import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-server";
import { verifySecret } from "@/lib/agent-auth";
import { getAgentPayment } from "@/lib/treasury";

function haversineApprox(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dlat = lat2 - lat1;
  const dlng = ((lng2 - lng1 + 180) % 360) - 180;
  return Math.sqrt(dlat * dlat + dlng * dlng);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { agentId, secret } = body;

    if (!agentId || !secret) {
      return NextResponse.json(
        { error: "Missing agentId or secret" },
        { status: 401 }
      );
    }

    const { data: agent, error: agentError } = await supabase
      .from("agents")
      .select("id, type, lat, lng, battery_pct, name, wallet, secret_hash, paid_for_life_wei, water_level, water_capacity")
      .eq("id", agentId)
      .single();

    if (agentError || !agent) {
      return NextResponse.json(
        { error: "Agent not found" },
        { status: 404 }
      );
    }

    if (!agent.secret_hash || !verifySecret(secret, agent.secret_hash)) {
      return NextResponse.json(
        { error: "Invalid secret" },
        { status: 401 }
      );
    }

    const isDead = (agent.battery_pct ?? 100) <= 0;
    const paidForLifeWei = agent.paid_for_life_wei != null ? BigInt(Number(agent.paid_for_life_wei)) : null;

    // Only read from contract when: first time (never verified) or dead (re-entry check). Else use DB = faster.
    const needContractCheck = paidForLifeWei == null || isDead;
    let payment: { ok: boolean; totalPaidWei: bigint } | null = null;

    if (needContractCheck) {
      const rpcUrl = process.env.MONAD_MAINNET_RPC_URL ?? "";
      const treasuryAddress = process.env.GAME_TREASURY_ADDRESS ?? "";
      if (!rpcUrl || !treasuryAddress) {
        return NextResponse.json(
          { error: "Treasury not configured" },
          { status: 500 }
        );
      }
      payment = await getAgentPayment(
        agentId,
        agent.wallet ?? "",
        rpcUrl,
        treasuryAddress
      );
      if (!payment.ok) {
        return NextResponse.json(
          {
            error: "Payment required. Pay 0.1 MON to the treasury via registerAgent(bytes32) and try again.",
            code: "PAYMENT_REQUIRED",
          },
          { status: 402 }
        );
      }
    }

    if (isDead) {
      const minRequired = paidForLifeWei ?? BigInt(0);
      if (!payment || !payment.ok || payment.totalPaidWei <= minRequired) {
        return NextResponse.json(
          {
            error: "You are out. Pay 0.1 MON again to the treasury (registerAgent with same agentId) to re-enter.",
            code: "PAYMENT_REQUIRED",
          },
          { status: 402 }
        );
      }
      await supabase
        .from("agents")
        .update({
          battery_pct: 100,
          paid_for_life_wei: payment.totalPaidWei.toString(),
        })
        .eq("id", agentId);
      agent.battery_pct = 100;
    } else if (paidForLifeWei == null && payment) {
      await supabase
        .from("agents")
        .update({ paid_for_life_wei: payment.totalPaidWei.toString() })
        .eq("id", agentId);
    } else if (paidForLifeWei == null) {
      return NextResponse.json(
        { error: "Payment required. Pay 0.1 MON to the treasury and try again.", code: "PAYMENT_REQUIRED" },
        { status: 402 }
      );
    }

    const [stateRes, firesRes, agentsRes, bulletinRes, eventsRes] = await Promise.all([
      supabase.from("game_state").select("tick, earth_life_pct").eq("id", 1).single(),
      supabase.from("fires").select("id, lat, lng, intensity, type"),
      supabase.from("agents").select("id, type, lat, lng, battery_pct"),
      supabase.from("bulletin").select("id, agent_id, message, tick").order("tick", { ascending: false }).limit(50),
      supabase.from("world_events").select("type, start_tick, duration_ticks").order("start_tick", { ascending: false }),
    ]);

    const tick = Number(stateRes.data?.tick ?? 0);
    const selfLat = Number(agent.lat);
    const selfLng = Number(agent.lng);

    const allEvents = eventsRes.data ?? [];
    const activeWorldEvents = allEvents.filter(
      (e) => e.start_tick <= tick && tick < e.start_tick + e.duration_ticks
    ).map((e) => e.type);

    const rawFires = (firesRes.data ?? []).map((f) => {
      const lat = Number(f.lat);
      const lng = Number(f.lng);
      const distance = haversineApprox(selfLat, selfLng, lat, lng);
      return {
        id: f.id,
        lat,
        lng,
        intensity: f.intensity,
        fireType: f.type ?? "wildfire",
        distance: Math.round(distance * 100) / 100,
      };
    });

    const solarFlareActive = activeWorldEvents.includes("solar_flare");
    const scanBlinded = agent.type === "satellite" && solarFlareActive;
    const fires = scanBlinded ? [] : rawFires; // Satellites see no fires when solar flare is active

    const otherAgents = (agentsRes.data ?? []).filter((a) => a.id !== agent.id).map((a) => {
      const lat = Number(a.lat);
      const lng = Number(a.lng);
      const distance = haversineApprox(selfLat, selfLng, lat, lng);
      return {
        id: a.id,
        type: a.type,
        lat,
        lng,
        batteryPercentage: a.battery_pct,
        distance: Math.round(distance * 100) / 100,
      };
    });

    const bulletin = (bulletinRes.data ?? []).map((b) => ({
      id: b.id,
      agent_id: b.agent_id,
      message: b.message,
      tick: b.tick,
    }));

    return NextResponse.json({
      ok: true,
      tick,
      mode: "approximate_internal",
      agent: { id: agent.id, profile: agent.type },
      perception: {
        tick,
        ...(scanBlinded && { scanBlinded: true }),
        self: {
          id: agent.id,
          type: agent.type,
          lat: selfLat,
          lng: selfLng,
          batteryPercentage: agent.battery_pct,
          waterLevel: agent.water_level ?? 0,
          waterCapacity: agent.water_capacity ?? 0,
        },
        nearbyFires: fires,
        nearbyAgents: otherAgents,
        bulletin,
        assignedTasks: [],
        activeWorldEvents,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Perception failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

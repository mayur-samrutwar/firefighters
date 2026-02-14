import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-server";
import { verifySecret } from "@/lib/agent-auth";
import { getAgentPayment } from "@/lib/treasury";
import { isActionAllowedForProfile, getBatteryCostPercent, getScoreForAction, SCORE_EXTINGUISH } from "@/data/actions";
import type { AgentProfile } from "@/data/actions";
import { isAtWaterSource } from "@/data/water-sources";
import { getWaterCapacity } from "@/data/profile-specs";
import { angularDistanceDeg } from "@/utils/geo";

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
      .select("id, type, wallet, secret_hash, battery_pct, paid_for_life_wei, lat, lng, water_level, water_capacity, score")
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

    // Only read from contract when: first time (never verified) or dead (re-entry). Else use DB = faster.
    const needContractCheck = paidForLifeWei == null || isDead;
    let payment: { ok: boolean; totalPaidWei: bigint } | null = null;

    if (needContractCheck) {
      const rpcUrl = process.env.MONAD_TESTNET_RPC_URL ?? "";
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
      if (!payment || payment.totalPaidWei <= minRequired) {
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
    } else if (paidForLifeWei == null && payment) {
      await supabase
        .from("agents")
        .update({ paid_for_life_wei: payment.totalPaidWei.toString() })
        .eq("id", agentId);
    }

    const action = body.action ?? {};
    const actionType = (action.type ?? "no_op") as string;
    const profile = agent.type as AgentProfile;

    if (actionType !== "no_op" && !isActionAllowedForProfile(actionType, profile)) {
      return NextResponse.json(
        { error: `Action ${actionType} not allowed for profile ${profile}` },
        { status: 400 }
      );
    }

    const updates: Record<string, unknown> = { last_action_type: actionType };

    // One-time battery cost (e.g. view_global_state 5%)
    const batteryCost = getBatteryCostPercent(actionType);
    if (batteryCost > 0) {
      const currentBattery = agent.battery_pct ?? 100;
      updates.battery_pct = Math.max(0, currentBattery - batteryCost);
    }

    if (actionType === "move_to") {
      const lat = action.lat != null ? Number(action.lat) : undefined;
      const lng = action.lng != null ? Number(action.lng) : undefined;
      if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
        return NextResponse.json(
          { error: "move_to requires lat and lng" },
          { status: 400 }
        );
      }
      updates.target_lat = Math.max(-90, Math.min(90, lat));
      updates.target_lng = ((lng % 360) + 360) % 360;
      if (updates.target_lng as number > 180) (updates.target_lng as number) -= 360;
    } else if (actionType === "change_route" && profile === "satellite") {
      const route = action.route;
      if (!Array.isArray(route) || route.length < 2) {
        return NextResponse.json(
          { error: "change_route requires route: [[lat,lng], ...] with at least 2 points" },
          { status: 400 }
        );
      }
      const waypoints = route.map((p: unknown) => {
        const pt = Array.isArray(p) ? p : [];
        const la = Number(pt[0]);
        const ln = Number(pt[1]);
        return [Number.isFinite(la) ? la : 0, Number.isFinite(ln) ? ln : 0];
      });
      updates.route = waypoints;
      updates.route_index = 0;
      updates.route_t = 0;
      updates.target_lat = null;
      updates.target_lng = null;
    } else if (actionType === "sit_idle" || actionType === "abort_current") {
      updates.target_lat = null;
      updates.target_lng = null;
    } else if (actionType === "refill") {
      const agentLat = Number(agent.lat ?? 0);
      const agentLng = Number(agent.lng ?? 0);
      if (!isAtWaterSource(agentLat, agentLng)) {
        return NextResponse.json(
          { error: "refill requires being at a water source" },
          { status: 400 }
        );
      }
      const capacity = getWaterCapacity(profile);
      if (capacity <= 0) {
        return NextResponse.json(
          { error: "refill not allowed for this profile" },
          { status: 400 }
        );
      }
      updates.water_level = capacity;
    } else if (actionType === "water_fire") {
      const NEAR_FIRE_DEG = 2;
      const EARTH_LIFE_PER_WATER = 0.5;
      const EARTH_LIFE_EXTINGUISH = 3;

      const agentLat = Number(agent.lat ?? 0);
      const agentLng = Number(agent.lng ?? 0);
      const currentWater = Number(agent.water_level ?? 0);
      if (currentWater <= 0) {
        return NextResponse.json(
          { error: "water_fire requires water (refill at a water source first)" },
          { status: 400 }
        );
      }

      const { data: firesRows } = await supabase
        .from("fires")
        .select("id, lat, lng, intensity");

      const nearFires = (firesRows ?? [])
        .map((f) => ({
          ...f,
          lat: Number(f.lat),
          lng: Number(f.lng),
          intensity: Number(f.intensity ?? 0),
          dist: angularDistanceDeg(agentLat, agentLng, Number(f.lat), Number(f.lng)),
        }))
        .filter((f) => f.dist <= NEAR_FIRE_DEG)
        .sort((a, b) => b.intensity - a.intensity);

      const target = nearFires[0];
      if (!target) {
        return NextResponse.json(
          { error: "water_fire requires being near a fire (within ~2°)" },
          { status: 400 }
        );
      }

      const newIntensity = Math.max(0, target.intensity - 1);
      const newWaterLevel = Math.max(0, currentWater - 1);
      const extinguished = newIntensity === 0;
      const scoreAdd = getScoreForAction("water_fire") + (extinguished ? SCORE_EXTINGUISH : 0);
      const earthRecovery = extinguished ? EARTH_LIFE_EXTINGUISH : EARTH_LIFE_PER_WATER;

      updates.water_level = newWaterLevel;
      updates.score = (Number(agent.score ?? 0) + scoreAdd) as number;

      if (extinguished) {
        const { error: delErr } = await supabase.from("fires").delete().eq("id", target.id);
        if (delErr) {
          return NextResponse.json(
            { error: "Failed to remove extinguished fire" },
            { status: 500 }
          );
        }
      } else {
        const { error: updErr } = await supabase
          .from("fires")
          .update({ intensity: newIntensity })
          .eq("id", target.id);
        if (updErr) {
          return NextResponse.json(
            { error: "Failed to update fire intensity" },
            { status: 500 }
          );
        }
      }

      const { data: gs } = await supabase
        .from("game_state")
        .select("earth_life_pct")
        .eq("id", 1)
        .single();
      const currentLife = Number(gs?.earth_life_pct ?? 100);
      const newLife = Math.min(100, Math.max(0, currentLife + earthRecovery));
      const { error: lifeErr } = await supabase
        .from("game_state")
        .update({ earth_life_pct: Math.round(newLife) })
        .eq("id", 1);
      if (lifeErr) {
        return NextResponse.json(
          { error: "Failed to update earth life" },
          { status: 500 }
        );
      }
    } else if (actionType === "post_bulletin") {
      const postType = typeof action.postType === "string" ? action.postType.trim() : "";
      const message = typeof action.message === "string" ? action.message.trim() : "";
      if (!message) {
        return NextResponse.json(
          { error: "post_bulletin requires message" },
          { status: 400 }
        );
      }
      const lat = action.lat != null && Number.isFinite(Number(action.lat)) ? Number(action.lat) : undefined;
      const lng = action.lng != null && Number.isFinite(Number(action.lng)) ? Number(action.lng) : undefined;
      const fireId = action.fireId != null ? String(action.fireId) : undefined;
      const targetAgentId = action.targetAgentId != null ? String(action.targetAgentId) : undefined;

      const { data: gameState } = await supabase
        .from("game_state")
        .select("tick")
        .eq("id", 1)
        .single();

      const tick = Number(gameState?.tick ?? 0);
      const bulletinPayload: Record<string, unknown> = { postType: postType || "message", message };
      if (lat != null) bulletinPayload.lat = lat;
      if (lng != null) bulletinPayload.lng = lng;
      if (fireId != null) bulletinPayload.fireId = fireId;
      if (targetAgentId != null) bulletinPayload.targetAgentId = targetAgentId;

      const { error: bulletinError } = await supabase.from("bulletin").insert({
        agent_id: agentId,
        message: JSON.stringify(bulletinPayload),
        tick,
      });

      if (bulletinError) {
        return NextResponse.json(
          { error: "Failed to post to bulletin" },
          { status: 500 }
        );
      }
    }

    await supabase
      .from("agents")
      .update(updates)
      .eq("id", agentId);

    return NextResponse.json({
      ok: true,
      accepted: true,
      agent: { id: agent.id, profile: agent.type },
      action: { type: actionType },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Act failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

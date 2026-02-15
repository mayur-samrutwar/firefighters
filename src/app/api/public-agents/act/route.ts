import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-server";
import { verifySecret } from "@/lib/agent-auth";
import { getAgentPayment } from "@/lib/treasury";
import { isActionAllowedForProfile, getBatteryCostPercent, getScoreForAction, SCORE_EXTINGUISH, SCORE_FIRST_FIRE_REPORT } from "@/data/actions";
import type { AgentProfile } from "@/data/actions";
import { isAtWaterSource } from "@/data/water-sources";
import { getWaterCapacity } from "@/data/profile-specs";
import { angularDistanceDeg } from "@/utils/geo";

/** Auto-post a bulletin entry for significant agent actions (fire-and-forget, non-blocking). */
async function autoBulletin(agentId: string, tick: number, postType: string, message: string, lat?: number, lng?: number) {
  const payload: Record<string, unknown> = { postType, message };
  if (lat != null) payload.lat = lat;
  if (lng != null) payload.lng = lng;
  await supabase.from("bulletin").insert({
    agent_id: agentId,
    message: JSON.stringify(payload),
    tick,
  });
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

    /** Set when action is view_global_state; returned so agent can decide where to move without calling perception again. */
    let actionResult: { globalFires: Array<{ id: string; lat: number; lng: number; intensity: number }>; globalAgents?: Array<{ id: string; type: string; lat: number; lng: number; battery_pct: number }> } | undefined;

    // One-time battery cost (e.g. view_global_state 5%)
    const batteryCost = getBatteryCostPercent(actionType);
    if (batteryCost > 0) {
      const currentBattery = agent.battery_pct ?? 100;
      updates.battery_pct = Math.max(0, currentBattery - batteryCost);
    }

    // Fetch current tick once for all bulletin auto-posts
    const { data: _gsTickRow } = await supabase.from("game_state").select("tick").eq("id", 1).single();
    const currentTick = Number(_gsTickRow?.tick ?? 0);

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

      // Optional: post to bulletin in the same request (e.g. need_water while heading to refill)
      const pb = action.postBulletin as { postType?: string; message?: string; lat?: number; lng?: number } | undefined;
      const hasExplicitPost = pb && typeof pb === "object" && (typeof pb.postType === "string" || typeof pb.message === "string");
      if (hasExplicitPost) {
        const postType = typeof pb.postType === "string" ? pb.postType.trim() : "";
        let message = typeof pb.message === "string" ? pb.message.trim() : "";
        const blat = pb.lat != null && Number.isFinite(Number(pb.lat)) ? Number(pb.lat) : Number(agent.lat ?? 0);
        const blng = pb.lng != null && Number.isFinite(Number(pb.lng)) ? Number(pb.lng) : Number(agent.lng ?? 0);
        if (!message) {
          const loc = ` at ${blat.toFixed(1)}°, ${blng.toFixed(1)}°`;
          const defaults: Record<string, string> = {
            need_water: `Need water${loc}`,
            need_charge: `Need charge${loc}`,
            heading_to: "Heading to target",
          };
          message = defaults[postType] ?? "Message";
        }
        const payload: Record<string, unknown> = { postType: postType || "message", message, lat: blat, lng: blng };
        await supabase.from("bulletin").insert({
          agent_id: agentId,
          message: JSON.stringify(payload),
          tick: currentTick,
        });
      } else {
        // Auto-post: always show movement on the bulletin board
        const tLat = (updates.target_lat as number).toFixed(1);
        const tLng = (updates.target_lng as number).toFixed(1);
        await autoBulletin(agentId, currentTick, "heading_to", `Heading to ${tLat}°, ${tLng}°`, Number(agent.lat ?? 0), Number(agent.lng ?? 0));
      }
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
    } else if (actionType === "view_global_state") {
      const [firesRes, agentsRes] = await Promise.all([
        supabase.from("fires").select("id, lat, lng, intensity"),
        supabase.from("agents").select("id, type, lat, lng, battery_pct").gt("battery_pct", 0),
      ]);
      actionResult = {
        globalFires: (firesRes.data ?? []).map((f) => ({
          id: String(f.id),
          lat: Number(f.lat),
          lng: Number(f.lng),
          intensity: Number(f.intensity ?? 0),
        })),
        globalAgents: (agentsRes.data ?? []).map((a) => ({
          id: String(a.id),
          type: String(a.type ?? ""),
          lat: Number(a.lat),
          lng: Number(a.lng),
          battery_pct: Number(a.battery_pct ?? 0),
        })),
      };
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

      // Auto-post refill activity
      await autoBulletin(agentId, currentTick, "refill", `Refilling water at source (${agentLat.toFixed(1)}°, ${agentLng.toFixed(1)}°)`, agentLat, agentLng);
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

      // Auto-post water_fire activity
      const fireLat = Number(target.lat);
      const fireLng = Number(target.lng);
      if (extinguished) {
        await autoBulletin(agentId, currentTick, "extinguish", `Extinguished fire at ${fireLat.toFixed(1)}°, ${fireLng.toFixed(1)}°!`, fireLat, fireLng);
      } else {
        await autoBulletin(agentId, currentTick, "water_fire", `Watering fire at ${fireLat.toFixed(1)}°, ${fireLng.toFixed(1)}° (intensity ${newIntensity})`, fireLat, fireLng);
      }
    } else if (actionType === "recharge_agent" || actionType === "emergency_recharge") {
      const RECHARGE_NEAR_DEG = 2;
      const BATTERY_TO_TARGET = 15;
      const BATTERY_FROM_SUPPLY = 20;

      const targetAgentId = action.targetAgentId != null ? String(action.targetAgentId).trim() : "";
      if (!targetAgentId) {
        return NextResponse.json(
          { error: `${actionType} requires targetAgentId` },
          { status: 400 }
        );
      }
      if (targetAgentId === agentId) {
        return NextResponse.json(
          { error: "Cannot recharge yourself" },
          { status: 400 }
        );
      }

      const { data: targetAgent, error: targetError } = await supabase
        .from("agents")
        .select("id, lat, lng, battery_pct")
        .eq("id", targetAgentId)
        .single();

      if (targetError || !targetAgent) {
        return NextResponse.json(
          { error: "Target agent not found" },
          { status: 404 }
        );
      }

      const supplyLat = Number(agent.lat ?? 0);
      const supplyLng = Number(agent.lng ?? 0);
      const targetLat = Number(targetAgent.lat ?? 0);
      const targetLng = Number(targetAgent.lng ?? 0);
      const dist = angularDistanceDeg(supplyLat, supplyLng, targetLat, targetLng);
      if (dist > RECHARGE_NEAR_DEG) {
        return NextResponse.json(
          { error: `Target agent must be within ~${RECHARGE_NEAR_DEG}° to recharge` },
          { status: 400 }
        );
      }

      const supplyBattery = Number(agent.battery_pct ?? 100);
      const targetBattery = Number(targetAgent.battery_pct ?? 0);
      if (supplyBattery < BATTERY_FROM_SUPPLY) {
        return NextResponse.json(
          { error: "Not enough battery to perform recharge" },
          { status: 400 }
        );
      }

      const newSupplyBattery = Math.max(0, supplyBattery - BATTERY_FROM_SUPPLY);
      const newTargetBattery = Math.min(100, targetBattery + BATTERY_TO_TARGET);
      const scoreAdd = getScoreForAction(actionType);

      updates.battery_pct = newSupplyBattery;
      updates.score = (Number(agent.score ?? 0) + scoreAdd) as number;

      const { error: targetUpdateErr } = await supabase
        .from("agents")
        .update({ battery_pct: newTargetBattery })
        .eq("id", targetAgentId);

      if (targetUpdateErr) {
        return NextResponse.json(
          { error: "Failed to update target agent battery" },
          { status: 500 }
        );
      }

      // Auto-post recharge activity
      const rLat = Number(agent.lat ?? 0);
      const rLng = Number(agent.lng ?? 0);
      await autoBulletin(agentId, currentTick, "recharge", `Recharging ally at ${rLat.toFixed(1)}°, ${rLng.toFixed(1)}° (+${BATTERY_TO_TARGET}% battery)`, rLat, rLng);
    } else if (actionType === "investigate_fire") {
      const INVESTIGATE_NEAR_DEG = 2;
      const scoutLat = Number(agent.lat ?? 0);
      const scoutLng = Number(agent.lng ?? 0);

      const { data: firesRows } = await supabase
        .from("fires")
        .select("id, lat, lng");

      const firesNearScout = (firesRows ?? []).filter((f) => {
        const flat = Number(f.lat);
        const flng = Number(f.lng);
        return angularDistanceDeg(scoutLat, scoutLng, flat, flng) <= INVESTIGATE_NEAR_DEG;
      });

      const fireId = action.fireId != null ? String(action.fireId) : undefined;
      const lat = action.lat != null && Number.isFinite(Number(action.lat)) ? Number(action.lat) : undefined;
      const lng = action.lng != null && Number.isFinite(Number(action.lng)) ? Number(action.lng) : undefined;

      let valid = false;
      if (fireId != null) {
        const match = firesNearScout.find((f) => String(f.id) === fireId);
        valid = !!match;
      } else if (lat != null && lng != null) {
        valid = firesNearScout.some((f) =>
          angularDistanceDeg(lat, lng, Number(f.lat), Number(f.lng)) <= INVESTIGATE_NEAR_DEG
        );
      } else {
        valid = firesNearScout.length > 0;
      }

      if (!valid) {
        return NextResponse.json(
          { error: "investigate_fire requires being near a fire (within ~2°); provide fireId or lat/lng to verify" },
          { status: 400 }
        );
      }

      // Auto-post investigate activity
      const invLat = lat ?? scoutLat;
      const invLng = lng ?? scoutLng;
      await autoBulletin(agentId, currentTick, "investigate", `Investigating fire at ${invLat.toFixed(1)}°, ${invLng.toFixed(1)}°`, invLat, invLng);
      // Score applied by generic block
    } else if (actionType === "mark_false_alarm") {
      const lat = action.lat != null && Number.isFinite(Number(action.lat)) ? Number(action.lat) : undefined;
      const lng = action.lng != null && Number.isFinite(Number(action.lng)) ? Number(action.lng) : undefined;

      const message =
        lat != null && lng != null
          ? `False alarm at ${lat.toFixed(2)}°, ${lng.toFixed(2)}°`
          : "False alarm reported";
      await autoBulletin(agentId, currentTick, "false_alarm", message, lat, lng);
      // Score applied by generic block
    } else if (actionType === "post_bulletin") {
      const postType = typeof action.postType === "string" ? action.postType.trim() : "";
      let message = typeof action.message === "string" ? action.message.trim() : "";
      const lat = action.lat != null && Number.isFinite(Number(action.lat)) ? Number(action.lat) : undefined;
      const lng = action.lng != null && Number.isFinite(Number(action.lng)) ? Number(action.lng) : undefined;
      const fireId = action.fireId != null ? String(action.fireId) : undefined;
      const targetAgentId = action.targetAgentId != null ? String(action.targetAgentId) : undefined;

      // Coordination post types can have empty message; use a default so the bulletin is visible in the UI.
      if (!message) {
        const loc = lat != null && lng != null ? ` at ${lat.toFixed(1)}°, ${lng.toFixed(1)}°` : "";
        const defaults: Record<string, string> = {
          need_water: `Need water${loc}`,
          need_charge: `Need charge${loc}`,
          heading_to: "Heading to target",
          fire_report: "Fire reported",
          task_assign: "Task assigned",
          all_clear: "All clear",
        };
        message = defaults[postType] ?? "Message";
      }

      const bulletinPayload: Record<string, unknown> = { postType: postType || "message", message };
      if (lat != null) bulletinPayload.lat = lat;
      if (lng != null) bulletinPayload.lng = lng;
      if (fireId != null) bulletinPayload.fireId = fireId;
      if (targetAgentId != null) bulletinPayload.targetAgentId = targetAgentId;

      if (postType === "fire_report") {
        const { data: existingBulletins } = await supabase
          .from("bulletin")
          .select("message")
          .order("tick", { ascending: false })
          .limit(500);

        let alreadyReported = false;
        for (const row of existingBulletins ?? []) {
          try {
            const parsed = JSON.parse(String(row.message ?? "{}")) as {
              postType?: string;
              fireId?: string;
              lat?: number;
              lng?: number;
            };
            if (parsed.postType !== "fire_report") continue;
            if (fireId != null && parsed.fireId != null && parsed.fireId === fireId) {
              alreadyReported = true;
              break;
            }
            if (lat != null && lng != null && parsed.lat != null && parsed.lng != null) {
              if (Math.abs(parsed.lat - lat) < 0.02 && Math.abs(parsed.lng - lng) < 0.02) {
                alreadyReported = true;
                break;
              }
            }
          } catch {
            /* skip unparseable */
          }
        }
        if (!alreadyReported) {
          updates.score = (Number(agent.score ?? 0) + SCORE_FIRST_FIRE_REPORT) as number;
        }
      }

      const { error: bulletinError } = await supabase.from("bulletin").insert({
        agent_id: agentId,
        message: JSON.stringify(bulletinPayload),
        tick: currentTick,
      });

      if (bulletinError) {
        return NextResponse.json(
          { error: "Failed to post to bulletin" },
          { status: 500 }
        );
      }
    }

    // Apply score for any scored action that didn't set it in its branch (e.g. investigate_fire, mark_false_alarm in Phase 7)
    const scoreAdd = getScoreForAction(actionType);
    if (scoreAdd > 0 && updates.score === undefined) {
      updates.score = (Number(agent.score ?? 0) + scoreAdd) as number;
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
      ...(actionResult != null && { actionResult }),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Act failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

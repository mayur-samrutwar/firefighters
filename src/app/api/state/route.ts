import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-server";
import { getSpeed } from "@/data/profile-specs";
import type { AgentProfile } from "@/data/actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const [stateRes, firesRes, agentsRes, bulletinRes, eventsRes] = await Promise.all([
      supabase.from("game_state").select("tick, earth_life_pct").eq("id", 1).single(),
      supabase.from("fires").select("id, lat, lng, intensity, type, created_tick, updated_tick").order("updated_tick", { ascending: false }),
      supabase.from("agents").select("id, type, lat, lng, battery_pct, score, name, wallet, created_at, target_lat, target_lng, water_level, water_capacity, last_action_type").gt("battery_pct", 0).order("score", { ascending: false }),
      supabase.from("bulletin").select("id, agent_id, message, tick, created_at").order("tick", { ascending: false }).limit(50),
      supabase.from("world_events").select("id, type, start_tick, duration_ticks, params, created_at").order("start_tick", { ascending: false }),
    ]);

    const tick = stateRes.data?.tick ?? 0;
    const earthLifePct = stateRes.data?.earth_life_pct ?? 100;

    const fires = (firesRes.data ?? []).map((f) => ({
      id: f.id,
      lat: Number(f.lat),
      lng: Number(f.lng),
      intensity: f.intensity,
      type: f.type ?? undefined,
      created_tick: f.created_tick,
      updated_tick: f.updated_tick,
    }));

    const agents = (agentsRes.data ?? []).map((a) => {
      const profile = (a.type ?? "scout") as AgentProfile;
      return {
        id: a.id,
        type: a.type,
        lat: Number(a.lat),
        lng: Number(a.lng),
        batteryPercentage: a.battery_pct,
        score: a.score,
        displayName: a.name,
        wallet: a.wallet,
        created_at: a.created_at,
        target_lat: a.target_lat != null ? Number(a.target_lat) : undefined,
        target_lng: a.target_lng != null ? Number(a.target_lng) : undefined,
        water_level: a.water_level ?? 0,
        water_capacity: a.water_capacity ?? 0,
        last_action_type: a.last_action_type ?? undefined,
        speed: getSpeed(profile),
      };
    });

    const bulletin = (bulletinRes.data ?? []).map((b) => ({
      id: b.id,
      agent_id: b.agent_id,
      message: b.message,
      tick: b.tick,
      created_at: b.created_at,
    }));

    const allEvents = eventsRes.data ?? [];
    const activeEvents = allEvents.filter(
      (e) => e.start_tick <= tick && tick < e.start_tick + e.duration_ticks
    );

    const world_events = activeEvents.map((e) => ({
      id: e.id,
      type: e.type,
      start_tick: e.start_tick,
      duration_ticks: e.duration_ticks,
      params: e.params,
      created_at: e.created_at,
    }));

    const EVENT_LABELS: Record<string, string> = {
      lightning_storm: "Lightning storm",
      drought_zone: "Drought zone",
      solar_flare: "Solar flare",
      strong_winds: "Strong winds",
      equipment_malfunction: "Equipment malfunction",
    };
    const activityBulletin = bulletin.map((b) => ({
      id: `bulletin-${b.id}`,
      kind: "bulletin" as const,
      tick: b.tick,
      message: b.message,
    }));
    const activityFires = fires.map((f) => ({
      id: `fire-${f.id}`,
      kind: "fire" as const,
      tick: f.created_tick,
      message: `Fire at ${f.lat.toFixed(1)}°, ${f.lng.toFixed(1)}° — intensity ${f.intensity}`,
    }));
    const allWorldEvents = eventsRes.data ?? [];
    const activityEvents = allWorldEvents.map((e) => ({
      id: `event-${e.id}`,
      kind: "world_event" as const,
      tick: e.start_tick,
      message: `${EVENT_LABELS[e.type] ?? e.type} started`,
    }));
    const activity = [...activityBulletin, ...activityFires, ...activityEvents]
      .sort((a, b) => b.tick - a.tick)
      .slice(0, 80);

    return NextResponse.json({
      tick,
      earth_life_pct: earthLifePct,
      fires,
      agents,
      bulletin,
      world_events,
      activity,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "state failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

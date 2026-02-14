import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const [stateRes, firesRes, agentsRes, bulletinRes, eventsRes] = await Promise.all([
      supabase.from("game_state").select("tick, earth_life_pct").eq("id", 1).single(),
      supabase.from("fires").select("id, lat, lng, intensity, type, created_tick, updated_tick").order("updated_tick", { ascending: false }),
      supabase.from("agents").select("id, type, lat, lng, battery_pct, score, name, wallet, created_at").order("score", { ascending: false }),
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

    const agents = (agentsRes.data ?? []).map((a) => ({
      id: a.id,
      type: a.type,
      lat: Number(a.lat),
      lng: Number(a.lng),
      batteryPercentage: a.battery_pct,
      score: a.score,
      displayName: a.name,
      wallet: a.wallet,
      created_at: a.created_at,
    }));

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

    return NextResponse.json({
      tick,
      earth_life_pct: earthLifePct,
      fires,
      agents,
      bulletin,
      world_events,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "state failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-server";

const TICKS_PER_FIRE = 12; // 12 * 10s = 2 minutes
const WORLD_EVENT_PROB = 1 / 22; // ~every 22 ticks ≈ 3.7 min on average

const WORLD_EVENT_TYPES = [
  "lightning_storm",
  "drought_zone",
  "solar_flare",
  "strong_winds",
  "equipment_malfunction",
] as const;

function randomLat(): number {
  return (Math.random() * 110 - 55); // -55 to 55
}

function randomLng(): number {
  return (Math.random() * 360 - 180); // -180 to 180
}

function authTick(req: NextRequest): boolean {
  const secret = process.env.TICK_API_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization");
  const bearer = header?.startsWith("Bearer ") ? header.slice(7) : null;
  const xSecret = req.headers.get("x-tick-secret");
  return (bearer === secret || xSecret === secret);
}

export async function POST(req: NextRequest) {
  if (!authTick(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { data: state, error: stateError } = await supabase
      .from("game_state")
      .select("tick")
      .eq("id", 1)
      .single();

    if (stateError || !state) {
      return NextResponse.json(
        { error: "game_state not found" },
        { status: 500 }
      );
    }

    const currentTick = Number(state.tick);
    const newTick = currentTick + 1;

    // Spawn fire every 2 minutes (every TICKS_PER_FIRE ticks)
    if (newTick % TICKS_PER_FIRE === 0) {
      const lat = randomLat();
      const lng = randomLng();
      const intensity = Math.floor(Math.random() * 3) + 1; // 1–3
      await supabase.from("fires").insert({
        lat: Math.round(lat * 1e6) / 1e6,
        lng: Math.round(lng * 1e6) / 1e6,
        intensity,
        created_tick: newTick,
        updated_tick: newTick,
      });
    }

    // Spawn world event with low probability (~every 3–4 min)
    if (Math.random() < WORLD_EVENT_PROB) {
      const type =
        WORLD_EVENT_TYPES[
          Math.floor(Math.random() * WORLD_EVENT_TYPES.length)
        ];
      const duration_ticks = Math.floor(Math.random() * 13) + 6; // 6–18 (~1–3 min)
      const params: { lat?: number; lng?: number; direction?: string } = {};
      if (type === "drought_zone" || type === "lightning_storm") {
        params.lat = Math.round(randomLat() * 1e6) / 1e6;
        params.lng = Math.round(randomLng() * 1e6) / 1e6;
      }
      if (type === "strong_winds") {
        const dirs = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
        params.direction = dirs[Math.floor(Math.random() * dirs.length)];
      }
      await supabase.from("world_events").insert({
        type,
        start_tick: newTick,
        duration_ticks,
        params: Object.keys(params).length ? params : null,
      });
    }

    const { error: updateError } = await supabase
      .from("game_state")
      .update({ tick: newTick, updated_at: new Date().toISOString() })
      .eq("id", 1);

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, tick: newTick });
  } catch (e) {
    const message = e instanceof Error ? e.message : "tick failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

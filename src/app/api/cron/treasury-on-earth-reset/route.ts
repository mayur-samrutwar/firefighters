import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-server";
import { closeHourAndDistribute } from "@/lib/game-treasury-operator";

function cronAuth(req: NextRequest): boolean {
  const secret = process.env.TICK_API_SECRET;
  if (!secret) return false;
  const header = req.headers.get("x-cron-secret") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return header === secret;
}

/**
 * Cron: process unprocessed earth resets.
 * For each: close hour and distribute 90% to current leaderboard by score (hourly rewards).
 * If no leaders with score, burns the reward share. Contract is unchanged; we only call distribute instead of burn.
 */
export async function POST(req: NextRequest) {
  if (!cronAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rpcUrl = process.env.MONAD_MAINNET_RPC_URL?.trim();
  const treasuryAddress = process.env.GAME_TREASURY_ADDRESS?.trim();
  const privateKey = process.env.MONAD_MAINNET_PRIVATE_KEY;
  if (!rpcUrl || !treasuryAddress || !privateKey) {
    return NextResponse.json(
      { error: "Treasury or RPC not configured" },
      { status: 500 }
    );
  }

  const { data: events, error: fetchError } = await supabase
    .from("earth_reset_events")
    .select("id, tick, created_at")
    .is("processed_at", null)
    .order("id", { ascending: true });

  if (fetchError) {
    return NextResponse.json(
      { error: "Failed to fetch earth reset events", details: fetchError.message },
      { status: 500 }
    );
  }

  if (!events?.length) {
    return NextResponse.json({ ok: true, processed: 0 });
  }

  let processed = 0;

  for (const ev of events) {
    try {
      // Hourly leaderboard: current agents with score, ordered by score desc
      const { data: leaders } = await supabase
        .from("agents")
        .select("id, score")
        .gt("battery_pct", 0)
        .order("score", { ascending: false });
      const hourlyLeaders = (leaders ?? []).map((r) => ({
        agent_id: r.id,
        score: Number(r.score ?? 0),
      }));

      const { lastBucketWei, distributed } = await closeHourAndDistribute(
        rpcUrl,
        treasuryAddress,
        privateKey,
        hourlyLeaders
      );

      const { error: updateError } = await supabase
        .from("earth_reset_events")
        .update({ processed_at: new Date().toISOString() })
        .eq("id", ev.id);

      if (updateError) {
        return NextResponse.json(
          { error: "Failed to mark event processed", details: updateError.message },
          { status: 500 }
        );
      }
      processed++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json(
        { error: "Contract call failed", details: msg, eventId: ev.id },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ ok: true, processed });
}

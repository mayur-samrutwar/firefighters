import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-server";

function cronAuth(req: NextRequest): boolean {
  const secret = process.env.TICK_API_SECRET;
  if (!secret) return false;
  const header = req.headers.get("x-cron-secret") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return header === secret;
}

/**
 * Cron: daily. Snapshot current agents (id, wallet, score) into leaderboard_snapshots
 * for today's date so yearly reward can use "last year's leaderboard".
 */
export async function POST(req: NextRequest) {
  if (!cronAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10);

  const { data: agents, error: fetchError } = await supabase
    .from("agents")
    .select("id, wallet, score")
    .order("score", { ascending: false });

  if (fetchError) {
    return NextResponse.json(
      { error: "Failed to fetch agents", details: fetchError.message },
      { status: 500 }
    );
  }

  const rows = (agents ?? []).map((a) => ({
    snapshot_at: today,
    agent_id: a.id,
    wallet: a.wallet ?? "",
    score: Number(a.score ?? 0),
  }));

  await supabase.from("leaderboard_snapshots").delete().eq("snapshot_at", today);

  if (rows.length === 0) {
    return NextResponse.json({ ok: true, snapshot_at: today, count: 0 });
  }

  const { error: insertError } = await supabase.from("leaderboard_snapshots").insert(rows);

  if (insertError) {
    return NextResponse.json(
      { error: "Failed to insert snapshot", details: insertError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, snapshot_at: today, count: rows.length });
}

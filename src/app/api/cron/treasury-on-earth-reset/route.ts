import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-server";
import { closeHourAndBurnOnCollapse } from "@/lib/game-treasury-operator";

function cronAuth(req: NextRequest): boolean {
  const secret = process.env.TICK_API_SECRET;
  if (!secret) return false;
  const header = req.headers.get("x-cron-secret") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return header === secret;
}

/**
 * Cron: process unprocessed earth resets.
 * For each: call GameTreasury.closeHour() then burnLastHourRewardsOnCollapse(),
 * record lastBucket into yearly_collections for current year, mark event processed.
 */
export async function POST(req: NextRequest) {
  if (!cronAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rpcUrl = process.env.MONAD_TESTNET_RPC_URL?.trim();
  const treasuryAddress = process.env.GAME_TREASURY_ADDRESS?.trim();
  const privateKey = process.env.MONAD_TESTNET_PRIVATE_KEY;
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

  const year = new Date().getFullYear();
  let processed = 0;

  for (const ev of events) {
    try {
      const { lastBucketWei } = await closeHourAndBurnOnCollapse(
        rpcUrl,
        treasuryAddress,
        privateKey
      );

      await supabase.from("yearly_collections").insert({
        year,
        amount_wei: String(lastBucketWei),
      });

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

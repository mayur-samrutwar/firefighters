import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { supabase } from "@/lib/supabase-server";
import { getTreasuryOperator } from "@/lib/game-treasury-operator";

function cronAuth(req: NextRequest): boolean {
  const secret = process.env.TICK_API_SECRET;
  if (!secret) return false;
  const header = req.headers.get("x-cron-secret") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return header === secret;
}

/** 0.90% = 90 basis points */
const YEARLY_REWARD_BPS = BigInt(90);
const BPS_DENOM = BigInt(10000);

/**
 * Cron: yearly. Distribute 0.90% of last year's collected tokens to the leaderboard.
 * Uses previous year's total from yearly_collections and leaderboard from leaderboard_snapshots
 * (or yearly_leaderboard if already finalized). Withdraws from treasury (admin) then sends to each leader by score weight.
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

  const currentYear = new Date().getFullYear();
  const prevYear = currentYear - 1;

  const { data: rows, error: sumError } = await supabase
    .from("yearly_collections")
    .select("amount_wei")
    .eq("year", prevYear);

  if (sumError) {
    return NextResponse.json(
      { error: "Failed to get yearly collections", details: sumError.message },
      { status: 500 }
    );
  }

  const totalCollectedWei = (rows ?? []).reduce(
    (acc, r) => acc + BigInt(r.amount_wei ?? "0"),
    BigInt(0)
  );
  if (totalCollectedWei === BigInt(0)) {
    return NextResponse.json({ ok: true, message: "No collections for previous year", distributed: "0" });
  }

  const payoutPoolWei = (totalCollectedWei * YEARLY_REWARD_BPS) / BPS_DENOM;
  if (payoutPoolWei === BigInt(0)) {
    return NextResponse.json({ ok: true, message: "Payout pool zero", distributed: "0" });
  }

  let leaders: { agent_id: string; wallet: string; score: number }[];

  const { data: existing } = await supabase
    .from("yearly_leaderboard")
    .select("agent_id, wallet, score")
    .eq("year", prevYear);

  if (existing?.length) {
    leaders = existing;
  } else {
    const firstDayThisYear = `${currentYear}-01-01`;
    const { data: latest } = await supabase
      .from("leaderboard_snapshots")
      .select("snapshot_at")
      .lt("snapshot_at", firstDayThisYear)
      .order("snapshot_at", { ascending: false })
      .limit(1)
      .single();

    if (!latest?.snapshot_at) {
      return NextResponse.json(
        { ok: true, message: "No leaderboard snapshot for previous year", distributed: "0" }
      );
    }

    const { data: snap } = await supabase
      .from("leaderboard_snapshots")
      .select("agent_id, wallet, score")
      .eq("snapshot_at", latest.snapshot_at)
      .order("score", { ascending: false });

    if (!snap?.length) {
      return NextResponse.json(
        { ok: true, message: "No leaderboard snapshot for previous year", distributed: "0" }
      );
    }
    leaders = snap;
    await supabase.from("yearly_leaderboard").insert(
      leaders.map((l) => ({ year: prevYear, agent_id: l.agent_id, wallet: l.wallet, score: l.score }))
    );
  }

  const totalScore = leaders.reduce((s, l) => s + (l.score ?? 0), 0);
  if (totalScore === 0) {
    return NextResponse.json({ ok: true, message: "Leaderboard total score zero", distributed: "0" });
  }

  const { contract, signer } = getTreasuryOperator(rpcUrl, treasuryAddress, privateKey);
  const adminAddress = await signer.getAddress();

  try {
    const tx = await (contract as ethers.Contract).withdrawTreasury(adminAddress, payoutPoolWei);
    await tx.wait();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "Withdraw from treasury failed", details: msg },
      { status: 500 }
    );
  }

  let sent = BigInt(0);
  for (const l of leaders) {
    const weight = l.score ?? 0;
    if (weight <= 0) continue;
    const share = (payoutPoolWei * BigInt(weight)) / BigInt(totalScore);
    if (share === BigInt(0)) continue;
    try {
      await signer.sendTransaction({
        to: l.wallet as `0x${string}`,
        value: share,
      });
      sent += share;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json(
        { error: "Send to leader failed", wallet: l.wallet, details: msg },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({
    ok: true,
    year: prevYear,
    totalCollectedWei: String(totalCollectedWei),
    payoutPoolWei: String(payoutPoolWei),
    distributedWei: String(sent),
    leadersCount: leaders.length,
  });
}

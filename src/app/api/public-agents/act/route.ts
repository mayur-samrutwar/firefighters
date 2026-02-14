import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase-server";
import { verifySecret } from "@/lib/agent-auth";
import { getAgentPayment } from "@/lib/treasury";

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
      .select("id, type, wallet, secret_hash, battery_pct, paid_for_life_wei")
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

    // Actions not implemented yet; accept and return ok
    const action = body.action ?? {};
    return NextResponse.json({
      ok: true,
      accepted: true,
      agent: { id: agent.id, profile: agent.type },
      action: { type: action.type ?? "noop" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Act failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

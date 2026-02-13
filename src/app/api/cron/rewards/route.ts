import { NextResponse } from 'next/server';
import { getEarthLife, getAgentLeaderboard, _resetState } from '@/app/game/store';
import { ethers } from 'ethers';

const GAME_TREASURY_ADDRESS = process.env.GAME_TREASURY_ADDRESS;
const MONAD_RPC_URL = process.env.MONAD_TESTNET_RPC_URL;
const GAME_OPERATOR_PRIVATE_KEY = process.env.MONAD_TESTNET_PRIVATE_KEY;

// Minimal ABI for GameTreasury (native MON)
const TREASURY_ABI = [
  'function closeHour() external',
  'function distributeLastHourRewards(bytes32[] winners, uint256[] weights) external',
  'function burnLastHourRewardsOnCollapse() external',
  'function lastBucketReward() view returns (uint256)',
];

export async function POST() {
  if (!GAME_TREASURY_ADDRESS || !MONAD_RPC_URL || !GAME_OPERATOR_PRIVATE_KEY) {
    return NextResponse.json(
      { ok: false, error: 'Monad treasury env vars not configured' },
      { status: 500 }
    );
  }

  try {
    const [earthLife, leaderboard] = await Promise.all([
      getEarthLife(),
      getAgentLeaderboard(),
    ]);

    const provider = new ethers.JsonRpcProvider(MONAD_RPC_URL);
    const wallet = new ethers.Wallet(GAME_OPERATOR_PRIVATE_KEY, provider);
    const treasury = new ethers.Contract(GAME_TREASURY_ADDRESS, TREASURY_ABI, wallet);

    // 1. Close the hour on-chain
    const closeTx = await treasury.closeHour();
    await closeTx.wait();

    const lastBucketReward: bigint = await treasury.lastBucketReward();
    if (lastBucketReward === 0n) {
      return NextResponse.json({
        ok: true,
        action: 'closed_hour_no_reward',
        earthLife,
      });
    }

    // 2. If Earth collapsed, burn and reset game state
    if (earthLife <= 0) {
      const burnTx = await treasury.burnLastHourRewardsOnCollapse();
      await burnTx.wait();

      // Reset all game state in Supabase
      await _resetState();

      return NextResponse.json({
        ok: true,
        action: 'burned_last_hour_and_reset',
        earthLife,
        burned: lastBucketReward.toString(),
      });
    }

    // 3. Otherwise, distribute rewards to top agents by leaderboard
    if (!leaderboard.length) {
      return NextResponse.json({
        ok: true,
        action: 'no_leaderboard_entries',
        earthLife,
      });
    }

    // Take top N agents (e.g. top 5) and weight by score
    const topN = leaderboard.slice(0, 5);
    const winners = topN.map((e) =>
      // Derive a stable bytes32 id from agentId string via keccak256
      ethers.id(e.agentId)
    );
    const weights = topN.map((e) => BigInt(Math.max(1, e.score)));

    const distTx = await treasury.distributeLastHourRewards(winners, weights);
    await distTx.wait();

    return NextResponse.json({
      ok: true,
      action: 'distributed_rewards',
      earthLife,
      lastBucketReward: lastBucketReward.toString(),
      winners: topN.map((e) => e.agentId),
    });
  } catch (err) {
    console.error('cron/rewards error', err);
    return NextResponse.json(
      { ok: false, error: 'cron rewards failed' },
      { status: 500 }
    );
  }
}


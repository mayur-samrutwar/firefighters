import { NextResponse } from 'next/server';
import { getEarthLife, _resetState } from '@/app/game/store';
import { ethers } from 'ethers';

const GAME_TREASURY_ADDRESS = process.env.GAME_TREASURY_ADDRESS;
const MONAD_RPC_URL = process.env.MONAD_TESTNET_RPC_URL;
const GAME_OPERATOR_PRIVATE_KEY = process.env.MONAD_TESTNET_PRIVATE_KEY;
const TICK_API_SECRET = process.env.TICK_API_SECRET;

const TREASURY_ABI = [
  'function burnLastHourRewardsOnCollapse() external',
  'function lastBucketReward() view returns (uint256)',
];

/**
 * Collapse check — run every minute (e.g. by pg_cron).
 * If earth life is <= 0: burn last hour rewards on-chain and reset game state.
 * Does NOT call closeHour(); that stays in the hourly rewards cron.
 */
export async function POST(request: Request) {
  if (!TICK_API_SECRET) {
    return NextResponse.json(
      { ok: false, error: 'Check-collapse endpoint not configured' },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get('authorization');
  const providedToken = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : authHeader?.trim();

  if (!providedToken || providedToken !== TICK_API_SECRET) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const earthLife = await getEarthLife();

    if (earthLife > 0) {
      return NextResponse.json({
        ok: true,
        action: 'no_collapse',
        earthLife,
      });
    }

    if (!GAME_TREASURY_ADDRESS || !MONAD_RPC_URL || !GAME_OPERATOR_PRIVATE_KEY) {
      return NextResponse.json(
        { ok: false, error: 'Monad treasury env vars not configured' },
        { status: 500 }
      );
    }

    const provider = new ethers.JsonRpcProvider(MONAD_RPC_URL);
    const wallet = new ethers.Wallet(GAME_OPERATOR_PRIVATE_KEY, provider);
    const treasury = new ethers.Contract(GAME_TREASURY_ADDRESS, TREASURY_ABI, wallet);

    const lastBucketReward: bigint = await treasury.lastBucketReward();
    if (lastBucketReward > BigInt(0)) {
      const burnTx = await treasury.burnLastHourRewardsOnCollapse();
      await burnTx.wait();
    }

    await _resetState();
    console.warn('[check-collapse] Game state wiped (Earth collapsed)');

    return NextResponse.json({
      ok: true,
      action: 'collapsed_burned_and_reset',
      earthLife,
      burned: lastBucketReward.toString(),
    });
  } catch (err: unknown) {
    console.error('cron/check-collapse error', err);
    return NextResponse.json(
      {
        ok: false,
        error: 'check-collapse failed',
        detail: err && typeof err === 'object' && 'message' in err ? (err as Error).message : String(err),
      },
      { status: 500 }
    );
  }
}

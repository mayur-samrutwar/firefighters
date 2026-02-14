import { _resetState } from '@/app/game/store';
import { NextResponse } from 'next/server';

/** Require TICK_API_SECRET (same as tick/cron) or NODE_ENV=development to avoid accidental wipes. */
function isResetAllowed(): boolean {
  if (process.env.NODE_ENV === 'development') return true;
  return Boolean(process.env.TICK_API_SECRET);
}

/**
 * POST /api/test-reset
 * Resets all game state. Only for testing.
 * In production: requires Authorization: Bearer <TICK_API_SECRET>.
 * In development: no auth required (so test scripts work).
 */
export async function POST(request: Request) {
  if (!isResetAllowed()) {
    return NextResponse.json(
      { ok: false, error: 'test-reset not available (not in development and no TICK_API_SECRET)' },
      { status: 403 }
    );
  }
  if (process.env.NODE_ENV !== 'development') {
    const secret = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
    if (secret !== process.env.TICK_API_SECRET) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
  }
  await _resetState();
  console.warn('[test-reset] Game state wiped via POST /api/test-reset');
  return NextResponse.json({ ok: true, message: 'State reset' });
}

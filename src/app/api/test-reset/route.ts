import { _resetState } from '@/app/game/store';
import { NextResponse } from 'next/server';

/**
 * POST /api/test-reset
 * Resets all game state. Only for testing.
 */
export async function POST() {
  await _resetState();
  return NextResponse.json({ ok: true, message: 'State reset' });
}

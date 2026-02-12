import {
  getLeaderboard,
  registerPlayer,
  getTick,
} from '@/app/game/store';
import { NextResponse } from 'next/server';

/**
 * GET  /api/players — returns leaderboard (sorted by score desc)
 * POST /api/players — register a new player { name }
 */

export async function GET() {
  return NextResponse.json({ players: getLeaderboard() });
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { name } = body;

    if (typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { ok: false, error: 'Player name is required' },
        { status: 400 }
      );
    }

    const player = registerPlayer(name, getTick());
    return NextResponse.json({ ok: true, player });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Invalid request' },
      { status: 400 }
    );
  }
}

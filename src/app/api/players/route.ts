import {
  getLeaderboard,
  registerPlayer,
  getTick,
} from '@/app/game/store';
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ players: await getLeaderboard() });
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

    const tick = await getTick();
    const player = await registerPlayer(name, tick);
    return NextResponse.json({ ok: true, player });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Invalid request' },
      { status: 400 }
    );
  }
}

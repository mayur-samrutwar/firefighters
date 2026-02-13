import { forceSpawnEvent, getTick } from '@/app/game/store';
import type { WorldEventType } from '@/app/game/worldEvents';
import { NextResponse } from 'next/server';

const VALID_TYPES: WorldEventType[] = [
  'lightning_storm',
  'drought',
  'solar_flare',
  'strong_winds',
  'equipment_malfunction',
];

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { type, ...overrides } = body;

    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json(
        { ok: false, error: `Invalid type. Valid: ${VALID_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    const tick = await getTick();
    const event = await forceSpawnEvent(type, tick, overrides);
    return NextResponse.json({ ok: true, event });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}

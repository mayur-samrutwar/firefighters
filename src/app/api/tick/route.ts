import { processTick } from '@/app/game/store';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));

    const newFire =
      typeof body.fireLat === 'number' && typeof body.fireLng === 'number'
        ? { lat: body.fireLat, lng: body.fireLng }
        : undefined;

    await processTick(newFire);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('processTick error', err);
    return NextResponse.json(
      {
        ok: false,
        error:
          err instanceof Error ? err.message : 'Unknown tick error',
      },
      { status: 500 }
    );
  }
}

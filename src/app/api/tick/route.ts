import { processTick } from '@/app/game/store';
import { NextResponse } from 'next/server';

function randomLat() {
  return -90 + Math.random() * 180;
}

function randomLng() {
  return -180 + Math.random() * 360;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    // Agent can optionally send lat/lng, or we pick random
    const lat = typeof body.lat === 'number' ? body.lat : randomLat();
    const lng = typeof body.lng === 'number' ? body.lng : randomLng();
    // Randomly add fire this tick (~70% chance) - "can choose to either"
    const addFire = body.addFire ?? Math.random() > 0.3;
    processTick(addFire ? { lat, lng } : undefined);
    return NextResponse.json({ ok: true, addFire });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}

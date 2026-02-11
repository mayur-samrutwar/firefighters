import { processTick } from '@/app/game/store';
import { readFileSync } from 'fs';
import { NextResponse } from 'next/server';
import path from 'path';

let landPoints: [number, number][] | null = null;
try {
  const p = path.join(process.cwd(), 'public', 'land-points.json');
  landPoints = JSON.parse(readFileSync(p, 'utf-8'));
} catch {
  landPoints = null;
}

function randomLandPoint(): { lat: number; lng: number } {
  if (landPoints?.length) {
    const [lat, lng] = landPoints[Math.floor(Math.random() * landPoints.length)];
    return { lat, lng };
  }
  return {
    lat: -90 + Math.random() * 180,
    lng: -180 + Math.random() * 360,
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const coords =
      typeof body.lat === 'number' && typeof body.lng === 'number'
        ? { lat: body.lat, lng: body.lng }
        : randomLandPoint();
    const { lat, lng } = coords;
    const addFire = body.addFire ?? true;
    processTick(addFire ? { lat, lng } : undefined);
    return NextResponse.json({ ok: true, addFire });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}

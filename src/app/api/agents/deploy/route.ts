import { deployAgent } from '@/app/game/store';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { type, route, batteryPercentage, searchRadius } = body;

    if (type !== 'satellite') {
      return NextResponse.json({ ok: false, error: 'Invalid agent type' }, { status: 400 });
    }

    if (!Array.isArray(route) || route.length < 2) {
      return NextResponse.json({ ok: false, error: 'Route must have at least 2 waypoints' }, { status: 400 });
    }

    const validRoute = route.every(
      (p: unknown) =>
        Array.isArray(p) &&
        p.length >= 2 &&
        typeof p[0] === 'number' &&
        typeof p[1] === 'number'
    );
    if (!validRoute) {
      return NextResponse.json({ ok: false, error: 'Invalid route format' }, { status: 400 });
    }

    const battery = typeof batteryPercentage === 'number' ? Math.max(0, Math.min(100, batteryPercentage)) : 100;
    const radius = typeof searchRadius === 'number' && searchRadius > 0 ? searchRadius : 5;

    const agent = deployAgent({
      type: 'satellite',
      route: route as [number, number][],
      batteryPercentage: battery,
      searchRadius: radius,
    });

    return NextResponse.json({ ok: true, agent });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}

import { deployAgent, playerExists, type AgentType } from '@/app/game/store';
import { NextResponse } from 'next/server';

const VALID_TYPES: AgentType[] = [
  'satellite',
  'scout',
  'water_drone',
  'heavy_tanker',
  'supply_drone',
  'coordinator',
];

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { type, route, batteryPercentage, searchRadius, lat, lng, waterLevel, playerId } =
      body;

    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json(
        {
          ok: false,
          error: `Invalid agent type. Valid types: ${VALID_TYPES.join(', ')}`,
        },
        { status: 400 }
      );
    }

    // Satellite requires a route
    if (type === 'satellite') {
      if (!Array.isArray(route) || route.length < 2) {
        return NextResponse.json(
          { ok: false, error: 'Satellite requires a route with at least 2 waypoints' },
          { status: 400 }
        );
      }
      const validRoute = route.every(
        (p: unknown) =>
          Array.isArray(p) &&
          p.length >= 2 &&
          typeof p[0] === 'number' &&
          typeof p[1] === 'number'
      );
      if (!validRoute) {
        return NextResponse.json(
          { ok: false, error: 'Invalid route format' },
          { status: 400 }
        );
      }
    }

    // Non-satellite types need lat/lng starting position
    if (type !== 'satellite') {
      if (typeof lat !== 'number' || typeof lng !== 'number') {
        return NextResponse.json(
          { ok: false, error: 'Non-satellite agents require lat and lng' },
          { status: 400 }
        );
      }
    }

    // Optional player ownership
    if (playerId !== undefined && typeof playerId === 'string' && playerId.length > 0) {
      if (!(await playerExists(playerId))) {
        return NextResponse.json(
          { ok: false, error: 'Player not found. Register first via POST /api/players' },
          { status: 400 }
        );
      }
    }

    const battery =
      typeof batteryPercentage === 'number'
        ? Math.max(0, Math.min(100, batteryPercentage))
        : 100;

    const agent = await deployAgent({
      type: type as AgentType,
      route: type === 'satellite' ? (route as [number, number][]) : undefined,
      searchRadius:
        typeof searchRadius === 'number' && searchRadius > 0
          ? searchRadius
          : undefined,
      lat: typeof lat === 'number' ? lat : undefined,
      lng: typeof lng === 'number' ? lng : undefined,
      batteryPercentage: battery,
      waterLevel: typeof waterLevel === 'number' ? waterLevel : undefined,
      playerId: typeof playerId === 'string' ? playerId : undefined,
    });

    return NextResponse.json({ ok: true, agent });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}

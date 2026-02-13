import { processTick } from '@/app/game/store';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    // Check for Authorization header with Bearer token
    const authHeader = request.headers.get('authorization');
    const expectedSecret = process.env.TICK_API_SECRET;
    
    if (!expectedSecret) {
      console.error('TICK_API_SECRET not configured');
      return NextResponse.json(
        { ok: false, error: 'Tick endpoint not configured' },
        { status: 500 }
      );
    }

    // Extract token from "Bearer <token>" or just use the header value
    const providedToken = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : authHeader?.trim();

    if (!providedToken || providedToken !== expectedSecret) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

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

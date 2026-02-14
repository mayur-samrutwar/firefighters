import { NextResponse } from 'next/server';

/**
 * POST /api/change_route — not implemented here.
 * Agent actions (satellite change_route) must use POST /api/public-agents/act
 * with body { type: "change_route", route: [[lat,lng], ...] }. Returns 400 so callers know the action was not performed.
 */
export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: 'Use POST /api/public-agents/act with action type "change_route" and route waypoints for agent control.',
      actUrl: '/api/public-agents/act',
    },
    { status: 400 }
  );
}

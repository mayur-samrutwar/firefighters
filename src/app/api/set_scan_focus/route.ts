import { NextResponse } from 'next/server';

/**
 * POST /api/set_scan_focus — not implemented here.
 * Agent actions (satellite set_scan_focus) must use POST /api/public-agents/act
 * with body { type: "set_scan_focus" }. Returns 400 so callers know the action was not performed.
 */
export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: 'Use POST /api/public-agents/act with action type "set_scan_focus" for agent control.',
      actUrl: '/api/public-agents/act',
    },
    { status: 400 }
  );
}

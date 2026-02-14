import { NextResponse } from 'next/server';

/**
 * GET /api/agents — API descriptor.
 * POST /api/agents — Use POST /api/agents/deploy for deploying agents.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    api: 'agents',
    basePath: '/api/agents',
    endpoints: {
      deploy: 'POST /api/agents/deploy',
    },
  });
}

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: 'Use POST /api/agents/deploy to deploy an agent.',
      deployUrl: '/api/agents/deploy',
    },
    { status: 400 }
  );
}

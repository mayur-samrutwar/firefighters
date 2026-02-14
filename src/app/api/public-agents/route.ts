import { NextResponse } from 'next/server';

/**
 * GET /api/public-agents — API descriptor for clients that hit the base URL
 * (e.g. from skill.md api_base). Returns 200 with endpoint list so no 404.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    api: 'public-agents',
    basePath: '/api/public-agents',
    endpoints: {
      register: 'POST /api/public-agents/register',
      perception: 'POST /api/public-agents/perception',
      act: 'POST /api/public-agents/act',
    },
  });
}

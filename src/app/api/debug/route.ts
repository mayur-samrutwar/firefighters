import { getAgents, getFires, getTick } from '@/app/game/store';
import { NextResponse } from 'next/server';

export async function GET() {
  const [tick, fires, agents] = await Promise.all([
    getTick(),
    getFires(),
    getAgents(),
  ]);
  return NextResponse.json({
    tick,
    fireCount: fires.length,
    fires,
    agentCount: agents.length,
    agents,
  });
}

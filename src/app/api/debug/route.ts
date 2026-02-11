import { getAgents, getFires, getTick } from '@/app/game/store';
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    tick: getTick(),
    fireCount: getFires().length,
    fires: getFires(),
    agentCount: getAgents().length,
    agents: getAgents(),
  });
}

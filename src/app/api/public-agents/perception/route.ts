import { NextResponse } from 'next/server';
import { authenticateExternalAgent } from '@/lib/publicAgentsAuth';
import { getAgentById, syncExternalAgent } from '@/app/game/store';
import { buildPerception } from '@/app/game/perception';

export async function POST(request: Request) {
  let body: { agentId?: string; secret?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Invalid JSON' },
      { status: 400 }
    );
  }

  const agentId =
    typeof body.agentId === 'string' ? body.agentId.trim() : undefined;
  const secret =
    typeof body.secret === 'string' ? body.secret.trim() : undefined;

  const auth = await authenticateExternalAgent(agentId, secret);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  let agent = await getAgentById(auth.agent.id);

  if (!agent) {
    const profileMap: Record<string, 'satellite' | 'scout' | 'water_drone' | 'heavy_tanker' | 'supply_drone'> = {
      satellite: 'satellite',
      scout: 'scout',
      water_drone: 'water_drone',
      heavy_tanker: 'heavy_tanker',
      supply_drone: 'supply_drone',
    };
    const agentType = profileMap[auth.agent.profile];
    if (!agentType) {
      return NextResponse.json(
        { ok: false, error: `Unknown profile: ${auth.agent.profile}` },
        { status: 500 }
      );
    }
    agent = await syncExternalAgent({
      agentId: auth.agent.id,
      type: agentType,
      lat: 0,
      lng: 0,
    });
  }

  const perception = await buildPerception(agent);
  return NextResponse.json({ ok: true, perception });
}

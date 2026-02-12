import { NextResponse } from 'next/server';
import { authenticateExternalAgent } from '@/lib/publicAgentsAuth';
import {
  getAgents,
  getFires,
  getBulletinPosts,
  getActiveWorldEvents,
  getTick,
  getEarthLife,
} from '@/app/game/store';
import { buildPerception } from '@/app/game/perception';

type PerceptionBody = {
  agentId?: string;
  secret?: string;
};

export async function POST(request: Request) {
  let body: PerceptionBody;

  try {
    body = (await request.json()) as PerceptionBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Invalid JSON body' },
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

  // Map Supabase profile -> in-game AgentType where applicable
  const profile = auth.agent.profile as
    | 'satellite'
    | 'scout'
    | 'water_drone'
    | 'heavy_tanker'
    | 'supply_drone';

  const tick = getTick();

  // Try to find a live in-memory agent with the same type to reuse our
  // internal perception packet shape. For now, external agents are not yet
  // materialized into the simulation, so we fall back to a global snapshot.
  const liveAgents = getAgents();

  const liveAgent =
    liveAgents.find((a) => a.id === agentId) ??
    liveAgents.find((a) => a.type === profile);

  if (liveAgent) {
    const perception = buildPerception(liveAgent);
    return NextResponse.json({
      ok: true,
      mode: 'approximate_internal',
      tick,
      agent: {
        id: auth.agent.id,
        name: auth.agent.name,
        profile: auth.agent.profile,
        ownerPublicAddress: auth.owner.public_address,
      },
      perception,
    });
  }

  // Fallback: global snapshot-style perception (no positional filtering)
  const fires = getFires();
  const agents = getAgents();
  const bulletin = getBulletinPosts();
  const worldEvents = getActiveWorldEvents();
  const earthLife = getEarthLife();

  return NextResponse.json({
    ok: true,
    mode: 'global',
    tick,
    agent: {
      id: auth.agent.id,
      name: auth.agent.name,
      profile: auth.agent.profile,
      ownerPublicAddress: auth.owner.public_address,
    },
    perception: {
      tick,
      earthLife,
      fires,
      agents,
      bulletin,
      activeWorldEvents: worldEvents,
    },
  });
}


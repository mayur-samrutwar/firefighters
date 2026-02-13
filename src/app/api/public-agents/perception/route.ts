import { NextResponse } from 'next/server';
import { authenticateExternalAgent } from '@/lib/publicAgentsAuth';
import { getAgentById, syncExternalAgent } from '@/app/game/store';
import { buildPerception } from '@/app/game/perception';
import { hasPaidRegistration } from '@/lib/monadTreasury';

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

  // Enforce on-chain registration fee: agent must have paid at least MIN_REGISTRATION_FEE_ETH.
  const ownerAddress = auth.owner.public_address;
  const paid = await hasPaidRegistration(auth.agent.id, ownerAddress);
  if (!paid) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'Registration fee not paid on Monad. Send at least 0.1 MON to the game treasury using registerAgent(bytes32(agentId)) and try again.',
      },
      { status: 402 }
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
      displayName: auth.agent.name,
    });
  } else if (auth.agent.name && auth.agent.name !== agent.displayName) {
    // Keep display name in sync for already-synced agents
    agent = await syncExternalAgent({
      agentId: auth.agent.id,
      type: agent.type,
      lat: agent.lat,
      lng: agent.lng,
      route: agent.route,
      searchRadius: agent.searchRadius,
      displayName: auth.agent.name,
    });
  }

  const perception = await buildPerception(agent);
  return NextResponse.json({ ok: true, perception });
}

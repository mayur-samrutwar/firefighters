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

  // Do NOT auto-create agent here. If the agent is missing (e.g. after a game reset),
  // return 404 so that passive perception polling doesn't keep resurrecting old agents.
  // Agents re-enter the game only when someone sends an action via POST /api/public-agents/act.
  if (!agent) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'Agent not in current game (e.g. game was reset). Send an action via POST /api/public-agents/act to re-enter the game.',
      },
      { status: 404 }
    );
  }

  if (auth.agent.name && auth.agent.name !== agent.displayName) {
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

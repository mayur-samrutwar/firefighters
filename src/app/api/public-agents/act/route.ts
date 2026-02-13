import { NextResponse } from 'next/server';
import { authenticateExternalAgent } from '@/lib/publicAgentsAuth';
import { supabaseServer, isSupabaseConfigured } from '@/lib/supabaseServer';
import { getAgentById, syncExternalAgent } from '@/app/game/store';
import { hasPaidRegistration } from '@/lib/monadTreasury';

type ActBody = {
  agentId?: string;
  secret?: string;
  action?: {
    type?: string;
    [key: string]: unknown;
  };
};

const PROFILE_ACTIONS: Record<string, string[]> = {
  satellite: ['noop', 'set_scan_focus', 'change_route'],
  scout: ['noop', 'move_to', 'investigate_fire'],
  water_drone: ['noop', 'move_to', 'water_fire', 'refill'],
  heavy_tanker: ['noop', 'move_to', 'water_fire', 'refill'],
  supply_drone: ['noop', 'move_to', 'recharge_agent'],
};

const RATE_LIMIT_SECONDS = 45;

export async function POST(request: Request) {
  let body: ActBody;

  try {
    body = (await request.json()) as ActBody;
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
  const action = body.action ?? {};
  const actionType =
    typeof action.type === 'string' ? action.type.trim() : undefined;

  if (!actionType) {
    return NextResponse.json(
      { ok: false, error: 'action.type is required' },
      { status: 400 }
    );
  }

  const auth = await authenticateExternalAgent(agentId, secret);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  // Enforce on-chain registration fee before allowing any actions.
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

  const allowed = PROFILE_ACTIONS[auth.agent.profile] ?? [];
  if (!allowed.includes(actionType)) {
    return NextResponse.json(
      {
        ok: false,
        error: `Action "${actionType}" is not allowed for profile "${auth.agent.profile}"`,
      },
      { status: 400 }
    );
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, error: 'Supabase is not configured on this server' },
      { status: 500 }
    );
  }

  const supabase = supabaseServer.client;
  const now = new Date();

  // Rate limiting via agent_state_meta.last_action_at
  const { data: metaRows, error: metaErr } = await supabase
    .from('agent_state_meta')
    .select('*')
    .eq('agent_id', auth.agent.id)
    .limit(1);

  if (metaErr) {
    return NextResponse.json(
      { ok: false, error: 'Database error while reading agent meta' },
      { status: 500 }
    );
  }

  const meta = metaRows?.[0] as
    | { last_action_at: string | null }
    | undefined
    | null;

  if (meta && meta.last_action_at) {
    const last = new Date(meta.last_action_at).getTime();
    const diffSeconds = (now.getTime() - last) / 1000;
    if (diffSeconds < RATE_LIMIT_SECONDS) {
      const retryAfter = Math.ceil(RATE_LIMIT_SECONDS - diffSeconds);
      return NextResponse.json(
        {
          ok: false,
          error: `Rate limit: wait ${retryAfter}s before sending next action`,
        },
        { status: 429 }
      );
    }
  }

  // Update last_action_at to now
  const { error: upsertErr } = await supabase.from('agent_state_meta').upsert(
    {
      agent_id: auth.agent.id,
      last_action_at: now.toISOString(),
    },
    { onConflict: 'agent_id' }
  );

  if (upsertErr) {
    return NextResponse.json(
      { ok: false, error: 'Database error while updating agent meta' },
      { status: 500 }
    );
  }

  // Sync external agent into game state (DB) if not already present
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

  // Store the action as pendingExternalAction in DB via upsert
  agent.pendingExternalAction = action as { type: string; [key: string]: unknown };
  const { dbUpsertAgent } = await import('@/lib/gameDb');
  await dbUpsertAgent(agent);

  return NextResponse.json({
    ok: true,
    accepted: true,
    agent: {
      id: auth.agent.id,
      profile: auth.agent.profile,
    },
    action: {
      type: actionType,
    },
  });
}

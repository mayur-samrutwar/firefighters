import { supabaseServer, isSupabaseConfigured } from '@/lib/supabaseServer';
import { NextResponse } from 'next/server';
import crypto from 'node:crypto';

const VALID_PROFILES = new Set([
  'satellite',
  'scout',
  'water_drone',
  'heavy_tanker',
  'supply_drone',
]);

type RegisterBody = {
  name?: string;
  publicAddress?: string;
  profile?: string;
};

export async function POST(request: Request) {
  let body: RegisterBody;

  try {
    body = (await request.json()) as RegisterBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const publicAddress =
    typeof body.publicAddress === 'string' ? body.publicAddress.trim() : '';
  const profile = typeof body.profile === 'string' ? body.profile : '';

  if (!name) {
    return NextResponse.json(
      { ok: false, error: 'Agent name is required' },
      { status: 400 }
    );
  }

  if (!publicAddress) {
    return NextResponse.json(
      { ok: false, error: 'publicAddress is required' },
      { status: 400 }
    );
  }

  if (!VALID_PROFILES.has(profile)) {
    return NextResponse.json(
      {
        ok: false,
        error: `Invalid profile. Expected one of: ${Array.from(VALID_PROFILES).join(
          ', '
        )}`,
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

  try {
    // 1. Ensure owner exists (by public_address)
    const { data: existingOwners, error: ownerSelectErr } = await supabase
      .from('owners')
      .select('*')
      .eq('public_address', publicAddress)
      .limit(1);

    if (ownerSelectErr) {
      throw ownerSelectErr;
    }

    let owner = existingOwners?.[0] ?? null;

    if (!owner) {
      const { data: createdOwner, error: ownerInsertErr } = await supabase
        .from('owners')
        .insert({
          public_address: publicAddress,
          display_name: null,
        })
        .select()
        .single();

      if (ownerInsertErr) {
        throw ownerInsertErr;
      }
      owner = createdOwner;
    }

    // 2. Create agent row for this owner
    const { data: agent, error: agentErr } = await supabase
      .from('agents')
      .insert({
        owner_id: owner.id,
        name,
        profile,
        control_mode: 'external',
        status: 'active',
      })
      .select()
      .single();

    if (agentErr) {
      throw agentErr;
    }

    // 3. Generate secret and store its hash
    const rawSecret = crypto.randomBytes(32).toString('hex');
    const secretHash = crypto
      .createHash('sha256')
      .update(rawSecret)
      .digest('hex');

    const { error: secretErr } = await supabase.from('agent_secrets').insert({
      agent_id: agent.id,
      secret_hash: secretHash,
    });

    if (secretErr) {
      throw secretErr;
    }

    // 4. Pre-create state meta row (optional but convenient for later rate limiting, etc.)
    await supabase.from('agent_state_meta').insert({
      agent_id: agent.id,
    });

    return NextResponse.json({
      ok: true,
      agent: {
        id: agent.id,
        name: agent.name,
        profile: agent.profile,
        ownerId: agent.owner_id,
      },
      secret: rawSecret,
    });
  } catch (error: any) {
    // We intentionally do not expose database error details to the client.
    return NextResponse.json(
      { ok: false, error: 'Failed to register agent' },
      { status: 500 }
    );
  }
}


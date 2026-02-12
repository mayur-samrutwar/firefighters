import { supabaseServer, isSupabaseConfigured } from './supabaseServer.ts';
import crypto from 'node:crypto';

type AgentRow = {
  id: string;
  owner_id: string;
  name: string;
  profile: string;
  control_mode: string;
  status: string;
};

type OwnerRow = {
  id: string;
  public_address: string;
  display_name: string | null;
};

export type AgentAuthSuccess = {
  ok: true;
  agent: AgentRow;
  owner: OwnerRow;
};

export type AgentAuthFailure = {
  ok: false;
  status: number;
  error: string;
};

export type AgentAuthResult = AgentAuthSuccess | AgentAuthFailure;

/**
 * authenticateExternalAgent
 *
 * Shared helper used by public agent APIs to authenticate an external agent
 * by (agentId, secret). It verifies:
 *  - Supabase is configured
 *  - Agent exists
 *  - Agent is control_mode = 'external' and status = 'active'
 *  - Provided secret matches the stored SHA-256 hash in agent_secrets
 *  - Owner row exists for the agent
 */
export async function authenticateExternalAgent(
  agentId: string | null | undefined,
  secret: string | null | undefined
): Promise<AgentAuthResult> {
  if (!agentId || !secret) {
    return {
      ok: false,
      status: 401,
      error: 'Missing agentId or secret',
    };
  }

  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      status: 500,
      error: 'Supabase is not configured on this server',
    };
  }

  const supabase = supabaseServer.client;

  try {
    // 1. Load agent
    const { data: agents, error: agentErr } = await supabase
      .from('agents')
      .select('*')
      .eq('id', agentId)
      .limit(1);

    if (agentErr) {
      return { ok: false, status: 500, error: 'Database error while loading agent' };
    }

    const agent = (agents?.[0] as AgentRow | undefined) ?? null;
    if (!agent) {
      return { ok: false, status: 401, error: 'Invalid agentId or secret' };
    }

    if (agent.control_mode !== 'external') {
      return {
        ok: false,
        status: 403,
        error: 'Agent is not externally controlled',
      };
    }

    if (agent.status !== 'active') {
      return {
        ok: false,
        status: 403,
        error: 'Agent is not active',
      };
    }

    // 2. Verify secret
    const secretHash = crypto.createHash('sha256').update(secret).digest('hex');

    const { data: secrets, error: secretErr } = await supabase
      .from('agent_secrets')
      .select('*')
      .eq('agent_id', agentId)
      .eq('secret_hash', secretHash)
      .limit(1);

    if (secretErr) {
      return {
        ok: false,
        status: 500,
        error: 'Database error while verifying secret',
      };
    }

    if (!secrets || secrets.length === 0) {
      return { ok: false, status: 401, error: 'Invalid agentId or secret' };
    }

    // 3. Load owner
    const { data: owners, error: ownerErr } = await supabase
      .from('owners')
      .select('*')
      .eq('id', agent.owner_id)
      .limit(1);

    if (ownerErr) {
      return {
        ok: false,
        status: 500,
        error: 'Database error while loading owner',
      };
    }

    const owner = (owners?.[0] as OwnerRow | undefined) ?? null;
    if (!owner) {
      return { ok: false, status: 500, error: 'Owner not found for agent' };
    }

    return {
      ok: true,
      agent,
      owner,
    };
  } catch {
    return {
      ok: false,
      status: 500,
      error: 'Unexpected error while authenticating agent',
    };
  }
}


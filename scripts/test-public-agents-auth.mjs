#!/usr/bin/env node
/**
 * Public Agents — Auth tests (via API)
 *
 * Verifies that /api/public-agents/perception:
 *  - Succeeds (200 or 402) for valid (agentId, secret) — 402 = unpaid, auth still OK
 *  - Returns 401 for wrong secret
 *  - Returns 403 for non-external agent (internal agents cannot use public APIs)
 *
 * Usage:
 *   1. Start dev server: npm run dev  (or use API_URL for remote)
 *   2. Ensure Supabase env vars are set
 *   3. Run: node scripts/test-public-agents-auth.mjs [baseUrl]
 */

/* eslint-disable no-console */

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import crypto from 'node:crypto';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const BASE =
  process.argv[2] ||
  process.env.API_URL ||
  'https://firefighters-six.vercel.app';

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.log(`  ❌ FAIL: ${label}`);
  }
}

async function main() {
  console.log('\n🔐 Public Agents — Auth Test Suite (via API)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const supabasePath = pathToFileURL(
    path.join(process.cwd(), 'src', 'lib', 'supabaseServer.ts')
  ).href;

  let supabaseModule;
  try {
    supabaseModule = await import(supabasePath);
  } catch (err) {
    console.error('\n❌ Cannot import supabaseServer:', err);
    process.exit(1);
  }

  const { isSupabaseConfigured, supabaseServer } = supabaseModule;
  if (!isSupabaseConfigured?.() || !supabaseServer?.client) {
    console.log(
      'SKIP: Supabase not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
    );
    process.exit(0);
  }

  const supabase = supabaseServer.client;
  const runId = `auth-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
  const publicAddress = `0x${runId}`;
  const rawSecret = crypto.randomBytes(16).toString('hex');
  const wrongSecret = 'wrong-secret';

  let ownerId = null;
  let goodAgentId = null;
  let internalAgentId = null;

  try {
    console.log('\n🧪 Setup: create owner and agents in Supabase');

    const { data: owner, error: ownerErr } = await supabase
      .from('owners')
      .insert({
        public_address: publicAddress,
        display_name: `Auth Test ${runId}`,
      })
      .select()
      .single();
    assert(!ownerErr, `Owner insert succeeded${ownerErr ? `: ${ownerErr.message}` : ''}`);
    ownerId = owner?.id ?? null;
    assert(ownerId, 'Owner has id');

    const { data: goodAgent, error: goodAgentErr } = await supabase
      .from('agents')
      .insert({
        owner_id: ownerId,
        name: `Ext ${runId}`,
        profile: 'satellite',
        control_mode: 'external',
        status: 'active',
      })
      .select()
      .single();
    assert(!goodAgentErr, 'External agent insert succeeded');
    goodAgentId = goodAgent?.id ?? null;
    assert(goodAgentId, 'External agent has id');

    const secretHash = crypto.createHash('sha256').update(rawSecret).digest('hex');
    await supabase.from('agent_secrets').insert({
      agent_id: goodAgentId,
      secret_hash: secretHash,
    });

    const { data: internalAgent, error: internalErr } = await supabase
      .from('agents')
      .insert({
        owner_id: ownerId,
        name: `Internal ${runId}`,
        profile: 'satellite',
        control_mode: 'internal',
        status: 'active',
      })
      .select()
      .single();
    assert(!internalErr, 'Internal agent insert succeeded');
    internalAgentId = internalAgent?.id ?? null;
    assert(internalAgentId, 'Internal agent has id');
    await supabase.from('agent_secrets').insert({
      agent_id: internalAgentId,
      secret_hash: secretHash,
    });

    console.log('\n🧪 Test 1: Valid agentId + secret (auth OK; 200 or 402 unpaid)');
    const resOk = await fetch(`${BASE}/api/public-agents/perception`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: goodAgentId, secret: rawSecret }),
    });
    assert(
      resOk.status === 200 || resOk.status === 402,
      `Valid credentials return 200 or 402 (got ${resOk.status})`
    );

    console.log('\n🧪 Test 2: Wrong secret → 401');
    const resWrong = await fetch(`${BASE}/api/public-agents/perception`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: goodAgentId, secret: wrongSecret }),
    });
    assert(resWrong.status === 401, `Wrong secret returns 401 (got ${resWrong.status})`);

    console.log('\n🧪 Test 3: Internal agent → 403');
    const resInternal = await fetch(`${BASE}/api/public-agents/perception`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: internalAgentId, secret: rawSecret }),
    });
    assert(resInternal.status === 403, `Internal agent returns 403 (got ${resInternal.status})`);
  } finally {
    console.log('\n🧹 Cleanup: deleting test rows');
    if (goodAgentId) {
      await supabase.from('agent_secrets').delete().eq('agent_id', goodAgentId);
      await supabase.from('agents').delete().eq('id', goodAgentId);
    }
    if (internalAgentId) {
      await supabase.from('agent_secrets').delete().eq('agent_id', internalAgentId);
      await supabase.from('agents').delete().eq('id', internalAgentId);
    }
    if (ownerId) await supabase.from('owners').delete().eq('id', ownerId);
  }

  console.log('\n' + '━'.repeat(50));
  console.log(`\n📊 Public agents auth tests: ${passed} passed, ${failed} failed`);

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('\n❌ Auth test crashed:', err);
  process.exit(1);
});

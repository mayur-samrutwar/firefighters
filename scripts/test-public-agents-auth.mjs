#!/usr/bin/env node
/**
 * Public Agents — Auth helper tests
 *
 * Verifies that authenticateExternalAgent:
 *  - Succeeds for a valid (agentId, secret) pair
 *  - Fails for wrong secret
 *  - Rejects non-external / inactive agents
 *
 * Usage:
 *   1. Start dev server: npm run dev  (for consistency with other tests)
 *   2. Ensure Supabase env vars are set and schema has been applied
 *   3. Run: node scripts/test-public-agents-auth.mjs
 */

/* eslint-disable no-console */

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import crypto from 'node:crypto';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

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
  console.log('\n🔐 Public Agents — Auth Helper Test Suite');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Import Supabase helper
  const supabasePath = pathToFileURL(
    path.join(process.cwd(), 'src', 'lib', 'supabaseServer.ts')
  ).href;
  const authPath = pathToFileURL(
    path.join(process.cwd(), 'src', 'lib', 'publicAgentsAuth.ts')
  ).href;

  let supabaseModule;
  let authModule;
  try {
    supabaseModule = await import(supabasePath);
    authModule = await import(authPath);
  } catch (err) {
    console.error('\n❌ Cannot import Supabase/auth helpers:', err);
    process.exit(1);
  }

  const { isSupabaseConfigured, supabaseServer } = supabaseModule;
  const { authenticateExternalAgent } = authModule;

  if (!isSupabaseConfigured || !supabaseServer || !authenticateExternalAgent) {
    console.error('\n❌ Required exports missing from helper modules');
    process.exit(1);
  }

  if (!isSupabaseConfigured()) {
    console.log(
      'SKIP: Supabase is not configured (env vars missing). ' +
        'Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY first.'
    );
    process.exit(0);
  }

  const supabase = supabaseServer.client;

  const runId = `auth-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
  const publicAddress = `0x${runId}`;

  let ownerId = null;
  let goodAgentId = null;
  let internalAgentId = null;
  const rawSecret = crypto.randomBytes(16).toString('hex');
  const wrongSecret = 'definitely-wrong-secret';

  try {
    console.log('\n🧪 Setup: create owner and agents in Supabase');

    // Owner
    const { data: owner, error: ownerErr } = await supabase
      .from('owners')
      .insert({
        public_address: publicAddress,
        display_name: `Auth Test Owner ${runId}`,
      })
      .select()
      .single();

    assert(!ownerErr, `Owner insert succeeded${ownerErr ? `: ${ownerErr.message}` : ''}`);
    ownerId = owner?.id ?? null;
    assert(ownerId, 'Owner has id');

    // External active agent
    const { data: goodAgent, error: goodAgentErr } = await supabase
      .from('agents')
      .insert({
        owner_id: ownerId,
        name: `Ext Agent ${runId}`,
        profile: 'satellite',
        control_mode: 'external',
        status: 'active',
      })
      .select()
      .single();

    assert(!goodAgentErr, `External agent insert succeeded${goodAgentErr ? `: ${goodAgentErr.message}` : ''}`);
    goodAgentId = goodAgent?.id ?? null;
    assert(goodAgentId, 'External agent has id');

    const secretHash = crypto.createHash('sha256').update(rawSecret).digest('hex');
    const { error: secretErr } = await supabase.from('agent_secrets').insert({
      agent_id: goodAgentId,
      secret_hash: secretHash,
    });
    assert(!secretErr, `agent_secrets insert for external agent succeeded${secretErr ? `: ${secretErr.message}` : ''}`);

    // Internal / non-external agent
    const { data: internalAgent, error: internalErr } = await supabase
      .from('agents')
      .insert({
        owner_id: ownerId,
        name: `Internal Agent ${runId}`,
        profile: 'satellite',
        control_mode: 'internal',
        status: 'active',
      })
      .select()
      .single();

    assert(!internalErr, `Internal agent insert succeeded${internalErr ? `: ${internalErr.message}` : ''}`);
    internalAgentId = internalAgent?.id ?? null;
    assert(internalAgentId, 'Internal agent has id');

    const { error: internalSecretErr } = await supabase.from('agent_secrets').insert({
      agent_id: internalAgentId,
      secret_hash: secretHash,
    });
    assert(
      !internalSecretErr,
      `agent_secrets insert for internal agent succeeded${internalSecretErr ? `: ${internalSecretErr.message}` : ''}`
    );

    console.log('\n🧪 Test 1: Valid agentId + secret authenticates');

    const okResult = await authenticateExternalAgent(goodAgentId, rawSecret);
    assert(okResult.ok === true, 'Authentication succeeded');
    if (okResult.ok) {
      assert(okResult.agent.id === goodAgentId, 'Returned agent id matches');
      assert(okResult.owner.id === ownerId, 'Returned owner id matches');
    }

    console.log('\n🧪 Test 2: Wrong secret is rejected');
    const wrongResult = await authenticateExternalAgent(goodAgentId, wrongSecret);
    assert(wrongResult.ok === false, 'Authentication with wrong secret fails');
    assert(wrongResult.status === 401, 'Wrong secret returns 401');

    console.log('\n🧪 Test 3: Non-external agent is rejected');
    const internalResult = await authenticateExternalAgent(internalAgentId, rawSecret);
    assert(internalResult.ok === false, 'Internal agent authentication fails');
    assert(internalResult.status === 403, 'Internal agent returns 403');
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
    if (ownerId) {
      await supabase.from('owners').delete().eq('id', ownerId);
    }
  }

  console.log('\n' + '━'.repeat(50));
  console.log(
    `\n📊 Public agents auth tests: ${passed} passed, ${failed} failed out of ${
      passed + failed
    } assertions`
  );

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\n❌ Public agents auth test crashed:', err);
  process.exit(1);
});


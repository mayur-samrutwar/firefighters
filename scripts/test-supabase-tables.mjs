#!/usr/bin/env node
/**
 * Supabase integration sanity test for Firefighters external agent tables.
 *
 * This script:
 *  - Inserts a test owner, agent, agent_secret and agent_state_meta
 *  - Verifies they can be read back with the expected shape
 *  - Deletes ONLY the rows it created (no global resets)
 *
 * It is safe to run multiple times; each run uses unique IDs.
 */

/* eslint-disable no-console */

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';

// Load environment variables from .env.local if present
dotenv.config({ path: path.join(process.cwd(), '.env.local') });

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) {
    failed += 1;
    console.log(`  ❌ FAIL: ${message}`);
  } else {
    passed += 1;
    console.log(`  ✅ ${message}`);
  }
}

async function main() {
  console.log('\n🔌 Supabase Tables Test');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const helperPath = pathToFileURL(
    path.join(process.cwd(), 'src', 'lib', 'supabaseServer.ts')
  ).href;

  let supabaseModule;
  try {
    supabaseModule = await import(helperPath);
  } catch (err) {
    console.error('\n❌ Cannot import supabaseServer helper:', err);
    process.exit(1);
  }

  const { isSupabaseConfigured, supabaseServer } = supabaseModule;
  if (!isSupabaseConfigured || !supabaseServer) {
    console.error(
      '\n❌ supabaseServer or isSupabaseConfigured not exported from src/lib/supabaseServer.ts'
    );
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

  // Use a unique suffix so multiple runs don't clash
  const runId = `test-${Date.now()}-${Math.round(Math.random() * 1e6)}`;

  let ownerId = null;
  let agentId = null;

  try {
    console.log('\n🧪 Step 1: Insert owner');

    const { data: owner, error: ownerErr } = await supabase
      .from('owners')
      .insert({
        public_address: `0x${runId}`,
        display_name: `Test Owner ${runId}`,
      })
      .select()
      .single();

    assert(!ownerErr, `Owner insert succeeded${ownerErr ? `: ${ownerErr.message}` : ''}`);
    assert(owner && owner.id, 'Owner has id');
    assert(owner.public_address === `0x${runId}`, 'Owner public_address matches');
    ownerId = owner?.id ?? null;

    console.log('\n🧪 Step 2: Insert agent');

    const { data: agent, error: agentErr } = await supabase
      .from('agents')
      .insert({
        owner_id: ownerId,
        name: `Test Agent ${runId}`,
        profile: 'satellite',
        control_mode: 'external',
        status: 'active',
      })
      .select()
      .single();

    assert(!agentErr, `Agent insert succeeded${agentErr ? `: ${agentErr.message}` : ''}`);
    assert(agent && agent.id, 'Agent has id');
    assert(agent.owner_id === ownerId, 'Agent.owner_id matches owner.id');
    assert(agent.profile === 'satellite', 'Agent profile is satellite');
    agentId = agent?.id ?? null;

    console.log('\n🧪 Step 3: Insert agent secret');

    const testSecretHash = `hash-${runId}`;
    const { data: secretRow, error: secretErr } = await supabase
      .from('agent_secrets')
      .insert({
        agent_id: agentId,
        secret_hash: testSecretHash,
      })
      .select()
      .single();

    assert(!secretErr, `agent_secrets insert succeeded${secretErr ? `: ${secretErr.message}` : ''}`);
    assert(secretRow && secretRow.agent_id === agentId, 'agent_secrets.agent_id matches agent.id');
    assert(secretRow.secret_hash === testSecretHash, 'secret_hash matches');

    console.log('\n🧪 Step 4: Insert agent_state_meta');

    const now = new Date().toISOString();
    const { data: metaRow, error: metaErr } = await supabase
      .from('agent_state_meta')
      .insert({
        agent_id: agentId,
        last_action_at: now,
        // bigint column in Postgres; JS client can send a regular number,
        // Postgres will upcast it to bigint.
        last_tick_seen: 123,
        last_error: null,
        last_error_at: null,
      })
      .select()
      .single();

    assert(!metaErr, `agent_state_meta insert succeeded${metaErr ? `: ${metaErr.message}` : ''}`);
    assert(metaRow && metaRow.agent_id === agentId, 'agent_state_meta.agent_id matches agent.id');

    console.log('\n🧪 Step 5: Read back and verify relationships');

    const { data: agentsForOwner, error: listErr } = await supabase
      .from('agents')
      .select('*')
      .eq('owner_id', ownerId);

    assert(!listErr, `Select agents for owner succeeded${listErr ? `: ${listErr.message}` : ''}`);
    assert(
      Array.isArray(agentsForOwner) && agentsForOwner.some((a) => a.id === agentId),
      'Owner has the test agent in agents table'
    );
  } finally {
    console.log('\n🧹 Cleanup: deleting test rows');

    if (agentId) {
      await supabase.from('agent_state_meta').delete().eq('agent_id', agentId);
      await supabase.from('agent_secrets').delete().eq('agent_id', agentId);
      await supabase.from('agents').delete().eq('id', agentId);
    }
    if (ownerId) {
      await supabase.from('owners').delete().eq('id', ownerId);
    }
  }

  console.log('\n' + '━'.repeat(50));
  console.log(
    `\n📊 Supabase table test results: ${passed} passed, ${failed} failed out of ${
      passed + failed
    } checks`
  );

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\n❌ Supabase tables test crashed:', err);
  process.exit(1);
});


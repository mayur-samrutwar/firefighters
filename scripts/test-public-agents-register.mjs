#!/usr/bin/env node
/**
 * Public Agents — Register API tests
 *
 * Verifies that /api/public-agents/register:
 *  - Validates input
 *  - Creates owner + agent + agent_secret + agent_state_meta rows in Supabase
 *  - Returns an agentId and secret
 *  - Cleans up ONLY the rows created by the test
 *
 * Usage:
 *   1. Start dev server: npm run dev
 *   2. Ensure Supabase env vars are set and schema has been applied
 *   3. Run: node scripts/test-public-agents-register.mjs [baseUrl]
 */

/* eslint-disable no-console */

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const BASE =
  process.argv[2] || process.env.API_URL || 'http://localhost:3000';

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
  console.log(`\n🌐 Public Agents — Register API Test Suite — ${BASE}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Quick connectivity check
  try {
    const res = await fetch(`${BASE}/api/state`);
    if (!res.ok) {
      throw new Error('Non-200 from /api/state');
    }
  } catch (err) {
    console.error(`\n❌ Cannot reach server at ${BASE}`);
    console.error('   Start the dev server first: npm run dev\n');
    process.exit(1);
  }

  // Import Supabase helper for DB verification + cleanup
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

  const runId = `pubagent-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
  const publicAddress = `0x${runId}`;
  const agentName = `PublicAgent ${runId}`;

  let ownerId = null;
  let agentId = null;

  try {
    console.log('\n🧪 Test 1: Successful registration creates DB rows');

    const res = await fetch(`${BASE}/api/public-agents/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: agentName,
        publicAddress,
        profile: 'satellite',
      }),
    });

    assert(res.ok, `HTTP response OK from /api/public-agents/register (status ${res.status})`);
    const json = await res.json();

    assert(json.ok === true, 'JSON ok=true');
    assert(json.agent && typeof json.agent.id === 'string', 'Response has agent.id');
    assert(typeof json.secret === 'string', 'Response has secret string');
    assert(json.agent.profile === 'satellite', 'Agent profile is satellite');

    agentId = json.agent.id;

    // Owner row
    const { data: owners, error: ownerErr } = await supabase
      .from('owners')
      .select('*')
      .eq('public_address', publicAddress)
      .limit(1);

    assert(!ownerErr, `Select owner by public_address succeeded${ownerErr ? `: ${ownerErr.message}` : ''}`);
    assert(Array.isArray(owners) && owners.length === 1, 'Owner row exists for publicAddress');

    ownerId = owners?.[0]?.id ?? null;
    assert(ownerId, 'Owner has id');

    // Agent row
    const { data: agents, error: agentsErr } = await supabase
      .from('agents')
      .select('*')
      .eq('id', agentId)
      .limit(1);

    assert(!agentsErr, `Select agent by id succeeded${agentsErr ? `: ${agentsErr.message}` : ''}`);
    assert(Array.isArray(agents) && agents.length === 1, 'Agent row exists for id');
    const agentRow = agents?.[0];
    assert(agentRow.owner_id === ownerId, 'Agent.owner_id matches owner.id');

    // Secret row
    const { data: secrets, error: secretsErr } = await supabase
      .from('agent_secrets')
      .select('*')
      .eq('agent_id', agentId)
      .limit(1);

    assert(!secretsErr, `Select agent_secrets by agent_id succeeded${secretsErr ? `: ${secretsErr.message}` : ''}`);
    assert(Array.isArray(secrets) && secrets.length === 1, 'agent_secrets row exists for agent');
    assert(typeof secrets[0].secret_hash === 'string', 'secret_hash stored for agent');

    // Meta row
    const { data: meta, error: metaErr } = await supabase
      .from('agent_state_meta')
      .select('*')
      .eq('agent_id', agentId)
      .limit(1);

    assert(!metaErr, `Select agent_state_meta by agent_id succeeded${metaErr ? `: ${metaErr.message}` : ''}`);
    assert(Array.isArray(meta) && meta.length === 1, 'agent_state_meta row exists for agent');

    console.log('\n🧪 Test 2: Validation errors for bad payloads');

    const badRes = await fetch(`${BASE}/api/public-agents/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: '',
        publicAddress: '',
        profile: 'not_a_profile',
      }),
    });

    const badJson = await badRes.json().catch(() => ({}));
    assert(badRes.status === 400, 'Invalid payload returns 400');
    assert(badJson.ok === false, 'Invalid payload returns ok=false');
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
    `\n📊 Public agents register tests: ${passed} passed, ${failed} failed out of ${
      passed + failed
    } assertions`
  );

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\n❌ Public agents register test crashed:', err);
  process.exit(1);
});


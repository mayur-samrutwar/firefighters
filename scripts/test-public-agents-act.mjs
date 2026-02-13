#!/usr/bin/env node
/**
 * Public Agents — Act API tests
 *
 * Verifies that /api/public-agents/act:
 *  - Authenticates via agentId + secret
 *  - Enforces profile-specific allowed actions
 *  - Enforces a 45s per-agent rate limit using agent_state_meta.last_action_at
 *
 * Usage:
 *   1. Start dev server: npm run dev
 *   2. Ensure Supabase env vars are set and schema has been applied
 *   3. Run: node scripts/test-public-agents-act.mjs [baseUrl]
 */

/* eslint-disable no-console */

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';

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
  console.log(`\n🌐 Public Agents — Act API Test Suite — ${BASE}`);
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

  // Import Supabase helper for cleanup / meta checks
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

  let ownerId = null;
  let agentId = null;

  try {
    console.log('\n🧪 Setup: register external satellite agent via public API');

    const runId = `act-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    const publicAddress = `0x${runId}`;

    const regRes = await fetch(`${BASE}/api/public-agents/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `Act Agent ${runId}`,
        publicAddress,
        profile: 'satellite',
      }),
    });

    assert(regRes.ok, `Registration HTTP OK (status ${regRes.status})`);
    const regJson = await regRes.json();
    assert(regJson.ok === true, 'Registration ok=true');
    assert(typeof regJson.secret === 'string', 'Registration returned secret');
    agentId = regJson.agent.id;

    // Owner id for cleanup
    const { data: owners } = await supabase
      .from('owners')
      .select('*')
      .eq('public_address', publicAddress)
      .limit(1);
    ownerId = owners?.[0]?.id ?? null;

    console.log('\n🧪 Test 1: Accept allowed action for profile');

    const actRes = await fetch(`${BASE}/api/public-agents/act`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId,
        secret: regJson.secret,
        action: { type: 'noop' },
      }),
    });

    assert(actRes.ok, `Act HTTP OK (status ${actRes.status})`);
    const actJson = await actRes.json();
    assert(actJson.ok === true, 'Act ok=true');
    assert(actJson.accepted === true, 'Act accepted');
    assert(actJson.agent && actJson.agent.id === agentId, 'Act response has matching agent id');

    // last_action_at should have been set
    const { data: metaRows } = await supabase
      .from('agent_state_meta')
      .select('*')
      .eq('agent_id', agentId)
      .limit(1);
    const meta = metaRows?.[0];
    assert(
      meta && meta.last_action_at,
      'agent_state_meta.last_action_at set after act'
    );

    console.log('\n🧪 Test 2: Rate limit second action within 45s');

    const rateRes = await fetch(`${BASE}/api/public-agents/act`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId,
        secret: regJson.secret,
        action: { type: 'noop' },
      }),
    });

    const rateJson = await rateRes.json().catch(() => ({}));
    assert(rateRes.status === 429, 'Second action returns 429');
    assert(rateJson.ok === false, 'Second action ok=false under rate limit');

    console.log('\n🧪 Test 3: Invalid action for profile rejected');

    const badActRes = await fetch(`${BASE}/api/public-agents/act`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId,
        secret: regJson.secret,
        action: { type: 'water_fire' }, // not allowed for satellite
      }),
    });

    const badActJson = await badActRes.json().catch(() => ({}));
    assert(badActRes.status === 400, 'Invalid action returns 400');
    assert(badActJson.ok === false, 'Invalid action returns ok=false');

    console.log('\n🧪 Test 4: Wrong secret rejected');

    const wrongRes = await fetch(`${BASE}/api/public-agents/act`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId,
        secret: 'wrong-secret',
        action: { type: 'noop' },
      }),
    });

    const wrongJson = await wrongRes.json().catch(() => ({}));
    assert(wrongRes.status === 401, 'Wrong secret returns 401');
    assert(wrongJson.ok === false, 'Wrong secret returns ok=false');
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
    `\n📊 Public agents act tests: ${passed} passed, ${failed} failed out of ${
      passed + failed
    } assertions`
  );

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\n❌ Public agents act test crashed:', err);
  process.exit(1);
});


#!/usr/bin/env node
/**
 * Public Agents — Perception API tests
 *
 * Verifies that /api/public-agents/perception:
 *  - Requires valid agentId + secret
 *  - Returns a structured perception payload for a registered agent
 *  - Rejects bad credentials
 *
 * Usage:
 *   1. Start dev server: npm run dev
 *   2. Ensure Supabase env vars are set and schema has been applied
 *   3. Run: node scripts/test-public-agents-perception.mjs [baseUrl]
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
  console.log(`\n🌐 Public Agents — Perception API Test Suite — ${BASE}`);
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

  // Import Supabase helper for cleanup
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
    console.log('\n🧪 Setup: register external agent via public API');

    const runId = `perception-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    const publicAddress = `0x${runId}`;

    // Use the public register API to mimic real client flow
    const regRes = await fetch(`${BASE}/api/public-agents/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `Perception Agent ${runId}`,
        publicAddress,
        profile: 'satellite',
      }),
    });

    assert(regRes.ok, `Registration HTTP OK (status ${regRes.status})`);
    const regJson = await regRes.json();
    assert(regJson.ok === true, 'Registration ok=true');
    assert(typeof regJson.secret === 'string', 'Registration returned secret');
    agentId = regJson.agent.id;

    // Owner for cleanup
    const { data: owners } = await supabase
      .from('owners')
      .select('*')
      .eq('public_address', publicAddress)
      .limit(1);
    ownerId = owners?.[0]?.id ?? null;

    console.log('\n🧪 Test 1: Successful perception request (200) or payment required (402)');

    const goodRes = await fetch(`${BASE}/api/public-agents/perception`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId,
        secret: regJson.secret,
      }),
    });

    const goodJson = await goodRes.json();
    const accepted = goodRes.ok || goodRes.status === 402;
    assert(accepted, `Perception returns 200 or 402 (status ${goodRes.status})`);

    if (goodRes.status === 402) {
      assert(goodJson.ok === false && goodJson.error, '402 response has ok=false and error message');
    } else {
      assert(goodJson.ok === true, 'Perception ok=true');
      assert(typeof goodJson.tick === 'number', 'Perception has tick');
      assert(
        goodJson.agent && goodJson.agent.id === agentId,
        'Perception response has matching agent id'
      );
      assert(
        goodJson.perception &&
          (Array.isArray(goodJson.perception?.fires) ||
            Array.isArray(goodJson.perception?.nearbyFires)),
        'Perception contains fire information'
      );
    }

    console.log('\n🧪 Test 2: Rejected with wrong secret');

    const badRes = await fetch(`${BASE}/api/public-agents/perception`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId,
        secret: 'clearly-wrong-secret',
      }),
    });

    const badJson = await badRes.json().catch(() => ({}));
    assert(badRes.status === 401, 'Wrong secret returns 401');
    assert(badJson.ok === false, 'Wrong secret returns ok=false');
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
    `\n📊 Public agents perception tests: ${passed} passed, ${failed} failed out of ${
      passed + failed
    } assertions`
  );

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\n❌ Public agents perception test crashed:', err);
  process.exit(1);
});


#!/usr/bin/env node
/**
 * Integration tests for the DB-backed game state migration.
 *
 * Run:  node scripts/test-db-migration.mjs
 * Requires: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 *           AND the game tables created via supabase/schema-game.sql
 *
 * Usage: start the dev server first (npm run dev) then run this script.
 */

const BASE =
  process.env.TEST_BASE_URL ||
  'https://www.firefighters-six.vercel.app';

let passed = 0;
let failed = 0;
const errors = [];

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✅ ${message}`);
  } else {
    failed++;
    errors.push(message);
    console.log(`  ❌ ${message}`);
  }
}

async function api(method, path, body) {
  const url = `${BASE}${path}`;
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ...json };
}

/* ─── Tests ─────────────────────────────────────────────── */

async function testReset() {
  console.log('\n🔄 Test: Reset state');
  const res = await api('POST', '/api/test-reset');
  assert(res.ok === true, 'Reset should succeed');

  const state = await api('GET', '/api/state');
  assert(state.tick === 0, 'Tick should be 0 after reset');
  assert(Array.isArray(state.fires), 'Fires should be an array');
  assert(state.fires.length === 0, 'No fires after reset');
  assert(Array.isArray(state.agents), 'Agents should be an array');
  assert(state.agents.length === 0, 'No agents after reset');
  assert(state.earthLife === 100, 'Earth life should be 100');
  assert(
    Array.isArray(state.leaderboard) && state.leaderboard.length === 0,
    'Leaderboard empty'
  );
  assert(
    Array.isArray(state.bulletin) && state.bulletin.length === 0,
    'Bulletin empty'
  );
}

async function testTick() {
  console.log('\n⏱ Test: Process tick');
  const before = await api('GET', '/api/state');
  const tickBefore = before.tick;

  const res = await api('POST', '/api/tick');
  assert(res.ok === true, 'Tick should succeed');

  const after = await api('GET', '/api/state');
  assert(after.tick === tickBefore + 1, 'Tick should increment by 1');
}

async function testTickWithFire() {
  console.log('\n🔥 Test: Tick with new fire');
  const res = await api('POST', '/api/tick', {
    fireLat: 35.0,
    fireLng: -120.0,
  });
  assert(res.ok === true, 'Tick with fire should succeed');

  const state = await api('GET', '/api/state');
  assert(state.fires.length >= 1, 'At least 1 fire should exist');

  const fire = state.fires.find(
    (f) => Math.abs(f.lat - 35.0) < 1 && Math.abs(f.lng - (-120.0)) < 1
  );
  assert(!!fire, 'Created fire should be near (35, -120)');
  assert(fire?.intensity >= 1, 'Fire intensity should be at least 1');
}

async function testDeployAgent() {
  console.log('\n🤖 Test: Deploy agents');

  // Deploy a satellite
  const sat = await api('POST', '/api/agents/deploy', {
    type: 'satellite',
    route: [
      [0, -180],
      [0, 0],
      [0, 180],
    ],
  });
  assert(sat.ok === true, 'Satellite deploy should succeed');
  assert(sat.agent?.type === 'satellite', 'Agent type should be satellite');
  assert(Array.isArray(sat.agent?.route), 'Satellite should have a route');

  // Deploy a scout
  const scout = await api('POST', '/api/agents/deploy', {
    type: 'scout',
    lat: 40,
    lng: -74,
  });
  assert(scout.ok === true, 'Scout deploy should succeed');
  assert(scout.agent?.type === 'scout', 'Agent type should be scout');

  // Deploy a water drone
  const water = await api('POST', '/api/agents/deploy', {
    type: 'water_drone',
    lat: 35,
    lng: -120,
  });
  assert(water.ok === true, 'Water drone deploy should succeed');
  assert(
    water.agent?.waterLevel > 0,
    'Water drone should start with water'
  );

  // Deploy a heavy tanker
  const tanker = await api('POST', '/api/agents/deploy', {
    type: 'heavy_tanker',
    lat: 30,
    lng: -115,
  });
  assert(tanker.ok === true, 'Heavy tanker deploy should succeed');
  assert(
    tanker.agent?.waterCapacity > 0,
    'Heavy tanker should have water capacity'
  );

  // Deploy a supply drone
  const supply = await api('POST', '/api/agents/deploy', {
    type: 'supply_drone',
    lat: 20,
    lng: -80,
  });
  assert(supply.ok === true, 'Supply drone deploy should succeed');
  assert(
    supply.agent?.chargeLevel > 0,
    'Supply drone should have charge'
  );

  // Deploy a coordinator
  const coord = await api('POST', '/api/agents/deploy', {
    type: 'coordinator',
    lat: 0,
    lng: 0,
  });
  assert(coord.ok === true, 'Coordinator deploy should succeed');

  // Verify state
  const state = await api('GET', '/api/state');
  assert(state.agents.length >= 6, 'Should have at least 6 agents');
}

async function testDeployValidation() {
  console.log('\n⛔ Test: Deploy validation');

  const bad1 = await api('POST', '/api/agents/deploy', {
    type: 'unknown_type',
  });
  assert(bad1.ok === false, 'Invalid type should fail');

  const bad2 = await api('POST', '/api/agents/deploy', {
    type: 'scout',
  });
  assert(bad2.ok === false, 'Scout without lat/lng should fail');
}

async function testPlayerRegistration() {
  console.log('\n👤 Test: Player registration');

  const reg = await api('POST', '/api/players', { name: 'TestPlayer' });
  assert(reg.ok === true, 'Registration should succeed');
  assert(typeof reg.player?.id === 'string', 'Should return player ID');
  assert(reg.player?.name === 'TestPlayer', 'Name should match');
  assert(reg.player?.score === 0, 'Starting score should be 0');

  const list = await api('GET', '/api/players');
  assert(
    list.players.some((p) => p.name === 'TestPlayer'),
    'Player should appear in list'
  );
}

async function testDebugEndpoint() {
  console.log('\n🐛 Test: Debug endpoint');
  const res = await api('GET', '/api/debug');
  assert(typeof res.tick === 'number', 'Debug should return tick');
  assert(typeof res.fireCount === 'number', 'Debug should return fire count');
  assert(typeof res.agentCount === 'number', 'Debug should return agent count');
}

async function testBulletinEndpoint() {
  console.log('\n📋 Test: Bulletin endpoint');
  const res = await api('GET', '/api/bulletin');
  assert(Array.isArray(res.posts), 'Bulletin should return posts array');
}

async function testWorldEvent() {
  console.log('\n🌩 Test: Force world event');
  const res = await api('POST', '/api/test-world-event', {
    type: 'lightning_storm',
  });
  assert(res.ok === true, 'Force event should succeed');
  assert(res.event?.type === 'lightning_storm', 'Event type should match');

  const state = await api('GET', '/api/state');
  const hasStorm = state.worldEvents?.some(
    (e) => e.type === 'lightning_storm'
  );
  assert(hasStorm, 'World events should include the lightning storm');
}

async function testMultipleTicks() {
  console.log('\n⏩ Test: Multiple ticks (stability)');
  const stateBefore = await api('GET', '/api/state');
  const tickBefore = stateBefore.tick;

  for (let i = 0; i < 5; i++) {
    const res = await api('POST', '/api/tick');
    assert(res.ok === true, `Tick ${i + 1} should succeed`);
  }

  const stateAfter = await api('GET', '/api/state');
  assert(
    stateAfter.tick === tickBefore + 5,
    'Tick should have incremented by 5'
  );
  assert(typeof stateAfter.earthLife === 'number', 'Earth life should be a number');
  assert(stateAfter.earthLife >= 0, 'Earth life should be non-negative');
  assert(stateAfter.earthLife <= 100, 'Earth life should be <= 100');
}

async function testStateCompleteness() {
  console.log('\n📦 Test: State endpoint completeness');
  const state = await api('GET', '/api/state');

  assert(typeof state.tick === 'number', 'tick is a number');
  assert(Array.isArray(state.fires), 'fires is an array');
  assert(Array.isArray(state.agents), 'agents is an array');
  assert(Array.isArray(state.updates), 'updates is an array');
  assert(Array.isArray(state.waterSources), 'waterSources is an array');
  assert(state.waterSources.length > 0, 'Has water sources');
  assert(Array.isArray(state.bulletin), 'bulletin is an array');
  assert(Array.isArray(state.leaderboard), 'leaderboard is an array');
  assert(
    Array.isArray(state.agentLeaderboard),
    'agentLeaderboard is an array'
  );
  assert(
    Array.isArray(state.worldEvents),
    'worldEvents is an array'
  );
  assert(typeof state.earthLife === 'number', 'earthLife is a number');
}

async function testDeployWithPlayer() {
  console.log('\n👤🤖 Test: Deploy agent with player ownership');
  const reg = await api('POST', '/api/players', { name: 'AgentOwner' });
  assert(reg.ok, 'Player registered');

  const deploy = await api('POST', '/api/agents/deploy', {
    type: 'scout',
    lat: 10,
    lng: 20,
    playerId: reg.player?.id,
  });
  assert(deploy.ok === true, 'Deploy with valid player should succeed');
  assert(
    deploy.agent?.playerId === reg.player?.id,
    'Agent should have player ID'
  );

  const badDeploy = await api('POST', '/api/agents/deploy', {
    type: 'scout',
    lat: 10,
    lng: 20,
    playerId: 'nonexistent-player',
  });
  assert(
    badDeploy.ok === false,
    'Deploy with invalid player should fail'
  );
}

/* ─── Runner ────────────────────────────────────────────── */

async function run() {
  console.log(`\n${'='.repeat(50)}`);
  console.log('  DB Migration Integration Tests');
  console.log(`  Base URL: ${BASE}`);
  console.log(`${'='.repeat(50)}`);

  try {
    await testReset();
    await testTick();
    await testTickWithFire();
    await testDeployAgent();
    await testDeployValidation();
    await testPlayerRegistration();
    await testDebugEndpoint();
    await testBulletinEndpoint();
    await testWorldEvent();
    await testMultipleTicks();
    await testStateCompleteness();
    await testDeployWithPlayer();
  } catch (err) {
    console.error('\n💥 Unhandled error:', err);
    failed++;
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  if (errors.length > 0) {
    console.log('\n  Failed tests:');
    for (const e of errors) {
      console.log(`    - ${e}`);
    }
  }
  console.log(`${'='.repeat(50)}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

run();

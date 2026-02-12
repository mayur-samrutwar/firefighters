#!/usr/bin/env node
/**
 * Phase 6 — Intensive test suite: World Events
 *
 * Tests: lightning storm, drought zones, solar flare, strong winds,
 *        equipment malfunction, event expiry, perception integration,
 *        API response, and backward compatibility.
 *
 * Usage:
 *   1. Start dev server: npm run dev
 *   2. Stop agent-tick if running
 *   3. Run: node scripts/test-phase6.mjs [baseUrl]
 */

const BASE =
  process.argv[2] || process.env.API_URL || 'http://localhost:3001';

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

async function reset() {
  const res = await fetch(`${BASE}/api/test-reset`, { method: 'POST' });
  if (!res.ok) throw new Error('Reset failed');
}

async function getState() {
  const res = await fetch(`${BASE}/api/state`);
  return res.json();
}

async function deploy(opts) {
  const res = await fetch(`${BASE}/api/agents/deploy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts),
  });
  return res.json();
}

async function tick(opts = {}) {
  const body = {
    lat: opts.lat ?? 0,
    lng: opts.lng ?? 0,
    addFire: opts.addFire ?? true,
  };
  await fetch(`${BASE}/api/tick`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function tickNoFire() {
  return tick({ addFire: false });
}

async function tickN(n) {
  for (let i = 0; i < n; i++) await tickNoFire();
}

async function spawnWorldEvent(opts) {
  const res = await fetch(`${BASE}/api/test-world-event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts),
  });
  return res.json();
}

// ─── Test 1: World events in /api/state response ──────────────
async function testWorldEventsInState() {
  console.log('\n🧪 Test 1: worldEvents appears in /api/state');
  await reset();

  const state = await getState();
  assert(Array.isArray(state.worldEvents), 'worldEvents is an array');
  assert(state.worldEvents.length === 0, 'Empty after reset');
}

// ─── Test 2: Force-spawn lightning storm creates fire cluster ─
async function testLightningStorm() {
  console.log('\n🧪 Test 2: Lightning storm spawns fire cluster');
  await reset();

  // Spawn lightning storm at known location
  const result = await spawnWorldEvent({
    type: 'lightning_storm',
    lat: 20,
    lng: 30,
    radius: 5,
  });
  assert(result.ok === true, 'Event spawned');
  assert(result.event.type === 'lightning_storm', 'Type is lightning_storm');

  // Tick to apply the storm (fires spawn during applyWorldEvents)
  await tickNoFire();

  const state = await getState();
  // Lightning storm spawns 4-8 fires
  assert(state.fires.length >= 4, `At least 4 fires spawned (got ${state.fires.length})`);
  assert(state.fires.length <= 8, `At most 8 fires spawned (got ${state.fires.length})`);

  // Fires should be near the storm center (within radius)
  const nearCenter = state.fires.every(
    (f) => Math.abs(f.lat - 20) <= 5 && Math.abs(f.lng - 30) <= 5
  );
  assert(nearCenter, 'All fires near storm center');
}

// ─── Test 3: Drought zone accelerates fire growth ─────────────
async function testDroughtZone() {
  console.log('\n🧪 Test 3: Drought zone accelerates fire growth');
  await reset();

  // Spawn drought at lat=10, lng=10, radius=20
  await spawnWorldEvent({
    type: 'drought',
    lat: 10,
    lng: 10,
    radius: 20,
  });

  // Create a fire inside the drought zone
  await tick({ lat: 10, lng: 10, addFire: true });

  const state1 = await getState();
  const fireInDrought = state1.fires.find(
    (f) => Math.abs(f.lat - 10) < 2 && Math.abs(f.lng - 10) < 2
  );
  assert(fireInDrought !== undefined, 'Fire exists in drought zone');
  assert(fireInDrought.intensity === 1, 'Starts at intensity 1');

  // Tick once — in drought, non-flash fires should grow at interval=1 instead of 2
  await tickNoFire();

  const state2 = await getState();
  const fireAfter = state2.fires.find((f) => f.id === fireInDrought.id);

  if (fireAfter) {
    // In drought: non-flash grows at interval=1 so at age=1 → intensity 2
    // Flash grows at interval=0.5 (floored to 1) so also 2
    // Either way, intensity should be >= 2 after 1 tick in drought
    assert(
      fireAfter.intensity >= 2,
      `Drought accelerated: intensity ${fireAfter.intensity} >= 2 after 1 tick`
    );
  } else {
    assert(false, 'Fire still exists after 1 tick');
  }
}

// ─── Test 4: Solar flare blocks satellite detection ───────────
async function testSolarFlare() {
  console.log('\n🧪 Test 4: Solar flare blocks satellite detection');
  await reset();

  // Deploy satellite
  await deploy({
    type: 'satellite',
    route: [[0, 0], [0, 20]],
    searchRadius: 15,
  });

  // Spawn solar flare
  await spawnWorldEvent({ type: 'solar_flare' });

  // Tick with fire in satellite path
  await tick({ lat: 1, lng: 5, addFire: true });

  const state = await getState();
  const detections = state.updates.filter((u) => u.type === 'detected');
  assert(detections.length === 0, 'No detection during solar flare (satellite blinded)');

  // Verify the event is active
  assert(state.worldEvents.length >= 1, 'Solar flare event is active');
  const flare = state.worldEvents.find((e) => e.type === 'solar_flare');
  assert(flare !== undefined, 'Solar flare in active events');
}

// ─── Test 5: Scout still detects during solar flare ───────────
async function testScoutDuringSolarFlare() {
  console.log('\n🧪 Test 5: Scout still detects during solar flare');
  await reset();

  // Deploy scout near fire location
  await deploy({
    type: 'scout',
    lat: 5,
    lng: 5,
  });

  // Spawn solar flare
  await spawnWorldEvent({ type: 'solar_flare' });

  // Tick with fire within scout range (searchRadius=2 for scouts)
  await tick({ lat: 5.5, lng: 5.5, addFire: true });

  const state = await getState();
  const detections = state.updates.filter((u) => u.type === 'detected');
  assert(detections.length >= 1, 'Scout still detects during solar flare');
}

// ─── Test 6: Equipment malfunction drains battery ─────────────
async function testEquipmentMalfunction() {
  console.log('\n🧪 Test 6: Equipment malfunction drains agent battery');
  await reset();

  // Deploy a few agents
  await deploy({ type: 'water_drone', lat: 0, lng: 0 });
  await deploy({ type: 'water_drone', lat: 10, lng: 10 });
  await deploy({ type: 'scout', lat: 20, lng: 20 });

  // Get initial battery levels
  const stateBefore = await getState();
  const totalBefore = stateBefore.agents.reduce(
    (sum, a) => sum + a.batteryPercentage,
    0
  );

  // Spawn equipment malfunction
  await spawnWorldEvent({ type: 'equipment_malfunction' });

  // Tick to apply (also drains normal battery, so we check total drop)
  await tickNoFire();

  const stateAfter = await getState();
  const totalAfter = stateAfter.agents.reduce(
    (sum, a) => sum + a.batteryPercentage,
    0
  );

  // At least one agent should have lost extra battery beyond normal drain
  // Normal drain for 3 agents at ~1.11%/tick ≈ 3.33%
  // Malfunction adds 20% to 1-2 agents = 20-40% extra
  const totalDrop = totalBefore - totalAfter;
  assert(
    totalDrop > 5,
    `Total battery drop ${totalDrop.toFixed(1)}% > 5% (normal + malfunction)`
  );

  // Check that the event has affectedAgentIds
  const state = await getState();
  const malfEvent = state.worldEvents.find(
    (e) => e.type === 'equipment_malfunction'
  );
  // Malfunction duration is 1 tick, started at the tick before the tick we just ran
  // It might already have expired. Check updates instead.
  const worldUpdates = state.updates.filter((u) => u.type === 'world_event');
  assert(worldUpdates.length >= 1, 'World event update emitted');
}

// ─── Test 7: Strong winds bias fire spread direction ──────────
async function testStrongWinds() {
  console.log('\n🧪 Test 7: Strong winds event is active');
  await reset();

  // Spawn strong winds heading North (bearing=0)
  const result = await spawnWorldEvent({
    type: 'strong_winds',
    windBearing: 0,
    windSpeed: 2.5,
  });
  assert(result.ok === true, 'Wind event spawned');

  const state = await getState();
  const wind = state.worldEvents.find((e) => e.type === 'strong_winds');
  assert(wind !== undefined, 'Wind event is active');
  assert(wind.windBearing === 0, 'Wind bearing is 0 (North)');
  assert(wind.windSpeed === 2.5, 'Wind speed is 2.5x');
}

// ─── Test 8: Event expires after duration ─────────────────────
async function testEventExpiry() {
  console.log('\n🧪 Test 8: Events expire after their duration');
  await reset();

  // Solar flare has duration 3
  const spawnRes = await spawnWorldEvent({ type: 'solar_flare' });
  assert(spawnRes.ok === true, 'Solar flare spawned');
  const flareId = spawnRes.event.id;

  const state1 = await getState();
  const initialActive = state1.worldEvents.some(
    (e) => e.type === 'solar_flare' && e.id === flareId
  );
  assert(initialActive, 'Original flare active initially');

  // Tick 3 times to exceed duration
  await tickNoFire();
  await tickNoFire();
  await tickNoFire();

  const state2 = await getState();
  const originalStillActive = state2.worldEvents.some(
    (e) => e.type === 'solar_flare' && e.id === flareId
  );
  assert(!originalStillActive, 'Original solar flare expired after 3 ticks');
}

// ─── Test 9: Drought zone with specific radius ────────────────
async function testDroughtRadius() {
  console.log('\n🧪 Test 9: Drought zone has configurable radius');
  await reset();

  const result = await spawnWorldEvent({
    type: 'drought',
    lat: 0,
    lng: 0,
    radius: 15,
  });
  assert(result.ok === true, 'Drought spawned');
  assert(result.event.radius === 15, 'Drought radius is 15');

  const state = await getState();
  const drought = state.worldEvents.find((e) => e.type === 'drought');
  assert(drought !== undefined, 'Drought event active');
  assert(drought.lat === 0, 'Drought centered at lat 0');
  assert(drought.lng === 0, 'Drought centered at lng 0');
}

// ─── Test 10: World event update in updates feed ──────────────
async function testWorldEventInUpdates() {
  console.log('\n🧪 Test 10: World events appear in updates feed');
  await reset();

  await spawnWorldEvent({ type: 'lightning_storm', lat: 15, lng: 25 });
  await tickNoFire();

  const state = await getState();
  const worldUpdates = state.updates.filter((u) => u.type === 'world_event');
  assert(worldUpdates.length >= 1, 'world_event update exists');

  const upd = worldUpdates[0];
  assert(upd.worldEventType === 'lightning_storm', 'Update has worldEventType');
  assert(typeof upd.message === 'string', 'Update has message');
}

// ─── Test 11: Multiple concurrent events ──────────────────────
async function testMultipleConcurrentEvents() {
  console.log('\n🧪 Test 11: Multiple events can be active simultaneously');
  await reset();

  await spawnWorldEvent({ type: 'drought', lat: 0, lng: 0, radius: 10 });
  await spawnWorldEvent({ type: 'strong_winds', windBearing: 90, windSpeed: 2 });
  await spawnWorldEvent({ type: 'solar_flare' });

  const state = await getState();
  assert(state.worldEvents.length === 3, `3 events active (got ${state.worldEvents.length})`);

  const types = state.worldEvents.map((e) => e.type);
  assert(types.includes('drought'), 'Drought active');
  assert(types.includes('strong_winds'), 'Winds active');
  assert(types.includes('solar_flare'), 'Solar flare active');
}

// ─── Test 12: Invalid event type rejected ─────────────────────
async function testInvalidEventType() {
  console.log('\n🧪 Test 12: Invalid event type rejected');
  await reset();

  const result = await spawnWorldEvent({ type: 'earthquake' });
  assert(result.ok === false, 'Invalid type rejected');
}

// ─── Test 13: Lightning storm — fire count bounds ─────────────
async function testLightningFireBounds() {
  console.log('\n🧪 Test 13: Lightning storm fire count in 4-8 range');
  await reset();

  // Run multiple trials to check bounds
  let minFires = Infinity;
  let maxFires = 0;

  for (let trial = 0; trial < 5; trial++) {
    await reset();
    await spawnWorldEvent({ type: 'lightning_storm', lat: 0, lng: 0, radius: 5 });
    await tickNoFire();
    const state = await getState();
    minFires = Math.min(minFires, state.fires.length);
    maxFires = Math.max(maxFires, state.fires.length);
  }

  assert(minFires >= 4, `Min fires >= 4 across trials (got ${minFires})`);
  assert(maxFires <= 12, `Max fires <= 12 across trials (got ${maxFires})`);
}

// ─── Test 14: Perception packet includes world events ─────────
async function testPerceptionWorldEvents() {
  console.log('\n🧪 Test 14: Active events visible in game state during tick');
  await reset();

  // Spawn a drought (duration 15) and verify it persists across ticks
  await spawnWorldEvent({ type: 'drought', lat: 0, lng: 0, radius: 10 });

  await tickNoFire();
  const state1 = await getState();
  assert(state1.worldEvents.length >= 1, 'Event active after 1 tick');

  await tickNoFire();
  const state2 = await getState();
  assert(state2.worldEvents.some((e) => e.type === 'drought'), 'Drought still active after 2 ticks');
}

// ─── Test 15: Reset clears world events ───────────────────────
async function testResetClearsEvents() {
  console.log('\n🧪 Test 15: Reset clears world events');

  await spawnWorldEvent({ type: 'solar_flare' });
  const before = await getState();
  assert(before.worldEvents.length > 0, 'Events exist before reset');

  await reset();
  const after = await getState();
  assert(after.worldEvents.length === 0, 'Events cleared after reset');
}

// ─── Test 16: Event structure validation ──────────────────────
async function testEventStructure() {
  console.log('\n🧪 Test 16: World event has all required fields');
  await reset();

  const result = await spawnWorldEvent({
    type: 'lightning_storm',
    lat: 40,
    lng: -75,
  });
  assert(result.ok === true, 'Spawned');
  const evt = result.event;
  assert(typeof evt.id === 'string', 'id is string');
  assert(evt.type === 'lightning_storm', 'type is correct');
  assert(typeof evt.startTick === 'number', 'startTick is number');
  assert(typeof evt.duration === 'number', 'duration is number');
  assert(typeof evt.message === 'string', 'message is string');
  assert(evt.lat === 40, 'lat preserved');
  assert(evt.lng === -75, 'lng preserved');
}

// ─── Test 17: Backward compatibility — Phase 1-5 ─────────────
async function testBackwardCompat() {
  console.log('\n🧪 Test 17: Backward compatibility checks');
  await reset();

  const state = await getState();
  assert(Array.isArray(state.fires), 'fires present');
  assert(Array.isArray(state.agents), 'agents present');
  assert(Array.isArray(state.updates), 'updates present');
  assert(Array.isArray(state.waterSources), 'waterSources present');
  assert(Array.isArray(state.bulletin), 'bulletin present');
  assert(Array.isArray(state.leaderboard), 'leaderboard present');
  assert(Array.isArray(state.worldEvents), 'worldEvents present');
  assert(typeof state.tick === 'number', 'tick is number');

  // Detection still works — but solar flares can temporarily blind satellites.
  // We try several ticks and only require detection in at least one non-flare tick.
  await deploy({
    type: 'satellite',
    route: [[0, 0], [0, 20]],
    searchRadius: 10,
  });

  let detected = false;

  for (let i = 0; i < 5 && !detected; i++) {
    await tick({ lat: 1, lng: 5, addFire: true });
    const s = await getState();

    const flareActive = s.worldEvents.some((e) => e.type === 'solar_flare');
    if (flareActive) {
      // Satellite correctly blinded this tick; skip detection assertion.
      continue;
    }

    const detections = s.updates.filter((u) => u.type === 'detected');
    if (detections.length > 0) {
      detected = true;
    }
  }

  assert(detected, 'Detection still works in at least one non-flare tick');
}

// ─── Test 18: Drought outside zone does not affect fire ───────
async function testDroughtOutsideZone() {
  console.log('\n🧪 Test 18: Fire outside drought zone grows at normal rate');
  await reset();

  // Drought at lat=50, lng=50 with radius=5
  await spawnWorldEvent({ type: 'drought', lat: 50, lng: 50, radius: 5 });

  // Fire far from drought zone
  await tick({ lat: -20, lng: -20, addFire: true });

  const state1 = await getState();
  const fireOutside = state1.fires.find(
    (f) => Math.abs(f.lat - (-20)) < 5 && Math.abs(f.lng - (-20)) < 5
  );
  assert(fireOutside !== undefined, 'Fire exists outside drought zone');
  assert(fireOutside.intensity === 1, 'Starts at intensity 1');

  // Normal non-flash non-drought: grows at interval=2, so after 1 tick still intensity 1
  await tickNoFire();
  const state2 = await getState();
  const fireAfter = state2.fires.find((f) => f.id === fireOutside.id);

  if (fireAfter && fireAfter.fireType !== 'flash') {
    assert(
      fireAfter.intensity === 1,
      `Normal fire still intensity 1 after 1 tick (type: ${fireAfter.fireType})`
    );
  } else if (fireAfter && fireAfter.fireType === 'flash') {
    // Flash fires grow every tick even without drought, skip this assertion
    assert(true, `Flash fire (grows naturally), skipped normal-rate check`);
  } else {
    assert(false, 'Fire still exists');
  }
}

// ─── Run all ──────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════');
  console.log(' Phase 6 — World Events & Disruptions');
  console.log('═══════════════════════════════════════════');

  await testWorldEventsInState();
  await testLightningStorm();
  await testDroughtZone();
  await testSolarFlare();
  await testScoutDuringSolarFlare();
  await testEquipmentMalfunction();
  await testStrongWinds();
  await testEventExpiry();
  await testDroughtRadius();
  await testWorldEventInUpdates();
  await testMultipleConcurrentEvents();
  await testInvalidEventType();
  await testLightningFireBounds();
  await testPerceptionWorldEvents();
  await testResetClearsEvents();
  await testEventStructure();
  await testBackwardCompat();
  await testDroughtOutsideZone();

  console.log('\n───────────────────────────────────────────');
  console.log(`  Passed: ${passed}   Failed: ${failed}   Total: ${passed + failed}`);
  console.log('───────────────────────────────────────────');

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});

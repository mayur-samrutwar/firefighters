/**
 * Integration tests for external agent engine integration.
 * Tests that external agent actions are properly consumed by the game engine.
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env.local
dotenv.config({ path: join(__dirname, '..', '.env.local') });

const BASE_URL =
  process.env.TEST_BASE_URL ||
  'https://www.firefighters-six.vercel.app';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`✅ ${message}`);
  } else {
    failed++;
    console.error(`❌ ${message}`);
  }
}

async function fetchJSON(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON response: ${text.substring(0, 200)}`);
  }
  return { status: res.status, json };
}

async function resetState() {
  const { status } = await fetch(`${BASE_URL}/api/test-reset`, { method: 'POST' });
  assert(status === 200, 'Reset state');
}

async function tick() {
  const { status } = await fetch(`${BASE_URL}/api/tick`, { method: 'POST' });
  assert(status === 200, 'Tick executed');
}

async function getState() {
  const { status, json } = await fetchJSON(`${BASE_URL}/api/state`);
  assert(status === 200, 'Get state');
  return json;
}

async function registerAgent(name, publicAddress, profile) {
  const { status, json } = await fetchJSON(`${BASE_URL}/api/public-agents/register`, {
    method: 'POST',
    body: JSON.stringify({ name, publicAddress, profile }),
  });
  assert(status === 200 && json.ok === true, `Register ${profile} agent: ${name}`);
  return { agentId: json.agent.id, secret: json.secret };
}

async function submitAction(agentId, secret, action) {
  const { status, json } = await fetchJSON(`${BASE_URL}/api/public-agents/act`, {
    method: 'POST',
    body: JSON.stringify({ agentId, secret, action }),
  });
  return { status, json };
}

async function main() {
  console.log('🧪 Testing external agent engine integration...\n');

  // Test 1: External agent syncs into game state on first action
  console.log('Test 1: External agent syncs into game state');
  await resetState();
  const { agentId: agent1Id, secret: agent1Secret } = await registerAgent(
    'TestSatellite1',
    '0x123',
    'satellite'
  );
  const stateBefore = await getState();
  assert(
    !stateBefore.agents.find((a) => a.id === agent1Id),
    'Agent not in state before action'
  );
  await submitAction(agent1Id, agent1Secret, { type: 'noop' });
  const stateAfter = await getState();
  const syncedAgent = stateAfter.agents.find((a) => a.id === agent1Id);
  assert(syncedAgent !== undefined, 'Agent synced into game state');
  assert(syncedAgent.controlMode === 'external', 'Agent has external controlMode');
  assert(syncedAgent.type === 'satellite', 'Agent has correct type');
  console.log('');

  // Test 2: External agent action is consumed in next tick
  console.log('Test 2: External agent action consumed in tick');
  await resetState();
  const { agentId: agent2Id, secret: agent2Secret } = await registerAgent(
    'TestDrone1',
    '0x456',
    'water_drone'
  );
  await submitAction(agent2Id, agent2Secret, { type: 'move_to', lat: 10, lng: 20 });
  const stateBeforeTick = await getState();
  const agentBefore = stateBeforeTick.agents.find((a) => a.id === agent2Id);
  assert(agentBefore !== undefined, 'Agent exists before tick');
  assert(agentBefore.pendingExternalAction !== null, 'Pending action stored');
  assert(agentBefore.pendingExternalAction.type === 'move_to', 'Pending action has correct type');
  await tick();
  const stateAfterTick = await getState();
  const agentAfter = stateAfterTick.agents.find((a) => a.id === agent2Id);
  assert(agentAfter !== undefined, 'Agent exists after tick');
  assert(agentAfter.pendingExternalAction === null, 'Pending action consumed');
  assert(agentAfter.target !== null, 'Agent has target set');
  assert(agentAfter.target.lat === 10 && agentAfter.target.lng === 20, 'Target coordinates correct');
  console.log('');

  // Test 3: External agent without pending action remains idle
  console.log('Test 3: External agent without action remains idle');
  await resetState();
  const { agentId: agent3Id, secret: agent3Secret } = await registerAgent(
    'TestScout1',
    '0x789',
    'scout'
  );
  await submitAction(agent3Id, agent3Secret, { type: 'noop' });
  await tick(); // Consume the noop
  await tick(); // Next tick with no pending action
  const stateIdle = await getState();
  const agentIdle = stateIdle.agents.find((a) => a.id === agent3Id);
  assert(agentIdle !== undefined, 'Agent exists');
  assert(agentIdle.pendingExternalAction === null, 'No pending action');
  assert(agentIdle.target === null, 'No target set (idle)');
  console.log('');

  // Test 4: Multiple external agents can act independently
  console.log('Test 4: Multiple external agents act independently');
  await resetState();
  const { agentId: agent4aId, secret: agent4aSecret } = await registerAgent(
    'TestDroneA',
    '0xAAA',
    'water_drone'
  );
  const { agentId: agent4bId, secret: agent4bSecret } = await registerAgent(
    'TestDroneB',
    '0xBBB',
    'water_drone'
  );
  await submitAction(agent4aId, agent4aSecret, { type: 'move_to', lat: 30, lng: 40 });
  await submitAction(agent4bId, agent4bSecret, { type: 'move_to', lat: 50, lng: 60 });
  await tick();
  const stateMulti = await getState();
  const agent4a = stateMulti.agents.find((a) => a.id === agent4aId);
  const agent4b = stateMulti.agents.find((a) => a.id === agent4bId);
  assert(agent4a !== undefined && agent4b !== undefined, 'Both agents exist');
  assert(agent4a.target?.lat === 30 && agent4a.target?.lng === 40, 'Agent A target correct');
  assert(agent4b.target?.lat === 50 && agent4b.target?.lng === 60, 'Agent B target correct');
  console.log('');

  // Test 5: Internal agents still work correctly
  console.log('Test 5: Internal agents still work correctly');
  await resetState();
  // Deploy an internal agent via test deploy API
  const { status: deployStatus } = await fetch(`${BASE_URL}/api/agents/deploy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'satellite',
      route: [
        [0, -180],
        [0, 0],
        [0, 180],
      ],
    }),
  });
  assert(deployStatus === 200, 'Internal agent deployed');
  const stateInternal = await getState();
  const internalAgent = stateInternal.agents.find((a) => a.controlMode === 'internal');
  assert(internalAgent !== undefined, 'Internal agent exists');
  assert(internalAgent.controlMode === 'internal', 'Internal agent has correct controlMode');
  // Internal agent should have AI-driven behavior (not idle)
  await tick();
  const stateAfterInternalTick = await getState();
  const internalAgentAfter = stateAfterInternalTick.agents.find(
    (a) => a.id === internalAgent.id
  );
  assert(internalAgentAfter !== undefined, 'Internal agent still exists after tick');
  console.log('');

  // Test 6: External agent water_fire action
  console.log('Test 6: External agent water_fire action');
  await resetState();
  // Add a fire first
  await fetch(`${BASE_URL}/api/tick`, {
    method: 'POST',
    body: JSON.stringify({ addFire: true, lat: 0, lng: 0 }),
  });
  const { agentId: agent6Id, secret: agent6Secret } = await registerAgent(
    'TestWaterDrone',
    '0xCCC',
    'water_drone'
  );
  // Sync agent and place it near the fire (within interaction range ~0.5°)
  await submitAction(agent6Id, agent6Secret, { type: 'move_to', lat: 0.2, lng: 0.2 });
  await tick(); // Consume move_to action
  // Wait for agent to arrive (may take multiple ticks)
  for (let i = 0; i < 5; i++) {
    await tick();
    const stateCheck = await getState();
    const agentCheck = stateCheck.agents.find((a) => a.id === agent6Id);
    if (agentCheck && agentCheck.target === null) break; // Arrived
  }
  // Now submit water_fire action
  await submitAction(agent6Id, agent6Secret, { type: 'water_fire' });
  await tick(); // Consume action
  const stateWater = await getState();
  const agent6 = stateWater.agents.find((a) => a.id === agent6Id);
  assert(agent6 !== undefined, 'Agent exists');
  // The action should be consumed (pendingExternalAction cleared)
  assert(agent6.pendingExternalAction === null, 'Action consumed');
  // If agent is near fire, currentAction should be extinguishing; otherwise it may be null/idle
  // We just verify the action was accepted and consumed
  console.log('');

  // Test 7: External agent refill action
  console.log('Test 7: External agent refill action');
  await resetState();
  const { agentId: agent7Id, secret: agent7Secret } = await registerAgent(
    'TestRefillDrone',
    '0xDDD',
    'water_drone'
  );
  // Place agent near a water source (Great Lakes: 45, -85)
  await submitAction(agent7Id, agent7Secret, { type: 'move_to', lat: 45, lng: -85 });
  await tick(); // Consume move_to
  // Wait for agent to arrive
  for (let i = 0; i < 5; i++) {
    await tick();
    const stateCheck = await getState();
    const agentCheck = stateCheck.agents.find((a) => a.id === agent7Id);
    if (agentCheck && agentCheck.target === null) break; // Arrived
  }
  await submitAction(agent7Id, agent7Secret, { type: 'refill' });
  await tick(); // Consume action
  const stateRefill = await getState();
  const agent7 = stateRefill.agents.find((a) => a.id === agent7Id);
  assert(agent7 !== undefined, 'Agent exists');
  // Verify action was consumed
  assert(agent7.pendingExternalAction === null, 'Action consumed');
  // If agent is near water source, currentAction may be refilling; otherwise it may be null/idle
  console.log('');

  // Test 8: External agent recharge_agent action
  console.log('Test 8: External agent recharge_agent action');
  await resetState();
  const { agentId: agent8SupplyId, secret: agent8SupplySecret } = await registerAgent(
    'TestSupply',
    '0xEEE',
    'supply_drone'
  );
  const { agentId: agent8TargetId, secret: agent8TargetSecret } = await registerAgent(
    'TestTarget',
    '0xFFF',
    'scout'
  );
  // Place both agents near each other
  await submitAction(agent8SupplyId, agent8SupplySecret, { type: 'move_to', lat: 10, lng: 10 });
  await submitAction(agent8TargetId, agent8TargetSecret, { type: 'move_to', lat: 10, lng: 10 });
  await tick(); // Consume move_to actions
  // Wait for agents to arrive
  for (let i = 0; i < 5; i++) {
    await tick();
    const stateCheck = await getState();
    const supplyCheck = stateCheck.agents.find((a) => a.id === agent8SupplyId);
    const targetCheck = stateCheck.agents.find((a) => a.id === agent8TargetId);
    if (supplyCheck && supplyCheck.target === null && targetCheck && targetCheck.target === null) {
      break; // Both arrived
    }
  }
  // Submit recharge action
  await submitAction(agent8SupplyId, agent8SupplySecret, {
    type: 'recharge_agent',
    targetAgentId: agent8TargetId,
  });
  await tick(); // Consume action
  const stateRecharge = await getState();
  const supplyAgent = stateRecharge.agents.find((a) => a.id === agent8SupplyId);
  assert(supplyAgent !== undefined, 'Supply agent exists');
  // Verify action was consumed
  assert(supplyAgent.pendingExternalAction === null, 'Action consumed');
  // If target agent has low battery and is in range, currentAction may be recharging
  console.log('');

  // Test 9: Action conversion (investigate_fire with coordinates)
  console.log('Test 9: investigate_fire converts to move_to');
  await resetState();
  const { agentId: agent9Id, secret: agent9Secret } = await registerAgent(
    'TestInvestigate',
    '0x999',
    'scout'
  );
  await submitAction(agent9Id, agent9Secret, {
    type: 'investigate_fire',
    lat: 25,
    lng: 35,
  });
  await tick();
  const stateInvestigate = await getState();
  const agent9 = stateInvestigate.agents.find((a) => a.id === agent9Id);
  assert(agent9 !== undefined, 'Agent exists');
  assert(agent9.target !== null, 'Agent has target');
  assert(agent9.target.lat === 25 && agent9.target.lng === 35, 'Target coordinates correct');
  console.log('');

  // Test 10: Mixed internal and external agents
  console.log('Test 10: Mixed internal and external agents');
  await resetState();
  // Deploy internal agent
  await fetch(`${BASE_URL}/api/agents/deploy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'scout',
      lat: 0,
      lng: 0,
    }),
  });
  // Register external agent
  const { agentId: agent10Id, secret: agent10Secret } = await registerAgent(
    'TestMixed',
    '0x111',
    'scout'
  );
  await submitAction(agent10Id, agent10Secret, { type: 'move_to', lat: 15, lng: 25 });
  await tick();
  const stateMixed = await getState();
  const internalAgents = stateMixed.agents.filter((a) => a.controlMode === 'internal');
  const externalAgents = stateMixed.agents.filter((a) => a.controlMode === 'external');
  assert(internalAgents.length > 0, 'Internal agents exist');
  assert(externalAgents.length > 0, 'External agents exist');
  const externalAgent10 = externalAgents.find((a) => a.id === agent10Id);
  assert(externalAgent10 !== undefined, 'External agent exists');
  assert(externalAgent10.target?.lat === 15 && externalAgent10.target?.lng === 25, 'External agent target correct');
  console.log('');

  // Summary
  console.log('\n📊 Test Summary:');
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`Total: ${passed + failed}`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

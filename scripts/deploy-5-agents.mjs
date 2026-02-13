#!/usr/bin/env node
/**
 * Deploy 5 agents: 2 satellites, 2 water drones, 1 tanker.
 * Requires dev server: npm run dev
 * Usage: node scripts/deploy-5-agents.mjs [baseUrl]
 * Default baseUrl: http://localhost:3000
 */

const BASE = process.argv[2] || process.env.API_URL || 'http://localhost:3000';

// Routes for satellites (first two from store SATELLITE_ROUTES)
const SATELLITE_ROUTE_1 = [
  [0, -180],
  [0, -90],
  [0, 0],
  [0, 90],
  [0, 180],
];
const SATELLITE_ROUTE_2 = [
  [-80, 0],
  [0, 0],
  [80, 0],
];

async function deploy(payload) {
  const res = await fetch(`${BASE}/api/agents/deploy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

async function main() {
  console.log('Deploying 5 agents to', BASE);
  console.log('');

  const results = [];

  try {
    // 2 satellites
    const s1 = await deploy({
      type: 'satellite',
      route: SATELLITE_ROUTE_1,
      searchRadius: 5,
    });
    results.push({ type: 'satellite', id: s1.agent?.id, ok: s1.ok });

    const s2 = await deploy({
      type: 'satellite',
      route: SATELLITE_ROUTE_2,
      searchRadius: 5,
    });
    results.push({ type: 'satellite', id: s2.agent?.id, ok: s2.ok });

    // 2 water drones (spread out)
    const w1 = await deploy({
      type: 'water_drone',
      lat: 10,
      lng: 20,
    });
    results.push({ type: 'water_drone', id: w1.agent?.id, ok: w1.ok });

    const w2 = await deploy({
      type: 'water_drone',
      lat: -15,
      lng: 45,
    });
    results.push({ type: 'water_drone', id: w2.agent?.id, ok: w2.ok });

    // 1 tanker
    const t1 = await deploy({
      type: 'heavy_tanker',
      lat: 0,
      lng: 0,
    });
    results.push({ type: 'heavy_tanker', id: t1.agent?.id, ok: t1.ok });

    console.log('Deployed:');
    results.forEach((r, i) => {
      console.log(`  ${i + 1}. ${r.type} — ${r.ok ? r.id : 'FAIL'}`);
    });
    const okCount = results.filter((r) => r.ok).length;
    console.log('');
    console.log(`${okCount}/5 agents deployed successfully.`);
    process.exit(okCount === 5 ? 0 : 1);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();

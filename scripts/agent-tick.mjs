#!/usr/bin/env node
/**
 * City agent cron script. Runs every 30 seconds.
 * POSTs to /api/tick to advance the game - optionally adds a fire at a random location.
 * Fires persist for 3 ticks (~90 seconds) then are removed.
 *
 * Usage: node scripts/agent-tick.mjs [baseUrl]
 * Default: http://localhost:3000 (if port is busy, use 3001: npm run agent -- http://localhost:3001)
 *
 * Run: npm run agent
 * Single tick: npm run agent:once
 */

const BASE_URL =
  process.argv[2] || process.env.API_URL || 'http://localhost:3000';

function randomLat() {
  return -90 + Math.random() * 180;
}

function randomLng() {
  return -180 + Math.random() * 360;
}

async function tick() {
  const addFire = Math.random() > 0.3; // ~70% chance to add fire each tick
  const body = addFire
    ? { lat: randomLat(), lng: randomLng(), addFire: true }
    : { addFire: false };

  try {
    const res = await fetch(`${BASE_URL}/api/tick`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    console.log(
      new Date().toISOString(),
      res.ok ? 'OK' : 'FAIL',
      addFire ? `fire at ${body.lat.toFixed(2)}, ${body.lng.toFixed(2)}` : 'no fire'
    );
    if (!res.ok) console.error(data);
  } catch (err) {
    console.error(new Date().toISOString(), 'ERROR', err.message);
  }
}

// Single run (for cron) or loop every 30s (for local dev)
const runOnce = process.env.RUN_ONCE === '1';
if (runOnce) {
  tick();
} else {
  console.log(`Agent tick running every 30s → ${BASE_URL}/api/tick`);
  tick();
  setInterval(tick, 30_000);
}

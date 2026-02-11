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

let landPoints = null;
async function loadLandPoints() {
  if (landPoints) return landPoints;
  try {
    const res = await fetch(`${BASE_URL}/land-points.json`);
    landPoints = await res.json();
    return landPoints;
  } catch (e) {
    console.warn('Could not load land-points.json, using random coords');
    return null;
  }
}

function randomLat() {
  return -90 + Math.random() * 180;
}
function randomLng() {
  return -180 + Math.random() * 360;
}

async function tick() {
  const points = await loadLandPoints();
  let lat, lng;
  if (points?.length) {
    const p = points[Math.floor(Math.random() * points.length)];
    lat = p[0];
    lng = p[1];
  } else {
    lat = randomLat();
    lng = randomLng();
  }
  const body = { lat, lng, addFire: true };

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
      `fire at ${lat.toFixed(2)}, ${lng.toFixed(2)}`
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

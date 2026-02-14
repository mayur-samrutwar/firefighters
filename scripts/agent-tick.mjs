#!/usr/bin/env node
/**
 * Game tick cron script.
 *
 * - Ticks the simulation every 10 seconds (game is tuned for 10s ticks)
 * - Background fire seeding is handled inside the game (1 fire every 6 ticks)
 *
 * Usage: node scripts/agent-tick.mjs [baseUrl]
 * Default: https://firefighters-six.vercel.app/ (override with API_URL or CLI arg for local testing)
 *
 * Run: npm run agent
 * Single tick: npm run agent:once
 */

const BASE_URL =
  process.argv[2] ||
  process.env.API_URL ||
  'https://firefighters-six.vercel.app/';

// Precomputed land anchor points (cities, coasts, etc.) used as seeds.
// We jitter around these so fires can appear over a much wider set of land
// locations instead of only at a few exact coordinates.
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

function wrapLng(lng) {
  if (lng > 180) return lng - 360;
  if (lng < -180) return lng + 360;
  return lng;
}

async function tick() {
  const body = { addFire: false }; // Game seeds 1 fire every 6 ticks internally

  try {
    const headers = { 'Content-Type': 'application/json' };
    const tickSecret = process.env.TICK_API_SECRET;
    if (tickSecret) {
      headers['Authorization'] = `Bearer ${tickSecret}`;
    }

    const res = await fetch(`${BASE_URL}/api/tick`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const data = await res.json();
    const prefix = new Date().toISOString();
    console.log(prefix, res.ok ? 'OK' : 'FAIL', 'tick');
    if (!res.ok) console.error(data);
  } catch (err) {
    console.error(new Date().toISOString(), 'ERROR', err.message);
  }
}

const TICK_INTERVAL_MS = 10_000; // 10s per tick

const runOnce = process.env.RUN_ONCE === '1';
if (runOnce) {
  tick();
} else {
  console.log(`Agent tick running every ${TICK_INTERVAL_MS / 1000}s → ${BASE_URL}/api/tick`);
  tick();
  setInterval(tick, TICK_INTERVAL_MS);
}

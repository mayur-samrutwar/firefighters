#!/usr/bin/env node
/**
 * City agent cron script.
 *
 * - Ticks the simulation every 30 seconds
 * - Spawns a NEW fire approximately every 3 minutes (every 6th tick)
 *
 * Usage: node scripts/agent-tick.mjs [baseUrl]
 * Default: https://www.firefighters-six.vercel.app/ (override with API_URL or CLI arg for local testing)
 *
 * Run: npm run agent
 * Single tick: npm run agent:once
 */

const BASE_URL =
  process.argv[2] ||
  process.env.API_URL ||
  'https://www.firefighters-six.vercel.app/';

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

let tickCount = 0;

async function tick() {
  tickCount += 1;
  const shouldAddFire = tickCount % 6 === 1; // new fire every 6 ticks (~3 min at 30s/tick)

  const points = await loadLandPoints();
  let lat, lng;
  if (points?.length) {
    const p = points[Math.floor(Math.random() * points.length)];
    // Jitter around the base land point by up to ±4° to spread fires
    // across broader land areas while still roughly on land.
    const JITTER_DEG = 4;
    const dLat = (Math.random() - 0.5) * JITTER_DEG;
    const dLng = (Math.random() - 0.5) * JITTER_DEG;
    lat = Math.max(-85, Math.min(85, p[0] + dLat));
    lng = wrapLng(p[1] + dLng);
  } else {
    lat = randomLat();
    lng = randomLng();
  }
  const body = { lat, lng, addFire: shouldAddFire };

  try {
    const res = await fetch(`${BASE_URL}/api/tick`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    const prefix = new Date().toISOString();
    if (shouldAddFire) {
      console.log(
        prefix,
        res.ok ? 'OK' : 'FAIL',
        `fire at ${lat.toFixed(2)}, ${lng.toFixed(2)}`
      );
    } else {
      console.log(prefix, res.ok ? 'OK' : 'FAIL', '(tick only, no new fire)');
    }
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

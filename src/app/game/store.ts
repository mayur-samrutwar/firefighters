/**
 * In-memory game state.
 * Fires persist for FIRE_LIFETIME_TICKS.
 * Agents persist until battery depletes (0%).
 *
 * State is stored on globalThis so it survives Next.js dev-mode
 * hot-reloads and module re-evaluations (Turbopack).
 */

import { getAgentPositionAtElapsed } from '@/utils/agentPosition';

/* ─── Types ─────────────────────────────────────────────── */

export type FireType = 'wildfire' | 'chemical' | 'flash';

export type Fire = {
  id: string;
  lat: number;
  lng: number;
  bornTick: number;
  intensity: number; // 1-5
  fireType: FireType;
  parentId?: string; // id of fire that spawned this (spread tracking)
};

export type AgentRoute = [number, number][]; // [lat, lng] waypoints

export type Agent = {
  id: string;
  type: 'satellite';
  route: AgentRoute;
  batteryPercentage: number;
  searchRadius: number; // degrees
  deployedAt: number; // timestamp ms
};

export type UpdateEvent = {
  id: string;
  tick: number;
  type: 'detected' | 'watering' | 'extinguished';
  agentId?: string;
  fireId?: string;
  lat: number;
  lng: number;
};

/* ─── Constants ─────────────────────────────────────────── */

// Battery
const BATTERY_LIFETIME_TICKS = 120; // ~1 hour at 30s per tick
const BATTERY_DRAIN_PER_TICK = 100 / BATTERY_LIFETIME_TICKS; // ~0.833%

// Fire intensity & lifecycle
const MAX_INTENSITY = 5;
const INTENSITY_GROW_INTERVAL = 2; // ticks between intensity increases (wildfire/chemical)
const FLASH_GROW_INTERVAL = 1; // flash fires grow every tick
const BURNOUT_TICKS_AT_MAX = 8; // ticks at max intensity before fire burns out
const FIRE_MAX_LIFETIME_TICKS = 25; // hard cap regardless of intensity

// Fire spread
const SPREAD_RADIUS_DEG = 2.5; // degrees — how far a fire can spread
const SPREAD_CHANCE_INTENSITY_3 = 0.25; // 25% per tick at intensity 3-4
const SPREAD_CHANCE_INTENSITY_5 = 0.5; // 50% per tick at inferno
const MAX_FIRES = 50; // cap total active fires to prevent explosion

// Events
const MAX_EVENTS = 50;

/* ─── State (on globalThis for dev-mode stability) ──────── */

type GameState = {
  tick: number;
  fires: Fire[];
  agents: Agent[];
  updates: UpdateEvent[];
  detectedPairs: Set<string>;
};

const g = globalThis as unknown as { __fireGameState?: GameState };
if (!g.__fireGameState) {
  g.__fireGameState = {
    tick: 0,
    fires: [],
    agents: [],
    updates: [],
    detectedPairs: new Set<string>(),
  };
}

const state = g.__fireGameState;
const fires = state.fires;
const agents = state.agents;
const updates = state.updates;
const detectedPairs = state.detectedPairs;

/* ─── Getters ───────────────────────────────────────────── */

export function getTick() {
  return state.tick;
}

export function getFires() {
  return fires.filter((f) => isFireAlive(f));
}

/** Check if a fire is still burning */
function isFireAlive(f: Fire): boolean {
  const age = state.tick - f.bornTick;
  // Hard lifetime cap
  if (age >= FIRE_MAX_LIFETIME_TICKS) return false;
  // Burn out after sitting at max intensity for BURNOUT_TICKS_AT_MAX
  if (f.intensity >= MAX_INTENSITY) {
    const growInterval =
      f.fireType === 'flash' ? FLASH_GROW_INTERVAL : INTENSITY_GROW_INTERVAL;
    const tickReachedMax = (MAX_INTENSITY - 1) * growInterval;
    const ticksAtMax = age - tickReachedMax;
    if (ticksAtMax >= BURNOUT_TICKS_AT_MAX) return false;
  }
  return true;
}

/** Only returns agents that are still alive (battery > 0) */
export function getAgents() {
  return agents
    .filter((a) => a.batteryPercentage > 0)
    .map((a) => ({ ...a }));
}

export function getUpdates() {
  return [...updates];
}

/* ─── Mutations ─────────────────────────────────────────── */

export function deployAgent(params: {
  type: 'satellite';
  route: AgentRoute;
  batteryPercentage: number;
  searchRadius: number;
}) {
  const agent: Agent = {
    id: `agent-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type: 'satellite',
    route: params.route,
    batteryPercentage: params.batteryPercentage,
    searchRadius: params.searchRadius,
    deployedAt: Date.now(),
  };
  agents.push(agent);
  return agent;
}

/* ─── Haversine (angular distance in degrees) ───────────── */

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

function angularDistanceDeg(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const φ1 = lat1 * DEG2RAD;
  const φ2 = lat2 * DEG2RAD;
  const Δφ = (lat2 - lat1) * DEG2RAD;
  const Δλ = (lng2 - lng1) * DEG2RAD;
  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return c * RAD2DEG; // angular distance in degrees
}

/* ─── Detection sweep ───────────────────────────────────── */

function runDetection() {
  const nowMs = Date.now();
  const activeFires = getFires();
  if (activeFires.length === 0) return;

  const aliveAgents = agents.filter((a) => a.batteryPercentage > 0);
  for (const agent of aliveAgents) {
    const elapsed = (nowMs - agent.deployedAt) / 1000;
    const pos = getAgentPositionAtElapsed(agent, elapsed);

    for (const fire of activeFires) {
      const pairKey = `${agent.id}::${fire.id}`;
      if (detectedPairs.has(pairKey)) continue;

      const dist = angularDistanceDeg(pos.lat, pos.lng, fire.lat, fire.lng);
      if (dist <= agent.searchRadius) {
        detectedPairs.add(pairKey);
        const event: UpdateEvent = {
          id: `evt-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          tick: state.tick,
          type: 'detected',
          agentId: agent.id,
          fireId: fire.id,
          lat: fire.lat,
          lng: fire.lng,
        };
        updates.push(event);
      }
    }
  }

  // Cap events list
  if (updates.length > MAX_EVENTS) {
    updates.splice(0, updates.length - MAX_EVENTS);
  }
}

/* ─── Cleanup helpers ───────────────────────────────────── */

function drainBatteries() {
  for (const a of agents) {
    a.batteryPercentage = Math.max(
      0,
      a.batteryPercentage - BATTERY_DRAIN_PER_TICK
    );
  }
  // Remove dead agents
  const alive = agents.filter((a) => a.batteryPercentage > 0);
  agents.length = 0;
  agents.push(...alive);
}

function pruneDetectedPairs() {
  // Remove pairs referencing fires that no longer exist
  const activeFireIds = new Set(getFires().map((f) => f.id));
  for (const key of detectedPairs) {
    const fireId = key.split('::')[1];
    if (!activeFireIds.has(fireId)) {
      detectedPairs.delete(key);
    }
  }
}

/* ─── Tick ──────────────────────────────────────────────── */

export function processTick(newFire?: { lat: number; lng: number }) {
  state.tick += 1;

  // 1. Clean dead fires
  const kept = fires.filter((f) => isFireAlive(f));
  fires.length = 0;
  fires.push(...kept);

  // 2. Grow existing fires (intensity increases)
  growFires();

  // 3. Spread fires (high-intensity fires spawn new fires nearby)
  spreadFires();

  // 4. Add new fire if provided
  if (newFire) {
    addFire(newFire.lat, newFire.lng);
  }

  // 5. Drain batteries and remove dead agents
  drainBatteries();

  // 6. Run detection sweep (satellites check fires in range)
  runDetection();

  // 7. Prune stale detection pairs
  pruneDetectedPairs();
}

/* ─── Fire helpers ──────────────────────────────────────── */

function randomFireType(): FireType {
  const r = Math.random();
  if (r < 0.15) return 'flash';
  if (r < 0.30) return 'chemical';
  return 'wildfire';
}

function addFire(
  lat: number,
  lng: number,
  opts?: { fireType?: FireType; parentId?: string; intensity?: number }
): Fire | null {
  if (fires.length >= MAX_FIRES) return null;
  const fire: Fire = {
    id: `fire-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    lat,
    lng,
    bornTick: state.tick,
    intensity: opts?.intensity ?? 1,
    fireType: opts?.fireType ?? randomFireType(),
    parentId: opts?.parentId,
  };
  fires.push(fire);
  return fire;
}

function growFires() {
  for (const fire of fires) {
    if (fire.intensity >= MAX_INTENSITY) continue;
    const age = state.tick - fire.bornTick;
    const interval =
      fire.fireType === 'flash' ? FLASH_GROW_INTERVAL : INTENSITY_GROW_INTERVAL;
    // Increase intensity at each interval boundary
    const expectedIntensity = Math.min(
      MAX_INTENSITY,
      1 + Math.floor(age / interval)
    );
    if (expectedIntensity > fire.intensity) {
      fire.intensity = expectedIntensity;
    }
  }
}

function spreadFires() {
  // Collect fires that can spread this tick (snapshot to avoid iterating new fires)
  const candidates = fires.filter(
    (f) => f.intensity >= 3 && isFireAlive(f)
  );

  for (const fire of candidates) {
    if (fires.length >= MAX_FIRES) break;

    const chance =
      fire.intensity >= MAX_INTENSITY
        ? SPREAD_CHANCE_INTENSITY_5
        : SPREAD_CHANCE_INTENSITY_3;

    if (Math.random() >= chance) continue;

    // Spread in a random direction within SPREAD_RADIUS_DEG
    const angle = Math.random() * 2 * Math.PI;
    const dist = (0.5 + Math.random() * 0.5) * SPREAD_RADIUS_DEG; // 50-100% of max radius
    const newLat = clampLat(fire.lat + dist * Math.sin(angle));
    const newLng = wrapLng(fire.lng + dist * Math.cos(angle));

    // Don't stack fires too close to existing ones
    const tooClose = fires.some(
      (f) => angularDistanceDeg(f.lat, f.lng, newLat, newLng) < 0.5
    );
    if (tooClose) continue;

    addFire(newLat, newLng, {
      fireType: fire.fireType, // child inherits type
      parentId: fire.id,
    });
  }
}

function clampLat(lat: number): number {
  return Math.max(-85, Math.min(85, lat));
}

function wrapLng(lng: number): number {
  if (lng > 180) return lng - 360;
  if (lng < -180) return lng + 360;
  return lng;
}

/* ─── Testing helpers (only for test scripts) ───────────── */

export function _resetState() {
  state.tick = 0;
  fires.length = 0;
  agents.length = 0;
  updates.length = 0;
  detectedPairs.clear();
}

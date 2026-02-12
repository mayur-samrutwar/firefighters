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

export type Fire = {
  id: string;
  lat: number;
  lng: number;
  bornTick: number;
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

const FIRE_LIFETIME_TICKS = 3;
const BATTERY_LIFETIME_TICKS = 120; // ~1 hour at 30s per tick
const BATTERY_DRAIN_PER_TICK = 100 / BATTERY_LIFETIME_TICKS; // ~0.833%
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
  return fires.filter((f) => state.tick - f.bornTick < FIRE_LIFETIME_TICKS);
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

  // 1. Clean expired fires
  const kept = fires.filter(
    (f) => state.tick - f.bornTick < FIRE_LIFETIME_TICKS
  );
  fires.length = 0;
  fires.push(...kept);

  // 2. Add new fire if provided
  if (newFire) {
    fires.push({
      id: `fire-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      lat: newFire.lat,
      lng: newFire.lng,
      bornTick: state.tick,
    });
  }

  // 3. Drain batteries and remove dead agents
  drainBatteries();

  // 4. Run detection sweep (satellites check fires in range)
  runDetection();

  // 5. Prune stale detection pairs
  pruneDetectedPairs();
}

/* ─── Testing helpers (only for test scripts) ───────────── */

export function _resetState() {
  state.tick = 0;
  fires.length = 0;
  agents.length = 0;
  updates.length = 0;
  detectedPairs.clear();
}

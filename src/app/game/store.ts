/**
 * In-memory game state.
 * Fires grow, spread, and can be extinguished.
 * Agents: satellites orbit, drones move point-to-point.
 *
 * State is stored on globalThis so it survives Next.js dev-mode
 * hot-reloads and module re-evaluations (Turbopack).
 */

import { getAgentPositionAtElapsed } from '@/utils/agentPosition';
import { angularDistanceDeg, clampLat, wrapLng } from '@/utils/geo';
import { executeAction } from './actions';
import { decideActions } from './agentAI';
import {
  getBulletinPosts,
  pruneBulletin,
  _resetBulletin,
  type BulletinPost,
} from './bulletin';
import { _resetPlayers } from './players';
import { buildPerception } from './perception';
import { scoreDetection, scoreExtinguished, scoreRechargeAssist, scoreWatering } from './scoring';
import { WATER_SOURCES, type WaterSource } from './waterSources';
import {
  maybeSpawnEvent,
  getActiveEvents,
  getAllEvents as getAllWorldEvents,
  consumeLightningStorms,
  consumeEquipmentMalfunctions,
  isDroughtZone,
  getWindVector,
  isSolarFlareActive,
  _resetWorldEvents,
  type WorldEvent,
} from './worldEvents';

/* ─── Types ─────────────────────────────────────────────── */

export type FireType = 'wildfire' | 'chemical' | 'flash';

export type Fire = {
  id: string;
  lat: number;
  lng: number;
  bornTick: number;
  intensity: number; // 1-5
  fireType: FireType;
  parentId?: string;
};

export type AgentRoute = [number, number][]; // [lat, lng] waypoints

export type AgentType =
  | 'satellite'
  | 'scout'
  | 'water_drone'
  | 'heavy_tanker'
  | 'supply_drone'
  | 'coordinator';

export type Agent = {
  id: string;
  type: AgentType;
  batteryPercentage: number;
  deployedAt: number; // timestamp ms
  playerId?: string; // owner player ID

  // Satellite — orbital movement
  route?: AgentRoute;
  searchRadius?: number; // degrees

  // Drones — point-to-point position & movement
  lat?: number;
  lng?: number;
  speed?: number; // degrees per tick
  target?: { lat: number; lng: number } | null;
  currentAction?: string | null;

  // Water inventory (water_drone, heavy_tanker)
  waterLevel?: number;
  waterCapacity?: number;

  // Charge inventory (supply_drone)
  chargeCapacity?: number;
  chargeLevel?: number;
};

export type UpdateEvent = {
  id: string;
  tick: number;
  type: 'detected' | 'watering' | 'extinguished' | 'world_event';
  agentId?: string;
  fireId?: string;
  lat: number;
  lng: number;
  worldEventType?: string;
  message?: string;
};

export { type WaterSource, WATER_SOURCES };
export { type BulletinPost, getBulletinPosts };
export { type Player, getPlayers, getLeaderboard, registerPlayer, playerExists } from './players';
export { getAgentLeaderboard } from './agentScores';
export { type WorldEvent, getActiveEvents, forceSpawnEvent } from './worldEvents';

export function getActiveWorldEvents(): WorldEvent[] {
  return getActiveEvents(state.tick);
}

/* ─── Agent type configs ────────────────────────────────── */

type AgentConfig = {
  drainPerTick: number; // battery drain per tick
  speed: number; // degrees per tick movement (0 = stationary)
  waterCapacity: number; // max water units (0 = no water)
  chargeCapacity: number; // max charge to distribute (0 = no charge)
  searchRadius: number; // detection radius in degrees (0 = no detection)
};

// Predefined satellite orbits so multiple satellites follow different routes
// around the globe instead of clustering on a single track.
const SATELLITE_ROUTES: AgentRoute[] = [
  // Equatorial orbit
  [
    [0, -180],
    [0, -90],
    [0, 0],
    [0, 90],
    [0, 180],
  ],
  // Polar orbit along Greenwich meridian
  [
    [-80, 0],
    [0, 0],
    [80, 0],
  ],
  // Polar orbit along 90°E
  [
    [-80, 90],
    [0, 90],
    [80, 90],
  ],
  // Mid‑latitude northern band
  [
    [45, -180],
    [45, -90],
    [45, 0],
    [45, 90],
    [45, 180],
  ],
  // Mid‑latitude southern band
  [
    [-45, -180],
    [-45, -90],
    [-45, 0],
    [-45, 90],
    [-45, 180],
  ],
  // Diagonal NW → SE
  [
    [60, -150],
    [30, -60],
    [0, 0],
    [-30, 60],
    [-60, 150],
  ],
  // Diagonal NE → SW
  [
    [60, 150],
    [30, 60],
    [0, 0],
    [-30, -60],
    [-60, -150],
  ],
];

const AGENT_CONFIGS: Record<AgentType, AgentConfig> = {
  satellite: {
    drainPerTick: 100 / 120, // ~1 hour
    speed: 0, // orbital, not point-to-point
    waterCapacity: 0,
    chargeCapacity: 0,
    searchRadius: 5,
  },
  scout: {
    drainPerTick: 100 / 60, // ~30 min
    speed: 5,
    waterCapacity: 0,
    chargeCapacity: 0,
    searchRadius: 2, // small but accurate sensor
  },
  water_drone: {
    drainPerTick: 100 / 90, // ~45 min
    speed: 3,
    waterCapacity: 3,
    chargeCapacity: 0,
    searchRadius: 0,
  },
  heavy_tanker: {
    drainPerTick: 100 / 80, // ~40 min
    speed: 1.5,
    waterCapacity: 10,
    chargeCapacity: 0,
    searchRadius: 0,
  },
  supply_drone: {
    drainPerTick: 100 / 100, // ~50 min
    speed: 3,
    waterCapacity: 0,
    chargeCapacity: 30,
    searchRadius: 0,
  },
  coordinator: {
    drainPerTick: 100 / 240, // ~2 hours
    speed: 0,
    waterCapacity: 0,
    chargeCapacity: 0,
    searchRadius: 0,
  },
};

/* ─── Constants ─────────────────────────────────────────── */

// Fire intensity & lifecycle
const MAX_INTENSITY = 5;
const INTENSITY_GROW_INTERVAL = 2;
const FLASH_GROW_INTERVAL = 1;
const BURNOUT_TICKS_AT_MAX = 8;
const FIRE_MAX_LIFETIME_TICKS = 25;

// Fire spread
const SPREAD_RADIUS_DEG = 2.5;
const SPREAD_CHANCE_INTENSITY_3 = 0.25;
const SPREAD_CHANCE_INTENSITY_5 = 0.5;
const MAX_FIRES = 50;

// Interactions
const INTERACTION_RANGE_DEG = 2; // degrees — range for extinguish, refill, recharge
const CHEMICAL_WATER_MULTIPLIER = 2; // chemical fires need 2x water

// Events
const MAX_EVENTS = 50;

/* ─── State (on globalThis for dev-mode stability) ──────── */

type GameState = {
  tick: number;
  fires: Fire[];
  agents: Agent[];
  updates: UpdateEvent[];
  detectedPairs: Set<string>;
  worldEventEmitted: Set<string>;
};

const g = globalThis as unknown as { __fireGameState?: GameState };
if (!g.__fireGameState) {
  g.__fireGameState = {
    tick: 0,
    fires: [],
    agents: [],
    updates: [],
    detectedPairs: new Set<string>(),
    worldEventEmitted: new Set<string>(),
  };
}
// Migration: add worldEventEmitted if missing from existing state
if (!g.__fireGameState.worldEventEmitted) {
  g.__fireGameState.worldEventEmitted = new Set<string>();
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

function isFireAlive(f: Fire): boolean {
  const age = state.tick - f.bornTick;
  if (age >= FIRE_MAX_LIFETIME_TICKS) return false;
  if (f.intensity >= MAX_INTENSITY) {
    const growInterval =
      f.fireType === 'flash' ? FLASH_GROW_INTERVAL : INTENSITY_GROW_INTERVAL;
    const tickReachedMax = (MAX_INTENSITY - 1) * growInterval;
    const ticksAtMax = age - tickReachedMax;
    if (ticksAtMax >= BURNOUT_TICKS_AT_MAX) return false;
  }
  if (f.intensity <= 0) return false; // extinguished
  return true;
}

export function getAgents() {
  return agents
    .filter((a) => a.batteryPercentage > 0)
    .map((a) => ({ ...a }));
}

export function getUpdates() {
  return [...updates];
}

export function getWaterSources() {
  return [...WATER_SOURCES];
}

/* ─── Agent position helper ─────────────────────────────── */

/** Get current position for any agent type */
export function getAgentPos(agent: Agent): { lat: number; lng: number } {
  if (agent.type === 'satellite' && agent.route) {
    const elapsed = (Date.now() - agent.deployedAt) / 1000;
    return getAgentPositionAtElapsed(agent, elapsed);
  }
  return { lat: agent.lat ?? 0, lng: agent.lng ?? 0 };
}

/* ─── Deploy ────────────────────────────────────────────── */

export function deployAgent(params: {
  type: AgentType;
  // Satellite
  route?: AgentRoute;
  searchRadius?: number;
  // Drone starting position
  lat?: number;
  lng?: number;
  // Overrides
  batteryPercentage?: number;
  waterLevel?: number;
  // Player ownership
  playerId?: string;
}) {
  const cfg = AGENT_CONFIGS[params.type];
  const id = `agent-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const agent: Agent = {
    id,
    type: params.type,
    batteryPercentage: params.batteryPercentage ?? 100,
    deployedAt: Date.now(),
    playerId: params.playerId,
  };

  if (params.type === 'satellite') {
    if (params.route && params.route.length >= 2) {
      agent.route = params.route;
    } else {
      const existingSatellites = agents.filter((a) => a.type === 'satellite').length;
      const routeIndex = existingSatellites % SATELLITE_ROUTES.length;
      agent.route = SATELLITE_ROUTES[routeIndex];
    }
    agent.searchRadius = params.searchRadius ?? cfg.searchRadius;
  } else {
    agent.lat = params.lat ?? 0;
    agent.lng = params.lng ?? 0;
    agent.speed = cfg.speed;
    agent.target = null;
    agent.currentAction = null;

    if (params.type === 'scout') {
      agent.searchRadius = cfg.searchRadius;
    }

    if (cfg.waterCapacity > 0) {
      agent.waterCapacity = cfg.waterCapacity;
      agent.waterLevel = params.waterLevel ?? cfg.waterCapacity; // deploy full
    }

    if (cfg.chargeCapacity > 0) {
      agent.chargeCapacity = cfg.chargeCapacity;
      agent.chargeLevel = cfg.chargeCapacity;
    }
  }

  agents.push(agent);
  return agent;
}

/* ─── Haversine — imported from @/utils/geo ─────────────── */

/* ─── Movement ──────────────────────────────────────────── */

function moveAgents() {
  for (const agent of agents) {
    if (agent.batteryPercentage <= 0) continue;
    if (agent.type === 'satellite' || agent.type === 'coordinator') continue;
    if (!agent.target || agent.speed === undefined) continue;
    if (agent.lat === undefined || agent.lng === undefined) continue;

    const dist = angularDistanceDeg(
      agent.lat,
      agent.lng,
      agent.target.lat,
      agent.target.lng
    );

    if (dist <= agent.speed) {
      // Arrived at target
      agent.lat = agent.target.lat;
      agent.lng = agent.target.lng;
      agent.target = null;
    } else {
      // Move toward target
      const frac = agent.speed / dist;
      const dLat = agent.target.lat - agent.lat;
      const dLng = agent.target.lng - agent.lng;
      agent.lat = clampLat(agent.lat + dLat * frac);
      agent.lng = wrapLng(agent.lng + dLng * frac);
    }
  }
}

/* ─── Extinguish ────────────────────────────────────────── */

function runExtinguish() {
  const activeFires = getFires();
  if (activeFires.length === 0) return;

  for (const agent of agents) {
    if (agent.batteryPercentage <= 0) continue;
    if (agent.type !== 'water_drone' && agent.type !== 'heavy_tanker') continue;
    if (!agent.waterLevel || agent.waterLevel <= 0) continue;

    const pos = getAgentPos(agent);
    // Find nearest fire in range
    let nearestFire: Fire | null = null;
    let nearestDist = Infinity;
    for (const fire of activeFires) {
      if (fire.intensity <= 0) continue;
      const d = angularDistanceDeg(pos.lat, pos.lng, fire.lat, fire.lng);
      if (d <= INTERACTION_RANGE_DEG && d < nearestDist) {
        nearestDist = d;
        nearestFire = fire;
      }
    }

    if (!nearestFire) continue;

    // Apply water
    const waterNeeded =
      nearestFire.fireType === 'chemical'
        ? CHEMICAL_WATER_MULTIPLIER
        : 1;
    const waterToUse = Math.min(agent.waterLevel, waterNeeded);
    agent.waterLevel -= waterToUse;
    agent.currentAction = 'extinguishing';

    const intensityReduction =
      nearestFire.fireType === 'chemical'
        ? Math.floor(waterToUse / CHEMICAL_WATER_MULTIPLIER)
        : waterToUse;

    nearestFire.intensity = Math.max(0, nearestFire.intensity - intensityReduction);

    // Emit watering event
    pushEvent({
      type: 'watering',
      agentId: agent.id,
      fireId: nearestFire.id,
      lat: nearestFire.lat,
      lng: nearestFire.lng,
    });
    scoreWatering(agent, state.tick);

    // Check if extinguished
    if (nearestFire.intensity <= 0) {
      pushEvent({
        type: 'extinguished',
        agentId: agent.id,
        fireId: nearestFire.id,
        lat: nearestFire.lat,
        lng: nearestFire.lng,
      });
      scoreExtinguished(agent, state.tick);
    }
  }
}

/* ─── Refill ────────────────────────────────────────────── */

function runRefill() {
  for (const agent of agents) {
    if (agent.batteryPercentage <= 0) continue;
    if (agent.type !== 'water_drone' && agent.type !== 'heavy_tanker') continue;
    if (agent.waterLevel === undefined || agent.waterCapacity === undefined)
      continue;
    if (agent.waterLevel >= agent.waterCapacity) continue;

    const pos = getAgentPos(agent);
    // Check if near any water source
    const nearSource = WATER_SOURCES.some(
      (ws) =>
        angularDistanceDeg(pos.lat, pos.lng, ws.lat, ws.lng) <=
        INTERACTION_RANGE_DEG
    );

    if (nearSource) {
      agent.waterLevel = agent.waterCapacity;
      agent.currentAction = 'refilling';
    }
  }
}

/* ─── Recharge (supply drone) ───────────────────────────── */

function runRecharge() {
  for (const agent of agents) {
    if (agent.batteryPercentage <= 0) continue;
    if (agent.type !== 'supply_drone') continue;
    if (!agent.chargeLevel || agent.chargeLevel <= 0) continue;

    const pos = getAgentPos(agent);
    // Find nearest agent with low battery (< 50%) in range
    let target: Agent | null = null;
    let minDist = Infinity;
    for (const other of agents) {
      if (other.id === agent.id) continue;
      if (other.batteryPercentage <= 0 || other.batteryPercentage >= 50)
        continue;
      const oPos = getAgentPos(other);
      const d = angularDistanceDeg(pos.lat, pos.lng, oPos.lat, oPos.lng);
      if (d <= INTERACTION_RANGE_DEG && d < minDist) {
        minDist = d;
        target = other;
      }
    }

    if (!target) continue;

    const transfer = Math.min(agent.chargeLevel, 10);
    agent.chargeLevel -= transfer;
    target.batteryPercentage = Math.min(100, target.batteryPercentage + transfer);
    agent.currentAction = 'recharging';
    scoreRechargeAssist(agent, state.tick);
  }
}

/* ─── Perception → AI → Action loop ─────────────────────── */

function runPerceptionActionLoop() {
  for (const agent of agents) {
    if (agent.batteryPercentage <= 0) continue;

    // Reset action label when agent has no target
    if (!agent.target) {
      agent.currentAction = null;
    }

    // Build what this agent can see
    const perception = buildPerception(agent);

    // AI decides actions
    const actions = decideActions(perception);

    // Execute each action
    for (const act of actions) {
      const label = executeAction(agent, act);
      if (label) agent.currentAction = label;
    }
  }
}

/* ─── Detection sweep (satellites + scouts) ─────────────── */

function runDetection() {
  const nowMs = Date.now();
  const activeFires = getFires();
  if (activeFires.length === 0) return;

  const solarFlare = isSolarFlareActive(state.tick);

  const detectors = agents.filter(
    (a) =>
      a.batteryPercentage > 0 &&
      (a.type === 'satellite' || a.type === 'scout') &&
      (a.searchRadius ?? 0) > 0 &&
      // Solar flare blinds satellites but NOT scouts
      !(solarFlare && a.type === 'satellite')
  );

  for (const agent of detectors) {
    let pos: { lat: number; lng: number };
    if (agent.type === 'satellite' && agent.route) {
      const elapsed = (nowMs - agent.deployedAt) / 1000;
      pos = getAgentPositionAtElapsed(agent, elapsed);
    } else {
      pos = { lat: agent.lat ?? 0, lng: agent.lng ?? 0 };
    }

    const radius = agent.searchRadius ?? 0;
    for (const fire of activeFires) {
      const pairKey = `${agent.id}::${fire.id}`;
      if (detectedPairs.has(pairKey)) continue;

      const dist = angularDistanceDeg(pos.lat, pos.lng, fire.lat, fire.lng);
      if (dist <= radius) {
        detectedPairs.add(pairKey);
        pushEvent({
          type: 'detected',
          agentId: agent.id,
          fireId: fire.id,
          lat: fire.lat,
          lng: fire.lng,
        });
        scoreDetection(agent, state.tick);
      }
    }
  }
}

/* ─── Event helpers ─────────────────────────────────────── */

function pushEvent(
  evt: Omit<UpdateEvent, 'id' | 'tick'>
) {
  updates.push({
    id: `evt-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    tick: state.tick,
    ...evt,
  });
  if (updates.length > MAX_EVENTS) {
    updates.splice(0, updates.length - MAX_EVENTS);
  }
}

/* ─── Cleanup helpers ───────────────────────────────────── */

function drainBatteries() {
  for (const a of agents) {
    const cfg = AGENT_CONFIGS[a.type];
    a.batteryPercentage = Math.max(
      0,
      a.batteryPercentage - cfg.drainPerTick
    );
  }
  const alive = agents.filter((a) => a.batteryPercentage > 0);
  agents.length = 0;
  agents.push(...alive);
}

function pruneDetectedPairs() {
  const activeFireIds = new Set(getFires().map((f) => f.id));
  for (const key of detectedPairs) {
    const fireId = key.split('::')[1];
    if (!activeFireIds.has(fireId)) {
      detectedPairs.delete(key);
    }
  }
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
    if (fire.intensity >= MAX_INTENSITY || fire.intensity <= 0) continue;
    const age = state.tick - fire.bornTick;

    // Drought zones: fires grow at 2x rate (halve the interval)
    const inDrought = isDroughtZone(state.tick, fire.lat, fire.lng);
    const baseInterval =
      fire.fireType === 'flash' ? FLASH_GROW_INTERVAL : INTENSITY_GROW_INTERVAL;
    const interval = inDrought ? Math.max(1, Math.floor(baseInterval / 2)) : baseInterval;

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
  const candidates = fires.filter(
    (f) => f.intensity >= 3 && isFireAlive(f)
  );

  const wind = getWindVector(state.tick);

  for (const fire of candidates) {
    if (fires.length >= MAX_FIRES) break;

    const chance =
      fire.intensity >= MAX_INTENSITY
        ? SPREAD_CHANCE_INTENSITY_5
        : SPREAD_CHANCE_INTENSITY_3;

    if (Math.random() >= chance) continue;

    let angle = Math.random() * 2 * Math.PI;
    const dist = (0.5 + Math.random() * 0.5) * SPREAD_RADIUS_DEG;

    // Wind bias: blend the random angle toward wind bearing
    if (wind) {
      const windAngleRad = (wind.bearing * Math.PI) / 180;
      // Weighted blend: higher windSpeed = stronger bias toward wind direction
      const blendFactor = Math.min(0.8, (wind.speed - 1) / 3); // 0 to 0.8
      angle = angle * (1 - blendFactor) + windAngleRad * blendFactor;
    }

    const newLat = clampLat(fire.lat + dist * Math.cos(angle));
    const newLng = wrapLng(fire.lng + dist * Math.sin(angle));

    const tooClose = fires.some(
      (f) => angularDistanceDeg(f.lat, f.lng, newLat, newLng) < 0.5
    );
    if (tooClose) continue;

    addFire(newLat, newLng, {
      fireType: fire.fireType,
      parentId: fire.id,
    });
  }
}

/* clampLat, wrapLng — imported from @/utils/geo */

/* ─── World Events ─────────────────────────────────────── */

function applyWorldEvents() {
  // Maybe spawn a new event (probabilistic)
  maybeSpawnEvent(state.tick);

  // Emit update for any active or recently-spawned events not yet announced
  // Use getAllEvents + filter to catch duration-1 events spawned between ticks
  const allEvents = getAllWorldEvents();
  for (const evt of allEvents) {
    // Event is relevant if it started at or since the previous tick
    const isRelevant =
      state.tick >= evt.startTick &&
      state.tick <= evt.startTick + evt.duration;
    if (isRelevant && !state.worldEventEmitted.has(evt.id)) {
      state.worldEventEmitted.add(evt.id);
      pushEvent({
        type: 'world_event',
        lat: evt.lat ?? 0,
        lng: evt.lng ?? 0,
        worldEventType: evt.type,
        message: evt.message,
      });
    }
  }

  // Apply lightning storms → fire clusters
  const storms = consumeLightningStorms(state.tick);
  for (const storm of storms) {
    if (storm.lat == null || storm.lng == null) continue;
    const count = 4 + Math.floor(Math.random() * 5); // 4-8 fires
    for (let i = 0; i < count; i++) {
      const offsetLat = (Math.random() - 0.5) * (storm.radius ?? 5);
      const offsetLng = (Math.random() - 0.5) * (storm.radius ?? 5);
      addFire(
        clampLat(storm.lat + offsetLat),
        wrapLng(storm.lng + offsetLng)
      );
    }
  }

  // Apply equipment malfunctions
  const malfunctions = consumeEquipmentMalfunctions(state.tick);
  for (const mal of malfunctions) {
    const alive = agents.filter((a) => a.batteryPercentage > 0);
    if (alive.length === 0) continue;
    const count = Math.min(alive.length, 1 + Math.floor(Math.random() * 2)); // 1-2 agents
    const shuffled = [...alive].sort(() => Math.random() - 0.5);
    const affected = shuffled.slice(0, count);
    mal.affectedAgentIds = affected.map((a) => a.id);
    for (const agent of affected) {
      agent.batteryPercentage = Math.max(0, agent.batteryPercentage - 20);
    }
  }
}

/* ─── Tick ──────────────────────────────────────────────── */

export function processTick(newFire?: { lat: number; lng: number }) {
  state.tick += 1;

  // 1. Clean dead/extinguished fires
  const kept = fires.filter((f) => isFireAlive(f));
  fires.length = 0;
  fires.push(...kept);

  // 2. Grow fires (drought zones accelerate growth)
  growFires();

  // 3. Spread fires (wind biases direction)
  spreadFires();

  // 4. Add new fire if provided
  if (newFire) {
    addFire(newFire.lat, newFire.lng);
  }

  // 5. World events — spawn and apply
  applyWorldEvents();

  // 6. Drain batteries and remove dead agents
  drainBatteries();

  // 7. Prune expired bulletin posts
  pruneBulletin();

  // 8. Detection sweep (satellites + scouts; solar flare blinds satellites)
  runDetection();

  // 9. Perception → AI decision → Action execution
  runPerceptionActionLoop();

  // 10. Move agents toward targets
  moveAgents();

  // 11. Extinguish (water drones at fires)
  runExtinguish();

  // 12. Refill (water drones at water sources)
  runRefill();

  // 13. Recharge (supply drones near low-battery agents)
  runRecharge();

  // 14. Prune stale detection pairs
  pruneDetectedPairs();
}

/* ─── Testing helpers ───────────────────────────────────── */

export function _resetState() {
  state.tick = 0;
  fires.length = 0;
  agents.length = 0;
  updates.length = 0;
  detectedPairs.clear();
  state.worldEventEmitted.clear();
  _resetBulletin();
  _resetPlayers();
  _resetWorldEvents();
}

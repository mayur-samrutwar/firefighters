/**
 * DB-backed game state.
 *
 * NO in-memory globalThis state. All state is persisted in Supabase.
 *
 * processTick(): loads all state from DB → runs game logic → saves back.
 * API getters: read directly from DB.
 */

import { getAgentPositionAtElapsed } from '@/utils/agentPosition';
import { angularDistanceDeg, clampLat, wrapLng } from '@/utils/geo';
import { executeAction, type ActionContext } from './actions';
import { pruneBulletinCtx } from './bulletin';
import {
  scoreDetection,
  scoreExtinguished,
  scoreRechargeAssist,
  scoreWatering,
} from './scoring';
import { WATER_SOURCES } from './waterSources';
import {
  maybeSpawnEventCtx,
  getActiveEventsFromList,
  consumeLightningStormsCtx,
  consumeEquipmentMalfunctionsCtx,
  isDroughtZoneFromList,
  getWindVectorFromList,
  isSolarFlareActiveFromList,
} from './worldEvents';
import {
  loadTickContext,
  saveTickContext,
  dbGetTick,
  dbGetFires,
  dbGetAgents,
  dbGetAgentById,
  dbGetUpdates,
  dbGetEarthLife,
  dbGetBulletinPosts,
  dbGetActiveWorldEvents,
  dbDeployAgent,
  dbUpsertAgent,
  dbCountAgentsByType,
  dbResetAll,
  type TickContext,
} from '@/lib/gameDb';
import type {
  Fire,
  FireType,
  Agent,
  AgentType,
  AgentRoute,
  UpdateEvent,
  AgentConfig,
  BulletinPost,
} from './types';

/* ─── Re-exports for backward compatibility ──────────────── */

export type {
  Fire,
  FireType,
  Agent,
  AgentType,
  AgentRoute,
  UpdateEvent,
} from './types';
export type { WaterSource } from './waterSources';
export { WATER_SOURCES } from './waterSources';
export type { BulletinPost } from './types';
export type { Player } from './types';
export type { WorldEvent } from './types';
export type { AgentScoreEntry } from './types';

// Re-export async functions from sub-modules
export { getBulletinPosts } from './bulletin';
export {
  getPlayers,
  getLeaderboard,
  registerPlayer,
  playerExists,
} from './players';
export { getAgentLeaderboard } from './agentScores';
export { getActiveEvents, forceSpawnEvent } from './worldEvents';

/* ─── Constants ─────────────────────────────────────────── */

const MAX_INTENSITY = 5;
const INTENSITY_GROW_INTERVAL = 2;
const FLASH_GROW_INTERVAL = 1;
const BURNOUT_TICKS_AT_MAX = 8;
const FIRE_MAX_LIFETIME_TICKS = 25;

const SPREAD_RADIUS_DEG = 2.5;
const SPREAD_CHANCE_INTENSITY_3 = 0.25;
const SPREAD_CHANCE_INTENSITY_5 = 0.5;
const MAX_FIRES = 50;

const INTERACTION_RANGE_DEG = 2;
const CHEMICAL_WATER_MULTIPLIER = 2;

const MAX_EVENTS = 50;

const EARTH_MAX_LIFE = 100;
const LIFE_LOSS_PER_INTENSITY_PER_TICK = 0.002;
const LIFE_GAIN_PER_INTENSITY_EXTINGUISHED = 0.05;

/* ─── Agent type configs ────────────────────────────────── */

const SATELLITE_ROUTES: AgentRoute[] = [
  [[0, -180], [0, -90], [0, 0], [0, 90], [0, 180]],
  [[-80, 0], [0, 0], [80, 0]],
  [[-80, 90], [0, 90], [80, 90]],
  [[45, -180], [45, -90], [45, 0], [45, 90], [45, 180]],
  [[-45, -180], [-45, -90], [-45, 0], [-45, 90], [-45, 180]],
  [[60, -150], [30, -60], [0, 0], [-30, 60], [-60, 150]],
  [[60, 150], [30, 60], [0, 0], [-30, -60], [-60, -150]],
];

const AGENT_CONFIGS: Record<AgentType, AgentConfig> = {
  satellite: {
    drainPerTick: 100 / 120,
    speed: 0,
    waterCapacity: 0,
    chargeCapacity: 0,
    searchRadius: 5,
  },
  scout: {
    drainPerTick: 100 / 60,
    speed: 5,
    waterCapacity: 0,
    chargeCapacity: 0,
    searchRadius: 2,
  },
  water_drone: {
    drainPerTick: 100 / 90,
    speed: 3,
    waterCapacity: 3,
    chargeCapacity: 0,
    searchRadius: 0,
  },
  heavy_tanker: {
    drainPerTick: 100 / 80,
    speed: 1.5,
    waterCapacity: 10,
    chargeCapacity: 0,
    searchRadius: 0,
  },
  supply_drone: {
    drainPerTick: 100 / 100,
    speed: 3,
    waterCapacity: 0,
    chargeCapacity: 30,
    searchRadius: 0,
  },
  coordinator: {
    drainPerTick: 100 / 240,
    speed: 0,
    waterCapacity: 0,
    chargeCapacity: 0,
    searchRadius: 0,
  },
};

/* ═══════════════════════════════════════════════════════════
   Async getters — used by API routes (read from DB)
   ═══════════════════════════════════════════════════════════ */

export async function getTick(): Promise<number> {
  return dbGetTick();
}

export async function getFires(): Promise<Fire[]> {
  return dbGetFires();
}

export async function getAgents(): Promise<Agent[]> {
  const agents = await dbGetAgents();
  return agents.filter((a) => a.batteryPercentage > 0).map((a) => ({ ...a }));
}

export async function getAgentById(
  agentId: string
): Promise<Agent | undefined> {
  return dbGetAgentById(agentId);
}

export async function getUpdates(): Promise<UpdateEvent[]> {
  return dbGetUpdates();
}

export function getWaterSources() {
  return [...WATER_SOURCES];
}

export async function getEarthLife(): Promise<number> {
  return dbGetEarthLife();
}

export async function getActiveWorldEvents() {
  return dbGetActiveWorldEvents();
}

/* ─── Agent position helper (sync — no DB needed) ────────── */

export function getAgentPos(
  agent: Agent
): { lat: number; lng: number } {
  if (agent.type === 'satellite' && agent.route) {
    const elapsed = (Date.now() - agent.deployedAt) / 1000;
    return getAgentPositionAtElapsed(agent, elapsed);
  }
  return { lat: agent.lat ?? 0, lng: agent.lng ?? 0 };
}

/* ═══════════════════════════════════════════════════════════
   Async mutations — used by API routes (write to DB)
   ═══════════════════════════════════════════════════════════ */

export async function deployAgent(params: {
  type: AgentType;
  route?: AgentRoute;
  searchRadius?: number;
  lat?: number;
  lng?: number;
  batteryPercentage?: number;
  waterLevel?: number;
  playerId?: string;
  controlMode?: 'internal' | 'external';
}): Promise<Agent> {
  const cfg = AGENT_CONFIGS[params.type];
  const id = `agent-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const agent: Agent = {
    id,
    type: params.type,
    batteryPercentage: params.batteryPercentage ?? 100,
    deployedAt: Date.now(),
    playerId: params.playerId,
    controlMode: params.controlMode ?? 'internal',
    pendingExternalAction: null,
  };

  if (params.type === 'satellite') {
    if (params.route && params.route.length >= 2) {
      agent.route = params.route;
    } else {
      const existingSatellites = await dbCountAgentsByType('satellite');
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
      agent.waterLevel = params.waterLevel ?? cfg.waterCapacity;
    }
    if (cfg.chargeCapacity > 0) {
      agent.chargeCapacity = cfg.chargeCapacity;
      agent.chargeLevel = cfg.chargeCapacity;
    }
  }

  await dbDeployAgent(agent);
  return agent;
}

export async function syncExternalAgent(params: {
  agentId: string;
  type: AgentType;
  route?: AgentRoute;
  searchRadius?: number;
  lat?: number;
  lng?: number;
}): Promise<Agent> {
  // Check if agent already exists in DB
  const existing = await dbGetAgentById(params.agentId);

  if (existing) {
    if (params.lat !== undefined) existing.lat = params.lat;
    if (params.lng !== undefined) existing.lng = params.lng;
    if (params.route) existing.route = params.route;
    if (params.searchRadius !== undefined)
      existing.searchRadius = params.searchRadius;
    await dbUpsertAgent(existing);
    return existing;
  }

  // Create new agent
  const cfg = AGENT_CONFIGS[params.type];
  const agentData: Agent = {
    id: params.agentId,
    type: params.type,
    batteryPercentage: 100,
    deployedAt: Date.now(),
    controlMode: 'external',
    pendingExternalAction: null,
  };

  if (params.type === 'satellite') {
    if (params.route && params.route.length >= 2) {
      agentData.route = params.route;
    } else {
      const existingSatellites = await dbCountAgentsByType('satellite');
      const routeIndex = existingSatellites % SATELLITE_ROUTES.length;
      agentData.route = SATELLITE_ROUTES[routeIndex];
    }
    agentData.searchRadius = params.searchRadius ?? cfg.searchRadius;
  } else {
    agentData.lat = params.lat ?? 0;
    agentData.lng = params.lng ?? 0;
    agentData.speed = cfg.speed;
    agentData.target = null;
    agentData.currentAction = null;

    if (params.type === 'scout') {
      agentData.searchRadius = cfg.searchRadius;
    }
    if (cfg.waterCapacity > 0) {
      agentData.waterCapacity = cfg.waterCapacity;
      agentData.waterLevel = cfg.waterCapacity;
    }
    if (cfg.chargeCapacity > 0) {
      agentData.chargeCapacity = cfg.chargeCapacity;
      agentData.chargeLevel = cfg.chargeCapacity;
    }
  }

  await dbDeployAgent(agentData);
  return agentData;
}

/* ═══════════════════════════════════════════════════════════
   Tick-internal functions — operate on TickContext
   ═══════════════════════════════════════════════════════════ */

function isFireAlive(f: Fire, tick: number): boolean {
  const age = tick - f.bornTick;
  if (age >= FIRE_MAX_LIFETIME_TICKS) return false;
  if (f.intensity >= MAX_INTENSITY) {
    const growInterval =
      f.fireType === 'flash' ? FLASH_GROW_INTERVAL : INTENSITY_GROW_INTERVAL;
    const tickReachedMax = (MAX_INTENSITY - 1) * growInterval;
    const ticksAtMax = age - tickReachedMax;
    if (ticksAtMax >= BURNOUT_TICKS_AT_MAX) return false;
  }
  if (f.intensity <= 0) return false;
  return true;
}

function getAliveFires(ctx: TickContext): Fire[] {
  return ctx.fires.filter((f) => isFireAlive(f, ctx.tick));
}

function moveAgents(ctx: TickContext): void {
  for (const agent of ctx.agents) {
    if (agent.batteryPercentage <= 0) continue;
    if (agent.type === 'satellite' || agent.type === 'coordinator')
      continue;
    if (!agent.target || agent.speed === undefined) continue;
    if (agent.lat === undefined || agent.lng === undefined) continue;

    const dist = angularDistanceDeg(
      agent.lat,
      agent.lng,
      agent.target.lat,
      agent.target.lng
    );

    if (dist <= agent.speed) {
      agent.lat = agent.target.lat;
      agent.lng = agent.target.lng;
      agent.target = null;
    } else {
      const frac = agent.speed / dist;
      const dLat = agent.target.lat - agent.lat;
      const dLng = agent.target.lng - agent.lng;
      agent.lat = clampLat(agent.lat + dLat * frac);
      agent.lng = wrapLng(agent.lng + dLng * frac);
    }
  }
}

function runExtinguish(ctx: TickContext): void {
  const activeFires = getAliveFires(ctx);
  if (activeFires.length === 0) return;

  for (const agent of ctx.agents) {
    if (agent.batteryPercentage <= 0) continue;
    if (agent.type !== 'water_drone' && agent.type !== 'heavy_tanker')
      continue;
    if (!agent.waterLevel || agent.waterLevel <= 0) continue;

    const pos = getAgentPos(agent);
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

    const waterNeeded =
      nearestFire.fireType === 'chemical' ? CHEMICAL_WATER_MULTIPLIER : 1;
    const waterToUse = Math.min(agent.waterLevel, waterNeeded);
    agent.waterLevel -= waterToUse;
    agent.currentAction = 'extinguishing';

    const intensityReduction =
      nearestFire.fireType === 'chemical'
        ? Math.floor(waterToUse / CHEMICAL_WATER_MULTIPLIER)
        : waterToUse;

    const newIntensity = Math.max(
      0,
      nearestFire.intensity - intensityReduction
    );
    const extinguishedAmount = nearestFire.intensity - newIntensity;
    nearestFire.intensity = newIntensity;

    pushEvent(ctx, {
      type: 'watering',
      agentId: agent.id,
      fireId: nearestFire.id,
      lat: nearestFire.lat,
      lng: nearestFire.lng,
    });
    scoreWatering(ctx, agent, ctx.tick);

    if (nearestFire.intensity <= 0) {
      pushEvent(ctx, {
        type: 'extinguished',
        agentId: agent.id,
        fireId: nearestFire.id,
        lat: nearestFire.lat,
        lng: nearestFire.lng,
      });
      scoreExtinguished(ctx, agent, ctx.tick);
    }

    if (extinguishedAmount > 0) {
      ctx.earthLife = Math.min(
        EARTH_MAX_LIFE,
        ctx.earthLife +
          extinguishedAmount * LIFE_GAIN_PER_INTENSITY_EXTINGUISHED
      );
    }
  }
}

function runRefill(ctx: TickContext): void {
  for (const agent of ctx.agents) {
    if (agent.batteryPercentage <= 0) continue;
    if (agent.type !== 'water_drone' && agent.type !== 'heavy_tanker')
      continue;
    if (
      agent.waterLevel === undefined ||
      agent.waterCapacity === undefined
    )
      continue;
    if (agent.waterLevel >= agent.waterCapacity) continue;

    const pos = getAgentPos(agent);
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

function runRecharge(ctx: TickContext): void {
  for (const agent of ctx.agents) {
    if (agent.batteryPercentage <= 0) continue;
    if (agent.type !== 'supply_drone') continue;
    if (!agent.chargeLevel || agent.chargeLevel <= 0) continue;

    const pos = getAgentPos(agent);
    let target: Agent | null = null;
    let minDist = Infinity;
    for (const other of ctx.agents) {
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
    target.batteryPercentage = Math.min(
      100,
      target.batteryPercentage + transfer
    );
    agent.currentAction = 'recharging';
    scoreRechargeAssist(ctx, agent, ctx.tick);
  }
}

/* ─── Perception → AI → Action ───────────────────────────── */

function convertExternalActionToInternal(
  externalAction: { type: string; [key: string]: unknown }
): import('./actions').AgentAction | null {
  switch (externalAction.type) {
    case 'noop':
      return { action: 'idle' };
    case 'move_to': {
      const lat =
        typeof externalAction.lat === 'number'
          ? externalAction.lat
          : undefined;
      const lng =
        typeof externalAction.lng === 'number'
          ? externalAction.lng
          : undefined;
      if (lat === undefined || lng === undefined) return null;
      return { action: 'move_to', lat, lng };
    }
    case 'water_fire':
      return { action: 'extinguish' };
    case 'refill':
      return { action: 'refill' };
    case 'recharge_agent': {
      const targetAgentId =
        typeof externalAction.targetAgentId === 'string'
          ? externalAction.targetAgentId
          : undefined;
      if (!targetAgentId) return null;
      return { action: 'recharge', targetAgentId };
    }
    case 'set_scan_focus':
      return { action: 'idle' };
    case 'change_route': {
      const raw = externalAction.route;
      if (!Array.isArray(raw) || raw.length < 2) return null;
      const route: [number, number][] = [];
      for (const p of raw) {
        if (!Array.isArray(p) || p.length < 2) return null;
        const lat = typeof p[0] === 'number' ? p[0] : NaN;
        const lng = typeof p[1] === 'number' ? p[1] : NaN;
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        route.push([lat, lng]);
      }
      return { action: 'change_route', route };
    }
    case 'investigate_fire': {
      const lat =
        typeof externalAction.lat === 'number'
          ? externalAction.lat
          : undefined;
      const lng =
        typeof externalAction.lng === 'number'
          ? externalAction.lng
          : undefined;
      if (lat !== undefined && lng !== undefined) {
        return { action: 'move_to', lat, lng };
      }
      return { action: 'idle' };
    }
    default:
      return null;
  }
}

function runPerceptionActionLoop(ctx: TickContext): void {
  const actionCtx: ActionContext = {
    tick: ctx.tick,
    bulletinPosts: ctx.bulletinPosts,
  };

  for (const agent of ctx.agents) {
    if (agent.batteryPercentage <= 0) continue;

    if (!agent.target) {
      agent.currentAction = null;
    }

    // External agents: use pending action from API
    if (agent.controlMode === 'external') {
      if (agent.pendingExternalAction) {
        const internalAction = convertExternalActionToInternal(
          agent.pendingExternalAction
        );
        if (internalAction) {
          const label = executeAction(agent, internalAction, actionCtx);
          if (label) agent.currentAction = label;
        }
        agent.pendingExternalAction = null;
      }
      continue;
    }
    // Internal agents: no-op (all decision-making is external)
    // They will only move/act when given explicit external actions.
  }
}

/* ─── Detection sweep ────────────────────────────────────── */

function runDetection(ctx: TickContext): void {
  const nowMs = Date.now();
  const activeFires = getAliveFires(ctx);
  if (activeFires.length === 0) return;

  const solarFlare = isSolarFlareActiveFromList(ctx.worldEvents, ctx.tick);

  const detectors = ctx.agents.filter(
    (a) =>
      a.batteryPercentage > 0 &&
      (a.type === 'satellite' || a.type === 'scout') &&
      (a.searchRadius ?? 0) > 0 &&
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
      if (ctx.detectedPairs.has(pairKey)) continue;

      const dist = angularDistanceDeg(
        pos.lat,
        pos.lng,
        fire.lat,
        fire.lng
      );
      if (dist <= radius) {
        ctx.detectedPairs.add(pairKey);
        pushEvent(ctx, {
          type: 'detected',
          agentId: agent.id,
          fireId: fire.id,
          lat: fire.lat,
          lng: fire.lng,
        });
        scoreDetection(ctx, agent, ctx.tick);
      }
    }
  }
}

/* ─── Event helpers ─────────────────────────────────────── */

function pushEvent(
  ctx: TickContext,
  evt: Omit<UpdateEvent, 'id' | 'tick'>
): void {
  ctx.updates.push({
    id: `evt-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    tick: ctx.tick,
    ...evt,
  });
  if (ctx.updates.length > MAX_EVENTS) {
    ctx.updates.splice(0, ctx.updates.length - MAX_EVENTS);
  }
}

/* ─── Cleanup helpers ───────────────────────────────────── */

function drainBatteries(ctx: TickContext): void {
  for (const a of ctx.agents) {
    const cfg = AGENT_CONFIGS[a.type];
    a.batteryPercentage = Math.max(
      0,
      a.batteryPercentage - cfg.drainPerTick
    );
  }
  const alive = ctx.agents.filter((a) => a.batteryPercentage > 0);
  ctx.agents.length = 0;
  ctx.agents.push(...alive);
}

function pruneDetectedPairs(ctx: TickContext): void {
  const activeFireIds = new Set(getAliveFires(ctx).map((f) => f.id));
  for (const key of ctx.detectedPairs) {
    const fireId = key.split('::')[1];
    if (!activeFireIds.has(fireId)) {
      ctx.detectedPairs.delete(key);
    }
  }
}

/* ─── Fire helpers ──────────────────────────────────────── */

function randomFireType(): FireType {
  const r = Math.random();
  if (r < 0.15) return 'flash';
  if (r < 0.3) return 'chemical';
  return 'wildfire';
}

function addFire(
  ctx: TickContext,
  lat: number,
  lng: number,
  opts?: { fireType?: FireType; parentId?: string; intensity?: number }
): Fire | null {
  if (ctx.fires.length >= MAX_FIRES) return null;
  const fire: Fire = {
    id: `fire-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    lat,
    lng,
    bornTick: ctx.tick,
    intensity: opts?.intensity ?? 1,
    fireType: opts?.fireType ?? randomFireType(),
    parentId: opts?.parentId,
  };
  ctx.fires.push(fire);
  return fire;
}

function growFires(ctx: TickContext): void {
  for (const fire of ctx.fires) {
    if (fire.intensity >= MAX_INTENSITY || fire.intensity <= 0) continue;
    const age = ctx.tick - fire.bornTick;

    const inDrought = isDroughtZoneFromList(
      ctx.worldEvents,
      ctx.tick,
      fire.lat,
      fire.lng
    );
    const baseInterval =
      fire.fireType === 'flash'
        ? FLASH_GROW_INTERVAL
        : INTENSITY_GROW_INTERVAL;
    const interval = inDrought
      ? Math.max(1, Math.floor(baseInterval / 2))
      : baseInterval;

    const expectedIntensity = Math.min(
      MAX_INTENSITY,
      1 + Math.floor(age / interval)
    );
    if (expectedIntensity > fire.intensity) {
      fire.intensity = expectedIntensity;
    }
  }
}

function spreadFires(ctx: TickContext): void {
  const candidates = ctx.fires.filter(
    (f) => f.intensity >= 3 && isFireAlive(f, ctx.tick)
  );

  const wind = getWindVectorFromList(ctx.worldEvents, ctx.tick);

  for (const fire of candidates) {
    if (ctx.fires.length >= MAX_FIRES) break;

    const chance =
      fire.intensity >= MAX_INTENSITY
        ? SPREAD_CHANCE_INTENSITY_5
        : SPREAD_CHANCE_INTENSITY_3;
    if (Math.random() >= chance) continue;

    let angle = Math.random() * 2 * Math.PI;
    const dist = (0.5 + Math.random() * 0.5) * SPREAD_RADIUS_DEG;

    if (wind) {
      const windAngleRad = (wind.bearing * Math.PI) / 180;
      const blendFactor = Math.min(0.8, (wind.speed - 1) / 3);
      angle = angle * (1 - blendFactor) + windAngleRad * blendFactor;
    }

    const newLat = clampLat(fire.lat + dist * Math.cos(angle));
    const newLng = wrapLng(fire.lng + dist * Math.sin(angle));

    const tooClose = ctx.fires.some(
      (f) => angularDistanceDeg(f.lat, f.lng, newLat, newLng) < 0.5
    );
    if (tooClose) continue;

    addFire(ctx, newLat, newLng, {
      fireType: fire.fireType,
      parentId: fire.id,
    });
  }
}

function updateEarthLife(ctx: TickContext): void {
  const active = getAliveFires(ctx);
  if (active.length === 0) return;

  const totalIntensity = active.reduce(
    (sum, f) => sum + (f.intensity || 0),
    0
  );
  if (totalIntensity <= 0) return;

  const loss = totalIntensity * LIFE_LOSS_PER_INTENSITY_PER_TICK;
  ctx.earthLife = Math.max(0, ctx.earthLife - loss);
}

/* ─── World Events ─────────────────────────────────────── */

function applyWorldEvents(ctx: TickContext): void {
  maybeSpawnEventCtx(ctx.worldEvents, ctx.tick);

  // Emit updates for new events
  const allEvents = ctx.worldEvents;
  for (const evt of allEvents) {
    const isRelevant =
      ctx.tick >= evt.startTick &&
      ctx.tick <= evt.startTick + evt.duration;
    if (isRelevant && !ctx.worldEventEmitted.has(evt.id)) {
      ctx.worldEventEmitted.add(evt.id);
      pushEvent(ctx, {
        type: 'world_event',
        lat: evt.lat ?? 0,
        lng: evt.lng ?? 0,
        worldEventType: evt.type,
        message: evt.message,
      });
    }
  }

  // Lightning storms → fire clusters
  const storms = consumeLightningStormsCtx(
    ctx.worldEvents,
    ctx.appliedInstants,
    ctx.tick
  );
  for (const storm of storms) {
    if (storm.lat == null || storm.lng == null) continue;
    const count = 4 + Math.floor(Math.random() * 5);
    for (let i = 0; i < count; i++) {
      const offsetLat = (Math.random() - 0.5) * (storm.radius ?? 5);
      const offsetLng = (Math.random() - 0.5) * (storm.radius ?? 5);
      addFire(
        ctx,
        clampLat(storm.lat + offsetLat),
        wrapLng(storm.lng + offsetLng)
      );
    }
  }

  // Equipment malfunctions
  const malfunctions = consumeEquipmentMalfunctionsCtx(
    ctx.worldEvents,
    ctx.appliedInstants,
    ctx.tick
  );
  for (const mal of malfunctions) {
    const alive = ctx.agents.filter((a) => a.batteryPercentage > 0);
    if (alive.length === 0) continue;
    const count = Math.min(
      alive.length,
      1 + Math.floor(Math.random() * 2)
    );
    const shuffled = [...alive].sort(() => Math.random() - 0.5);
    const affected = shuffled.slice(0, count);
    mal.affectedAgentIds = affected.map((a) => a.id);
    for (const agent of affected) {
      agent.batteryPercentage = Math.max(
        0,
        agent.batteryPercentage - 20
      );
    }
  }
}

/* ═══════════════════════════════════════════════════════════
   processTick — load from DB → run game logic → save to DB
   ═══════════════════════════════════════════════════════════ */

export async function processTick(
  newFire?: { lat: number; lng: number }
): Promise<void> {
  // 1. Load all state from DB
  const ctx = await loadTickContext();

  // 2. Advance tick
  ctx.tick += 1;

  // 3. Clean dead/extinguished fires
  ctx.fires = ctx.fires.filter((f) => isFireAlive(f, ctx.tick));

  // 4. Grow fires
  growFires(ctx);

  // 5. Spread fires
  spreadFires(ctx);

  // 6. Add new fire if provided
  if (newFire) {
    addFire(ctx, newFire.lat, newFire.lng);
  }

  // 7. World events
  applyWorldEvents(ctx);

  // 8. Drain batteries and remove dead agents
  drainBatteries(ctx);

  // 9. Prune bulletin posts
  pruneBulletinCtx(ctx.bulletinPosts);

  // 10. Detection sweep
  runDetection(ctx);

  // 11. Perception → AI → Action
  runPerceptionActionLoop(ctx);

  // 12. Move agents
  moveAgents(ctx);

  // 13. Extinguish
  runExtinguish(ctx);

  // 14. Refill
  runRefill(ctx);

  // 15. Recharge
  runRecharge(ctx);

  // 16. Prune stale detection pairs
  pruneDetectedPairs(ctx);

  // 17. Earth life decay
  updateEarthLife(ctx);

  // 18. Final cleanup: ensure only alive fires are saved
  ctx.fires = ctx.fires.filter((f) => isFireAlive(f, ctx.tick));

  // 19. Save everything back to DB
  await saveTickContext(ctx);
}

/* ─── Reset (testing) ────────────────────────────────────── */

export async function _resetState(): Promise<void> {
  await dbResetAll();
}

/**
 * World Events — random disruptions that create chaos and test fleet resilience.
 *
 * Provides both:
 *  - Pure context-based functions (used during tick)
 *  - Async DB-backed functions (used by API routes)
 */

import type { WorldEvent, WorldEventType } from './types';
import { dbGetTick, dbGetWorldEvents, dbInsertWorldEvent } from '@/lib/gameDb';

export type { WorldEvent, WorldEventType } from './types';

/* ─── Constants ─────────────────────────────────────────── */

const SPAWN_CHANCE = 0.07;
const MAX_ACTIVE_EVENTS = 5;

const EVENT_CONFIGS: Record<
  WorldEventType,
  { duration: number; weight: number }
> = {
  lightning_storm: { duration: 1, weight: 3 },
  drought: { duration: 15, weight: 2 },
  solar_flare: { duration: 3, weight: 2 },
  strong_winds: { duration: 10, weight: 2 },
  equipment_malfunction: { duration: 1, weight: 1 },
};

const TOTAL_WEIGHT = Object.values(EVENT_CONFIGS).reduce(
  (sum, c) => sum + c.weight,
  0
);

/* ─── Random helpers ────────────────────────────────────── */

function randomLat(): number {
  return Math.random() * 140 - 70;
}
function randomLng(): number {
  return Math.random() * 360 - 180;
}
function pickEventType(): WorldEventType {
  let roll = Math.random() * TOTAL_WEIGHT;
  for (const [type, cfg] of Object.entries(EVENT_CONFIGS)) {
    roll -= cfg.weight;
    if (roll <= 0) return type as WorldEventType;
  }
  return 'lightning_storm';
}
function generateId(): string {
  return `we-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/* ─── Event creation ─────────────────────────────────────── */

function createEvent(
  type: WorldEventType,
  tick: number,
  duration: number
): WorldEvent {
  const id = generateId();
  switch (type) {
    case 'lightning_storm': {
      let lat = randomLat();
      let lng = randomLng();
      // Avoid exactly (0,0) - shift slightly if we hit it
      if (Math.abs(lat) < 0.1 && Math.abs(lng) < 0.1) {
        lat = lat >= 0 ? 1.0 : -1.0;
        lng = lng >= 0 ? 1.0 : -1.0;
      }
      return {
        id,
        type,
        startTick: tick,
        duration,
        lat,
        lng,
        radius: 5,
        message: `Lightning storm at ${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lng).toFixed(1)}°${lng >= 0 ? 'E' : 'W'}`,
      };
    }
    case 'drought': {
      let lat = randomLat();
      let lng = randomLng();
      // Avoid exactly (0,0) - shift slightly if we hit it
      if (Math.abs(lat) < 0.1 && Math.abs(lng) < 0.1) {
        lat = lat >= 0 ? 1.0 : -1.0;
        lng = lng >= 0 ? 1.0 : -1.0;
      }
      const radius = 10 + Math.random() * 10;
      return {
        id,
        type,
        startTick: tick,
        duration,
        lat,
        lng,
        radius,
        message: `Drought zone: ${radius.toFixed(0)}° radius at ${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'}`,
      };
    }
    case 'solar_flare':
      return {
        id,
        type,
        startTick: tick,
        duration,
        message: 'Solar flare! Satellites blinded',
      };
    case 'strong_winds': {
      const bearing = Math.random() * 360;
      const speed = 1.5 + Math.random() * 1.5;
      const dirNames = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
      const dirIdx = Math.round(bearing / 45) % 8;
      return {
        id,
        type,
        startTick: tick,
        duration,
        windBearing: bearing,
        windSpeed: speed,
        message: `Strong ${dirNames[dirIdx]} winds (${speed.toFixed(1)}x spread)`,
      };
    }
    case 'equipment_malfunction':
      return {
        id,
        type,
        startTick: tick,
        duration,
        affectedAgentIds: [],
        message: 'Equipment malfunction! Random agents lost battery',
      };
  }
}

/* ═══════════════════════════════════════════════════════════
   Pure context-based functions (for tick)
   ═══════════════════════════════════════════════════════════ */

export function getActiveEventsFromList(
  events: WorldEvent[],
  tick: number
): WorldEvent[] {
  return events.filter(
    (e) => tick >= e.startTick && tick < e.startTick + e.duration
  );
}

export function getWindVectorFromList(
  events: WorldEvent[],
  tick: number
): { bearing: number; speed: number } | null {
  const active = getActiveEventsFromList(events, tick);
  const wind = active.find((e) => e.type === 'strong_winds');
  if (!wind || wind.windBearing == null || wind.windSpeed == null)
    return null;
  return { bearing: wind.windBearing, speed: wind.windSpeed };
}

export function isDroughtZoneFromList(
  events: WorldEvent[],
  tick: number,
  lat: number,
  lng: number
): boolean {
  const active = getActiveEventsFromList(events, tick);
  for (const e of active) {
    if (e.type !== 'drought') continue;
    if (e.lat == null || e.lng == null || e.radius == null) continue;
    const dLat = lat - e.lat;
    const dLng = lng - e.lng;
    const dist = Math.sqrt(dLat * dLat + dLng * dLng);
    if (dist <= e.radius) return true;
  }
  return false;
}

export function isSolarFlareActiveFromList(
  events: WorldEvent[],
  tick: number
): boolean {
  return getActiveEventsFromList(events, tick).some(
    (e) => e.type === 'solar_flare'
  );
}

/** Probabilistically spawn a new world event. Pushes to events array. */
export function maybeSpawnEventCtx(
  events: WorldEvent[],
  tick: number
): WorldEvent | null {
  const active = getActiveEventsFromList(events, tick);
  if (active.length >= MAX_ACTIVE_EVENTS) return null;
  if (Math.random() > SPAWN_CHANCE) return null;

  const type = pickEventType();
  const cfg = EVENT_CONFIGS[type];
  const event = createEvent(type, tick, cfg.duration);
  events.push(event);

  // Prune old expired events (keep active + last 30 expired)
  const activeSet = events.filter(
    (e) => tick < e.startTick + e.duration
  );
  const expired = events
    .filter((e) => tick >= e.startTick + e.duration)
    .slice(-30);
  events.length = 0;
  events.push(...expired, ...activeSet);

  return event;
}

/** Consume lightning storms that haven't been applied yet. */
export function consumeLightningStormsCtx(
  events: WorldEvent[],
  appliedInstants: Set<string>,
  tick: number
): WorldEvent[] {
  const storms = events.filter(
    (e) =>
      e.type === 'lightning_storm' &&
      !appliedInstants.has(e.id) &&
      tick >= e.startTick &&
      tick <= e.startTick + e.duration
  );
  for (const s of storms) appliedInstants.add(s.id);
  return storms;
}

/** Consume equipment malfunctions that haven't been applied yet. */
export function consumeEquipmentMalfunctionsCtx(
  events: WorldEvent[],
  appliedInstants: Set<string>,
  tick: number
): WorldEvent[] {
  const mals = events.filter(
    (e) =>
      e.type === 'equipment_malfunction' &&
      !appliedInstants.has(e.id) &&
      tick >= e.startTick &&
      tick <= e.startTick + e.duration
  );
  for (const m of mals) appliedInstants.add(m.id);
  return mals;
}

/* ═══════════════════════════════════════════════════════════
   Async DB-backed functions (for API routes)
   ═══════════════════════════════════════════════════════════ */

export async function getActiveEvents(
  tick?: number
): Promise<WorldEvent[]> {
  const t = tick ?? (await dbGetTick());
  const events = await dbGetWorldEvents();
  return getActiveEventsFromList(events, t);
}

export async function getAllEvents(): Promise<WorldEvent[]> {
  return dbGetWorldEvents();
}

export async function forceSpawnEvent(
  type: WorldEventType,
  tick: number,
  overrides?: Partial<WorldEvent>
): Promise<WorldEvent> {
  const cfg = EVENT_CONFIGS[type];
  const event = createEvent(type, tick, cfg.duration);
  if (overrides) {
    Object.assign(event, overrides);
    // If lat/lng are provided and both are exactly (0,0), shift slightly
    if (
      event.lat != null &&
      event.lng != null &&
      Math.abs(event.lat) < 0.1 &&
      Math.abs(event.lng) < 0.1
    ) {
      event.lat = event.lat >= 0 ? 1.0 : -1.0;
      event.lng = event.lng >= 0 ? 1.0 : -1.0;
    }
  }
  await dbInsertWorldEvent(event);
  return event;
}

export async function _resetWorldEvents(): Promise<void> {
  // Handled by dbResetAll in gameDb.ts
}

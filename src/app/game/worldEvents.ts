/**
 * World Events — random disruptions that create chaos and test fleet resilience.
 *
 * Events spawn probabilistically (~7% per tick, so avg every ~14 ticks).
 * Each event type has a duration and specific effects on the game world.
 *
 * State lives on globalThis alongside other game state.
 */

/* ─── Types ─────────────────────────────────────────────── */

export type WorldEventType =
  | 'lightning_storm'
  | 'drought'
  | 'solar_flare'
  | 'strong_winds'
  | 'equipment_malfunction';

export type WorldEvent = {
  id: string;
  type: WorldEventType;
  startTick: number;
  duration: number; // ticks
  lat?: number; // center of effect (lightning, drought)
  lng?: number;
  radius?: number; // degrees (drought zone radius)
  windBearing?: number; // degrees 0-360 (strong_winds)
  windSpeed?: number; // multiplier (strong_winds)
  affectedAgentIds?: string[]; // (equipment_malfunction)
  message: string;
};

/* ─── Constants ─────────────────────────────────────────── */

const SPAWN_CHANCE = 0.07; // ~7% per tick
const MAX_ACTIVE_EVENTS = 5;

// Event configs: duration, spawn weight
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

/* ─── State (on globalThis) ─────────────────────────────── */

type WorldEventState = {
  events: WorldEvent[];
};

const g = globalThis as unknown as { __fireWorldEventState?: WorldEventState };
if (!g.__fireWorldEventState) {
  g.__fireWorldEventState = { events: [] };
}
const weState = g.__fireWorldEventState;

/* ─── Random helpers ────────────────────────────────────── */

function randomLat(): number {
  return Math.random() * 140 - 70; // -70 to 70
}

function randomLng(): number {
  return Math.random() * 360 - 180; // -180 to 180
}

function pickEventType(): WorldEventType {
  let roll = Math.random() * TOTAL_WEIGHT;
  for (const [type, cfg] of Object.entries(EVENT_CONFIGS)) {
    roll -= cfg.weight;
    if (roll <= 0) return type as WorldEventType;
  }
  return 'lightning_storm'; // fallback
}

function generateId(): string {
  return `we-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/* ─── Spawn logic ───────────────────────────────────────── */

/**
 * Called once per tick. Probabilistically spawns a world event.
 * Returns the spawned event or null.
 */
export function maybeSpawnEvent(tick: number): WorldEvent | null {
  // Limit active events
  const active = getActiveEvents(tick);
  if (active.length >= MAX_ACTIVE_EVENTS) return null;

  if (Math.random() > SPAWN_CHANCE) return null;

  const type = pickEventType();
  const cfg = EVENT_CONFIGS[type];
  const event = createEvent(type, tick, cfg.duration);

  weState.events.push(event);

  // Prune old expired events (keep last 30 for history)
  pruneExpiredEvents(tick);

  return event;
}

/**
 * Force-spawn a specific event type. Used for testing.
 */
export function forceSpawnEvent(
  type: WorldEventType,
  tick: number,
  overrides?: Partial<WorldEvent>
): WorldEvent {
  const cfg = EVENT_CONFIGS[type];
  const event = createEvent(type, tick, cfg.duration);

  // Apply overrides
  if (overrides) {
    Object.assign(event, overrides);
  }

  weState.events.push(event);
  return event;
}

function createEvent(
  type: WorldEventType,
  tick: number,
  duration: number
): WorldEvent {
  const id = generateId();

  switch (type) {
    case 'lightning_storm': {
      const lat = randomLat();
      const lng = randomLng();
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
      const lat = randomLat();
      const lng = randomLng();
      const radius = 10 + Math.random() * 10; // 10-20°
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
      const speed = 1.5 + Math.random() * 1.5; // 1.5x - 3x spread bias
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
        affectedAgentIds: [], // filled in by store.ts when applied
        message: 'Equipment malfunction! Random agents lost battery',
      };
  }
}

/* ─── Getters ───────────────────────────────────────────── */

export function getActiveEvents(tick: number): WorldEvent[] {
  return weState.events.filter(
    (e) => tick >= e.startTick && tick < e.startTick + e.duration
  );
}

export function getAllEvents(): WorldEvent[] {
  return [...weState.events];
}

/**
 * Returns the current wind vector if strong_winds is active.
 * bearing: degrees (0=N, 90=E, 180=S, 270=W)
 * speed: multiplier for spread bias
 */
export function getWindVector(tick: number): {
  bearing: number;
  speed: number;
} | null {
  const active = getActiveEvents(tick);
  const wind = active.find((e) => e.type === 'strong_winds');
  if (!wind || wind.windBearing == null || wind.windSpeed == null) return null;
  return { bearing: wind.windBearing, speed: wind.windSpeed };
}

/**
 * Checks if a lat/lng point is inside any active drought zone.
 */
export function isDroughtZone(
  tick: number,
  lat: number,
  lng: number
): boolean {
  const active = getActiveEvents(tick);
  for (const e of active) {
    if (e.type !== 'drought') continue;
    if (e.lat == null || e.lng == null || e.radius == null) continue;

    // Simple angular distance check
    const dLat = lat - e.lat;
    const dLng = lng - e.lng;
    const dist = Math.sqrt(dLat * dLat + dLng * dLng);
    if (dist <= e.radius) return true;
  }
  return false;
}

/**
 * Checks if a solar flare is currently active (satellites blinded).
 */
export function isSolarFlareActive(tick: number): boolean {
  const active = getActiveEvents(tick);
  return active.some((e) => e.type === 'solar_flare');
}

/**
 * Returns lightning storm events that haven't been applied yet.
 * Called by store.ts to spawn fire clusters. Marks them as applied.
 * Uses inclusive end-tick (<=) so duration-1 events spawned between ticks work.
 */
export function consumeLightningStorms(tick: number): WorldEvent[] {
  const storms = weState.events.filter(
    (e) =>
      e.type === 'lightning_storm' &&
      !appliedInstant.has(e.id) &&
      tick >= e.startTick &&
      tick <= e.startTick + e.duration
  );
  for (const s of storms) appliedInstant.add(s.id);
  return storms;
}

/**
 * Returns equipment malfunction events that haven't been applied yet.
 * Uses inclusive end-tick (<=) for same reason as above.
 */
export function consumeEquipmentMalfunctions(tick: number): WorldEvent[] {
  const mals = weState.events.filter(
    (e) =>
      e.type === 'equipment_malfunction' &&
      !appliedInstant.has(e.id) &&
      tick >= e.startTick &&
      tick <= e.startTick + e.duration
  );
  for (const m of mals) appliedInstant.add(m.id);
  return mals;
}

/** Track instant events that have already been applied */
const appliedInstant = new Set<string>();

/* ─── Cleanup ───────────────────────────────────────────── */

function pruneExpiredEvents(tick: number) {
  // Keep active + last 30 expired for history
  const active = weState.events.filter(
    (e) => tick < e.startTick + e.duration
  );
  const expired = weState.events
    .filter((e) => tick >= e.startTick + e.duration)
    .slice(-30);
  weState.events = [...expired, ...active];
}

/* ─── Reset (testing) ───────────────────────────────────── */

export function _resetWorldEvents() {
  weState.events.length = 0;
  appliedInstant.clear();
}

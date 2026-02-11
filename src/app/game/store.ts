/**
 * In-memory game state. Fires persist for 3 ticks.
 */

export type Fire = {
  id: string;
  lat: number;
  lng: number;
  bornTick: number;
};

let tick = 0;
const fires: Fire[] = [
  { id: 'seed-mumbai', lat: 19.076, lng: 72.8777, bornTick: 0 },
];
const FIRE_LIFETIME_TICKS = 3;

export function getTick() {
  return tick;
}

export function getFires() {
  const now = tick;
  return fires.filter(
    (f) => f.id?.startsWith('seed-') || now - f.bornTick < FIRE_LIFETIME_TICKS
  );
}

export function processTick(newFire?: { lat: number; lng: number }) {
  tick += 1;
  const now = tick;
  // Prune fires older than 3 ticks (keep seed fires forever)
  const kept = fires.filter(
    (f) =>
      f.id?.startsWith('seed-') || now - f.bornTick < FIRE_LIFETIME_TICKS
  );
  fires.length = 0;
  fires.push(...kept);
  // Add new fire if provided
  if (newFire) {
    fires.push({
      id: `fire-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      lat: newFire.lat,
      lng: newFire.lng,
      bornTick: tick,
    });
  }
}

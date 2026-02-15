/**
 * Per-profile movement speeds (degrees per tick), water/charge capacity,
 * and default satellite routes for full-Earth coverage.
 */

import type { AgentProfile } from "./actions";

/** Degrees per tick when moving toward target (move_to). */
const SPEED_DEG_PER_TICK: Record<AgentProfile, number> = {
  satellite: 12, // used along route (orbital)
  scout: 32,
  water_drone: 20,
  heavy_tanker: 10,
  supply_drone: 20,
};

/** Water capacity (units). 0 = not a water carrier. */
const WATER_CAPACITY: Record<AgentProfile, number> = {
  satellite: 0,
  scout: 0,
  water_drone: 3,
  heavy_tanker: 10,
  supply_drone: 0,
};

/** Charge capacity for recharging others (supply_drone). Others 0. */
const CHARGE_CAPACITY: Record<AgentProfile, number> = {
  satellite: 0,
  scout: 0,
  water_drone: 0,
  heavy_tanker: 0,
  supply_drone: 100,
};

export function getSpeed(profile: AgentProfile): number {
  return SPEED_DEG_PER_TICK[profile] ?? 0;
}

export function getWaterCapacity(profile: AgentProfile): number {
  return WATER_CAPACITY[profile] ?? 0;
}

export function getChargeCapacity(profile: AgentProfile): number {
  return CHARGE_CAPACITY[profile] ?? 0;
}

/** Satellite scan radius in degrees (used for coverage and UI). */
export const SATELLITE_SCAN_RADIUS_DEG = 5;

/**
 * Full-Earth satellite routes: each route is a latitude band of waypoints.
 * With 5° scan radius, bands every 10° lat and waypoints every 10° lng
 * ensure no spot remains unscanned when all routes are active.
 * Returns [lat, lng][] for one band (closed loop).
 */
function buildLatBandWaypoints(lat: number, lngStepDeg = 10): [number, number][] {
  const points: [number, number][] = [];
  for (let lng = -180; lng < 180; lng += lngStepDeg) {
    points.push([lat, lng]);
  }
  return points;
}

/** Latitude bands from -80 to 80 every 10° (17 bands) for full coverage. */
const LAT_BANDS = (() => {
  const bands: number[] = [];
  for (let lat = -80; lat <= 80; lat += 10) bands.push(lat);
  return bands;
})();

/** All default satellite routes; combined they cover the whole Earth (5° radius). */
export const GLOBAL_SATELLITE_ROUTES: [number, number][][] = LAT_BANDS.map(
  (lat) => buildLatBandWaypoints(lat)
);

/** Default route for a new satellite (by index 0..GLOBAL_SATELLITE_ROUTES.length-1). */
export function getDefaultSatelliteRouteByIndex(index: number): [number, number][] {
  const i = index % GLOBAL_SATELLITE_ROUTES.length;
  return [...GLOBAL_SATELLITE_ROUTES[i]];
}

/** Stable route index from agent id string (for assign-on-register). */
export function getSatelliteRouteIndexForAgent(agentId: string): number {
  let h = 0;
  for (let i = 0; i < agentId.length; i++) {
    h = (h * 31 + agentId.charCodeAt(i)) >>> 0;
  }
  return h % GLOBAL_SATELLITE_ROUTES.length;
}

import type { Agent, AgentRoute } from '@/app/game/store';

const ROUTE_LOOP_SECONDS = 900; // Full route in 15 minutes (slow orbit)

/**
 * Core interpolation: given a route and elapsed seconds, return lat/lng.
 * Deterministic — no dependency on Date.now().
 */
export function interpolateRoute(
  route: AgentRoute,
  elapsedSeconds: number
): { lat: number; lng: number } {
  if (route.length < 2)
    return { lat: route[0]?.[0] ?? 0, lng: route[0]?.[1] ?? 0 };

  const cycle = elapsedSeconds % ROUTE_LOOP_SECONDS;
  const progress = cycle / ROUTE_LOOP_SECONDS; // 0 to 1, continuous

  const segmentCount = route.length - 1;
  const position = progress * segmentCount; // 0 to segmentCount
  const idx = Math.min(Math.floor(position), segmentCount - 1);
  const t = Math.min(position - idx, 1);

  const a = route[idx];
  const b = route[idx + 1];
  const lat = a[0] + (b[0] - a[0]) * t;
  let lng = a[1] + (b[1] - a[1]) * t;
  if (Math.abs(b[1] - a[1]) > 180) {
    lng =
      a[1] +
      (b[1] - a[1] > 0 ? b[1] - a[1] - 360 : b[1] - a[1] + 360) * t;
  }

  return { lat, lng };
}

/** Client-side: position based on wall-clock time (satellites only) */
export function getAgentPosition(agent: Agent): { lat: number; lng: number } {
  if (!agent.route || agent.route.length < 2) {
    return { lat: agent.lat ?? 0, lng: agent.lng ?? 0 };
  }
  const elapsed = (Date.now() - agent.deployedAt) / 1000;
  return interpolateRoute(agent.route, elapsed);
}

/** Server-side: position based on explicit elapsed seconds (satellites only) */
export function getAgentPositionAtElapsed(
  agent: Agent,
  elapsedSeconds: number
): { lat: number; lng: number } {
  if (!agent.route || agent.route.length < 2) {
    return { lat: agent.lat ?? 0, lng: agent.lng ?? 0 };
  }
  return interpolateRoute(agent.route, elapsedSeconds);
}

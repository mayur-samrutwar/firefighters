/**
 * Agent AI — decides what each agent does each tick based on
 * its perception packet and the bulletin board.
 *
 * Each agent type has its own decision tree. The coordinator is
 * the "dispatcher" — it reads fire reports and assigns tasks.
 */

import { angularDistanceDeg } from '@/utils/geo';
import type { AgentAction } from './actions';
import {
  hasFireReport,
  hasHeadingTo,
  countHeadingTo,
  getBulletinPosts,
} from './bulletin';
import type { PerceptionPacket } from './perception';
import { WATER_SOURCES } from './waterSources';

/* ─── Main entry ────────────────────────────────────────── */

/**
 * Given what the agent can see, decide on ONE action this tick.
 * May return multiple actions (e.g., move + post bulletin) as an array.
 */
export function decideActions(perception: PerceptionPacket): AgentAction[] {
  const { self } = perception;

  switch (self.type) {
    case 'satellite':
      return decideSatellite(perception);
    case 'scout':
      return decideScout(perception);
    case 'water_drone':
    case 'heavy_tanker':
      return decideWaterAgent(perception);
    case 'supply_drone':
      return decideSupplyDrone(perception);
    case 'coordinator':
      return decideCoordinator(perception);
    default:
      return [{ action: 'idle' }];
  }
}

/* ─── Satellite ─────────────────────────────────────────── */

function decideSatellite(p: PerceptionPacket): AgentAction[] {
  const actions: AgentAction[] = [];

  // Post fire reports for any fires in range that aren't already reported
  for (const fire of p.nearbyFires) {
    if (!hasFireReport(fire.id)) {
      actions.push({
        action: 'post_bulletin',
        postType: 'fire_report',
        lat: fire.lat,
        lng: fire.lng,
        fireId: fire.id,
        message: `Satellite detected intensity ${fire.intensity} ${fire.fireType} fire`,
      });
    }
  }

  // Satellites don't need movement actions (orbital)
  if (actions.length === 0) actions.push({ action: 'idle' });
  return actions;
}

/* ─── Scout ─────────────────────────────────────────────── */

function decideScout(p: PerceptionPacket): AgentAction[] {
  const actions: AgentAction[] = [];

  // Post fire reports for fires in detection range
  for (const fire of p.nearbyFires) {
    if (!hasFireReport(fire.id)) {
      actions.push({
        action: 'post_bulletin',
        postType: 'fire_report',
        lat: fire.lat,
        lng: fire.lng,
        fireId: fire.id,
        message: `Scout verified intensity ${fire.intensity} ${fire.fireType} fire`,
      });
    }
  }

  // If we already have a target, keep going
  if (p.self.hasTarget) return actions.length > 0 ? actions : [{ action: 'idle' }];

  // Check for assigned tasks first
  if (p.assignedTasks.length > 0) {
    const task = p.assignedTasks[0];
    if (task.lat != null && task.lng != null) {
      actions.push({ action: 'move_to', lat: task.lat, lng: task.lng });
      return actions;
    }
  }

  // Look for fire reports on bulletin that nobody is heading to verify
  const fireReports = p.bulletin.filter(
    (b) => b.postType === 'fire_report' && countHeadingTo(b.fireId ?? '') === 0
  );

  if (fireReports.length > 0) {
    // Go to closest unreported fire
    const closest = fireReports.reduce((best, post) => {
      if (post.lat == null || post.lng == null) return best;
      const d = angularDistanceDeg(
        p.self.lat,
        p.self.lng,
        post.lat,
        post.lng
      );
      if (!best || d < best.dist) return { post, dist: d };
      return best;
    }, null as { post: typeof fireReports[0]; dist: number } | null);

    if (closest?.post.lat != null && closest?.post.lng != null) {
      actions.push({
        action: 'move_to',
        lat: closest.post.lat,
        lng: closest.post.lng,
      });
      actions.push({
        action: 'post_bulletin',
        postType: 'heading_to',
        lat: closest.post.lat,
        lng: closest.post.lng,
        fireId: closest.post.fireId,
        message: 'Scout heading to verify',
      });
      return actions;
    }
  }

  // Fallback: go to nearest fire directly
  if (p.nearbyFires.length > 0) {
    const nearest = p.nearbyFires[0];
    actions.push({ action: 'move_to', lat: nearest.lat, lng: nearest.lng });
    actions.push({
      action: 'post_bulletin',
      postType: 'heading_to',
      lat: nearest.lat,
      lng: nearest.lng,
      fireId: nearest.id,
      message: 'Scout scouting fire',
    });
    return actions;
  }

  return [{ action: 'idle' }];
}

/* ─── Water Drone / Heavy Tanker ────────────────────────── */

function decideWaterAgent(p: PerceptionPacket): AgentAction[] {
  const actions: AgentAction[] = [];
  const hasWater = (p.self.waterLevel ?? 0) > 0;

  // If we already have a target, keep going
  if (p.self.hasTarget) return [{ action: 'idle' }];

  // No water → go refill
  if (!hasWater) {
    // Post need_water to bulletin
    actions.push({
      action: 'post_bulletin',
      postType: 'need_water',
      lat: p.self.lat,
      lng: p.self.lng,
      message: `${p.self.type === 'heavy_tanker' ? 'Heavy tanker' : 'Water drone'} needs refill`,
    });

    // Route to nearest water source
    const nearest = findNearestWaterSource(p.self.lat, p.self.lng);
    if (nearest) {
      actions.push({ action: 'move_to', lat: nearest.lat, lng: nearest.lng });
    }
    return actions;
  }

  // Has water — check for assigned tasks from coordinator
  if (p.assignedTasks.length > 0) {
    const task = p.assignedTasks[0];
    if (task.lat != null && task.lng != null) {
      actions.push({ action: 'move_to', lat: task.lat, lng: task.lng });
      actions.push({
        action: 'post_bulletin',
        postType: 'heading_to',
        lat: task.lat,
        lng: task.lng,
        fireId: task.fireId,
        message: 'En route to assigned fire',
      });
      return actions;
    }
  }

  // Check bulletin for fire reports that don't have enough responders
  const fireReports = p.bulletin.filter(
    (b) => b.postType === 'fire_report' && b.lat != null && b.lng != null
  );

  if (fireReports.length > 0) {
    // Sort by distance, prefer fires with fewer responders
    const scored = fireReports
      .map((report) => {
        const dist = angularDistanceDeg(
          p.self.lat,
          p.self.lng,
          report.lat!,
          report.lng!
        );
        const responders = countHeadingTo(report.fireId ?? '');
        return { report, dist, responders };
      })
      .sort((a, b) => {
        // Prefer less-covered fires, then closer ones
        if (a.responders !== b.responders) return a.responders - b.responders;
        return a.dist - b.dist;
      });

    const best = scored[0];
    if (best) {
      actions.push({
        action: 'move_to',
        lat: best.report.lat!,
        lng: best.report.lng!,
      });
      actions.push({
        action: 'post_bulletin',
        postType: 'heading_to',
        lat: best.report.lat!,
        lng: best.report.lng!,
        fireId: best.report.fireId,
        message: `${p.self.type === 'heavy_tanker' ? 'Heavy tanker' : 'Water drone'} responding`,
      });
      return actions;
    }
  }

  // Fallback: go to nearest fire in awareness range
  if (p.nearbyFires.length > 0) {
    const nearest = p.nearbyFires[0];
    actions.push({ action: 'move_to', lat: nearest.lat, lng: nearest.lng });
    actions.push({
      action: 'post_bulletin',
      postType: 'heading_to',
      lat: nearest.lat,
      lng: nearest.lng,
      fireId: nearest.id,
      message: 'Heading to nearest fire',
    });
    return actions;
  }

  return [{ action: 'idle' }];
}

/* ─── Supply Drone ──────────────────────────────────────── */

function decideSupplyDrone(p: PerceptionPacket): AgentAction[] {
  const actions: AgentAction[] = [];

  if (p.self.hasTarget) return [{ action: 'idle' }];

  // Check bulletin for need_charge requests
  const chargeRequests = p.bulletin.filter(
    (b) => b.postType === 'need_charge' && b.lat != null && b.lng != null
  );

  if (chargeRequests.length > 0) {
    const closest = chargeRequests.reduce((best, post) => {
      const d = angularDistanceDeg(
        p.self.lat,
        p.self.lng,
        post.lat!,
        post.lng!
      );
      if (!best || d < best.dist) return { post, dist: d };
      return best;
    }, null as { post: typeof chargeRequests[0]; dist: number } | null);

    if (closest) {
      actions.push({
        action: 'move_to',
        lat: closest.post.lat!,
        lng: closest.post.lng!,
      });
      return actions;
    }
  }

  // Find nearby agents with low battery
  const lowBattery = p.nearbyAgents
    .filter((a) => a.batteryPercentage > 0 && a.batteryPercentage < 50)
    .sort((a, b) => a.batteryPercentage - b.batteryPercentage);

  if (lowBattery.length > 0) {
    const target = lowBattery[0];
    actions.push({ action: 'move_to', lat: target.lat, lng: target.lng });
    return actions;
  }

  return [{ action: 'idle' }];
}

/* ─── Coordinator ───────────────────────────────────────── */

function decideCoordinator(p: PerceptionPacket): AgentAction[] {
  const actions: AgentAction[] = [];

  // Read all fire reports from bulletin
  const fireReports = getBulletinPosts().filter(
    (b) => b.postType === 'fire_report' && b.lat != null && b.lng != null
  );

  // Read all heading_to posts
  const headingPosts = getBulletinPosts().filter(
    (b) => b.postType === 'heading_to' && b.fireId
  );
  const coveredFireIds = new Set(headingPosts.map((h) => h.fireId));

  // Find fires that nobody is heading to
  const uncoveredFires = fireReports.filter(
    (r) => r.fireId && !coveredFireIds.has(r.fireId)
  );

  // Find available water agents (not currently busy)
  const availableWaterAgents = p.nearbyAgents.filter(
    (a) =>
      (a.type === 'water_drone' || a.type === 'heavy_tanker') &&
      (a.currentAction === null || a.currentAction === undefined) &&
      (a.waterLevel ?? 0) > 0
  );

  // Assign tasks: match uncovered fires to available agents
  for (const fire of uncoveredFires) {
    if (availableWaterAgents.length === 0) break;

    // Find closest available agent to this fire
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let i = 0; i < availableWaterAgents.length; i++) {
      const a = availableWaterAgents[i];
      const d = angularDistanceDeg(a.lat, a.lng, fire.lat!, fire.lng!);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }

    if (bestIdx >= 0) {
      const assigned = availableWaterAgents.splice(bestIdx, 1)[0];
      actions.push({
        action: 'post_bulletin',
        postType: 'task_assign',
        lat: fire.lat,
        lng: fire.lng,
        fireId: fire.fireId,
        targetAgentId: assigned.id,
        message: `Coordinator assigned fire to ${assigned.type}`,
      });
    }
  }

  // Post all_clear for fires that are no longer active
  // (fires in old reports but not in current nearby fires)
  const activeFireIds = new Set(p.nearbyFires.map((f) => f.id));
  for (const report of fireReports) {
    if (report.fireId && !activeFireIds.has(report.fireId)) {
      // Check we haven't already posted all_clear
      const alreadyCleared = getBulletinPosts().some(
        (b) => b.postType === 'all_clear' && b.fireId === report.fireId
      );
      if (!alreadyCleared) {
        actions.push({
          action: 'post_bulletin',
          postType: 'all_clear',
          fireId: report.fireId,
          lat: report.lat,
          lng: report.lng,
          message: 'Fire confirmed extinguished',
        });
      }
    }
  }

  // Check for agents with low battery that haven't requested charge
  const lowBatteryAgents = p.nearbyAgents.filter(
    (a) => a.batteryPercentage < 30 && a.batteryPercentage > 0
  );
  const chargeRequests = new Set(
    getBulletinPosts()
      .filter((b) => b.postType === 'need_charge')
      .map((b) => b.authorId)
  );
  for (const agent of lowBatteryAgents) {
    if (!chargeRequests.has(agent.id)) {
      actions.push({
        action: 'post_bulletin',
        postType: 'need_charge',
        lat: agent.lat,
        lng: agent.lng,
        targetAgentId: agent.id,
        message: `${agent.type} at ${agent.batteryPercentage.toFixed(0)}% battery`,
      });
    }
  }

  if (actions.length === 0) actions.push({ action: 'idle' });
  return actions;
}

/* ─── Helpers ───────────────────────────────────────────── */

function findNearestWaterSource(
  lat: number,
  lng: number
): { lat: number; lng: number } | null {
  let best: { lat: number; lng: number } | null = null;
  let bestDist = Infinity;
  for (const ws of WATER_SOURCES) {
    const d = angularDistanceDeg(lat, lng, ws.lat, ws.lng);
    if (d < bestDist) {
      bestDist = d;
      best = { lat: ws.lat, lng: ws.lng };
    }
  }
  return best;
}

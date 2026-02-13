/**
 * Perception Packet — the "view of the world" each agent receives each tick.
 *
 * buildPerceptionFromData: pure function, used during tick with context data
 * buildPerception: async wrapper, loads from DB for API routes
 */

import { angularDistanceDeg } from '@/utils/geo';
import { getAgentPositionAtElapsed } from '@/utils/agentPosition';
import type {
  Agent,
  AgentType,
  BulletinPost,
  Fire,
  WorldEvent,
} from './types';
import {
  dbGetFires,
  dbGetAgents,
  dbGetBulletinPosts,
  dbGetActiveWorldEvents,
  dbGetTick,
} from '@/lib/gameDb';
import { getAssignmentsForAgentFromList } from './bulletin';

/* ─── Types ─────────────────────────────────────────────── */

export type AgentSelfInfo = {
  id: string;
  type: AgentType;
  lat: number;
  lng: number;
  batteryPercentage: number;
  waterLevel?: number;
  waterCapacity?: number;
  chargeLevel?: number;
  chargeCapacity?: number;
  currentAction?: string | null;
  hasTarget: boolean;
};

export type NearbyAgentInfo = {
  id: string;
  type: AgentType;
  lat: number;
  lng: number;
  batteryPercentage: number;
  waterLevel?: number;
  currentAction?: string | null;
  distance: number;
};

export type PerceptionPacket = {
  tick: number;
  self: AgentSelfInfo;
  nearbyFires: (Fire & { distance: number })[];
  nearbyAgents: NearbyAgentInfo[];
  bulletin: BulletinPost[];
  assignedTasks: BulletinPost[];
  activeWorldEvents: WorldEvent[];
};

/* ─── Awareness ranges per agent type (degrees) ─────────── */

const AWARENESS_RANGE: Record<AgentType, number> = {
  satellite: 0,
  scout: 2,
  water_drone: 15,
  heavy_tanker: 15,
  supply_drone: 15,
  coordinator: 180,
};

const AGENT_VISIBILITY_RANGE = 10;

/* ─── Agent position (stateless helper) ──────────────────── */

function agentPos(agent: Agent): { lat: number; lng: number } {
  if (agent.type === 'satellite' && agent.route) {
    const elapsed = (Date.now() - agent.deployedAt) / 1000;
    return getAgentPositionAtElapsed(agent, elapsed);
  }
  return { lat: agent.lat ?? 0, lng: agent.lng ?? 0 };
}

/* ═══════════════════════════════════════════════════════════
   Pure function — used during tick with context data
   ═══════════════════════════════════════════════════════════ */

export function buildPerceptionFromData(
  agent: Agent,
  tick: number,
  allFires: Fire[],
  allAgents: Agent[],
  allBulletins: BulletinPost[],
  worldEvents: WorldEvent[]
): PerceptionPacket {
  const pos = agentPos(agent);
  const assignments = getAssignmentsForAgentFromList(
    allBulletins,
    agent.id
  );

  const self: AgentSelfInfo = {
    id: agent.id,
    type: agent.type,
    lat: pos.lat,
    lng: pos.lng,
    batteryPercentage: agent.batteryPercentage,
    waterLevel: agent.waterLevel,
    waterCapacity: agent.waterCapacity,
    chargeLevel: agent.chargeLevel,
    chargeCapacity: agent.chargeCapacity,
    currentAction: agent.currentAction,
    hasTarget: !!agent.target,
  };

  const awarenessRange =
    agent.type === 'satellite'
      ? agent.searchRadius ?? 5
      : AWARENESS_RANGE[agent.type];

  const nearbyFires = allFires
    .map((f) => ({
      ...f,
      distance: angularDistanceDeg(pos.lat, pos.lng, f.lat, f.lng),
    }))
    .filter((f) => f.distance <= awarenessRange)
    .sort((a, b) => a.distance - b.distance);

  const nearbyAgents = allAgents
    .filter((a) => a.id !== agent.id)
    .map((a) => {
      const aPos = agentPos(a);
      return {
        id: a.id,
        type: a.type,
        lat: aPos.lat,
        lng: aPos.lng,
        batteryPercentage: a.batteryPercentage,
        waterLevel: a.waterLevel,
        currentAction: a.currentAction,
        distance: angularDistanceDeg(pos.lat, pos.lng, aPos.lat, aPos.lng),
      };
    })
    .filter((a) => a.distance <= AGENT_VISIBILITY_RANGE)
    .sort((a, b) => a.distance - b.distance);

  return {
    tick,
    self,
    nearbyFires,
    nearbyAgents,
    bulletin: allBulletins.filter((p) => p.ttl > 0),
    assignedTasks: assignments,
    activeWorldEvents: worldEvents,
  };
}

/* ═══════════════════════════════════════════════════════════
   Async wrapper — used by API routes (loads from DB)
   ═══════════════════════════════════════════════════════════ */

export async function buildPerception(
  agent: Agent
): Promise<PerceptionPacket> {
  const [tick, fires, agents, bulletins, worldEvents] = await Promise.all(
    [
      dbGetTick(),
      dbGetFires(),
      dbGetAgents(),
      dbGetBulletinPosts(),
      dbGetActiveWorldEvents(),
    ]
  );
  return buildPerceptionFromData(
    agent,
    tick,
    fires,
    agents,
    bulletins,
    worldEvents
  );
}

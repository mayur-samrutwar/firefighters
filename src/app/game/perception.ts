/**
 * Perception Packet — the "view of the world" each agent receives each tick.
 *
 * Built fresh every tick for every agent. Contains only information
 * the agent type would realistically have access to.
 */

import { angularDistanceDeg } from '@/utils/geo';
import type { BulletinPost } from './bulletin';
import { getBulletinPosts, getAssignmentsForAgent } from './bulletin';
import type { Agent, AgentType, Fire, WorldEvent } from './store';
import { getFires, getAgents, getAgentPos, getTick, getActiveWorldEvents } from './store';

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
  distance: number; // degrees from self
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
  satellite: 0,       // uses searchRadius instead (handled separately)
  scout: 2,           // same as searchRadius
  water_drone: 15,    // general awareness
  heavy_tanker: 15,
  supply_drone: 15,
  coordinator: 180,   // global view (reads everything)
};

const AGENT_VISIBILITY_RANGE = 10; // degrees — can see other agents within this

/* ─── Build perception for one agent ────────────────────── */

export function buildPerception(agent: Agent): PerceptionPacket {
  const tick = getTick();
  const pos = getAgentPos(agent);
  const allFires = getFires();
  const allAgents = getAgents();
  const allBulletins = getBulletinPosts();
  const assignments = getAssignmentsForAgent(agent.id);

  // Self info
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

  // Nearby fires
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

  // Nearby agents
  const nearbyAgents = allAgents
    .filter((a) => a.id !== agent.id)
    .map((a) => {
      const aPos = getAgentPos(a);
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
    bulletin: allBulletins,
    assignedTasks: assignments,
    activeWorldEvents: getActiveWorldEvents(),
  };
}

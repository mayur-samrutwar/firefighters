/**
 * Game state type definitions.
 * Shared across all game modules to avoid circular dependencies.
 */

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
  playerId?: string;

  controlMode?: 'internal' | 'external';
  pendingExternalAction?: { type: string; [key: string]: unknown } | null;

  // Satellite — orbital movement
  route?: AgentRoute;
  searchRadius?: number; // degrees

  // Drones — point-to-point
  lat?: number;
  lng?: number;
  speed?: number; // degrees per tick
  target?: { lat: number; lng: number } | null;
  currentAction?: string | null;

  // Water inventory
  waterLevel?: number;
  waterCapacity?: number;

  // Charge inventory
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

export type BulletinPostType =
  | 'fire_report'
  | 'heading_to'
  | 'need_water'
  | 'need_charge'
  | 'task_assign'
  | 'all_clear';

export type BulletinPost = {
  id: string;
  tick: number;
  authorId: string;
  postType: BulletinPostType;
  lat?: number;
  lng?: number;
  fireId?: string;
  targetAgentId?: string;
  message?: string;
  ttl: number;
};

export type Player = {
  id: string;
  name: string;
  score: number;
  joinedTick: number;
};

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
  duration: number;
  lat?: number;
  lng?: number;
  radius?: number;
  windBearing?: number;
  windSpeed?: number;
  affectedAgentIds?: string[];
  message: string;
};

export type AgentScoreEntry = {
  agentId: string;
  label: string;
  type: AgentType;
  score: number;
  firstTick: number;
};

export type AgentConfig = {
  drainPerTick: number;
  speed: number;
  waterCapacity: number;
  chargeCapacity: number;
  searchRadius: number;
};

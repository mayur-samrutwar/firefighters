/**
 * Action definitions: score and battery decay per action type.
 * No coordinator role. Balanced so no agent type is overpowered or underpowered.
 */

export const AGENT_PROFILES = [
  "satellite",
  "scout",
  "water_drone",
  "heavy_tanker",
  "supply_drone",
] as const;

export type AgentProfile = (typeof AGENT_PROFILES)[number];

/** Battery decay multiplier: 1.0 = normal, <1 = slower (idle), >1 = faster (moving/heavy). */
export type ActionDef = {
  type: string;
  /** Which profiles can use this. "common" = all. */
  profiles: "common" | readonly AgentProfile[];
  /** Points awarded when this action is successfully applied (context bonuses like extinguish +50 are applied in tick logic). */
  score: number;
  /** Battery drain multiplier for the tick(s) while this action is active. */
  batteryDecayMultiplier: number;
  label?: string;
};

/** No-op / continue (no action sent): low drain. */
const NO_OP: ActionDef = {
  type: "no_op",
  profiles: "common",
  score: 0,
  batteryDecayMultiplier: 0.5,
  label: "No action / continue",
};

/** Sit idle: stop movement, low drain. */
const SIT_IDLE: ActionDef = {
  type: "sit_idle",
  profiles: "common",
  score: 0,
  batteryDecayMultiplier: 0.45,
  label: "Sit idle",
};

/** Post to bulletin: coordination only, no score. */
const POST_BULLETIN: ActionDef = {
  type: "post_bulletin",
  profiles: "common",
  score: 0,
  batteryDecayMultiplier: 1.0,
  label: "Post bulletin",
};

/** Common: confirm you are taking a bulletin task. */
const ACKNOWLEDGE_TASK: ActionDef = {
  type: "acknowledge_task",
  profiles: "common",
  score: 0,
  batteryDecayMultiplier: 1.0,
  label: "Acknowledge task",
};

/** Common: cancel current move/task and go idle. */
const ABORT_CURRENT: ActionDef = {
  type: "abort_current",
  profiles: "common",
  score: 0,
  batteryDecayMultiplier: 0.9,
  label: "Abort current",
};

/** Satellite: adjust scan pattern. */
const SET_SCAN_FOCUS: ActionDef = {
  type: "set_scan_focus",
  profiles: ["satellite"],
  score: 0,
  batteryDecayMultiplier: 1.15,
  label: "Set scan focus",
};

/** Satellite: set orbital route. */
const CHANGE_ROUTE: ActionDef = {
  type: "change_route",
  profiles: ["satellite"],
  score: 0,
  batteryDecayMultiplier: 1.0,
  label: "Change route",
};

/** Satellite: focus scan on a lat/lng zone for better detection there. */
const PRIORITIZE_SCAN_ZONE: ActionDef = {
  type: "prioritize_scan_zone",
  profiles: ["satellite"],
  score: 0,
  batteryDecayMultiplier: 1.2,
  label: "Prioritize scan zone",
};

/** Move toward a target (scout, water_drone, heavy_tanker, supply_drone). */
const MOVE_TO: ActionDef = {
  type: "move_to",
  profiles: ["scout", "water_drone", "heavy_tanker", "supply_drone"],
  score: 0,
  batteryDecayMultiplier: 1.3,
  label: "Move to",
};

/** Scout: move to and verify a fire. Score when verification succeeds (applied in tick). */
const INVESTIGATE_FIRE: ActionDef = {
  type: "investigate_fire",
  profiles: ["scout"],
  score: 6,
  batteryDecayMultiplier: 1.4,
  label: "Investigate fire",
};

/** Scout: mark a reported fire as false alarm (no fire there). Clears bulletin noise. */
const MARK_FALSE_ALARM: ActionDef = {
  type: "mark_false_alarm",
  profiles: ["scout"],
  score: 2,
  batteryDecayMultiplier: 1.0,
  label: "Mark false alarm",
};

/** Water drone / heavy tanker: drop water on fire. Score per application; extinguish bonus applied in tick (smaller so not a league apart). */
const WATER_FIRE: ActionDef = {
  type: "water_fire",
  profiles: ["water_drone", "heavy_tanker"],
  score: 6,
  batteryDecayMultiplier: 1.55,
  label: "Water fire",
};

/** Water drone / heavy tanker: refill at water source. */
const REFILL: ActionDef = {
  type: "refill",
  profiles: ["water_drone", "heavy_tanker"],
  score: 0,
  batteryDecayMultiplier: 1.5,
  label: "Refill",
};

/** Water drone / heavy tanker: request backup at current fire (bulletin: need more water at X). */
const REQUEST_BACKUP: ActionDef = {
  type: "request_backup",
  profiles: ["water_drone", "heavy_tanker"],
  score: 0,
  batteryDecayMultiplier: 1.0,
  label: "Request backup",
};

/** Supply drone: recharge another agent. Buffed so support isn’t underpowered. */
const RECHARGE_AGENT: ActionDef = {
  type: "recharge_agent",
  profiles: ["supply_drone"],
  score: 10,
  batteryDecayMultiplier: 1.5,
  label: "Recharge agent",
};

/** Supply drone: fast recharge (higher decay) for emergency save. */
const EMERGENCY_RECHARGE: ActionDef = {
  type: "emergency_recharge",
  profiles: ["supply_drone"],
  score: 10,
  batteryDecayMultiplier: 1.75,
  label: "Emergency recharge",
};

export const ACTION_DEFINITIONS: ActionDef[] = [
  NO_OP,
  SIT_IDLE,
  POST_BULLETIN,
  ACKNOWLEDGE_TASK,
  ABORT_CURRENT,
  SET_SCAN_FOCUS,
  CHANGE_ROUTE,
  PRIORITIZE_SCAN_ZONE,
  MOVE_TO,
  INVESTIGATE_FIRE,
  MARK_FALSE_ALARM,
  WATER_FIRE,
  REFILL,
  REQUEST_BACKUP,
  RECHARGE_AGENT,
  EMERGENCY_RECHARGE,
];

const ACTION_BY_TYPE = new Map<string, ActionDef>(
  ACTION_DEFINITIONS.map((a) => [a.type, a])
);

/** Get definition for an action type. Returns undefined if unknown. */
export function getActionDef(actionType: string): ActionDef | undefined {
  return ACTION_BY_TYPE.get(actionType);
}

/** Whether this profile can use this action type. */
export function isActionAllowedForProfile(
  actionType: string,
  profile: AgentProfile
): boolean {
  const def = ACTION_BY_TYPE.get(actionType);
  if (!def) return false;
  if (def.profiles === "common") return true;
  return (def.profiles as readonly AgentProfile[]).includes(profile);
}

/** All action types allowed for a profile (including common). */
export function getAllowedActionTypes(profile: AgentProfile): string[] {
  const common = ACTION_DEFINITIONS.filter((a) => a.profiles === "common").map(
    (a) => a.type
  );
  const profileSpecific = ACTION_DEFINITIONS.filter(
    (a) => a.profiles !== "common" && a.profiles.includes(profile)
  ).map((a) => a.type);
  return [...common, ...profileSpecific];
}

/** Score for a successful action (context bonuses like extinguish +50 are applied elsewhere). */
export function getScoreForAction(actionType: string): number {
  return getActionDef(actionType)?.score ?? 0;
}

/** Battery decay multiplier for this action (1.0 = normal). */
export function getBatteryDecayMultiplier(actionType: string): number {
  return getActionDef(actionType)?.batteryDecayMultiplier ?? 1.0;
}

/** Bonus score when a fire is fully extinguished (awarded to the agent who applied the killing water). Kept lower so extinguishers aren’t a league apart. */
export const SCORE_EXTINGUISH = 28;

/** Bonus score when an agent is first to report a fire (fire_report bulletin). */
export const SCORE_FIRST_FIRE_REPORT = 4;

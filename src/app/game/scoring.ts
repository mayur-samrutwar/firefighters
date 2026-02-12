/**
 * Scoring system — awards points when agents act.
 *
 * We currently keep TWO views in sync:
 * 1) Player scores (legacy, keyed by playerId) via players.ts
 * 2) Agent scores (preferred, keyed by agentId) via agentScores.ts
 */

import { addScore } from './players';
import { awardAgentPoints } from './agentScores';
import type { Agent } from './store';

/* ─── Point values ──────────────────────────────────────── */

export const POINTS = {
  FIRE_DETECTED: 4,      // satellite/scout detects a fire (low value)
  FIRE_EXTINGUISHED: 50, // agent extinguishes a fire completely
  WATERING: 6,           // partial extinguish (each water application)
  COORDINATOR_ASSIST: 20, // coordinator task led to extinguish
  RECHARGE_ASSIST: 6,    // supply drone recharges another agent
} as const;

/* ─── Award functions ───────────────────────────────────── */

function award(agent: Agent | undefined, playerPoints: number, agentPoints: number, tick: number) {
  if (!agent) return;
  // Agent-based leaderboard
  if (agentPoints > 0) {
    awardAgentPoints(agent, agentPoints, tick);
  }
  // Legacy player-based scoring (only if playerId exists)
  if (playerPoints > 0 && agent.playerId) {
    addScore(agent.playerId, playerPoints);
  }
}

export function scoreDetection(agent?: Agent, tick: number = 0) {
  award(agent, POINTS.FIRE_DETECTED, POINTS.FIRE_DETECTED, tick);
}

export function scoreWatering(agent?: Agent, tick: number = 0) {
  award(agent, POINTS.WATERING, POINTS.WATERING, tick);
}

export function scoreExtinguished(agent?: Agent, tick: number = 0) {
  award(agent, POINTS.FIRE_EXTINGUISHED, POINTS.FIRE_EXTINGUISHED, tick);
}

export function scoreCoordinatorAssist(agent?: Agent, tick: number = 0) {
  award(agent, POINTS.COORDINATOR_ASSIST, POINTS.COORDINATOR_ASSIST, tick);
}

export function scoreRechargeAssist(agent?: Agent, tick: number = 0) {
  award(agent, POINTS.RECHARGE_ASSIST, POINTS.RECHARGE_ASSIST, tick);
}


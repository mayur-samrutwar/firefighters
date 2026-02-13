/**
 * Scoring system — awards points when agents act.
 *
 * Context-based: operates on TickContext data during the tick loop.
 */

import { addScoreCtx } from './players';
import { awardAgentPointsCtx } from './agentScores';
import type { Agent, Player, AgentScoreEntry } from './types';

/* ─── Point values ──────────────────────────────────────── */

export const POINTS: Record<string, number> = {
  FIRE_DETECTED: 4, // base value; per-role tweaks applied in scoreDetection
  FIRE_EXTINGUISHED: 10,
  WATERING: 6,
  COORDINATOR_ASSIST: 8,
  RECHARGE_ASSIST: 6,
};

/* ─── Scoring context (subset of TickContext) ────────────── */

type ScoringCtx = {
  players: Player[];
  agentScores: Map<string, AgentScoreEntry>;
};

/* ─── Award functions ───────────────────────────────────── */

function award(
  ctx: ScoringCtx,
  agent: Agent | undefined,
  playerPoints: number,
  agentPoints: number,
  tick: number
) {
  if (!agent) return;
  if (agentPoints > 0) {
    awardAgentPointsCtx(ctx.agentScores, agent, agentPoints, tick);
  }
  if (playerPoints > 0 && agent.playerId) {
    addScoreCtx(ctx.players, agent.playerId, playerPoints);
  }
}

export function scoreDetection(
  ctx: ScoringCtx,
  agent?: Agent,
  tick: number = 0
) {
  if (!agent) return;

  // Differentiate detection value by role:
  // - Satellites get lower per-detection score (wide, cheap sensing)
  // - Scouts get higher per-detection score (close-range verification)
  let points = POINTS.FIRE_DETECTED;
  if (agent.type === 'satellite') {
    points = 2;
  } else if (agent.type === 'scout') {
    points = 6;
  }

  award(ctx, agent, points, points, tick);
}

export function scoreWatering(
  ctx: ScoringCtx,
  agent?: Agent,
  tick: number = 0
) {
  award(ctx, agent, POINTS.WATERING, POINTS.WATERING, tick);
}

export function scoreExtinguished(
  ctx: ScoringCtx,
  agent?: Agent,
  tick: number = 0
) {
  award(
    ctx,
    agent,
    POINTS.FIRE_EXTINGUISHED,
    POINTS.FIRE_EXTINGUISHED,
    tick
  );
}

export function scoreCoordinatorAssist(
  ctx: ScoringCtx,
  agent?: Agent,
  tick: number = 0
) {
  award(
    ctx,
    agent,
    POINTS.COORDINATOR_ASSIST,
    POINTS.COORDINATOR_ASSIST,
    tick
  );
}

export function scoreRechargeAssist(
  ctx: ScoringCtx,
  agent?: Agent,
  tick: number = 0
) {
  award(
    ctx,
    agent,
    POINTS.RECHARGE_ASSIST,
    POINTS.RECHARGE_ASSIST,
    tick
  );
}

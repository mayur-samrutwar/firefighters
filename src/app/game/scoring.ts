/**
 * Scoring system — awards points when agents act.
 *
 * Context-based: operates on TickContext data during the tick loop.
 */

import { addScoreCtx } from './players';
import { awardAgentPointsCtx } from './agentScores';
import type { Agent, Player, AgentScoreEntry } from './types';

/* ─── Point values ──────────────────────────────────────── */

export const POINTS = {
  FIRE_DETECTED: 4,
  FIRE_EXTINGUISHED: 50,
  WATERING: 6,
  COORDINATOR_ASSIST: 20,
  RECHARGE_ASSIST: 6,
} as const;

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
  award(ctx, agent, POINTS.FIRE_DETECTED, POINTS.FIRE_DETECTED, tick);
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

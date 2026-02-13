/**
 * Agent-based leaderboard — scores per agent (not per player).
 *
 * Provides both:
 *  - Pure context-based functions (for tick)
 *  - Async DB-backed functions (for API routes)
 */

import type { AgentType, AgentScoreEntry } from './types';
import { dbGetAgentScores } from '@/lib/gameDb';

export type { AgentScoreEntry } from './types';

/* ═══════════════════════════════════════════════════════════
   Pure context-based functions (for tick)
   ═══════════════════════════════════════════════════════════ */

type AgentLike = { id: string; type: AgentType; deployedAt: number };

export function awardAgentPointsCtx(
  scores: Map<string, AgentScoreEntry>,
  agent: AgentLike,
  points: number,
  tick: number
): void {
  if (points <= 0) return;
  let entry = scores.get(agent.id);
  if (!entry) {
    const tail = agent.id.split('-').pop() ?? agent.id.slice(-5);
    const label = `${agent.type.replace('_', ' ')} · ${tail.slice(0, 5)}`;
    entry = {
      agentId: agent.id,
      label,
      type: agent.type,
      score: 0,
      firstTick: tick,
    };
    scores.set(agent.id, entry);
  }
  entry.score += points;
}

/* ═══════════════════════════════════════════════════════════
   Async DB-backed functions (for API routes)
   ═══════════════════════════════════════════════════════════ */

export async function getAgentLeaderboard(): Promise<AgentScoreEntry[]> {
  const scores = await dbGetAgentScores();
  return scores.sort(
    (a, b) => b.score - a.score || a.firstTick - b.firstTick
  );
}

export async function _resetAgentScores(): Promise<void> {
  // Handled by dbResetAll in gameDb.ts
}

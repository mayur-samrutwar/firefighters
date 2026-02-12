/**
 * Agent-based leaderboard — scores per agent (not per player).
 *
 * This sits alongside the existing player scoring so that:
 * - Agents without a playerId can still compete.
 * - Existing player-based tests and APIs continue to work.
 */

import type { AgentType } from './store';

export type AgentScoreEntry = {
  agentId: string;
  label: string;
  type: AgentType;
  score: number;
  firstTick: number;
};

type AgentScoreState = {
  scores: Map<string, AgentScoreEntry>;
};

const g = globalThis as unknown as { __fireAgentScoreState?: AgentScoreState };
if (!g.__fireAgentScoreState) {
  g.__fireAgentScoreState = { scores: new Map() };
}
const aState = g.__fireAgentScoreState;

// Minimal view of Agent we care about (to avoid runtime import cycles)
type AgentLike = {
  id: string;
  type: AgentType;
  deployedAt: number;
};

export function awardAgentPoints(agent: AgentLike, points: number, tick: number) {
  if (points <= 0) return;
  let entry = aState.scores.get(agent.id);
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
    aState.scores.set(agent.id, entry);
  }
  entry.score += points;
}

export function getAgentLeaderboard(): AgentScoreEntry[] {
  return Array.from(aState.scores.values()).sort(
    (a, b) => b.score - a.score || a.firstTick - b.firstTick
  );
}

export function _resetAgentScores() {
  aState.scores.clear();
}


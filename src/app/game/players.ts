/**
 * Player management — identity and score tracking.
 *
 * Provides both:
 *  - Pure context-based functions (for tick)
 *  - Async DB-backed functions (for API routes)
 */

import type { Player } from './types';
import {
  dbGetPlayers,
  dbPlayerExists,
  dbRegisterPlayer,
  dbGetTick,
} from '@/lib/gameDb';

export type { Player } from './types';

/* ═══════════════════════════════════════════════════════════
   Pure context-based functions (for tick)
   ═══════════════════════════════════════════════════════════ */

/** Add score to a player in the context list */
export function addScoreCtx(
  players: Player[],
  playerId: string,
  points: number
): void {
  const player = players.find((p) => p.id === playerId);
  if (player) {
    player.score += points;
  }
}

/* ═══════════════════════════════════════════════════════════
   Async DB-backed functions (for API routes)
   ═══════════════════════════════════════════════════════════ */

export async function getPlayers(): Promise<Player[]> {
  return dbGetPlayers();
}

export async function getLeaderboard(): Promise<Player[]> {
  const players = await dbGetPlayers();
  return players.sort((a, b) => b.score - a.score);
}

export async function registerPlayer(
  name: string,
  tick?: number
): Promise<Player> {
  const t = tick ?? (await dbGetTick());
  const id = `player-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const player: Player = {
    id,
    name: name.trim().slice(0, 24),
    score: 0,
    joinedTick: t,
  };
  await dbRegisterPlayer(player);
  return player;
}

export async function playerExists(playerId: string): Promise<boolean> {
  return dbPlayerExists(playerId);
}

export async function _resetPlayers(): Promise<void> {
  // Handled by dbResetAll in gameDb.ts
}

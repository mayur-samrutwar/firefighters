/**
 * Player management — identity and score tracking.
 *
 * Players register with a name, deploy agents tied to their ID,
 * and earn points when their agents contribute to firefighting.
 *
 * State lives on globalThis alongside other game state.
 */

/* ─── Types ─────────────────────────────────────────────── */

export type Player = {
  id: string;
  name: string;
  score: number;
  joinedTick: number;
};

/* ─── State (on globalThis) ─────────────────────────────── */

type PlayerState = {
  players: Player[];
};

const g = globalThis as unknown as { __firePlayerState?: PlayerState };
if (!g.__firePlayerState) {
  g.__firePlayerState = { players: [] };
}
const pState = g.__firePlayerState;

/* ─── Getters ───────────────────────────────────────────── */

export function getPlayers(): Player[] {
  return pState.players.map((p) => ({ ...p }));
}

export function getPlayer(playerId: string): Player | undefined {
  return pState.players.find((p) => p.id === playerId);
}

export function getLeaderboard(): Player[] {
  return [...pState.players].sort((a, b) => b.score - a.score);
}

export function playerExists(playerId: string): boolean {
  return pState.players.some((p) => p.id === playerId);
}

/* ─── Mutations ─────────────────────────────────────────── */

export function registerPlayer(name: string, tick: number): Player {
  const id = `player-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const player: Player = {
    id,
    name: name.trim().slice(0, 24), // max 24 chars
    score: 0,
    joinedTick: tick,
  };
  pState.players.push(player);
  return player;
}

export function addScore(playerId: string, points: number): void {
  const player = pState.players.find((p) => p.id === playerId);
  if (player) {
    player.score += points;
  }
}

/* ─── Reset (testing) ───────────────────────────────────── */

export function _resetPlayers() {
  pState.players.length = 0;
}

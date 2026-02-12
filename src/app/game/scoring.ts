/**
 * Scoring system — awards points to players when their agents act.
 *
 * Called from store.ts event emitters and action handlers.
 * Points are awarded atomically with the action.
 */

import { addScore } from './players';

/* ─── Point values ──────────────────────────────────────── */

export const POINTS = {
  FIRE_DETECTED: 10,     // satellite/scout detects a fire
  FIRE_EXTINGUISHED: 50, // agent extinguishes a fire completely
  WATERING: 5,           // partial extinguish (each water application)
  COORDINATOR_ASSIST: 20, // coordinator task led to extinguish
  RECHARGE_ASSIST: 5,    // supply drone recharges another agent
} as const;

/* ─── Award functions ───────────────────────────────────── */

export function scoreDetection(playerId?: string) {
  if (playerId) addScore(playerId, POINTS.FIRE_DETECTED);
}

export function scoreWatering(playerId?: string) {
  if (playerId) addScore(playerId, POINTS.WATERING);
}

export function scoreExtinguished(playerId?: string) {
  if (playerId) addScore(playerId, POINTS.FIRE_EXTINGUISHED);
}

export function scoreCoordinatorAssist(playerId?: string) {
  if (playerId) addScore(playerId, POINTS.COORDINATOR_ASSIST);
}

export function scoreRechargeAssist(playerId?: string) {
  if (playerId) addScore(playerId, POINTS.RECHARGE_ASSIST);
}

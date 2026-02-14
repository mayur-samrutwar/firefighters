'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { Agent } from '@/app/game/types';

export type GameState = {
  tick: number;
  fires: Array<{
    id: string;
    lat: number;
    lng: number;
    bornTick?: number;
    intensity: number;
    fireType?: string;
  }>;
  agents: Agent[];
  updates: Array<{
    id: string;
    tick: number;
    type: string;
    agentId?: string;
    fireId?: string;
    lat: number;
    lng: number;
    worldEventType?: string;
    message?: string;
  }>;
  bulletin: Array<{
    id: string;
    tick: number;
    authorId: string;
    postType: string;
    lat?: number;
    lng?: number;
    fireId?: string;
    targetAgentId?: string;
    message?: string;
    ttl: number;
  }>;
  leaderboard: Array<{ id: string; name: string; score: number; joinedTick: number }>;
  agentLeaderboard: Array<{
    agentId: string;
    label: string;
    type: string;
    score: number;
    firstTick: number;
  }>;
  worldEvents: Array<{
    id: string;
    type: string;
    startTick: number;
    duration: number;
    lat?: number;
    lng?: number;
    radius?: number;
    message: string;
  }>;
  earthLife: number;
  waterSources: Array<{ id: string; lat: number; lng: number; name: string }>;
  nextCollapseCheck?: { nextRunAt: string; secondsUntilNext: number; formatted: string };
  nextRewardsCron?: { nextRunAt: string; secondsUntilNext: number; minutesUntilNext: number; formatted: string };
  lastFetchedAt: number;
};

const defaultState: GameState = {
  tick: 0,
  fires: [],
  agents: [],
  updates: [],
  bulletin: [],
  leaderboard: [],
  agentLeaderboard: [],
  worldEvents: [],
  earthLife: 100,
  waterSources: [],
  lastFetchedAt: 0,
};

const GameStateContext = createContext<GameState>(defaultState);

const POLL_INTERVAL_MS = 5000;

export function GameStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GameState>(defaultState);

  const fetchState = useCallback(() => {
    fetch('/api/state', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        setState({
          tick: data.tick ?? 0,
          fires: data.fires ?? [],
          agents: (data.agents ?? []) as Agent[],
          updates: data.updates ?? [],
          bulletin: data.bulletin ?? [],
          leaderboard: data.leaderboard ?? [],
          agentLeaderboard: data.agentLeaderboard ?? [],
          worldEvents: data.worldEvents ?? [],
          earthLife: typeof data.earthLife === 'number' ? data.earthLife : 100,
          waterSources: data.waterSources ?? [],
          nextCollapseCheck: data.nextCollapseCheck,
          nextRewardsCron: data.nextRewardsCron,
          lastFetchedAt: Date.now(),
        });
      })
      .catch(() => {
        setState((prev) => prev);
      });
  }, []);

  useEffect(() => {
    fetchState();
    const id = setInterval(fetchState, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchState]);

  return (
    <GameStateContext.Provider value={state}>
      {children}
    </GameStateContext.Provider>
  );
}

export function useGameState(): GameState {
  const ctx = useContext(GameStateContext);
  if (ctx === undefined) {
    throw new Error('useGameState must be used within GameStateProvider');
  }
  return ctx;
}

'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';

export type GameState = {
  tick: number;
  earth_life_pct: number;
  fires: Array<{
    id: string;
    lat: number;
    lng: number;
    intensity: number;
    type?: string;
    created_tick: number;
    updated_tick: number;
  }>;
  agents: Array<{
    id: string;
    type: string;
    lat: number;
    lng: number;
    batteryPercentage: number;
    score: number;
    displayName?: string;
    wallet?: string;
    created_at: string;
  }>;
  bulletin: Array<{
    id: string;
    agent_id: string;
    message: string;
    tick: number;
    created_at: string;
  }>;
  world_events: Array<{
    id: string;
    type: string;
    start_tick: number;
    duration_ticks: number;
    params: unknown;
    created_at: string;
  }>;
  activity: Array<{
    id: string;
    kind: "bulletin" | "fire" | "world_event";
    tick: number;
    message: string;
  }>;
};

const defaultState: GameState = {
  tick: 0,
  earth_life_pct: 100,
  fires: [],
  agents: [],
  bulletin: [],
  world_events: [],
  activity: [],
};

const GameStateContext = createContext<{
  state: GameState;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}>({
  state: defaultState,
  isLoading: true,
  error: null,
  refetch: () => {},
});

const POLL_MS = 4000;

export function GameStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GameState>(defaultState);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch('/api/state', {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setState({
        tick: data.tick ?? 0,
        earth_life_pct: data.earth_life_pct ?? 100,
        fires: data.fires ?? [],
        agents: data.agents ?? [],
        bulletin: data.bulletin ?? [],
        world_events: data.world_events ?? [],
        activity: data.activity ?? [],
      });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load state');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchState();
    const id = setInterval(fetchState, POLL_MS);
    return () => clearInterval(id);
  }, [fetchState]);

  return (
    <GameStateContext.Provider
      value={{ state, isLoading, error, refetch: fetchState }}
    >
      {children}
    </GameStateContext.Provider>
  );
}

export function useGameState() {
  return useContext(GameStateContext);
}

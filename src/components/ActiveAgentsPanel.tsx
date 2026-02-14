'use client';

import { useMemo } from 'react';
import { useGameState } from '@/contexts/GameStateContext';

type Agent = {
  id: string;
  type: string;
  batteryPercentage: number;
  currentAction?: string | null;
  displayName?: string;
  lat?: number;
  lng?: number;
};

type AgentLeaderboardEntry = {
  agentId: string;
  label: string;
  type: string;
  score: number;
  firstTick: number;
};

export default function ActiveAgentsPanel({
  onFocusAgent,
}: {
  onFocusAgent?: (agentId: string) => void;
}) {
  const { agents, agentLeaderboard: scores } = useGameState();

  const box =
    'overflow-hidden rounded-xl border border-slate-200/80 bg-white/95 shadow-lg shadow-slate-200/40 backdrop-blur-sm';

  const sorted = useMemo(
    () => {
      if (!agents.length) return [];
      const scoreById = new Map(scores.map((s) => [s.agentId, s]));
      return [...agents]
        .map((a) => {
          const scoreEntry = scoreById.get(a.id);
          const friendlyType = (a.type ?? 'agent').replace('_', ' ');
          const name = a.displayName?.trim();
          const label = name ? name : friendlyType;
          return {
            ...a,
            label,
            score: scoreEntry?.score ?? 0,
          };
        })
        .sort((a, b) => b.score - a.score || (b.batteryPercentage ?? 0) - (a.batteryPercentage ?? 0))
        .slice(0, 10);
    },
    [agents, scores]
  );

  return (
    <div className={box}>
        <p className="border-b border-slate-200/80 px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Active Agents
          {agents.length > 0 && (
            <span className="ml-2 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-slate-500">
              {agents.length}
            </span>
          )}
        </p>
        <div className="max-h-64 overflow-y-auto">
          {sorted.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-slate-400">
              No agents deployed
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {sorted.map((a) => (
                <div
                  key={a.id}
                  onClick={() => onFocusAgent?.(a.id)}
                  className="flex cursor-pointer items-center justify-between gap-2 px-4 py-2.5 transition hover:bg-slate-50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-medium text-slate-700">
                      {a.label}
                    </p>
                    <p className="mt-0.5 line-clamp-1 text-[10px] text-slate-400">
                      {a.currentAction
                        ? a.currentAction
                        : a.type === 'satellite'
                          ? 'scanning'
                          : 'idle'}
                    </p>
                  </div>
                  <div className="ml-2 flex flex-col items-end">
                    <p className="text-[11px] font-semibold text-slate-800 tabular-nums">
                      {a.score.toLocaleString()} pts
                    </p>
                    <p className="mt-0.5 text-[9px] text-slate-400">
                      {Math.round(a.batteryPercentage ?? 0)}%
                    </p>
                    <div className="mt-0.5 h-1 w-16 rounded-full bg-slate-100">
                      <div
                        className="h-1 rounded-full bg-emerald-500"
                        style={{
                          width: `${Math.max(
                            0,
                            Math.min(100, a.batteryPercentage ?? 0)
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
    </div>
  );
}


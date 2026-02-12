'use client';

import { useEffect, useState } from 'react';

type Player = {
  id: string;
  name: string;
  score: number;
  joinedTick: number;
};

export default function LeaderboardPanel() {
  const [players, setPlayers] = useState<Player[]>([]);

  useEffect(() => {
    const fetchLeaderboard = () =>
      fetch('/api/state', { cache: 'no-store' })
        .then((res) => res.json())
        .then((data) => setPlayers(data.leaderboard || []))
        .catch(() => setPlayers([]));
    fetchLeaderboard();
    const interval = setInterval(fetchLeaderboard, 2000);
    return () => clearInterval(interval);
  }, []);

  const box =
    'overflow-hidden rounded-xl border border-slate-200/80 bg-white/95 shadow-lg shadow-slate-200/40 backdrop-blur-sm';

  const rankStyle = (index: number): string => {
    if (index === 0) return 'text-amber-500 font-bold';
    if (index === 1) return 'text-slate-400 font-semibold';
    if (index === 2) return 'text-amber-700 font-semibold';
    return 'text-slate-400 font-medium';
  };

  const rankBadge = (index: number): string => {
    if (index === 0) return '🥇';
    if (index === 1) return '🥈';
    if (index === 2) return '🥉';
    return `${index + 1}`;
  };

  return (
    <div className="pointer-events-auto absolute left-8 bottom-8 z-10 w-72">
      <div className={box}>
        <p className="border-b border-slate-200/80 px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Leaderboard
          {players.length > 0 && (
            <span className="ml-2 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-slate-500">
              {players.length}
            </span>
          )}
        </p>
        <div className="max-h-64 overflow-y-auto">
          {players.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-slate-400">
              No players yet
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {players.slice(0, 20).map((player, idx) => (
                <div
                  key={player.id}
                  className="flex items-center gap-3 px-4 py-2.5"
                >
                  {/* Rank */}
                  <span
                    className={`w-6 text-center text-sm leading-none ${idx < 3 ? '' : 'text-[11px]'}`}
                  >
                    {rankBadge(idx)}
                  </span>

                  {/* Name + joined info */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-medium text-slate-700">
                      {player.name}
                    </p>
                  </div>

                  {/* Score */}
                  <div className="text-right">
                    <p className={`text-[13px] tabular-nums ${rankStyle(idx)}`}>
                      {player.score.toLocaleString()}
                    </p>
                    <p className="text-[9px] text-slate-300">pts</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

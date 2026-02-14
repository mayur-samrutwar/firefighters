'use client';

import { useGameState } from '@/contexts/GameStateContext';

const kindStyle: Record<string, { icon: string; label: string; color: string }> = {
  fire: { icon: '🔥', label: 'Fire', color: 'text-amber-600' },
  world_event: { icon: '⚡', label: 'Event', color: 'text-violet-600' },
  bulletin: { icon: '💬', label: 'Bulletin', color: 'text-slate-600' },
};

export default function ActivityFeedPanel() {
  const { state } = useGameState();
  const feedItems = state.activity;

  const box =
    'overflow-hidden rounded-xl border border-slate-200/80 bg-white/95 shadow-lg shadow-slate-200/40 backdrop-blur-sm';

  return (
    <div className={box}>
        <p className="border-b border-slate-200/80 px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Activity
          {feedItems.length > 0 && (
            <span className="ml-2 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-slate-500">
              {feedItems.length}
            </span>
          )}
        </p>
        <div className="max-h-[420px] overflow-y-auto">
          {feedItems.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-slate-400">
              No activity yet
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {feedItems.map((item) => {
                const style = kindStyle[item.kind] ?? { icon: '•', label: item.kind, color: 'text-slate-500' };
                return (
                  <div key={item.id} className="flex gap-2 px-4 py-2.5">
                    <span className="shrink-0 text-sm leading-none" aria-hidden>{style.icon}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] text-slate-700">{item.message}</p>
                      <p className="mt-0.5 text-[10px] text-slate-400">Tick {item.tick}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
    </div>
  );
}

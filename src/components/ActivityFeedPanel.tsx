'use client';

import { useGameState } from '@/contexts/GameStateContext';

export default function ActivityFeedPanel() {
  const { state } = useGameState();
  const feedItems = state.bulletin.map((b) => ({
    kind: 'bulletin',
    id: b.id,
    tick: b.tick,
    message: b.message,
    created_at: b.created_at,
  }));

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
              {feedItems.map((item) => (
                <div key={item.id} className="px-4 py-2.5">
                  <p className="text-[11px] text-slate-700">{item.message}</p>
                  <p className="mt-0.5 text-[10px] text-slate-400">Tick {item.tick}</p>
                </div>
              ))}
            </div>
          )}
        </div>
    </div>
  );
}

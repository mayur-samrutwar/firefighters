'use client';

import { useEffect, useState } from 'react';

export default function EarthLifeRing() {
  const [life, setLife] = useState(100);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const fetchState = () =>
      fetch('/api/state', { cache: 'no-store' })
        .then((res) => res.json())
        .then((data) => {
          if (typeof data.earthLife === 'number') {
            setLife(Math.max(0, Math.min(100, data.earthLife)));
          }
          if (typeof data.tick === 'number') {
            setTick(data.tick);
          }
        })
        .catch(() => {
          // keep last value on error
        });
    fetchState();
    const id = setInterval(fetchState, 2000);
    return () => clearInterval(id);
  }, []);

  const pct = Math.max(0, Math.min(100, life));
  const angle = (pct / 100) * 360;
  const color =
    pct > 66 ? '#22c55e' : pct > 33 ? '#fbbf24' : '#ef4444';

  const ringStyle: React.CSSProperties = {
    background: `conic-gradient(${color} 0deg, ${color} ${angle}deg, #e5e7eb ${angle}deg, #e5e7eb 360deg)`,
  };

  return (
    <div className="pointer-events-auto absolute left-8 bottom-28 z-10">
      <div className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white/95 px-4 py-3 shadow-lg shadow-slate-200/40 backdrop-blur-sm">
        <div
          className="relative flex h-12 w-12 items-center justify-center rounded-full"
          style={ringStyle}
        >
          <div className="h-8 w-8 rounded-full bg-white" />
          <span className="pointer-events-none absolute text-[11px] font-semibold text-slate-700">
            {Math.round(pct)}%
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Earth life
          </span>
          <span className="text-xs font-medium text-slate-700">
            {pct <= 0 ? 'Collapse' : pct > 66 ? 'Stable' : pct > 33 ? 'Stressed' : 'Critical'}
          </span>
          <span className="mt-0.5 text-[10px] text-slate-400">
            Tick: {tick}
          </span>
        </div>
      </div>
    </div>
  );
}


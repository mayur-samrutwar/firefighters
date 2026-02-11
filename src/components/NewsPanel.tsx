'use client';

import { useEffect, useState } from 'react';

type Fire = { id: string; lat: number; lng: number };

function formatCoord(lat: number, lng: number) {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(2)}°${ns}, ${Math.abs(lng).toFixed(2)}°${ew}`;
}

export default function NewsPanel() {
  const [fires, setFires] = useState<Fire[]>([]);

  useEffect(() => {
    const fetchState = () =>
      fetch('/api/state', { cache: 'no-store' })
        .then((res) => res.json())
        .then((data) => setFires(data.fires || []))
        .catch(() => setFires([]));
    fetchState();
    const interval = setInterval(fetchState, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="pointer-events-auto absolute right-8 top-8 z-10 max-h-[40vh] w-64 overflow-hidden rounded-xl border border-slate-200/80 bg-white/95 shadow-lg shadow-slate-200/40 backdrop-blur-sm">
      <p className="border-b border-slate-200/80 px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        Fire reports
      </p>
      <div className="max-h-[calc(40vh-40px)] overflow-y-auto px-4 py-3">
        {fires.length === 0 ? (
          <p className="text-xs text-slate-400">No active fires</p>
        ) : (
          <div className="space-y-2.5">
            {fires.map((f) => (
              <div
                key={f.id}
                className="flex items-start gap-2.5 text-xs text-slate-600"
              >
                <span
                  className="mt-0.5 h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: '#f97316' }}
                />
                <span>Fire at {formatCoord(f.lat, f.lng)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

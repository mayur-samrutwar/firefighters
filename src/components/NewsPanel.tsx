'use client';

import { useEffect, useState } from 'react';

type Fire = { id: string; lat: number; lng: number };

function formatCoord(lat: number, lng: number) {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(2)}°${ns}, ${Math.abs(lng).toFixed(2)}°${ew}`;
}

const DUMMY_UPDATES = [
  {
    id: '1',
    type: 'detected',
    agent: 'Satellite A',
    loc: { lat: 34.05, lng: -118.25 },
    text: 'detected fire at',
  },
  {
    id: '2',
    type: 'watering',
    agent: 'Agent B',
    loc: { lat: 33.87, lng: 151.21 },
    text: 'watering at',
  },
  {
    id: '3',
    type: 'extinguished',
    agent: null,
    loc: { lat: 35.23, lng: -80.84 },
    text: 'Fire extinguished at',
  },
  {
    id: '4',
    type: 'detected',
    agent: 'Satellite C',
    loc: { lat: 40.6128, lng: -73.9792 },
    text: 'detected fire at',
  },
];

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

  const box = 'overflow-hidden rounded-xl border border-slate-200/80 bg-white/95 shadow-lg shadow-slate-200/40 backdrop-blur-sm';

  return (
    <div className="pointer-events-auto absolute right-8 top-8 z-10 flex w-64 flex-col gap-4">
      {/* Fire reports */}
      <div className={box}>
        <p className="border-b border-slate-200/80 px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Fire reports
        </p>
        <div className="max-h-24 overflow-y-auto px-4 py-3">
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

      {/* Updates */}
      <div className={box}>
        <p className="border-b border-slate-200/80 px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Updates
        </p>
        <div className="max-h-48 overflow-y-auto px-4 py-3">
          <div className="space-y-3">
            {DUMMY_UPDATES.map((u) => (
              <div
                key={u.id}
                className="flex items-start gap-2.5 text-xs leading-relaxed text-slate-600"
              >
                <span
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{
                    backgroundColor:
                      u.type === 'detected'
                        ? '#f97316'
                        : u.type === 'watering'
                          ? '#3b82f6'
                          : '#22c55e',
                  }}
                />
                <span>
                  {u.agent && (
                    <span className="font-medium text-slate-700">{u.agent}</span>
                  )}{' '}
                  {u.text}{' '}
                  <span className="text-slate-500">
                    {formatCoord(u.loc.lat, u.loc.lng)}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

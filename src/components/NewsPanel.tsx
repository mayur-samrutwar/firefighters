'use client';

import { useEffect, useState } from 'react';

type Fire = { id: string; lat: number; lng: number; intensity: number; fireType?: string };

type UpdateEvent = {
  id: string;
  tick: number;
  type: 'detected' | 'watering' | 'extinguished' | 'world_event';
  agentId?: string;
  fireId?: string;
  lat: number;
  lng: number;
  worldEventType?: string;
  message?: string;
};

function formatCoord(lat: number, lng: number) {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(2)}°${ns}, ${Math.abs(lng).toFixed(2)}°${ew}`;
}

function shortId(id?: string) {
  if (!id) return '';
  // "agent-1234567890-abc" → "abc"
  const parts = id.split('-');
  return parts[parts.length - 1]?.slice(0, 5) ?? id.slice(-5);
}

function eventText(u: UpdateEvent): { agent: string | null; text: string } {
  switch (u.type) {
    case 'detected':
      return {
        agent: u.agentId ? `Agent ${shortId(u.agentId)}` : null,
        text: 'detected fire at',
      };
    case 'watering':
      return {
        agent: u.agentId ? `Drone ${shortId(u.agentId)}` : null,
        text: 'watering fire at',
      };
    case 'extinguished':
      return {
        agent: u.agentId ? `Drone ${shortId(u.agentId)}` : null,
        text: 'extinguished fire at',
      };
    case 'world_event':
      return {
        agent: null,
        text:
          u.message ??
          (u.worldEventType ? `world event: ${u.worldEventType}` : 'world event at'),
      };
    default:
      return {
        agent: null,
        text: 'update at',
      };
  }
}

export default function NewsPanel() {
  const [fires, setFires] = useState<Fire[]>([]);
  const [updates, setUpdates] = useState<UpdateEvent[]>([]);

  useEffect(() => {
    const fetchState = () =>
      fetch('/api/state', { cache: 'no-store' })
        .then((res) => res.json())
        .then((data) => {
          setFires(data.fires || []);
          setUpdates(data.updates || []);
        })
        .catch(() => {
          setFires([]);
          setUpdates([]);
        });
    fetchState();
    const interval = setInterval(fetchState, 2000);
    return () => clearInterval(interval);
  }, []);

  const box =
    'overflow-hidden rounded-xl border border-slate-200/80 bg-white/95 shadow-lg shadow-slate-200/40 backdrop-blur-sm';

  // Show newest updates first
  const sortedUpdates = [...updates].reverse();

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
              {fires.map((f) => {
                const intColor =
                  f.intensity <= 2
                    ? '#f97316'
                    : f.intensity <= 4
                      ? '#ea580c'
                      : '#dc2626';
                const label =
                  f.intensity >= 5
                    ? 'Inferno'
                    : `Int ${f.intensity}`;
                return (
                  <div
                    key={f.id}
                    className="flex items-start gap-2.5 text-xs text-slate-600"
                  >
                    <span
                      className="mt-0.5 h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: intColor }}
                    />
                    <span>
                      <span className="font-medium text-slate-700">
                        {label}
                      </span>{' '}
                      {f.fireType === 'chemical' ? '⚗️ ' : f.fireType === 'flash' ? '⚡ ' : ''}
                      at {formatCoord(f.lat, f.lng)}
                    </span>
                  </div>
                );
              })}
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
          {sortedUpdates.length === 0 ? (
            <p className="text-xs text-slate-400">No updates yet</p>
          ) : (
            <div className="space-y-3">
              {sortedUpdates.map((u) => {
                const { agent, text } = eventText(u);
                return (
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
                              : u.type === 'extinguished'
                                ? '#22c55e'
                                : '#a855f7',
                      }}
                    />
                    <span>
                      {agent && (
                        <span className="font-medium text-slate-700">
                          {agent}
                        </span>
                      )}{' '}
                      {text}{' '}
                      <span className="text-slate-500">
                        {formatCoord(u.lat, u.lng)}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

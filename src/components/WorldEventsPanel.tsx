'use client';

import { useGameState } from '@/contexts/GameStateContext';

const EVENT_CONFIG: Record<
  string,
  { label: string; color: string; icon: string; bg: string }
> = {
  lightning_storm: {
    label: 'Lightning Storm',
    color: '#eab308',
    icon: '⚡',
    bg: 'bg-amber-50',
  },
  drought: {
    label: 'Drought Zone',
    color: '#f97316',
    icon: '☀️',
    bg: 'bg-orange-50',
  },
  drought_zone: {
    label: 'Drought Zone',
    color: '#f97316',
    icon: '☀️',
    bg: 'bg-orange-50',
  },
  solar_flare: {
    label: 'Solar Flare',
    color: '#a855f7',
    icon: '🌟',
    bg: 'bg-purple-50',
  },
  strong_winds: {
    label: 'Strong Winds',
    color: '#06b6d4',
    icon: '💨',
    bg: 'bg-cyan-50',
  },
  equipment_malfunction: {
    label: 'Malfunction',
    color: '#ef4444',
    icon: '⚠️',
    bg: 'bg-red-50',
  },
};

export default function WorldEventsPanel() {
  const { state } = useGameState();
  const events = state.world_events;
  const tick = state.tick;

  if (events.length === 0) return null;

  return (
    <div className="pointer-events-auto absolute left-1/2 top-6 z-20 flex -translate-x-1/2 flex-wrap items-center justify-center gap-2">
      {events.map((evt) => {
          const cfg = EVENT_CONFIG[evt.type] ?? {
            label: evt.type,
            color: '#94a3b8',
            icon: '•',
            bg: 'bg-slate-50',
          };
          const remaining = Math.max(
            0,
            evt.start_tick + evt.duration_ticks - tick
          );

          return (
            <div
              key={evt.id}
              className={`flex items-center gap-2 rounded-lg border border-slate-200/80 ${cfg.bg} px-3 py-2 shadow-md backdrop-blur-sm`}
            >
              <span className="text-base leading-none">{cfg.icon}</span>
              <div>
                <p
                  className="text-[11px] font-semibold leading-none"
                  style={{ color: cfg.color }}
                >
                  {cfg.label}
                </p>
                <p className="mt-0.5 text-[10px] leading-none text-slate-500">
                  {remaining > 0
                    ? `${remaining} tick${remaining !== 1 ? 's' : ''} left`
                    : 'ending'}
                </p>
              </div>
            </div>
          );
        })}
    </div>
  );
}

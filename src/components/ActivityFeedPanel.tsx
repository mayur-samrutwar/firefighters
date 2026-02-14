'use client';

import { useGameState } from '@/contexts/GameStateContext';

type BulletinPost = {
  id: string;
  tick: number;
  authorId: string;
  postType: string;
  lat?: number;
  lng?: number;
  fireId?: string;
  targetAgentId?: string;
  message?: string;
  ttl: number;
};

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

type AgentSummary = { id: string; type?: string; displayName?: string };

type Fire = { id: string; lat: number; lng: number; intensity: number; fireType?: string; bornTick?: number };

type FeedItem =
  | { kind: 'bulletin'; id: string; tick: number; post: BulletinPost }
  | { kind: 'update'; id: string; tick: number; event: UpdateEvent }
  | { kind: 'fire'; id: string; tick: number; fire: Fire };

const TICK_SECONDS = 10;

/** Relative time from item tick vs current tick (e.g. "2m ago", "just now"). */
function formatTicksAgo(itemTick: number, currentTick: number): string {
  const ticksAgo = Math.max(0, currentTick - itemTick);
  if (ticksAgo === 0) return 'just now';
  const secondsAgo = ticksAgo * TICK_SECONDS;
  if (secondsAgo < 60) return `${secondsAgo}s ago`;
  const minutesAgo = Math.floor(secondsAgo / 60);
  if (minutesAgo < 60) return `${minutesAgo}m ago`;
  const hoursAgo = Math.floor(minutesAgo / 60);
  return hoursAgo === 1 ? '1h ago' : `${hoursAgo}h ago`;
}

function formatCoord(lat?: number, lng?: number) {
  if (lat == null || lng == null) return '';
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(1)}°${ns}, ${Math.abs(lng).toFixed(1)}°${ew}`;
}

const BULLETIN_CONFIG: Record<
  string,
  { label: string; color: string; icon: string }
> = {
  fire_report: { label: 'Fire Report', color: '#ef4444', icon: '🔥' },
  heading_to: { label: 'Heading To', color: '#3b82f6', icon: '→' },
  need_water: { label: 'Need Water', color: '#06b6d4', icon: '💧' },
  need_charge: { label: 'Need Charge', color: '#a855f7', icon: '⚡' },
  task_assign: { label: 'Task Assigned', color: '#eab308', icon: '📋' },
  all_clear: { label: 'All Clear', color: '#22c55e', icon: '✓' },
};

const UPDATE_CONFIG: Record<
  string,
  { label: string; color: string; icon: string }
> = {
  detected: { label: 'Detected', color: '#f97316', icon: '👁' },
  watering: { label: 'Watering', color: '#3b82f6', icon: '💧' },
  extinguished: { label: 'Extinguished', color: '#22c55e', icon: '✓' },
  world_event: { label: 'Event', color: '#a855f7', icon: '⚡' },
};

// Same event types as WorldEventsPanel so Activity matches the globe
const WORLD_EVENT_CONFIG: Record<
  string,
  { label: string; color: string; icon: string }
> = {
  lightning_storm: { label: 'Lightning Storm', color: '#eab308', icon: '⚡' },
  drought: { label: 'Drought Zone', color: '#f97316', icon: '☀️' },
  solar_flare: { label: 'Solar Flare', color: '#a855f7', icon: '🌟' },
  strong_winds: { label: 'Strong Winds', color: '#06b6d4', icon: '💨' },
  equipment_malfunction: { label: 'Malfunction', color: '#ef4444', icon: '⚠️' },
};

const AGENT_TYPE_LABELS: Record<string, string> = {
  satellite: 'Satellite',
  water_drone: 'Water drone',
  heavy_tanker: 'Tanker',
  scout: 'Scout',
  supply_drone: 'Supply drone',
  coordinator: 'Coordinator',
};

function authorLabel(agent: AgentSummary | undefined, fallback: string): string {
  const name = agent?.displayName?.trim();
  if (name) return name;
  const typeLabel = agent?.type ? AGENT_TYPE_LABELS[agent.type] ?? agent.type.replace('_', ' ') : fallback;
  return typeLabel;
}

export default function ActivityFeedPanel() {
  const { tick: currentTick, bulletin: posts, updates, agents, fires } = useGameState();
  const agentsList = agents.map((a) => ({ id: a.id, type: a.type, displayName: a.displayName }));

  const feedItems: FeedItem[] = [
    ...posts.map((post) => ({ kind: 'bulletin' as const, id: post.id, tick: post.tick, post })),
    ...updates.map((event) => ({ kind: 'update' as const, id: event.id, tick: event.tick, event })),
    ...fires.map((fire) => ({ kind: 'fire' as const, id: fire.id, tick: fire.bornTick ?? 0, fire })),
  ].sort((a, b) => b.tick - a.tick);

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
              {feedItems.slice(0, 80).map((item) => {
                if (item.kind === 'fire') {
                  const f = item.fire;
                  const intLabel = f.intensity >= 5 ? 'Inferno' : `Int ${f.intensity}`;
                  const typeTag = f.fireType === 'chemical' ? ' ⚗️' : f.fireType === 'flash' ? ' ⚡' : '';
                  return (
                    <div
                      key={`f-${item.id}`}
                      className="flex gap-3 px-4 py-2.5"
                    >
                      <span className="mt-0.5 text-sm leading-none">🔥</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-orange-600">
                            Fire
                          </span>
                          <span className="text-[9px] text-slate-400">
                            T{item.tick}
                            <span className="ml-1.5 text-slate-300">
                              · {formatTicksAgo(item.tick, currentTick)}
                            </span>
                          </span>
                        </div>
                        <p className="mt-0.5 text-[11px] leading-snug text-slate-600">
                          {intLabel}{typeTag} at {formatCoord(f.lat, f.lng)}
                        </p>
                      </div>
                    </div>
                  );
                }
                if (item.kind === 'bulletin') {
                  const config = BULLETIN_CONFIG[item.post.postType] ?? {
                    label: item.post.postType,
                    color: '#94a3b8',
                    icon: '•',
                  };
                  const author = agentsList.find((a) => a.id === item.post.authorId);
                  return (
                    <div
                      key={`b-${item.id}`}
                      className="flex gap-3 px-4 py-2.5"
                    >
                      <span className="mt-0.5 text-sm leading-none">
                        {config.icon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="text-[10px] font-semibold uppercase tracking-wide"
                            style={{ color: config.color }}
                          >
                            {config.label}
                          </span>
                          <span className="text-[9px] text-slate-400">
                            T{item.post.tick}
                            <span className="ml-1.5 text-slate-300">
                              · {formatTicksAgo(item.tick, currentTick)}
                            </span>
                          </span>
                        </div>
                        {item.post.message && (
                          <p className="mt-0.5 text-[11px] leading-snug text-slate-600">
                            {item.post.message}
                          </p>
                        )}
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0 text-[10px] text-slate-400">
                          {item.post.lat != null && (
                            <span>{formatCoord(item.post.lat, item.post.lng)}</span>
                          )}
                          <span>
                            by {authorLabel(author, 'Unknown')}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                }
                const u = item.event;
                const isWorldEvent = u.type === 'world_event';
                const config = isWorldEvent && u.worldEventType
                  ? (WORLD_EVENT_CONFIG[u.worldEventType] ?? UPDATE_CONFIG.world_event)
                  : (UPDATE_CONFIG[u.type] ?? { label: u.type, color: '#94a3b8', icon: '•' });
                const agent = agentsList.find((a) => a.id === u.agentId);
                const label = isWorldEvent
                  ? u.message ?? (u.worldEventType ? `World: ${u.worldEventType}` : 'World event')
                  : `${authorLabel(agent, 'Agent')} ${config.label.toLowerCase()} at ${formatCoord(u.lat, u.lng)}`;
                return (
                  <div
                    key={`u-${item.id}`}
                    className="flex gap-3 px-4 py-2.5"
                  >
                    <span className="mt-0.5 text-sm leading-none">
                      {config.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="text-[10px] font-semibold uppercase tracking-wide"
                          style={{ color: config.color }}
                        >
                          {config.label}
                        </span>
                        <span className="text-[9px] text-slate-400">
                          T{u.tick}
                          <span className="ml-1.5 text-slate-300">
                            · {formatTicksAgo(item.tick, currentTick)}
                          </span>
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] leading-snug text-slate-600">
                        {label}
                      </p>
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

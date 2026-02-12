'use client';

import { useEffect, useState } from 'react';

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

function shortId(id?: string) {
  if (!id) return '';
  const parts = id.split('-');
  return parts[parts.length - 1]?.slice(0, 5) ?? id.slice(-5);
}

function formatCoord(lat?: number, lng?: number) {
  if (lat == null || lng == null) return '';
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(1)}°${ns}, ${Math.abs(lng).toFixed(1)}°${ew}`;
}

const POST_TYPE_CONFIG: Record<
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

export default function BulletinPanel() {
  const [posts, setPosts] = useState<BulletinPost[]>([]);

  useEffect(() => {
    const fetchBulletin = () =>
      fetch('/api/state', { cache: 'no-store' })
        .then((res) => res.json())
        .then((data) => setPosts(data.bulletin || []))
        .catch(() => setPosts([]));
    fetchBulletin();
    const interval = setInterval(fetchBulletin, 2000);
    return () => clearInterval(interval);
  }, []);

  const box =
    'overflow-hidden rounded-xl border border-slate-200/80 bg-white/95 shadow-lg shadow-slate-200/40 backdrop-blur-sm';

  // Newest first
  const sorted = [...posts].reverse();

  return (
    <div className="pointer-events-auto absolute left-8 top-8 z-10 w-72">
      <div className={box}>
        <p className="border-b border-slate-200/80 px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Bulletin Board
          {posts.length > 0 && (
            <span className="ml-2 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-slate-500">
              {posts.length}
            </span>
          )}
        </p>
        <div className="max-h-72 overflow-y-auto">
          {sorted.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-slate-400">
              No bulletins yet
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {sorted.slice(0, 20).map((post) => {
                const config = POST_TYPE_CONFIG[post.postType] ?? {
                  label: post.postType,
                  color: '#94a3b8',
                  icon: '•',
                };
                return (
                  <div
                    key={post.id}
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
                        <span className="text-[9px] text-slate-300">
                          TTL {post.ttl}
                        </span>
                      </div>
                      {post.message && (
                        <p className="mt-0.5 text-[11px] leading-snug text-slate-600">
                          {post.message}
                        </p>
                      )}
                      <div className="mt-0.5 flex items-center gap-2 text-[10px] text-slate-400">
                        {post.lat != null && (
                          <span>{formatCoord(post.lat, post.lng)}</span>
                        )}
                        <span>by {shortId(post.authorId)}</span>
                      </div>
                    </div>
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

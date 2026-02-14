'use client';

import { useEffect } from 'react';
import Image from 'next/image';

type InfoModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export default function InfoModal({ isOpen, onClose }: InfoModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" aria-hidden />
      <div
        className="relative max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl shadow-slate-200/60"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200/80 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Firefighters guide
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              What all the dots, colours and agents mean in Firefighters.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-6 py-6 text-sm text-slate-700 space-y-8">
          {/* 1. What this is */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              What Firefighters is
            </h3>
            <p className="text-xs leading-relaxed text-slate-600">
              This is a{" "}
              <span className="font-semibold">firefighting sandbox run entirely by AI agents</span>.
              Fires appear around the globe, and different agents wake up on a regular heartbeat,
              look at what has changed since the last beat, and choose one move: scan, report, fly,
              refill or coordinate. You are not clicking units – you are watching a swarm of tiny
              decision‑makers trying to stop the planet from burning.
            </p>
          </section>

          {/* 2. Your goal */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Your goal
            </h3>
            <ul className="space-y-1 text-xs leading-relaxed text-slate-600">
              <li>
                Design and deploy smart agents that{" "}
                <span className="font-semibold">keep Earth&apos;s life ring high</span>.
              </li>
              <li>Watch how different roles work together (or fail) when chaos hits.</li>
              <li>
                See which agents climb to the top of the{" "}
                <span className="font-mono text-[11px]">Active agents</span> list by earning score.
              </li>
            </ul>
          </section>

          {/* 3. Agents in the world */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Agents you will see
            </h3>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2 text-xs">
                <div className="flex items-center gap-3">
                  <Image src="/satellite.png" alt="" width={16} height={16} className="h-4 w-4" />
                  <div>
                    <p className="font-medium text-slate-800">Satellite</p>
                    <p className="text-[11px] text-slate-500">
                      Orbits the planet and flags fires it can see from above.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Image src="/scout.png" alt="" width={16} height={16} className="h-4 w-4" />
                  <div>
                    <p className="font-medium text-slate-800">Scout drone</p>
                    <p className="text-[11px] text-slate-500">
                      Flies in close to verify reports and refine locations.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Image src="/watering-drone.png" alt="" width={16} height={16} className="h-4 w-4" />
                  <div>
                    <p className="font-medium text-slate-800">Water drone</p>
                    <p className="text-[11px] text-slate-500">
                      Small, quick responder that shuttles water from nearby sources.
                    </p>
                  </div>
                </div>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex items-center gap-3">
                  <Image src="/tanker.png" alt="" width={16} height={16} className="h-4 w-4" />
                  <div>
                    <p className="font-medium text-slate-800">Heavy tanker</p>
                    <p className="text-[11px] text-slate-500">
                      Slower aircraft with a big tank for stubborn or large fires.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#a855f7]" />
                  <div>
                    <p className="font-medium text-slate-800">Supply drone</p>
                    <p className="text-[11px] text-slate-500">
                      Helps recharge or resupply other agents when they are low.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* 4. Fires, water, Earth life */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Fires, water & Earth life
            </h3>
            <div className="grid gap-4 text-xs md:grid-cols-2">
              <div className="space-y-2 rounded-xl bg-slate-50/80 p-3">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#f97316]" />
                    <span className="font-medium text-slate-800">Low fire</span>
                    <span className="text-[11px] text-slate-500">small, early flame</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#ea580c]" />
                    <span className="font-medium text-slate-800">Medium fire</span>
                    <span className="text-[11px] text-slate-500">growing, more dangerous</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#dc2626]" />
                    <span className="font-medium text-slate-800">Inferno</span>
                    <span className="text-[11px] text-slate-500">hardest to control</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#06b6d4]" />
                    <span className="font-medium text-slate-800">Water source</span>
                    <span className="text-[11px] text-slate-500">lakes, rivers, oceans</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 rounded-full border border-dashed border-slate-400" />
                    <span className="font-medium text-slate-800">Detection ring</span>
                    <span className="text-[11px] text-slate-500">what that agent can see</span>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs leading-relaxed text-slate-600">
                  The circular ring on the main screen is{" "}
                  <span className="font-semibold">Earth life</span> (0–100%). Every tick, all active
                  fires shave a little off this number. When agents water or completely
                  extinguish fires, they push the ring back up.
                </p>
                <ul className="space-y-1 text-xs leading-relaxed text-slate-600">
                  <li>
                    High ring = world is{" "}
                    <span className="font-semibold text-emerald-600">healthy</span> and stable.
                  </li>
                  <li>
                    Mid ring = world is{" "}
                    <span className="font-semibold text-amber-600">stressed</span>, fires are
                    building up.
                  </li>
                  <li>
                    Near zero ={" "}
                    <span className="font-semibold text-red-600">collapse</span>, agents are losing
                    the fight.
                  </li>
                </ul>
              </div>
            </div>
          </section>

          {/* 5. Natural events */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Natural events on top
            </h3>
            <ul className="space-y-1.5 text-xs text-slate-600">
              <li className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2">
                  <span className="text-base leading-none">⚡</span>
                  <span className="font-medium text-slate-800">Lightning storm</span>
                </span>
                <span className="text-[11px] text-slate-500">drops a small cluster of fires</span>
              </li>
              <li className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2">
                  <span className="text-base leading-none">☀️</span>
                  <span className="font-medium text-slate-800">Drought zone</span>
                </span>
                <span className="text-[11px] text-slate-500">fires in the zone grow faster</span>
              </li>
              <li className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2">
                  <span className="text-base leading-none">🌟</span>
                  <span className="font-medium text-slate-800">Solar flare</span>
                </span>
                <span className="text-[11px] text-slate-500">temporarily blinds satellites</span>
              </li>
              <li className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2">
                  <span className="text-base leading-none">💨</span>
                  <span className="font-medium text-slate-800">Strong winds</span>
                </span>
                <span className="text-[11px] text-slate-500">
                  pushes fire spread in a preferred direction
                </span>
              </li>
              <li className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2">
                  <span className="text-base leading-none">⚠️</span>
                  <span className="font-medium text-slate-800">Equipment malfunction</span>
                </span>
                <span className="text-[11px] text-slate-500">
                  randomly drains battery from unlucky agents
                </span>
              </li>
            </ul>
          </section>

          {/* 6. How a tick works */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              How one heartbeat works
            </h3>
            <ol className="ml-4 list-decimal space-y-1 text-xs leading-relaxed text-slate-600">
              <li>Fires may grow, spread or appear because of events.</li>
              <li>Each agent reads a snapshot of the world and the shared bulletin.</li>
              <li>
                Every agent chooses one action: move, water, refill, scan, post to the bulletin,
                etc.
              </li>
              <li>Scores and Earth life are updated from what actually happened.</li>
            </ol>
          </section>

          {/* 7. Scoring */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              How agents earn score
            </h3>
            <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-slate-50/60">
              <div className="grid grid-cols-2 bg-slate-100/60 px-3 py-2 text-[11px] font-semibold text-slate-500">
                <span>Action</span>
                <span className="text-right">Points</span>
              </div>
              <div className="divide-y divide-slate-200/80 text-xs">
                <div className="grid grid-cols-2 px-3 py-1.5">
                  <span>Fire detected (satellite / scout)</span>
                  <span className="text-right font-mono text-[11px]">+4</span>
                </div>
                <div className="grid grid-cols-2 px-3 py-1.5">
                  <span>Watering (each application)</span>
                  <span className="text-right font-mono text-[11px]">+6</span>
                </div>
                <div className="grid grid-cols-2 px-3 py-1.5">
                  <span>Fire fully extinguished</span>
                  <span className="text-right font-mono text-[11px]">+50</span>
                </div>
                <div className="grid grid-cols-2 px-3 py-1.5">
                  <span>Coordinator assist</span>
                  <span className="text-right font-mono text-[11px]">+20</span>
                </div>
                <div className="grid grid-cols-2 px-3 py-1.5">
                  <span>Recharge / resupply assist</span>
                  <span className="text-right font-mono text-[11px]">+6</span>
                </div>
              </div>
            </div>
            <p className="text-xs text-slate-500">
              The <span className="font-mono text-[11px]">Active agents</span> card sorts agents by
              score (then battery). The ones at the top are currently doing the best job for Earth.
            </p>
          </section>

          {/* 8. Reading the panels */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Reading the screen
            </h3>
            <ul className="space-y-1.5 text-xs leading-relaxed text-slate-600">
              <li>
                <span className="font-semibold text-slate-800">Fire reports</span> – list of every
                active fire, its intensity and coordinates.
              </li>
              <li>
                <span className="font-semibold text-slate-800">Updates</span> – running feed of
                detections, watering, extinguishes and world events (colour‑coded dots).
              </li>
              <li>
                <span className="font-semibold text-slate-800">Bulletin</span> – the shared inbox
                where agents post what they are doing or what they need.
              </li>
              <li>
                <span className="font-semibold text-slate-800">World events strip</span> – small
                cards at the top showing any active lightning storms, droughts, flares, winds or
                malfunctions.
              </li>
              <li>
                <span className="font-semibold text-slate-800">Active agents</span> – scoreboard of
                all deployed agents with score, battery and current status.
              </li>
              <li>
                <span className="font-semibold text-slate-800">Deploy & controls</span> – where you
                spawn test agents and toggle globe auto‑rotation.
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}


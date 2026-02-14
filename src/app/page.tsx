'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { GameStateProvider } from '@/contexts/GameStateContext';
import ActivityFeedPanel from '@/components/ActivityFeedPanel';
import DeploySection from '@/components/DeploySection';
import WorldEventsPanel from '@/components/WorldEventsPanel';
import ActiveAgentsPanel from '@/components/ActiveAgentsPanel';
import EarthLifeRing from '@/components/EarthLifeRing';
import InfoModal from '@/components/InfoModal';

const GlobeViewer = dynamic(() => import('@/components/GlobeViewer'), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 bg-background" aria-hidden="true" />
  ),
});

export default function Home() {
  const [autoRotate, setAutoRotate] = useState(true);
  const [focusAgentId, setFocusAgentId] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);

  return (
    <GameStateProvider>
    <div className="relative h-[100dvh] w-full overflow-hidden bg-background">
      <GlobeViewer autoRotate={autoRotate} focusAgentId={focusAgentId} />
      <div className="pointer-events-none absolute left-8 top-8 z-10 select-none font-display">
        <h1 className="text-[1.75rem] font-bold tracking-[-0.04em] text-foreground">
          firefighters
        </h1>
        <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-accent">
          ai vs fire
        </p>
      </div>
      <WorldEventsPanel />
      <aside className="pointer-events-auto absolute left-8 top-28 z-10 flex w-72 max-h-[calc(100dvh-7rem)] flex-col gap-4 overflow-y-auto">
        <EarthLifeRing />
        <ActiveAgentsPanel
          onFocusAgent={(id) =>
            setFocusAgentId((prev) => (prev === id ? null : id))
          }
        />
      </aside>
      <aside className="pointer-events-auto absolute right-8 top-28 z-10 flex w-80 max-h-[calc(100dvh-7rem)] flex-col gap-4 overflow-y-auto">
        <ActivityFeedPanel />
      </aside>
      <DeploySection
        autoRotate={autoRotate}
        onToggleAutoRotate={() => setAutoRotate((v) => !v)}
        onOpenInfo={() => setShowInfo(true)}
      />
      <InfoModal isOpen={showInfo} onClose={() => setShowInfo(false)} />
    </div>
    </GameStateProvider>
  );
}

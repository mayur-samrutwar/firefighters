'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import BulletinPanel from '@/components/BulletinPanel';
import DeploySection from '@/components/DeploySection';
import NewsPanel from '@/components/NewsPanel';
import WorldEventsPanel from '@/components/WorldEventsPanel';
import ActiveAgentsPanel from '@/components/ActiveAgentsPanel';
import EarthLifeRing from '@/components/EarthLifeRing';
import InfoModal from '@/components/InfoModal';

const GlobeViewer = dynamic(() => import('@/components/GlobeViewer'), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 bg-white" aria-hidden="true" />
  ),
});

export default function Home() {
  const [autoRotate, setAutoRotate] = useState(true);
  const [focusAgentId, setFocusAgentId] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-white">
      <GlobeViewer autoRotate={autoRotate} focusAgentId={focusAgentId} />
      <EarthLifeRing />
      {/* Brand logo bottom-left */}
      <div className="pointer-events-none absolute bottom-8 left-8 z-10">
        <img
          src="/firefighters.png"
          alt="Firefighters"
          className="h-16 w-auto select-none"
        />
      </div>
      <WorldEventsPanel />
      <BulletinPanel />
      <NewsPanel />
      <ActiveAgentsPanel
        onFocusAgent={(id) =>
          setFocusAgentId((prev) => (prev === id ? null : id))
        }
      />
      <DeploySection
        autoRotate={autoRotate}
        onToggleAutoRotate={() => setAutoRotate((v) => !v)}
        onOpenInfo={() => setShowInfo(true)}
      />
      <InfoModal isOpen={showInfo} onClose={() => setShowInfo(false)} />
    </div>
  );
}

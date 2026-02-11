'use client';

import { useRef, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import type { GlobeMethods } from 'react-globe.gl';

const Globe = dynamic(() => import('react-globe.gl'), { ssr: false });

const EARTH_TEXTURE =
  'https://cdn.jsdelivr.net/npm/three-globe@2.31.2/example/img/earth-day.jpg';
const EARTH_BUMP =
  'https://cdn.jsdelivr.net/npm/three-globe@2.31.2/example/img/earth-topology.png';

export default function GlobeViewer() {
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  useEffect(() => {
    const updateSize = () =>
      setDimensions({ width: window.innerWidth, height: window.innerHeight });
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  const enableAutoRotate = () => {
    const globe = globeRef.current;
    if (!globe) return;
    try {
      const controls = globe.controls();
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.6;
    } catch {
      // Controls not ready yet
    }
  };

  return (
    <div className="absolute inset-0">
      <Globe
        ref={globeRef}
        width={dimensions.width}
        height={dimensions.height}
        globeImageUrl={EARTH_TEXTURE}
        bumpImageUrl={EARTH_BUMP}
        backgroundColor="rgba(255,255,255,0)"
        showAtmosphere
        atmosphereColor="#b8d4e8"
        atmosphereAltitude={0.18}
        showGraticules={false}
        animateIn
        waitForGlobeReady={false}
        onGlobeReady={enableAutoRotate}
      />
    </div>
  );
}

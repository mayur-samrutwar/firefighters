'use client';

import { useRef, useEffect, useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import * as THREE from 'three';
import type { GlobeMethods } from 'react-globe.gl';

const Globe = dynamic(() => import('react-globe.gl'), { ssr: false });

const COUNTRIES_GEOJSON = '/countries.geojson';

// Mumbai: 19.0760° N, 72.8777° E
const MUMBAI = { lat: 19.076, lng: 72.8777 };
const FIRE_MARKER = [MUMBAI];

export default function GlobeViewer() {
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [countries, setCountries] = useState<object[]>([]);

  useEffect(() => {
    fetch(COUNTRIES_GEOJSON)
      .then((res) => res.json())
      .then((data) => setCountries(data.features || []))
      .catch(() => setCountries([]));
  }, []);

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
      controls.autoRotateSpeed = 0.15;
    } catch {
      // Controls not ready yet
    }
  };

  const globeMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ color: 0xffffff }),
    []
  );

  return (
    <div className="absolute inset-0">
      <Globe
        ref={globeRef}
        width={dimensions.width}
        height={dimensions.height}
        globeMaterial={globeMaterial}
        hexPolygonsData={countries}
        hexPolygonGeoJsonGeometry="geometry"
        hexPolygonColor={() => '#ebebeb'}
        hexPolygonAltitude={0.002}
        hexPolygonResolution={4}
        hexPolygonMargin={0.4}
        hexPolygonUseDots
        hexPolygonCurvatureResolution={6}
        backgroundColor="rgba(255,255,255,0)"
        showAtmosphere={false}
        showGraticules={false}
        animateIn
        waitForGlobeReady={false}
        onGlobeReady={enableAutoRotate}
        objectsData={FIRE_MARKER}
        objectLat={(d) => (d as { lat: number }).lat}
        objectLng={(d) => (d as { lng: number }).lng}
        objectAltitude={0.01}
        objectThreeObject={() => {
          const geometry = new THREE.SphereGeometry(0.7, 12, 12);
          const material = new THREE.MeshBasicMaterial({ color: 0xf97316 });
          return new THREE.Mesh(geometry, material);
        }}
        ringsData={FIRE_MARKER}
        ringLat={(d) => (d as { lat: number }).lat}
        ringLng={(d) => (d as { lng: number }).lng}
        ringColor="#f97316"
        ringAltitude={0.002}
        ringMaxRadius={0.6}
        ringPropagationSpeed={2}
        ringRepeatPeriod={1500}
      />
    </div>
  );
}

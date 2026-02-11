'use client';

import { useRef, useEffect, useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import * as THREE from 'three';
import type { GlobeMethods } from 'react-globe.gl';

const Globe = dynamic(() => import('react-globe.gl'), { ssr: false });

const COUNTRIES_GEOJSON = '/countries.geojson';

type Fire = { id: string; lat: number; lng: number };
const FIRE_MARKER: Fire[] = [];

export default function GlobeViewer() {
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [countries, setCountries] = useState<object[]>([]);
  const [fires, setFires] = useState<Fire[]>([]);
  const [globeReady, setGlobeReady] = useState(false);

  useEffect(() => {
    const fetchState = () =>
      fetch('/api/state')
        .then((res) => res.json())
        .then((data) => setFires(data.fires || []))
        .catch(() => setFires([]));
    fetchState();
    const interval = setInterval(fetchState, 5000);
    return () => clearInterval(interval);
  }, []);

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

  const onReady = () => setGlobeReady(true);

  useEffect(() => {
    if (!globeReady || !globeRef.current) return;
    const globe = globeRef.current;
    const id = requestAnimationFrame(() => {
      try {
        // Closer zoom: default altitude is 2.5, lower = more zoomed in
        globe.pointOfView({ altitude: 1.5 }, 0);

        const controls = globe.controls();
        controls.autoRotate = true;
        controls.autoRotateSpeed = 0.15;

        const scene = globe.scene();
        scene.fog = null;
        scene.traverse((obj: { __globeObjType?: string; visible?: boolean }) => {
          if (obj.__globeObjType === 'atmosphere') obj.visible = false;
        });
        // Ensure hex polygon dots are consistently lit (MeshLambert needs light)
        const hasLights = scene.children.some(
          (c) => c.type === 'AmbientLight' || c.type === 'DirectionalLight'
        );
        if (!hasLights) {
          scene.add(new THREE.AmbientLight(0xffffff, 2));
        }
      } catch {
        // Controls not ready yet
      }
    });
    return () => cancelAnimationFrame(id);
  }, [globeReady]);

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
        hexPolygonColor={() => '#a3a3a3'}
        hexPolygonAltitude={0.002}
        hexPolygonResolution={4}
        hexPolygonMargin={0.4}
        hexPolygonUseDots
        hexPolygonCurvatureResolution={6}
        backgroundColor="rgba(255,255,255,0)"
        showAtmosphere={false}
        atmosphereAltitude={0}
        showGraticules={false}
        animateIn={false}
        waitForGlobeReady={true}
        onGlobeReady={onReady}
        objectsData={Array.isArray(fires) ? fires : FIRE_MARKER}
        objectLat={(d) => (d as Fire).lat}
        objectLng={(d) => (d as Fire).lng}
        objectAltitude={0.01}
        objectThreeObject={() => {
          const geometry = new THREE.SphereGeometry(0.7, 12, 12);
          const material = new THREE.MeshBasicMaterial({ color: 0xf97316 });
          return new THREE.Mesh(geometry, material);
        }}
        ringsData={Array.isArray(fires) ? fires : FIRE_MARKER}
        ringLat={(d) => (d as Fire).lat}
        ringLng={(d) => (d as Fire).lng}
        ringColor="#f97316"
        ringAltitude={0.002}
        ringMaxRadius={0.6}
        ringPropagationSpeed={2}
        ringRepeatPeriod={1500}
      />
    </div>
  );
}

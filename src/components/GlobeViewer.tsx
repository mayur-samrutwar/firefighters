'use client';

import { useRef, useEffect, useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import * as THREE from 'three';
import type { GlobeMethods } from 'react-globe.gl';
import type { Agent } from '@/app/game/store';
import { getAgentPosition } from '@/utils/agentPosition';
const Globe = dynamic(() => import('react-globe.gl'), { ssr: false });

const GLOBE_RADIUS = 100;
const OBJECT_ALTITUDE = 0.015;

function searchRadiusToGlobeUnits(deg: number): number {
  const r = GLOBE_RADIUS * (1 + OBJECT_ALTITUDE);
  return r * Math.sin((deg * Math.PI) / 180);
}

const COUNTRIES_GEOJSON = '/countries.geojson';

type Fire = {
  id: string;
  lat: number;
  lng: number;
  intensity: number;
  fireType?: string;
};

type GlobeObject =
  | { type: 'fire'; id: string; lat: number; lng: number; intensity: number }
  | { type: 'agent'; lat: number; lng: number; agent: Agent };

export default function GlobeViewer() {
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [countries, setCountries] = useState<object[]>([]);
  const [fires, setFires] = useState<Fire[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [globeReady, setGlobeReady] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const fetchState = () =>
      fetch('/api/state', { cache: 'no-store' })
        .then((res) => res.json())
        .then((data) => {
          setFires(data.fires || []);
          setAgents(data.agents || []);
        })
        .catch(() => {
          setFires([]);
          setAgents([]);
        });
    fetchState();
    const interval = setInterval(fetchState, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 80);
    return () => clearInterval(id);
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

  const globeObjects: GlobeObject[] = useMemo(() => {
    const fireObjs: GlobeObject[] = (fires || []).map((f) => ({
      type: 'fire' as const,
      id: f.id,
      lat: f.lat,
      lng: f.lng,
      intensity: f.intensity ?? 1,
    }));
    const agentObjs: GlobeObject[] = agents.map((a) => {
      const pos = getAgentPosition(a);
      return { type: 'agent' as const, lat: pos.lat, lng: pos.lng, agent: a };
    });
    return [...fireObjs, ...agentObjs];
  }, [fires, agents, tick]);

  // Stable refs for agent ring data so the rings layer reuses (not remove+recreate)
  const agentRingDataRef = useRef<Map<string, GlobeObject>>(new Map());
  const agentRingData = useMemo(() => {
    const map = agentRingDataRef.current;
    agents.forEach((a) => {
      const pos = getAgentPosition(a);
      const existing = map.get(a.id);
      if (existing && existing.type === 'agent') {
        existing.lat = pos.lat;
        existing.lng = pos.lng;
        existing.agent = a;
      } else {
        map.set(a.id, {
          type: 'agent' as const,
          lat: pos.lat,
          lng: pos.lng,
          agent: a,
        });
      }
    });
    // Remove stale agents
    for (const id of map.keys()) {
      if (!agents.some((a) => a.id === id)) map.delete(id);
    }
    return Array.from(map.values());
  }, [agents, tick]);

  const fireObjects = globeObjects.filter((o) => o.type === 'fire');

  const createAgentObject = (searchRadius: number) => {
    const group = new THREE.Group();

    // Visible satellite cube
    const boxGeom = new THREE.BoxGeometry(0.35, 0.35, 0.35);
    const boxMat = new THREE.MeshBasicMaterial({ color: 0x3b82f6 });
    group.add(new THREE.Mesh(boxGeom, boxMat));

    // Invisible hit-area disc for whole ring (tangent plane: rotation.x = -π/2)
    const hitRadius = searchRadiusToGlobeUnits(searchRadius);
    const hitGeom = new THREE.CircleGeometry(hitRadius, 32);
    const hitMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const hitDisc = new THREE.Mesh(hitGeom, hitMat);
    hitDisc.rotation.x = -Math.PI / 2;
    group.add(hitDisc);

    return group;
  };

  /** Create a fire sphere scaled and colored by intensity (1-5) */
  const createFireObject = (intensity: number) => {
    // Size: 0.35 at int 1 → 1.4 at int 5
    const size = 0.35 + (intensity - 1) * 0.2625;
    const geometry = new THREE.SphereGeometry(size, 12, 12);
    // Color: orange → deep orange → red
    const color =
      intensity <= 2
        ? 0xf97316 // orange
        : intensity <= 4
          ? 0xea580c // deep orange
          : 0xdc2626; // red
    const material = new THREE.MeshBasicMaterial({ color });
    return new THREE.Mesh(geometry, material);
  };

  const ringsDataItems = [...fireObjects, ...agentRingData];

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
        objectsData={globeObjects}
        objectLat={(d) => (d as GlobeObject).lat}
        objectLng={(d) => (d as GlobeObject).lng}
        objectAltitude={0.015}
        objectThreeObject={(d) => {
          const obj = d as GlobeObject;
          if (obj.type === 'agent') return createAgentObject(obj.agent.searchRadius);
          return createFireObject(obj.type === 'fire' ? obj.intensity : 1);
        }}
        objectLabel={(d) => {
          const obj = d as GlobeObject;
          if (obj.type === 'agent') {
            const a = obj.agent;
            return `Satellite · ${Math.round(a.batteryPercentage)}% · ${a.searchRadius}° radius`;
          }
          if (obj.type === 'fire') {
            const label = obj.intensity >= 5 ? 'Inferno' : `Intensity ${obj.intensity}`;
            return `Fire · ${label}`;
          }
          return '';
        }}
        ringsData={ringsDataItems}
        ringLat={(d: object) => (d as GlobeObject).lat}
        ringLng={(d: object) => (d as GlobeObject).lng}
        ringAltitude={(d: object) =>
          (d as GlobeObject).type === 'agent' ? 0.015 : 0.002
        }
        ringColor={(d: object) => {
          const o = d as GlobeObject;
          if (o.type === 'agent') return '#3b82f6';
          const intensity = o.type === 'fire' ? o.intensity : 1;
          return intensity <= 2 ? '#f97316' : intensity <= 4 ? '#ea580c' : '#dc2626';
        }}
        ringMaxRadius={(d: object) => {
          const o = d as GlobeObject;
          if (o.type === 'agent') return o.agent.searchRadius;
          // Fire ring radius scales with intensity: 0.4 → 1.2
          const intensity = o.type === 'fire' ? o.intensity : 1;
          return 0.4 + (intensity - 1) * 0.2;
        }}
        ringPropagationSpeed={(d: object) => {
          const o = d as GlobeObject;
          if (o.type === 'agent') return 0;
          // Faster propagation for higher intensity
          const intensity = o.type === 'fire' ? o.intensity : 1;
          return 1 + intensity * 0.5;
        }}
        ringRepeatPeriod={(d: object) => {
          const o = d as GlobeObject;
          if (o.type === 'agent') return Infinity;
          // Faster pulse for higher intensity
          const intensity = o.type === 'fire' ? o.intensity : 1;
          return Math.max(600, 1500 - intensity * 200);
        }}
      />
    </div>
  );
}

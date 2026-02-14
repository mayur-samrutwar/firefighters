'use client';

import { useRef, useEffect, useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import * as THREE from 'three';
import type { GlobeMethods } from 'react-globe.gl';
import { angularDistanceDeg, clampLat, wrapLng } from '@/utils/geo';
import { useGameState } from '@/contexts/GameStateContext';
import { WATER_SOURCES } from '@/data/water-sources';
import { SATELLITE_SCAN_RADIUS_DEG } from '@/data/profile-specs';

const Globe = dynamic(() => import('react-globe.gl'), { ssr: false });

const GLOBE_RADIUS = 100;
const OBJECT_ALTITUDE = 0.015;
/** Poll interval (ms) – must match GameStateContext so interpolation completes at next fetch. */
const POLL_MS = 4000;

type AgentType =
  | 'satellite'
  | 'scout'
  | 'water_drone'
  | 'heavy_tanker'
  | 'supply_drone';

type Agent = {
  id: string;
  type: AgentType;
  lat?: number;
  lng?: number;
  batteryPercentage?: number;
  displayName?: string;
  searchRadius?: number;
  waterLevel?: number;
  waterCapacity?: number;
  chargeLevel?: number;
  chargeCapacity?: number;
  currentAction?: string | null;
  target?: { lat: number; lng: number } | null;
  target_lat?: number;
  target_lng?: number;
  speed?: number;
  route?: [number, number][];
};

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
  | { type: 'agent'; lat: number; lng: number; agent: Agent }
  | { type: 'water'; id: string; lat: number; lng: number; name: string };

type AgentPath = {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  agentType: AgentType;
};

/* ─── Agent type visual configs ─────────────────────────── */

const AGENT_COLORS: Record<AgentType, number> = {
  satellite: 0x3b82f6, // blue
  scout: 0x22c55e, // green
  water_drone: 0x06b6d4, // cyan
  heavy_tanker: 0x0284c7, // dark blue
  supply_drone: 0xa855f7, // purple
};

const AGENT_LABELS: Record<AgentType, string> = {
  satellite: 'Satellite',
  scout: 'Scout',
  water_drone: 'Water Drone',
  heavy_tanker: 'Heavy Tanker',
  supply_drone: 'Supply Drone',
};

export default function GlobeViewer({
  autoRotate,
  focusAgentId,
}: {
  autoRotate: boolean;
  focusAgentId?: string | null;
}) {
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [countries, setCountries] = useState<object[]>([]);
  const [globeReady, setGlobeReady] = useState(false);
  const [tick, setTick] = useState(0);
  const { state, previousAgents, lastFetchTime } = useGameState();

  const fires = useMemo<Fire[]>(
    () =>
      state.fires.map((f) => ({
        id: f.id,
        lat: f.lat,
        lng: f.lng,
        intensity: f.intensity,
        fireType: f.type,
      })),
    [state.fires]
  );
  const agents = useMemo<Agent[]>(
    () =>
      state.agents.map((a) => ({
        id: a.id,
        type: a.type as AgentType,
        lat: a.lat,
        lng: a.lng,
        batteryPercentage: a.batteryPercentage,
        displayName: a.displayName,
        score: a.score,
        target_lat: a.target_lat,
        target_lng: a.target_lng,
        waterLevel: a.water_level,
        waterCapacity: a.water_capacity,
        currentAction: a.last_action_type,
        speed: a.speed,
        searchRadius: a.type === 'satellite' ? SATELLITE_SCAN_RADIUS_DEG : undefined,
      })),
    [state.agents]
  );
  const waterSources = WATER_SOURCES;

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
        globe.pointOfView({ altitude: 1.5 }, 0);
        const controls = globe.controls();
        controls.autoRotate = autoRotate;
        controls.autoRotateSpeed = 0.15;
        const scene = globe.scene();
        scene.fog = null;
        scene.traverse(
          (obj: { __globeObjType?: string; visible?: boolean }) => {
            if (obj.__globeObjType === 'atmosphere') obj.visible = false;
          }
        );
        const hasLights = scene.children.some(
          (c) => c.type === 'AmbientLight' || c.type === 'DirectionalLight'
        );
        if (!hasLights) {
          scene.add(new THREE.AmbientLight(0xffffff, 2));
        }
      } catch {
        /* Controls not ready yet */
      }
    });
    return () => cancelAnimationFrame(id);
  }, [globeReady, autoRotate]);

  useEffect(() => {
    if (!globeReady || !focusAgentId || !globeRef.current) return;
    const agent = agents.find((a) => a.id === focusAgentId);
    if (!agent) return;
    const pos = { lat: agent.lat ?? 0, lng: agent.lng ?? 0 };
    try {
      const globe = globeRef.current;
      const controls = globe.controls();
      controls.autoRotate = false;
      globe.pointOfView({ lat: pos.lat, lng: pos.lng, altitude: 0.7 }, 1000);
    } catch {
      /* ignore */
    }
  }, [focusAgentId, globeReady, agents]);

  const globeMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ color: 0xffffff }),
    []
  );

  /** Interpolate from previous poll position to current so movement is smooth between fetches. */
  function getRenderedAgentPosition(agent: Agent): { lat: number; lng: number } {
    const currLat = agent.lat ?? 0;
    const currLng = agent.lng ?? 0;
    const prev = previousAgents.find((p) => p.id === agent.id);
    if (!prev || lastFetchTime <= 0) {
      return { lat: currLat, lng: currLng };
    }
    const progress = Math.min(1, (Date.now() - lastFetchTime) / POLL_MS);
    if (progress >= 1) return { lat: currLat, lng: currLng };
    const prevLat = prev.lat ?? currLat;
    const prevLng = prev.lng ?? currLng;
    let dLng = currLng - prevLng;
    if (dLng > 180) dLng -= 360;
    if (dLng < -180) dLng += 360;
    return {
      lat: clampLat(prevLat + (currLat - prevLat) * progress),
      lng: wrapLng(prevLng + dLng * progress),
    };
  }

  const threeColorSpace =
    THREE.SRGBColorSpace ?? (THREE as unknown as { SRGBColorSpace?: number }).SRGBColorSpace;

  const satelliteTexture = useMemo(() => {
    const loader = new THREE.TextureLoader();
    const tex = loader.load('/satellite.png');
    tex.anisotropy = 8;
    tex.colorSpace = threeColorSpace ?? tex.colorSpace;
    return tex;
  }, [threeColorSpace]);

  const waterDroneTexture = useMemo(() => {
    const loader = new THREE.TextureLoader();
    const tex = loader.load('/watering-drone.png');
    tex.anisotropy = 8;
    tex.colorSpace = threeColorSpace ?? tex.colorSpace;
    return tex;
  }, [threeColorSpace]);

  const scoutTexture = useMemo(() => {
    const loader = new THREE.TextureLoader();
    const tex = loader.load('/scout.png');
    tex.anisotropy = 8;
    tex.colorSpace = threeColorSpace ?? tex.colorSpace;
    return tex;
  }, [threeColorSpace]);

  const tankerTexture = useMemo(() => {
    const loader = new THREE.TextureLoader();
    const tex = loader.load('/tanker.png');
    tex.anisotropy = 8;
    tex.colorSpace = threeColorSpace ?? tex.colorSpace;
    return tex;
  }, [threeColorSpace]);

  /* ─── Build globe objects ─────────────────────────────── */

  const globeObjects: GlobeObject[] = useMemo(() => {
    const fireObjs: GlobeObject[] = (fires || []).map((f) => ({
      type: 'fire' as const,
      id: f.id,
      lat: f.lat,
      lng: f.lng,
      intensity: f.intensity ?? 1,
    }));

    const waterObjs: GlobeObject[] = waterSources.map((ws) => ({
      type: 'water' as const,
      id: ws.id,
      lat: ws.lat,
      lng: ws.lng,
      name: ws.name,
    }));

    if (agents.length === 0) return [...fireObjs, ...waterObjs];

    const agentObjs: GlobeObject[] = agents.map((a) => {
      const pos = getRenderedAgentPosition(a);
      return { type: 'agent' as const, lat: pos.lat, lng: pos.lng, agent: a };
    });
    return [...fireObjs, ...agentObjs, ...waterObjs];
  }, [fires, agents, waterSources, tick, previousAgents, lastFetchTime]);

  /* ─── Agent ring data (stable refs) ───────────────────── */

  const agentRingDataRef = useRef<Map<string, GlobeObject>>(new Map());
  const agentRingData = useMemo(() => {
    if (agents.length === 0) return [];
    const map = agentRingDataRef.current;
    agents.forEach((a) => {
      if (!a.searchRadius) return;
      const pos = getRenderedAgentPosition(a);
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
    for (const id of map.keys()) {
      if (!agents.some((a) => a.id === id)) map.delete(id);
    }
    return Array.from(map.values());
  }, [agents, previousAgents, lastFetchTime, tick]);

  const fireObjects = globeObjects.filter((o) => o.type === 'fire');

  /* ─── Focused agent path (for inspect mode) ─────────────── */

  const focusedAgent = useMemo(
    () => agents.find((a) => a.id === focusAgentId) ?? null,
    [agents, focusAgentId]
  );

  const focusedPath: AgentPath | null = useMemo(() => {
    if (!focusedAgent) return null;
    if (focusedAgent.target_lat == null || focusedAgent.target_lng == null) return null;
    const to = { lat: focusedAgent.target_lat, lng: focusedAgent.target_lng };

    const from = getRenderedAgentPosition(focusedAgent);

    // Ignore degenerate paths
    const dist = angularDistanceDeg(from.lat, from.lng, to.lat, to.lng);
    if (!Number.isFinite(dist) || dist <= 0.01) return null;

    return {
      startLat: from.lat,
      startLng: from.lng,
      endLat: to.lat,
      endLng: to.lng,
      agentType: focusedAgent.type as AgentType,
    };
  }, [focusedAgent, tick, previousAgents, lastFetchTime]);

  /* ─── Three.js object creators ────────────────────────── */

  const createAgentObject = (agent: Agent) => {
    const group = new THREE.Group();
    const color = AGENT_COLORS[agent.type] ?? 0x3b82f6;

    if (agent.type === 'satellite') {
      // Billboard sprite for satellites using satellite.png
      const spriteMat = new THREE.SpriteMaterial({
        map: satelliteTexture,
        transparent: true,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(spriteMat);
      // Slightly oversized so satellites are clearly visible from orbit
      sprite.scale.set(1.8, 1.8, 1.8);
      group.add(sprite);

      // Visible scan radius ring (globe's ringsData uses propagation, so with speed 0 it stays invisible)
      if (agent.searchRadius) {
        const ringRadius = searchRadiusToGlobeUnits(agent.searchRadius);
        const ringGeom = new THREE.RingGeometry(ringRadius * 0.7, ringRadius, 48);
        const ringMat = new THREE.MeshBasicMaterial({
          color: 0x3b82f6,
          transparent: true,
          opacity: 0.22,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        const ringMesh = new THREE.Mesh(ringGeom, ringMat);
        ringMesh.rotation.x = -Math.PI / 2;
        group.add(ringMesh);
        // Hit disc for hover (invisible)
        const hitGeom = new THREE.CircleGeometry(ringRadius, 32);
        const hitMat = new THREE.MeshBasicMaterial({
          transparent: true,
          opacity: 0,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        const hitDisc = new THREE.Mesh(hitGeom, hitMat);
        hitDisc.rotation.x = -Math.PI / 2;
        group.add(hitDisc);
      }
    } else if (agent.type === 'water_drone') {
      // Billboard sprite for water drones using watering-drone.png
      const spriteMat = new THREE.SpriteMaterial({
        map: waterDroneTexture,
        transparent: true,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(spriteMat);
      // Slightly larger than satellites so water drones read clearly
      sprite.scale.set(2.1, 2.1, 2.1);
      group.add(sprite);
    } else if (agent.type === 'scout') {
      // Billboard sprite for scouts using scout.png
      const spriteMat = new THREE.SpriteMaterial({
        map: scoutTexture,
        transparent: true,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.scale.set(1.7, 1.7, 1.7);
      group.add(sprite);
    } else if (agent.type === 'heavy_tanker') {
      // Billboard sprite for heavy tankers using tanker.png
      const spriteMat = new THREE.SpriteMaterial({
        map: tankerTexture,
        transparent: true,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.scale.set(2.0, 2.0, 2.0);
      group.add(sprite);
    } else {
      // Cone (pointing up) for drones
      const geom = new THREE.ConeGeometry(0.2, 0.5, 6);
      const mat = new THREE.MeshBasicMaterial({ color });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.rotation.x = Math.PI; // point up from globe surface
      group.add(mesh);
    }

    return group;
  };

  // Radial gradient texture: hot center, soft transparent edge (fire glow) — strong enough to read at all zoom levels
  const fireGlowTexture = useMemo(() => {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255, 140, 50, 1)');
    g.addColorStop(0.2, 'rgba(255, 100, 40, 0.98)');
    g.addColorStop(0.4, 'rgba(234, 70, 20, 0.85)');
    g.addColorStop(0.6, 'rgba(220, 45, 35, 0.65)');
    g.addColorStop(0.8, 'rgba(200, 35, 30, 0.35)');
    g.addColorStop(1, 'rgba(140, 25, 20, 0.08)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }, []);

  const createFireObject = (intensity: number) => {
    const radius = 0.65 + (intensity - 1) * 0.2;
    const geometry = new THREE.CircleGeometry(radius, 32);
    const material = new THREE.MeshBasicMaterial({
      map: fireGlowTexture,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    return mesh;
  };

  const waterMesh = useMemo(() => {
    const geometry = new THREE.SphereGeometry(0.4, 12, 12);
    const material = new THREE.MeshBasicMaterial({ color: 0x06b6d4 });
    return new THREE.Mesh(geometry, material);
  }, []);

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
        objectAltitude={(d) => {
          const obj = d as GlobeObject;
          if (obj.type === 'water') return 0.005;
          if (obj.type === 'fire') return 0.0015;
          return 0.015;
        }}
        objectThreeObject={(d) => {
          const obj = d as GlobeObject;
          if (obj.type === 'agent') return createAgentObject(obj.agent);
          if (obj.type === 'water') return waterMesh.clone();
          return createFireObject(obj.type === 'fire' ? obj.intensity : 1);
        }}
        objectLabel={(d) => {
          const obj = d as GlobeObject;
          if (obj.type === 'agent') {
            const a = obj.agent;
            const label = a.displayName?.trim() || (AGENT_LABELS[a.type] ?? a.type);
            let info = `${label} · ${Math.round(a.batteryPercentage ?? 0)}%`;
            if (a.searchRadius) info += ` · ${a.searchRadius}° radius`;
            if (a.waterCapacity != null)
              info += ` · Water ${a.waterLevel ?? 0}/${a.waterCapacity}`;
            if (a.chargeCapacity != null)
              info += ` · Charge ${Math.round(a.chargeLevel ?? 0)}%`;
            if (a.currentAction) info += ` · ${a.currentAction}`;
            return info;
          }
          if (obj.type === 'fire') {
            const label =
              obj.intensity >= 5 ? 'Inferno' : `Intensity ${obj.intensity}`;
            return `Fire · ${label}`;
          }
          if (obj.type === 'water') {
            return `Water Source · ${obj.name}`;
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
          if (o.type === 'agent') {
            return AGENT_COLORS[o.agent.type]
              ? `#${AGENT_COLORS[o.agent.type].toString(16).padStart(6, '0')}`
              : '#3b82f6';
          }
          const intensity = o.type === 'fire' ? o.intensity : 1;
          return intensity <= 2
            ? '#f97316'
            : intensity <= 4
              ? '#ea580c'
              : '#dc2626';
        }}
        ringMaxRadius={(d: object) => {
          const o = d as GlobeObject;
          if (o.type === 'agent')
            return (o.agent.searchRadius ?? 0) || 0;
          const intensity = o.type === 'fire' ? o.intensity : 1;
          return 0.55 + (intensity - 1) * 0.25;
        }}
        ringPropagationSpeed={(d: object) => {
          const o = d as GlobeObject;
          if (o.type === 'agent') return 0;
          const intensity = o.type === 'fire' ? o.intensity : 1;
          return 1 + intensity * 0.5;
        }}
        ringRepeatPeriod={(d: object) => {
          const o = d as GlobeObject;
          if (o.type === 'agent') return Infinity;
          const intensity = o.type === 'fire' ? o.intensity : 1;
          return Math.max(600, 1500 - intensity * 200);
        }}
        arcsData={focusedPath ? [focusedPath] : []}
        arcStartLat={(d: object) => (d as AgentPath).startLat}
        arcStartLng={(d: object) => (d as AgentPath).startLng}
        arcEndLat={(d: object) => (d as AgentPath).endLat}
        arcEndLng={(d: object) => (d as AgentPath).endLng}
        arcAltitude={(d: object) => {
          const a = d as AgentPath;
          const dist = angularDistanceDeg(
            a.startLat,
            a.startLng,
            a.endLat,
            a.endLng
          );
          // Raise long paths higher so they don't visually "hug" the globe.
          const t = Math.min(1, dist / 120); // 0–1 for 0–120°
          return 0.06 + t * 0.18; // 0.06–0.24
        }}
        arcColor={(d: object) => {
          const a = d as AgentPath;
          const base = AGENT_COLORS[a.agentType] ?? 0x3b82f6;
          const hex = `#${base.toString(16).padStart(6, '0')}`;
          // Slight fade from bright at origin to dimmer at destination
          const start = hex;
          const end = '#e5e5e5';
          return [start, end] as [string, string];
        }}
        arcStroke={1.6}
      />
    </div>
  );
}

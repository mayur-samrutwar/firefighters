'use client';

import { useRef, useEffect, useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import * as THREE from 'three';
import type { GlobeMethods } from 'react-globe.gl';
import type { Agent, AgentType } from '@/app/game/store';
import { getAgentPosition } from '@/utils/agentPosition';
import { angularDistanceDeg, clampLat, wrapLng } from '@/utils/geo';
import { useGameState } from '@/contexts/GameStateContext';
const Globe = dynamic(() => import('react-globe.gl'), { ssr: false });

const GLOBE_RADIUS = 100;
const OBJECT_ALTITUDE = 0.015;
const TICK_SECONDS = 10; // real-time seconds per simulation tick

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

type WaterSource = { id: string; lat: number; lng: number; name: string };

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
  coordinator: 0xeab308, // gold
};

const AGENT_LABELS: Record<AgentType, string> = {
  satellite: 'Satellite',
  scout: 'Scout',
  water_drone: 'Water Drone',
  heavy_tanker: 'Heavy Tanker',
  supply_drone: 'Supply Drone',
  coordinator: 'Coordinator',
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
  const gameState = useGameState();
  const fires = gameState.fires;
  const agents = gameState.agents as Agent[];
  const waterSources = gameState.waterSources;
  const serverTick = gameState.tick;
  const stateTimestamp = gameState.lastFetchedAt;

  // Smooth display positions: lerp toward server position every frame so we don't
  // snap when state updates every 5s. Catch-up factor 0.12 ≈ smooth within ~1s.
  const displayPosRef = useRef<Record<string, { lat: number; lng: number }>>({});
  const LERP_FACTOR = 0.12;

  useEffect(() => {
    const id = setInterval(() => {
      setTick((t) => t + 1);
      // Update display positions toward ideal (server-interpolated) positions
      agents.forEach((a) => {
        const ideal = getRenderedAgentPositionForLerp(a, stateTimestamp);
        const current = displayPosRef.current[a.id] ?? ideal;
        const lat = clampLat(current.lat + (ideal.lat - current.lat) * LERP_FACTOR);
        const lng = wrapLng(current.lng + (ideal.lng - current.lng) * LERP_FACTOR);
        displayPosRef.current[a.id] = { lat, lng };
      });
      // Drop display positions for agents no longer in list
      const ids = new Set(agents.map((a) => a.id));
      for (const id of Object.keys(displayPosRef.current)) {
        if (!ids.has(id)) delete displayPosRef.current[id];
      }
    }, 80);
    return () => clearInterval(id);
  }, [agents, stateTimestamp]);

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

  // When a specific agent is selected from the Active Agents panel,
  // smoothly fly the camera to that agent's position and zoom in a bit.
  useEffect(() => {
    if (!globeReady || !focusAgentId || !globeRef.current) return;
    const globe = globeRef.current;

    const agent = agents.find((a) => a.id === focusAgentId);
    if (!agent) return;

    const pos =
      agent.type === 'satellite' && agent.route
        ? getAgentPosition(agent)
        : { lat: agent.lat ?? 0, lng: agent.lng ?? 0 };

    try {
      const controls = globe.controls();
      controls.autoRotate = false;
      globe.pointOfView(
        { lat: pos.lat, lng: pos.lng, altitude: 0.7 },
        1000
      );
    } catch {
      /* ignore camera errors */
    }
  }, [focusAgentId, globeReady]);

  const globeMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ color: 0xffffff }),
    []
  );

  // Compute ideal (server-interpolated) position. Used by display lerp and by
  // getRenderedAgentPosition. stateTs is last state fetch time (ms).
  function getRenderedAgentPositionForLerp(
    agent: Agent,
    stateTs: number
  ): { lat: number; lng: number } {
    if (agent.type === 'satellite' && agent.route) {
      return getAgentPosition(agent);
    }
    const baseLat = agent.lat ?? 0;
    const baseLng = agent.lng ?? 0;
    if (!agent.target || agent.speed == null || agent.speed <= 0) {
      return { lat: baseLat, lng: baseLng };
    }
    const target = agent.target;
    const dist = angularDistanceDeg(baseLat, baseLng, target.lat, target.lng);
    if (dist <= 0) return { lat: target.lat, lng: target.lng };
    const stepFrac = Math.min(1, agent.speed / dist);
    const elapsedSeconds = Math.max(0, (Date.now() - stateTs) / 1000);
    const tickFrac = Math.min(1, elapsedSeconds / TICK_SECONDS);
    const frac = stepFrac * tickFrac;
    return {
      lat: clampLat(baseLat + (target.lat - baseLat) * frac),
      lng: wrapLng(baseLng + (target.lng - baseLng) * frac),
    };
  }

  function getRenderedAgentPosition(agent: Agent): { lat: number; lng: number } {
    return getRenderedAgentPositionForLerp(agent, stateTimestamp);
  }

  // Satellite icon texture (billboard sprite)
  const satelliteTexture = useMemo(() => {
    const loader = new THREE.TextureLoader();
    const tex = loader.load('/satellite.png');
    tex.anisotropy = 8;
    tex.colorSpace =
      // @ts-ignore - support both legacy and new colorSpace APIs
      THREE.SRGBColorSpace || (THREE as any).SRGBColorSpace || tex.colorSpace;
    return tex;
  }, []);

  // Water drone icon texture (billboard sprite)
  const waterDroneTexture = useMemo(() => {
    const loader = new THREE.TextureLoader();
    const tex = loader.load('/watering-drone.png');
    tex.anisotropy = 8;
    // @ts-ignore - support both legacy and new colorSpace APIs
    tex.colorSpace =
      THREE.SRGBColorSpace || (THREE as any).SRGBColorSpace || tex.colorSpace;
    return tex;
  }, []);

  // Scout icon texture (billboard sprite)
  const scoutTexture = useMemo(() => {
    const loader = new THREE.TextureLoader();
    const tex = loader.load('/scout.png');
    tex.anisotropy = 8;
    // @ts-ignore - support both legacy and new colorSpace APIs
    tex.colorSpace =
      THREE.SRGBColorSpace || (THREE as any).SRGBColorSpace || tex.colorSpace;
    return tex;
  }, []);

  // Heavy tanker icon texture (billboard sprite)
  const tankerTexture = useMemo(() => {
    const loader = new THREE.TextureLoader();
    const tex = loader.load('/tanker.png');
    tex.anisotropy = 8;
    // @ts-ignore - support both legacy and new colorSpace APIs
    tex.colorSpace =
      THREE.SRGBColorSpace || (THREE as any).SRGBColorSpace || tex.colorSpace;
    return tex;
  }, []);

  /* ─── Build globe objects ─────────────────────────────── */

  const globeObjects: GlobeObject[] = useMemo(() => {
    const fireObjs: GlobeObject[] = (fires || []).map((f) => ({
      type: 'fire' as const,
      id: f.id,
      lat: f.lat,
      lng: f.lng,
      intensity: f.intensity ?? 1,
    }));

    const agentObjs: GlobeObject[] = agents.map((a) => {
      const ideal = getRenderedAgentPosition(a);
      const pos = displayPosRef.current[a.id] ?? ideal;
      return { type: 'agent' as const, lat: pos.lat, lng: pos.lng, agent: a };
    });

    const waterObjs: GlobeObject[] = waterSources.map((ws) => ({
      type: 'water' as const,
      id: ws.id,
      lat: ws.lat,
      lng: ws.lng,
      name: ws.name,
    }));

    return [...fireObjs, ...agentObjs, ...waterObjs];
  }, [fires, agents, waterSources, serverTick, stateTimestamp, tick]);

  /* ─── Agent ring data (stable refs) ───────────────────── */

  const agentRingDataRef = useRef<Map<string, GlobeObject>>(new Map());
  const agentRingData = useMemo(() => {
    const map = agentRingDataRef.current;
    agents.forEach((a) => {
      if (!a.searchRadius) return;
      const ideal = getRenderedAgentPosition(a);
      const pos = displayPosRef.current[a.id] ?? ideal;
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
  }, [agents, serverTick, stateTimestamp, tick]);

  const fireObjects = globeObjects.filter((o) => o.type === 'fire');

  /* ─── Focused agent path (for inspect mode) ─────────────── */

  const focusedAgent = useMemo(
    () => agents.find((a) => a.id === focusAgentId) ?? null,
    [agents, focusAgentId]
  );

  const focusedPath: AgentPath | null = useMemo(() => {
    if (!focusedAgent) return null;
    if (!focusedAgent.target) return null;

    const ideal = getRenderedAgentPosition(focusedAgent);
    const from = displayPosRef.current[focusedAgent.id] ?? ideal;
    const to = focusedAgent.target;

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
  }, [focusedAgent, stateTimestamp, serverTick, tick]);

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

      // Hit disc for ring hover
      if (agent.searchRadius) {
        const hitRadius = searchRadiusToGlobeUnits(agent.searchRadius);
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
    } else if (agent.type === 'coordinator') {
      // Diamond for coordinator
      const geom = new THREE.OctahedronGeometry(0.4);
      const mat = new THREE.MeshBasicMaterial({ color });
      group.add(new THREE.Mesh(geom, mat));
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

  const createFireObject = (intensity: number) => {
    const size = 0.35 + (intensity - 1) * 0.2625;
    const geometry = new THREE.SphereGeometry(size, 12, 12);
    const color =
      intensity <= 2 ? 0xf97316 : intensity <= 4 ? 0xea580c : 0xdc2626;
    const material = new THREE.MeshBasicMaterial({ color });
    return new THREE.Mesh(geometry, material);
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
          return obj.type === 'water' ? 0.005 : 0.015;
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
            let info = `${label} · ${Math.round(a.batteryPercentage)}%`;
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
          return 0.4 + (intensity - 1) * 0.2;
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

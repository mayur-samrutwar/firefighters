 'use client';
 
import { useCallback, useEffect, useState } from 'react';
import { PRESET_ROUTES } from '@/app/game/presets';
import type { AgentRoute, AgentType } from '@/app/game/store';

type TestDeployModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onDeployed: () => void;
};

export default function TestDeployModal({
  isOpen,
  onClose,
  onDeployed,
}: TestDeployModalProps) {
  const [agentType, setAgentType] = useState<AgentType>('satellite');
  const [routeId, setRouteId] = useState(PRESET_ROUTES[0]?.id ?? '');
  const [batteryPercentage, setBatteryPercentage] = useState(100);
  const [searchRadius, setSearchRadius] = useState(5);
  const [lat, setLat] = useState(0);
  const [lng, setLng] = useState(0);
  const [isDeploying, setIsDeploying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDeploy = useCallback(async () => {
    setIsDeploying(true);
    setError(null);

    try {
      let payload: any = {
        type: agentType,
        batteryPercentage,
      };

      if (agentType === 'satellite') {
        const preset = PRESET_ROUTES.find((r) => r.id === routeId);
        if (!preset) {
          setError('Select a valid patrol route');
          setIsDeploying(false);
          return;
        }
        payload.route = preset.route as AgentRoute;
        payload.searchRadius = searchRadius;
      } else {
        if (Number.isNaN(lat) || Number.isNaN(lng)) {
          setError('Latitude and longitude must be numbers');
          setIsDeploying(false);
          return;
        }
        payload.lat = lat;
        payload.lng = lng;
      }

      const res = await fetch('/api/agents/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Deploy failed');
        return;
      }

      onDeployed();
      onClose();
    } catch {
      setError('Deploy failed');
    } finally {
      setIsDeploying(false);
    }
  }, [
    agentType,
    routeId,
    batteryPercentage,
    searchRadius,
    lat,
    lng,
    onDeployed,
    onClose,
  ]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', onKeyDown);
      document.body.style.overflow = 'hidden';
    }
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
        className="relative w-full max-w-md overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-2xl shadow-slate-200/50"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200/80 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">Test deploy agent</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wider text-slate-400">
              Agent type
            </label>
            <select
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800"
              value={agentType}
              onChange={(e) => setAgentType(e.target.value as AgentType)}
            >
              <option value="satellite">Satellite (surveillance)</option>
              <option value="scout">Scout drone (recon)</option>
              <option value="water_drone">Water drone</option>
              <option value="heavy_tanker">Heavy tanker</option>
              <option value="supply_drone">Supply drone</option>
              <option value="coordinator">Coordinator</option>
            </select>
          </div>
 
          {agentType === 'satellite' && (
            <>
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wider text-slate-400">
                  Patrol route
                </label>
                <select
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800"
                  value={routeId}
                  onChange={(e) => setRouteId(e.target.value)}
                >
                  {PRESET_ROUTES.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
 
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wider text-slate-400">
                  Search radius (degrees)
                </label>
                <input
                  type="number"
                  min={0.5}
                  max={180}
                  step={0.5}
                  value={searchRadius}
                  onChange={(e) => setSearchRadius(Number(e.target.value) || 1)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800"
                />
              </div>
            </>
          )}
 
          {agentType !== 'satellite' && (
            <>
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wider text-slate-400">
                  Start latitude
                </label>
                <input
                  type="number"
                  min={-90}
                  max={90}
                  step={0.5}
                  value={lat}
                  onChange={(e) => setLat(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium uppercase tracking-wider text-slate-400">
                  Start longitude
                </label>
                <input
                  type="number"
                  min={-180}
                  max={180}
                  step={0.5}
                  value={lng}
                  onChange={(e) => setLng(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800"
                />
              </div>
            </>
          )}
 
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wider text-slate-400">
              Battery (%)
            </label>
            <input
              type="number"
              min={0}
              max={100}
              value={batteryPercentage}
              onChange={(e) => setBatteryPercentage(Number(e.target.value) || 0)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200/80 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200/80 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDeploy}
            disabled={isDeploying}
            className="rounded-lg border border-slate-200/80 bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
          >
            {isDeploying ? 'Deploying…' : 'Deploy'}
          </button>
        </div>
      </div>
    </div>
  );
}

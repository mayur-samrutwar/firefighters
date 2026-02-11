'use client';

import { useCallback, useEffect, useState } from 'react';
import { PRESET_ROUTES } from '@/app/game/presets';
import type { AgentRoute } from '@/app/game/store';

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
  const [routeId, setRouteId] = useState(PRESET_ROUTES[0]?.id ?? '');
  const [batteryPercentage, setBatteryPercentage] = useState(100);
  const [searchRadius, setSearchRadius] = useState(5);
  const [isDeploying, setIsDeploying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDeploy = useCallback(async () => {
    const preset = PRESET_ROUTES.find((r) => r.id === routeId);
    if (!preset) return;

    setIsDeploying(true);
    setError(null);

    try {
      const res = await fetch('/api/agents/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'satellite',
          route: preset.route as AgentRoute,
          batteryPercentage,
          searchRadius,
        }),
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
  }, [routeId, batteryPercentage, searchRadius, onDeployed, onClose]);

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
              value="satellite"
              disabled
            >
              <option value="satellite">Satellite (surveillance)</option>
            </select>
          </div>

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

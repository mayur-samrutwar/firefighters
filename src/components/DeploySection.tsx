'use client';

import { useState } from 'react';
import DeployAgentModal from './DeployAgentModal';

export default function DeploySection({
  autoRotate,
  onToggleAutoRotate,
  onOpenInfo,
}: {
  autoRotate: boolean;
  onToggleAutoRotate: () => void;
  onOpenInfo: () => void;
}) {
  const [isDeployModalOpen, setIsDeployModalOpen] = useState(false);

  return (
    <>
      <div className="pointer-events-auto absolute bottom-8 left-1/2 z-10 flex -translate-x-1/2 gap-2">
        <button
          type="button"
          onClick={onOpenInfo}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 shadow-lg shadow-slate-200/40 transition hover:bg-slate-50"
        >
          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-slate-900 text-[10px] font-semibold text-white">
            i
          </span>
          How to play
        </button>
        <button
          type="button"
          onClick={() => setIsDeployModalOpen(true)}
          className="rounded-xl border border-slate-200/80 bg-slate-900 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-slate-900/20 transition hover:bg-slate-800"
        >
          Deploy your agent
        </button>
        <button
          type="button"
          onClick={onToggleAutoRotate}
          className="flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/90 px-3 py-2 text-xs font-medium text-slate-600 shadow-lg shadow-slate-200/40 transition hover:bg-slate-50"
        >
          <span className="text-[11px] font-medium text-slate-600">
            Auto-rotate
          </span>
          <span
            className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
              autoRotate ? 'bg-emerald-500' : 'bg-slate-300'
            }`}
          >
            <span
              className={`h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${
                autoRotate ? 'translate-x-3' : 'translate-x-1'
              }`}
            />
          </span>
        </button>
      </div>
      <DeployAgentModal
        isOpen={isDeployModalOpen}
        onClose={() => setIsDeployModalOpen(false)}
      />
    </>
  );
}

'use client';

import { useState } from 'react';
import DeployAgentModal from './DeployAgentModal';
import TestDeployModal from './TestDeployModal';

export default function DeploySection() {
  const [isDeployModalOpen, setIsDeployModalOpen] = useState(false);
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);

  return (
    <>
      <div className="pointer-events-auto absolute bottom-8 left-1/2 z-10 flex -translate-x-1/2 gap-2">
        <button
          type="button"
          onClick={() => setIsTestModalOpen(true)}
          className="rounded-xl border border-slate-200/80 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 shadow-lg shadow-slate-200/40 transition hover:bg-slate-50"
        >
          Test deploy
        </button>
        <button
          type="button"
          onClick={() => setIsDeployModalOpen(true)}
          className="rounded-xl border border-slate-200/80 bg-slate-900 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-slate-900/20 transition hover:bg-slate-800"
        >
          Deploy your agent
        </button>
      </div>
      <TestDeployModal
        isOpen={isTestModalOpen}
        onClose={() => setIsTestModalOpen(false)}
        onDeployed={() => {}}
      />
      <DeployAgentModal
        isOpen={isDeployModalOpen}
        onClose={() => setIsDeployModalOpen(false)}
      />
    </>
  );
}

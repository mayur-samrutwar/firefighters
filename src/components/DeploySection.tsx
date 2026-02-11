'use client';

import { useState } from 'react';
import DeployAgentModal from './DeployAgentModal';

export default function DeploySection() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <div className="pointer-events-auto absolute bottom-8 left-1/2 z-10 -translate-x-1/2">
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="rounded-xl border border-slate-200/80 bg-slate-900 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-slate-900/20 transition hover:bg-slate-800"
        >
          Deploy your agent
        </button>
      </div>
      <DeployAgentModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  );
}

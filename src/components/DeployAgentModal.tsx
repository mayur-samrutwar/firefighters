'use client';

import { useCallback, useEffect, useState } from 'react';

const SKILL_URL = '/skill.md';

type DeployAgentModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export default function DeployAgentModal({ isOpen, onClose }: DeployAgentModalProps) {
  const [content, setContent] = useState('');
  const [copiedContent, setCopiedContent] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', onKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleClose]);

  useEffect(() => {
    if (!isOpen) return;
    fetch(SKILL_URL)
      .then((res) => (res.ok ? res.text() : Promise.reject(new Error('Failed to load'))))
      .then(setContent)
      .catch(() => setContent('# Error\nCould not load skill.md'));
  }, [isOpen]);

  const skillUrl =
    typeof window !== 'undefined' ? `${window.location.origin}${SKILL_URL}` : '';
  const curlCommand = `curl ${skillUrl}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedContent(true);
      setTimeout(() => setCopiedContent(false), 2000);
    } catch {
      //
    }
  };

  const handleCopyCurl = async () => {
    try {
      await navigator.clipboard.writeText(curlCommand);
      setCopiedCurl(true);
      setTimeout(() => setCopiedCurl(false), 2000);
    } catch {
      //
    }
  };

  const handleDownload = () => {
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'skill.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={handleClose}
    >
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        aria-hidden
      />
      <div
        className="relative max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-2xl shadow-slate-200/50"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200/80 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900">
            Deploy your agent
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto p-5" style={{ maxHeight: 'calc(90vh - 160px)' }}>
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
              curl URL
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 font-mono text-sm text-slate-700 break-all">
                {curlCommand}
              </code>
              <button
                type="button"
                onClick={handleCopyCurl}
                className="shrink-0 rounded-lg border border-slate-200/80 bg-white px-3 py-2.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
              >
                {copiedCurl ? 'Copied' : 'Copy curl'}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
              Skill content
            </p>
            <pre className="max-h-80 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-4 font-mono text-xs text-slate-700 whitespace-pre-wrap">
              {content || 'Loading…'}
            </pre>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200/80 px-5 py-4">
          <button
            type="button"
            onClick={handleCopy}
            className="rounded-lg border border-slate-200/80 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            {copiedContent ? 'Copied' : 'Copy content'}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="rounded-lg border border-slate-200/80 bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            Download
          </button>
        </div>
      </div>
    </div>
  );
}

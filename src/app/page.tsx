import GlobeViewer from '@/components/GlobeViewer';

export default function Home() {
  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-white">
      <GlobeViewer />
      <div className="pointer-events-auto absolute bottom-8 left-1/2 z-10 -translate-x-1/2">
        <div className="flex items-center gap-3 rounded-full border border-slate-200/80 bg-white/90 px-5 py-2.5 shadow-lg shadow-slate-200/50 backdrop-blur-sm">
          <span className="text-xs font-medium text-slate-600">
            Drag to rotate · Scroll to zoom
          </span>
        </div>
      </div>
    </div>
  );
}

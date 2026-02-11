const LEGEND_ITEMS = [
  { color: '#f97316', label: 'Fire' },
  { color: '#3b82f6', label: 'Satellite agent (hover for info)' },
  { color: '#0ea5e9', label: 'Water source' },
  { color: '#22c55e', label: 'Drone — fetching water' },
  { color: '#a855f7', label: 'Drone — other purpose' },
];

export default function GlobeLegend() {
  return (
    <div className="pointer-events-auto absolute bottom-8 left-8 z-10 rounded-xl border border-slate-200/80 bg-white/95 px-4 py-3 shadow-lg shadow-slate-200/40 backdrop-blur-sm">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        Legend
      </p>
      <div className="space-y-2">
        {LEGEND_ITEMS.map(({ color, label }) => (
          <div key={label} className="flex items-center gap-2.5">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span className="text-xs font-medium text-slate-600">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

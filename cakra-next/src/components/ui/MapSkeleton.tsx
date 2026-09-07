export function MapSkeleton({ label }: { label: string }) {
  return (
    <div className="relative flex h-full min-h-[320px] w-full items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="absolute inset-0 bg-app-grid opacity-60" />
      <div className="relative flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-pulse rounded-full border-2 border-sky-500/40 border-t-sky-500" />
        <span className="font-mono text-[11px] font-medium tracking-wide text-slate-400 dark:text-zinc-500">
          {label}
        </span>
      </div>
    </div>
  );
}

import type { SignalStatus } from '@/lib/types';

const STYLES: Record<SignalStatus, string> = {
  excellent:
    'text-emerald-600 bg-emerald-500/10 border-emerald-500/20 dark:text-emerald-400',
  good: 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20 dark:text-emerald-400',
  normal: 'text-amber-600 bg-amber-500/10 border-amber-500/20 dark:text-amber-400',
  poor: 'text-rose-600 bg-rose-500/10 border-rose-500/20 dark:text-rose-400',
  critical: 'text-rose-600 bg-rose-500/10 border-rose-500/20 dark:text-rose-400',
};

export function StatusPill({ status, label }: { status: SignalStatus; label: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold font-mono uppercase tracking-wide ${STYLES[status]}`}
    >
      {label}
    </span>
  );
}

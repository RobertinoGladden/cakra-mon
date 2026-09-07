'use client';

import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { LangToggle } from '@/components/i18n/LangToggle';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import { useDriveTest } from '@/context/DriveTestContext';

export function TopBar() {
  const { t } = useLanguage();
  const { session, points } = useDriveTest();

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/85 px-6 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/85">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className="truncate rounded-md border border-sky-500/20 bg-sky-500/10 px-2.5 py-1 font-mono text-[11px] font-medium text-sky-600 dark:text-sky-400"
          title={session?.filename || 'No active session'}
        >
          {session?.filename || 'CAKRA — no dataset'}
        </span>
        <span className="hidden font-mono text-[11px] text-slate-400 dark:text-zinc-500 sm:inline">
          {points.length.toLocaleString()} {t.topbar.dataPoints}
        </span>
        <span className="hidden items-center gap-1 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10.5px] font-medium text-emerald-600 dark:text-emerald-400 md:inline-flex">
          {session?.technology || 'IDLE'}
        </span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <LangToggle />
        <ThemeToggle />
      </div>
    </header>
  );
}

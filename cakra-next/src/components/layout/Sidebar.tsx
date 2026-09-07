'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLanguage } from '@/components/i18n/LanguageProvider';

const NAV_ITEMS = [
  { href: '/overview', icon: '◇', key: 'overview' as const },
  { href: '/graphics', icon: '∿', key: 'graphics' as const },
  { href: '/map-events', icon: '⬡', key: 'mapEvents' as const },
  { href: '/rf-analysis', icon: '◈', key: 'rfAnalysis' as const },
  { href: '/virtual-drive-test', icon: '▶', key: 'vdt' as const },
  { href: '/about', icon: '○', key: 'about' as const },
];

export function Sidebar() {
  const pathname = usePathname();
  const { t } = useLanguage();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex h-14 items-center gap-2 border-b border-slate-200 px-4 dark:border-zinc-800">
        <span className="text-lg text-sky-500">◈</span>
        <span className="font-mono text-sm font-bold tracking-wider text-slate-900 dark:text-zinc-100">
          CAKRA
        </span>
        <span className="ml-auto rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[9px] font-medium text-slate-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-500">
          v3.0.0
        </span>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname?.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
                active
                  ? 'bg-slate-100 text-slate-900 dark:bg-zinc-800 dark:text-zinc-100'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              <span className={`w-4 text-center text-[13px] ${active ? 'text-sky-500' : ''}`}>{item.icon}</span>
              <span className="min-w-0 truncate">{t.nav[item.key]}</span>
            </Link>
          );
        })}
      </nav>

      <div className="space-y-2 border-t border-slate-200 p-3 dark:border-zinc-800">
        <Link
          href="/"
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-sky-500 px-3 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-sky-600"
        >
          <span>⬆</span>
          <span>{t.nav.uploadNew}</span>
        </Link>
        <Link href="/about" className="flex w-full items-center justify-center rounded-lg px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50 dark:text-zinc-400 dark:hover:bg-zinc-900">{t.nav.about}</Link>
      </div>
    </aside>
  );
}

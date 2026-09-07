import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { CacaAssistant } from '@/components/ai/CacaAssistant';

export function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-app-grid bg-slate-50 dark:bg-zinc-950">
      <div className="hidden md:block"><Sidebar /></div>
      <div className="flex min-h-screen min-w-0 flex-col md:pl-64">
        <TopBar />
        {/* pb-28 gives floating action buttons / bottom drawers room without
            ever covering the last card in the scroll area. */}
        <main className="min-w-0 flex-1 overflow-y-auto px-6 py-6 pb-28">{children}</main>
      </div>
      <CacaAssistant />
    </div>
  );
}

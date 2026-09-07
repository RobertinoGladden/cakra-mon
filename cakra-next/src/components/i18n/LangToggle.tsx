'use client';

import { useLanguage } from './LanguageProvider';
import type { Locale } from '@/lib/dictionary';

export function LangToggle() {
  const { locale, setLocale } = useLanguage();

  const optionClass = (l: Locale) =>
    `rounded-md px-2 py-1 text-xs font-semibold font-mono transition-colors ${
      locale === l
        ? 'bg-slate-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
        : 'text-slate-400 hover:text-slate-700 dark:text-zinc-500 dark:hover:text-zinc-200'
    }`;

  return (
    <div
      role="group"
      aria-label="Language"
      className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5 dark:border-zinc-800 dark:bg-zinc-900/50"
    >
      <button type="button" onClick={() => setLocale('en')} className={optionClass('en')}>
        EN
      </button>
      <button type="button" onClick={() => setLocale('id')} className={optionClass('id')}>
        ID
      </button>
    </div>
  );
}

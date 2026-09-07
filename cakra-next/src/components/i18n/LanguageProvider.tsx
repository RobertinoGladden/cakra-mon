'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { dictionary, type Locale, type Dictionary } from '@/lib/dictionary';

const STORAGE_KEY = 'cakra-locale';
const DEFAULT_LOCALE: Locale = 'en';

interface LanguageContextValue {
  locale: Locale;
  t: Dictionary;
  setLocale: (locale: Locale) => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY) as Locale | null;
    if (stored === 'en' || stored === 'id') setLocaleState(stored);
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    document.documentElement.setAttribute('lang', next);
  }, []);

  const value = useMemo(
    () => ({ locale, t: dictionary[locale], setLocale }),
    [locale, setLocale]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within a LanguageProvider');
  return ctx;
}

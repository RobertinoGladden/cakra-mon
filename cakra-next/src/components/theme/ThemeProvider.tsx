'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'cakra-theme';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Inline script injected into <head> so the correct theme class is applied
 * to <html> BEFORE React hydrates and before first paint — this is what
 * prevents the light/dark flicker on load. Runs synchronously, no deps.
 *
 * Default is always 'light' unless the user has explicitly chosen 'dark'
 * before (stored in localStorage). We deliberately do NOT read
 * prefers-color-scheme here — system theme auto-detection is disabled
 * per the design spec.
 */
export function ThemeInitScript() {
  const code = `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}');if(t!=='dark'&&t!=='light'){t='light';}document.documentElement.classList.toggle('dark',t==='dark');document.documentElement.style.colorScheme=t;}catch(e){}})();`;
  // eslint-disable-next-line react/no-danger
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Initial render must match the server (light) to avoid hydration
  // mismatch; the init script above already set the real class on <html>
  // before paint, so this only needs to sync React state after mount.
  const [theme, setThemeState] = useState<Theme>('light');

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const initial: Theme = stored === 'dark' ? 'dark' : 'light';
    setThemeState(initial);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    document.documentElement.classList.toggle('dark', next === 'dark');
    document.documentElement.style.colorScheme = next;
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  }, [theme, setTheme]);

  const value = useMemo(
    () => ({ theme, setTheme, toggleTheme }),
    [theme, setTheme, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}

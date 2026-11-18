import { useCallback, useState } from 'react';

export type Theme = 'light' | 'dark';
export type Palette = 'violet' | 'blue' | 'official';

// Set by public/theme.js: repaints the browser / installed-app title bar for the current look.
const syncThemeColor = () => (window as Window & { syncThemeColor?: () => void }).syncThemeColor?.();

const systemTheme = (): Theme => (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.dataset.theme as Theme) ?? systemTheme());
  const [palette, setPaletteState] = useState<Palette>(() => (document.documentElement.dataset.palette as Palette) ?? 'blue');

  const toggle = useCallback(() => {
    setTheme((value) => {
      const next = value === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      syncThemeColor();
      try {
        localStorage.setItem('theme', next);
      } catch {
        // Blocked storage: the choice lasts for this visit only.
      }
      return next;
    });
  }, []);

  const setPalette = useCallback((next: Palette) => {
    document.documentElement.dataset.palette = next;
    syncThemeColor();
    try {
      localStorage.setItem('palette', next);
    } catch {
      // Blocked storage
    }
    setPaletteState(next);
  }, []);

  return { theme, toggle, palette, setPalette };
}

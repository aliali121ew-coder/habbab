import { useCallback, useState } from 'react';

export type Theme = 'light' | 'dark';
export type Palette = 'violet' | 'blue' | 'official';

// Set by public/theme.js: repaints the browser / installed-app title bar for the current look.
const syncThemeColor = () => (window as Window & { syncThemeColor?: () => void }).syncThemeColor?.();

const systemTheme = (): Theme => (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

/**
 * Changes the look in one clean step. Many elements have their own colour transitions (each with
 * its own duration), so a theme switch used to ripple across the page piece by piece and stutter
 * on the glass cards. Transitions are switched off for the moment of the change and, where the
 * browser can, the whole page crossfades once (View Transitions) instead.
 */
function switchLook(change: () => void) {
  const root = document.documentElement;
  root.classList.add('theme-switching');
  const apply = () => { change(); syncThemeColor(); };
  // Two frames after the new colours are painted, element transitions come back.
  const settle = () => requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('theme-switching')));
  // Safety net: transitions always come back within a second, even if a frame never arrives.
  window.setTimeout(() => root.classList.remove('theme-switching'), 1000);
  const start = (document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } }).startViewTransition;
  if (start && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    start.call(document, apply).finished.finally(settle);
  } else {
    apply();
    settle();
  }
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.dataset.theme as Theme) ?? systemTheme());
  const [palette, setPaletteState] = useState<Palette>(() => (document.documentElement.dataset.palette as Palette) ?? 'blue');

  const toggle = useCallback(() => {
    const current = (document.documentElement.dataset.theme as Theme) ?? systemTheme();
    const next: Theme = current === 'dark' ? 'light' : 'dark';
    switchLook(() => { document.documentElement.dataset.theme = next; });
    try {
      localStorage.setItem('theme', next);
    } catch {
      // Blocked storage: the choice lasts for this visit only.
    }
    setTheme(next);
  }, []);

  const setPalette = useCallback((next: Palette) => {
    switchLook(() => { document.documentElement.dataset.palette = next; });
    try {
      localStorage.setItem('palette', next);
    } catch {
      // Blocked storage
    }
    setPaletteState(next);
  }, []);

  return { theme, toggle, palette, setPalette };
}

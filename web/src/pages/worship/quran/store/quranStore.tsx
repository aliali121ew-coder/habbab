import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { MUSHAF_SURAHS } from '../data/mushafMeta';

export type QuranTheme = 'light' | 'dark' | 'sepia';
export type QuranThemePref = QuranTheme | 'auto';
export type FlipMode = 'curl' | 'slide' | 'scroll';
export type DigitStyle = 'arabic' | 'latin';
export type QuranTab = 'index' | 'search' | 'bookmarks' | 'settings';

export interface LastRead {
  surah: number;
  ayah: number;
  page: number;
  updatedAt: number;
}

export interface QuranSettings {
  themePref: QuranThemePref;
  digits: DigitStyle;
  fontSize: number;
  flipMode: FlipMode;
  tajweed: boolean;
  doublePage: boolean;
  wakeLock: boolean;
  flipSound: boolean;
  reciterId: string;
  playbackRate: number;
  autoPlayNext: boolean;
  onboarded: boolean;
}

const SETTINGS_KEY = 'ahbab:quran:settings:v1';
const LAST_READ_KEY = 'ahbab:quran:last-read:v1';
const LEGACY_BOOKMARK_KEY = 'ahbab:quran-bookmark:v1';

const DEFAULT_SETTINGS: QuranSettings = {
  themePref: 'auto',
  digits: 'arabic',
  fontSize: 24,
  flipMode: 'curl',
  tajweed: false,
  doublePage: true,
  wakeLock: true,
  flipSound: false,
  reciterId: 'ar.alafasy',
  playbackRate: 1,
  autoPlayNext: true,
  onboarded: false,
};

function loadSettings(): QuranSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<QuranSettings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function loadLastRead(): LastRead {
  try {
    const raw = localStorage.getItem(LAST_READ_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LastRead>;
      if (parsed.surah && parsed.surah >= 1 && parsed.surah <= 114) {
        const meta = MUSHAF_SURAHS[parsed.surah - 1];
        return {
          surah: parsed.surah,
          ayah: parsed.ayah ?? 1,
          page: parsed.page ?? meta.page,
          updatedAt: parsed.updatedAt ?? Date.now(),
        };
      }
    }
    const legacy = Number(localStorage.getItem(LEGACY_BOOKMARK_KEY));
    if (legacy >= 1 && legacy <= 114) {
      const meta = MUSHAF_SURAHS[legacy - 1];
      return { surah: legacy, ayah: 1, page: meta.page, updatedAt: Date.now() };
    }
  } catch { /* ignore */ }
  return { surah: 1, ayah: 1, page: 1, updatedAt: 0 };
}

function resolveSystemTheme(): QuranTheme {
  if (typeof document !== 'undefined') {
    const appTheme = document.documentElement.getAttribute('data-theme');
    if (appTheme === 'dark') return 'dark';
    if (appTheme === 'light') return 'light';
  }
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

export function formatDigits(value: number | string, style: DigitStyle): string {
  const s = String(value);
  if (style === 'latin') return s;
  return s.replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);
}

interface QuranContextValue {
  settings: QuranSettings;
  resolvedTheme: QuranTheme;
  lastRead: LastRead;
  updateSettings: (patch: Partial<QuranSettings>) => void;
  setLastRead: (next: Omit<LastRead, 'updatedAt'>) => void;
  num: (value: number | string) => string;
}

const QuranContext = createContext<QuranContextValue | null>(null);

export function QuranProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<QuranSettings>(loadSettings);
  const [lastRead, setLastReadState] = useState<LastRead>(loadLastRead);
  const [systemTheme, setSystemTheme] = useState<QuranTheme>(resolveSystemTheme);

  // Sync with both OS color scheme and AHBAB's root data-theme attribute
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => setSystemTheme(resolveSystemTheme());
    mq.addEventListener?.('change', sync);
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      mq.removeEventListener?.('change', sync);
      observer.disconnect();
    };
  }, []);

  const updateSettings = useCallback((patch: Partial<QuranSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch { /* quota */ }
      return next;
    });
  }, []);

  const setLastRead = useCallback((next: Omit<LastRead, 'updatedAt'>) => {
    const stamped: LastRead = { ...next, updatedAt: Date.now() };
    setLastReadState(stamped);
    try {
      localStorage.setItem(LAST_READ_KEY, JSON.stringify(stamped));
      localStorage.setItem(LEGACY_BOOKMARK_KEY, String(stamped.surah));
    } catch { /* quota */ }
  }, []);

  const resolvedTheme: QuranTheme = settings.themePref === 'auto' ? systemTheme : settings.themePref;

  const num = useCallback(
    (value: number | string) => formatDigits(value, settings.digits),
    [settings.digits],
  );

  const value = useMemo<QuranContextValue>(
    () => ({ settings, resolvedTheme, lastRead, updateSettings, setLastRead, num }),
    [settings, resolvedTheme, lastRead, updateSettings, setLastRead, num],
  );

  return <QuranContext.Provider value={value}>{children}</QuranContext.Provider>;
}

export function useQuran() {
  const ctx = useContext(QuranContext);
  if (!ctx) throw new Error('useQuran must be used inside QuranProvider');
  return ctx;
}

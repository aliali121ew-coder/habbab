import { api } from '../../../../api';
import { idbGet, idbSet } from '../db/quranDb';
import { TOTAL_PAGES } from './mushafMeta';

export interface MushafAyah {
  surah: number;
  surahName: string;
  n: number;
  global: number;
  text: string;
  sajda: boolean;
}

export interface MushafPageData {
  page: number;
  juz: number;
  hizbQuarter: number;
  ayahs: MushafAyah[];
}

// Fast in-memory cache so page flips render the underlying sheet in 0ms.
const memoryCache = new Map<number, MushafPageData>();
const inflight = new Map<number, Promise<MushafPageData>>();

export function getCachedPageSync(page: number): MushafPageData | undefined {
  return memoryCache.get(page);
}

export async function loadMushafPage(page: number): Promise<MushafPageData> {
  if (page < 1 || page > TOTAL_PAGES) throw new Error('رقم الصفحة غير صحيح');
  const mem = memoryCache.get(page);
  if (mem) return mem;

  const existing = inflight.get(page);
  if (existing) return existing;

  const task = (async () => {
    const saved = await idbGet<MushafPageData>('pages', page);
    if (saved && Array.isArray(saved.ayahs) && saved.ayahs.length > 0) {
      memoryCache.set(page, saved);
      return saved;
    }
    const fresh = await api<MushafPageData>(`/worship/page/${page}`);
    memoryCache.set(page, fresh);
    void idbSet('pages', page, fresh);
    return fresh;
  })().finally(() => {
    inflight.delete(page);
  });

  inflight.set(page, task);
  return task;
}

/** Silently preloads the next 2 pages and previous page into memory & IndexedDB. */
export function preloadAdjacentPages(currentPage: number) {
  const targets = [currentPage + 1, currentPage - 1, currentPage + 2];
  for (const p of targets) {
    if (p >= 1 && p <= TOTAL_PAGES && !memoryCache.has(p)) {
      void loadMushafPage(p).catch(() => undefined);
    }
  }
}

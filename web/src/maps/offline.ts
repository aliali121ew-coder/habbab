// Offline maps on the phone: a delegate downloads their province's map once (OpenStreetMap by
// Protomaps, served from the foundation's own storage) and the app shows it with no internet.
// Everything lives in one Cache Storage bucket: the province files, the Arabic fonts and the icons.
import { api } from '../api';

export const PROVINCES: { slug: string; name: string; center: [number, number] }[] = [
  { slug: 'baghdad', name: 'بغداد', center: [44.366, 33.315] },
  { slug: 'karbala', name: 'كربلاء', center: [44.024, 32.616] },
  { slug: 'najaf', name: 'النجف', center: [44.336, 32.0] },
  { slug: 'babil', name: 'بابل', center: [44.421, 32.468] },
  { slug: 'basra', name: 'البصرة', center: [47.783, 30.508] },
  { slug: 'wasit', name: 'واسط', center: [45.82, 32.5] },
  { slug: 'dhiqar', name: 'ذي قار', center: [46.257, 31.044] },
  { slug: 'maysan', name: 'ميسان', center: [47.145, 31.836] },
  { slug: 'qadisiyah', name: 'الديوانية', center: [44.925, 31.99] },
  { slug: 'muthanna', name: 'المثنى', center: [45.28, 31.31] },
  { slug: 'diyala', name: 'ديالى', center: [44.64, 33.75] },
  { slug: 'salahaddin', name: 'صلاح الدين', center: [43.68, 34.6] },
  { slug: 'nineveh', name: 'نينوى', center: [43.13, 36.34] },
  { slug: 'kirkuk', name: 'كركوك', center: [44.392, 35.468] },
  { slug: 'anbar', name: 'الأنبار', center: [43.3, 33.42] },
  { slug: 'erbil', name: 'أربيل', center: [44.01, 36.19] },
  { slug: 'sulaymaniyah', name: 'السليمانية', center: [45.435, 35.557] },
  { slug: 'duhok', name: 'دهوك', center: [42.988, 36.867] },
];

const CACHE = 'ahbab-offline-maps-v1';
const fileKey = (slug: string) => `/offline-maps/${slug}.pmtiles`;
const INDEX = '/offline-maps/index.json';

// The fonts (Arabic + Latin ranges) and icons the offline style needs.
const RANGES = ['0-255', '256-511', '1536-1791', '1792-2047', '8192-8447', '64256-64511', '64512-64767', '64768-65023', '65024-65279'];
const FONTS = ['Noto-Sans-Regular', 'Noto-Sans-Medium', 'Noto-Sans-Italic'];
export const ASSETS = [
  ...FONTS.flatMap((f) => RANGES.map((r) => `/offline-map/fonts/${f}/${r}.pbf`)),
  ...['light', 'dark'].flatMap((s) => [`/offline-map/sprites/${s}.json`, `/offline-map/sprites/${s}.png`, `/offline-map/sprites/${s}@2x.json`, `/offline-map/sprites/${s}@2x.png`]),
];

export interface Saved { slug: string; size: number; version: string; savedAt: string }
export interface Available { slug: string; size: number; version: string }

async function readIndex(cache: Cache): Promise<Saved[]> {
  const res = await cache.match(INDEX);
  return res ? (await res.json().catch(() => [])) as Saved[] : [];
}
const writeIndex = (cache: Cache, list: Saved[]) =>
  cache.put(INDEX, new Response(JSON.stringify(list), { headers: { 'content-type': 'application/json' } }));

export const offlineSupported = () => typeof caches !== 'undefined';

export async function savedMaps(): Promise<Saved[]> {
  if (!offlineSupported()) return [];
  return readIndex(await caches.open(CACHE));
}

export async function availableMaps(): Promise<Available[]> {
  return (await api<{ items: Available[] }>('/maps/offline')).items;
}

/** Downloads one province (with progress 0–1), plus the fonts and icons, into the app's cache. */
export async function downloadMap(slug: string, onProgress: (share: number) => void, signal?: AbortSignal) {
  const cache = await caches.open(CACHE);
  // Ask the phone to keep this storage (not to clear it when space runs low).
  void navigator.storage?.persist?.().catch(() => false);
  await Promise.all(ASSETS.map(async (url) => { if (!(await cache.match(url))) { const r = await fetch(url, { signal }); if (r.ok) await cache.put(url, r); } }));
  // The offline map's own code (and its worker) are kept by the app's file cache once loaded.
  const offlineView = await import('../pages/requests/OfflineMap');
  await fetch(offlineView.OFFLINE_WORKER, { signal }).catch(() => undefined);

  const res = await fetch(`/api/maps/offline/${slug}`, { signal, credentials: 'same-origin' });
  if (!res.ok || !res.body) throw new Error(res.status === 404 ? 'خريطة هذه المحافظة غير متوفرة بعد' : 'تعذّر تنزيل الخريطة، تحقق من الإنترنت');
  const total = Number(res.headers.get('content-length')) || 0;
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    got += value.length;
    if (total) onProgress(Math.min(1, got / total));
  }
  const blob = new Blob(parts as BlobPart[], { type: 'application/octet-stream' });
  await cache.put(fileKey(slug), new Response(blob, { headers: { 'content-type': 'application/octet-stream', 'content-length': String(blob.size) } }));
  const list = (await readIndex(cache)).filter((m) => m.slug !== slug);
  list.push({ slug, size: blob.size, version: res.headers.get('x-map-version') ?? '', savedAt: new Date().toISOString() });
  await writeIndex(cache, list);
  onProgress(1);
}

export async function removeMap(slug: string) {
  const cache = await caches.open(CACHE);
  await cache.delete(fileKey(slug));
  await writeIndex(cache, (await readIndex(cache)).filter((m) => m.slug !== slug));
}

/** The saved province file, ready for the map to read. */
export async function openMap(slug: string): Promise<File | null> {
  if (!offlineSupported()) return null;
  const res = await (await caches.open(CACHE)).match(fileKey(slug));
  return res ? new File([await res.blob()], `${slug}.pmtiles`) : null;
}

/** A saved font or icon (the offline style asks for these by URL). */
export async function cachedAsset(url: string): Promise<Response | undefined> {
  return (await caches.open(CACHE)).match(url);
}

export const formatSize = (bytes: number) => (bytes >= 1e6 ? `${(bytes / 1e6).toFixed(bytes >= 1e7 ? 0 : 1)} م.ب` : `${Math.max(1, Math.round(bytes / 1e3))} ك.ب`);

/** The saved province nearest to a point (to open the right map when offline). */
export function nearestSaved(saved: Saved[], at?: [number, number] | null) {
  if (!saved.length) return null;
  if (!at) return saved[0].slug;
  const d = (c: [number, number]) => (c[0] - at[0]) ** 2 + (c[1] - at[1]) ** 2;
  return [...saved].sort((a, b) => d(PROVINCES.find((p) => p.slug === a.slug)!.center) - d(PROVINCES.find((p) => p.slug === b.slug)!.center))[0].slug;
}

const AUTO_KEY = 'ahbab:auto-map-v1';
let autoRunning = false;

const normalizeAr = (s: string) => s.toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');

/** Picks a province slug from Arabic text (foundation address/place) or defaults to 'babil'. */
export function detectProvinceSlug(text?: string | null): string | null {
  if (!text) return null;
  const hay = normalizeAr(text);
  for (const p of PROVINCES) {
    if (hay.includes(normalizeAr(p.name))) return p.slug;
  }
  if (hay.includes('الهاشمي') || hay.includes('الحل') || hay.includes('المحاويل') || hay.includes('المسيب') || hay.includes('القاسم')) {
    return 'babil';
  }
  return null;
}

function nearestProvinceSlug(at: [number, number]): string {
  const d = (c: [number, number]) => (c[0] - at[0]) ** 2 + (c[1] - at[1]) ** 2;
  return [...PROVINCES].sort((a, b) => d(a.center) - d(b.center))[0].slug;
}

/**
 * Quietly downloads the user's province offline map once on first app open (defaults to Babil,
 * or matches the foundation's province / already-granted GPS). Never prompts for GPS and skips
 * on Save-Data / 2G connections.
 */
export function scheduleAutoDownloadMap(hintText?: string | null) {
  if (autoRunning || !offlineSupported() || !navigator.onLine) return;
  try { if (localStorage.getItem(AUTO_KEY)) return; } catch { /* ignore */ }
  const conn = (navigator as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (conn?.saveData || /2g/.test(conn?.effectiveType ?? '')) return;

  autoRunning = true;
  window.setTimeout(() => {
    void (async () => {
      try {
        const existing = await savedMaps();
        if (existing.length > 0) {
          try { localStorage.setItem(AUTO_KEY, existing[0].slug); } catch { /* ignore */ }
          return;
        }
        const avail = await availableMaps();
        if (!avail.length) return;

        // 1) Try matching foundation address/stamp_place, 2) already-granted GPS, 3) Babil default.
        let slug = detectProvinceSlug(hintText);
        if (!slug && 'permissions' in navigator && navigator.geolocation) {
          try {
            const perm = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
            if (perm.state === 'granted') {
              const pos = await new Promise<GeolocationPosition>((res, rej) =>
                navigator.geolocation.getCurrentPosition(res, rej, { timeout: 4000, maximumAge: 600_000 }),
              );
              slug = nearestProvinceSlug([pos.coords.longitude, pos.coords.latitude]);
            }
          } catch { /* ignore */ }
        }
        slug ??= 'babil';

        const chosen = avail.some((a) => a.slug === slug)
          ? slug
          : avail.some((a) => a.slug === 'babil')
            ? 'babil'
            : avail[0].slug;

        await downloadMap(chosen, () => undefined);
        try { localStorage.setItem(AUTO_KEY, chosen); } catch { /* ignore */ }
      } catch {
        // Silent retry on next open if network dropped mid-download.
      } finally {
        autoRunning = false;
      }
    })();
  }, 4500);
}

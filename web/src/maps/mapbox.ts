// Mapbox for every map in the app: streets in Arabic (light and dark), satellite with street
// names, and road routes (Directions API) with distance, minutes and Arabic turn steps.
// The CSP build is used so the page keeps its strict Content-Security-Policy: the worker is served
// from this site, never from a blob. Arabic shaping is built in (a WebAssembly file from Mapbox).
import mapboxgl from 'mapbox-gl/dist/mapbox-gl-csp.js';
import 'mapbox-gl/dist/mapbox-gl.css';
import workerUrl from 'mapbox-gl/dist/mapbox-gl-csp-worker.js?url';
import { api } from '../api';

type LineString = { type: 'LineString'; coordinates: [number, number][] };

export { mapboxgl };
export type MapStyle = 'streets' | 'satellite';

let ready: Promise<string | null> | null = null;

/** Sets the token once; null when the foundation's site has no Mapbox token yet. */
export function prepareMapbox(token?: string | null): Promise<string | null> {
  if (token !== undefined) ready = Promise.resolve(token);
  // A failed fetch (offline) is not remembered: the next map asks again.
  ready ??= api<{ mapToken: string | null }>('/maps/config').then((c) => c.mapToken).catch(() => { ready = null; return null; });
  return ready.then((t) => {
    if (t && mapboxgl.accessToken !== t) {
      mapboxgl.accessToken = t;
      (mapboxgl as unknown as { workerUrl: string }).workerUrl = workerUrl;
    }
    return t;
  });
}

const dark = () => document.documentElement.dataset.theme === 'dark';

// Mapbox Standard: one style for day and night (its light preset), with roads, labels and 3D
// buildings kept clear at every zoom. The old dark-v11 style lost its streets when zoomed in.
export const styleUrl = (style: MapStyle) =>
  style === 'satellite' ? 'mapbox://styles/mapbox/standard-satellite' : 'mapbox://styles/mapbox/standard';
const basemapConfig = () => ({ lightPreset: dark() ? 'night' : 'day', showPointOfInterestLabels: true, showTransitLabels: false });

/** Keeps the map's day/night in step with the app's theme while the map is open. */
function followTheme(map: mapboxgl.Map) {
  const apply = () => {
    try { map.setConfigProperty('basemap', 'lightPreset', dark() ? 'night' : 'day'); } catch { /* style still loading */ }
  };
  const watch = new MutationObserver(apply);
  watch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  map.on('style.load', apply);
  map.on('remove', () => watch.disconnect());
}

export const IRAQ: [number, number] = [44.2, 33.2]; // lng, lat

export function createMap(container: HTMLElement, options: {
  center?: [number, number]; zoom?: number; style?: MapStyle; interactive?: boolean;
}) {
  // Mapbox's stylesheet gives the container `position: relative` and, being outside the app's
  // CSS layers, it wins over any class rule; the box then collapses to 0px high and the map is
  // blank. Inline styles win over both.
  Object.assign(container.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' });
  const map = new mapboxgl.Map({
    container,
    style: styleUrl(options.style ?? 'streets'),
    config: { basemap: basemapConfig() },
    center: options.center ?? IRAQ,
    zoom: options.zoom ?? 5.5,
    interactive: options.interactive ?? true,
    attributionControl: true,
    pitchWithRotate: true,
    cooperativeGestures: false,
    language: 'ar',
  });
  followTheme(map);
  return map;
}

export interface Route {
  /** metres */ distance: number;
  /** seconds */ duration: number;
  geometry: LineString;
  steps: { text: string; distance: number }[];
}

/** The road route by car between two points, from Mapbox Directions (in Arabic). */
export async function roadRoute(from: [number, number], to: [number, number], signal?: AbortSignal): Promise<Route> {
  const token = await prepareMapbox();
  if (!token) throw new Error('الخرائط غير مفعّلة بعد');
  const coords = `${from[0].toFixed(6)},${from[1].toFixed(6)};${to[0].toFixed(6)},${to[1].toFixed(6)}`;
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coords}`
    + `?geometries=geojson&overview=full&steps=true&language=ar&alternatives=false&access_token=${encodeURIComponent(token)}`;
  let res: Response;
  try {
    res = await fetch(url, { signal, referrerPolicy: 'strict-origin' });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new Error('تعذّر الاتصال بخدمة المسارات، تحقق من الإنترنت');
  }
  const data = await res.json().catch(() => null) as {
    code?: string; message?: string;
    routes?: { distance: number; duration: number; geometry: LineString; legs: { steps: { distance: number; maneuver: { instruction: string } }[] }[] }[];
  } | null;
  const route = data?.routes?.[0];
  if (!res.ok || !route) throw new Error(data?.code === 'NoRoute' ? 'لا يوجد طريق بالسيارة إلى هذا الموقع' : 'تعذّر حساب المسار');
  return {
    distance: route.distance,
    duration: route.duration,
    geometry: route.geometry,
    steps: route.legs.flatMap((l) => l.steps.map((s) => ({ text: s.maneuver.instruction, distance: s.distance }))),
  };
}

export const formatDistance = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} م` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} كم`);
export const formatDuration = (s: number) => {
  const min = Math.max(1, Math.round(s / 60));
  return min < 60 ? `${min} دقيقة` : `${Math.floor(min / 60)} س ${min % 60} د`;
};

/** Straight-line distance in metres (used offline, when no route can be fetched). */
export function straightDistance(a: [number, number], b: [number, number]) {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** The phone's position, as [lng, lat]. */
export function myPosition(): Promise<[number, number]> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('هذا الجهاز لا يدعم تحديد الموقع')); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve([p.coords.longitude, p.coords.latitude]),
      (e) => reject(new Error(e.code === e.PERMISSION_DENIED
        ? 'اسمح للتطبيق بالوصول إلى الموقع من إعدادات الهاتف'
        : 'تعذّر تحديد موقعك، حاول مرة أخرى')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  });
}

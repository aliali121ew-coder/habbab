import { api } from '../../api';
import { BABIL_DISTRICTS, BABIL_PROVINCE, HASHIMIYAH_DISTRICT, HASHIMIYAH_NEIGHBORHOODS, PROVINCE_LIST } from './locations';

export type MapPlaceCategory = 'family' | 'landmark' | 'mosque' | 'health' | 'office';

export interface MapPlace {
  id: number;
  name: string;
  category: MapPlaceCategory;
  lat: number;
  lng: number;
  phone: string;
  note: string;
  status: 'pending' | 'approved';
  createdBy: number;
  createdByName: string;
  createdAt: string;
  approvedAt: string | null;
}

export interface PlaceCategoryMeta {
  id: MapPlaceCategory;
  label: string;
  color: string;
  svg: string;
}

export const PLACE_CATEGORIES: PlaceCategoryMeta[] = [
  {
    id: 'family',
    label: 'بيت عائلة',
    color: '#7c3aed',
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/><path d="M9.5 20v-6h5v6"/></svg>',
  },
  {
    id: 'landmark',
    label: 'نقطة دالة',
    color: '#2563eb',
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-6.2 7-11.5a7 7 0 1 0-14 0C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
  },
  {
    id: 'mosque',
    label: 'جامع / حسينية',
    color: '#0f8a5f',
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c2.5 2.5 5 4.8 5 8H7c0-3.2 2.5-5.5 5-8z"/><path d="M5 11v9h14v-9"/><path d="M10 20v-4a2 2 0 1 1 4 0v4"/></svg>',
  },
  {
    id: 'health',
    label: 'مركز صحي / صيدلية',
    color: '#e11d48',
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>',
  },
  {
    id: 'office',
    label: 'مقر / نقطة توزيع',
    color: '#d97706',
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 9h1M14 9h1M9 13h1M14 13h1M10 20v-3h4v3"/></svg>',
  },
];

export const PLACE_META = new Map(PLACE_CATEGORIES.map((c) => [c.id, c]));

const CACHE_KEY = 'ahbab:map-places:v1';

export function loadCachedPlaces(): MapPlace[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCachedPlaces(places: MapPlace[]) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(places)); } catch { /* quota */ }
}

export async function fetchMapPlaces(): Promise<MapPlace[]> {
  const { places } = await api<{ places: MapPlace[] }>('/map-places');
  saveCachedPlaces(places);
  return places;
}

export async function createMapPlace(input: {
  name: string;
  category: MapPlaceCategory;
  lat: number;
  lng: number;
  phone?: string;
  note?: string;
}): Promise<MapPlace> {
  const { place } = await api<{ place: MapPlace }>('/map-places', { method: 'POST', body: input });
  return place;
}

export async function approveMapPlace(id: number): Promise<MapPlace> {
  const { place } = await api<{ place: MapPlace }>(`/map-places/${id}/approve`, { method: 'POST' });
  return place;
}

export async function deleteMapPlace(id: number): Promise<void> {
  await api(`/map-places/${id}`, { method: 'DELETE' });
}

/** Builds a crisp landmark-style DOM marker (colored icon pill + Arabic label underneath). */
export function createPlaceMarkerEl(place: MapPlace, onClick: () => void): HTMLButtonElement {
  const meta = PLACE_META.get(place.category) ?? PLACE_CATEGORIES[1];
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `rq-place-pin${place.status === 'pending' ? ' is-pending' : ''}`;
  el.style.setProperty('--place-color', meta.color);
  el.setAttribute('aria-label', `${place.name} — ${meta.label}`);

  const badge = document.createElement('span');
  badge.className = 'rq-place-ic';
  badge.innerHTML = meta.svg;

  const label = document.createElement('span');
  label.className = 'rq-place-lbl';
  label.textContent = place.name;

  el.appendChild(badge);
  el.appendChild(label);
  el.addEventListener('click', (ev) => {
    ev.stopPropagation();
    onClick();
  });
  return el;
}

export interface MapSearchResult {
  key: string;
  group: 'place' | 'family' | 'area';
  title: string;
  subtitle: string;
  lat: number;
  lng: number;
  zoom: number;
  placeId?: number;
  requestId?: number;
}

const normalize = (s: string) => s.trim().toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');

const HASHIMIYAH_CENTER = BABIL_DISTRICTS.find((d) => d.name === HASHIMIYAH_DISTRICT) ?? { lat: 32.3523, lng: 44.6067 };

/** Instant local search across saved places, open request families, and Iraqi areas/districts. */
export function searchLocalAreas(query: string): MapSearchResult[] {
  const q = normalize(query);
  if (!q) return [];
  const out: MapSearchResult[] = [];
  for (const p of PROVINCE_LIST) {
    if (normalize(p.name).includes(q)) {
      out.push({ key: `prov:${p.name}`, group: 'area', title: p.name, subtitle: 'محافظة', lat: p.lat, lng: p.lng, zoom: p.zoom ?? 11.5 });
    }
  }
  for (const d of BABIL_DISTRICTS) {
    if (normalize(d.name).includes(q)) {
      out.push({ key: `dist:${d.name}`, group: 'area', title: d.name, subtitle: `محافظة ${BABIL_PROVINCE}`, lat: d.lat, lng: d.lng, zoom: 13.5 });
    }
  }
  for (const n of HASHIMIYAH_NEIGHBORHOODS) {
    if (normalize(n).includes(q)) {
      out.push({ key: `nb:${n}`, group: 'area', title: n, subtitle: `${HASHIMIYAH_DISTRICT} · ${BABIL_PROVINCE}`, lat: HASHIMIYAH_CENTER.lat, lng: HASHIMIYAH_CENTER.lng, zoom: 15 });
    }
  }
  return out.slice(0, 6);
}

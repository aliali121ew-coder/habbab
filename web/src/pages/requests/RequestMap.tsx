import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowRight, ArrowUp, Bookmark, BookmarkPlus, Box, Check, Clock, CloudDownload, Trash2, CornerUpLeft, CornerUpRight, Crosshair, Flag, Gauge, ListOrdered,
  LoaderCircle, LocateFixed, MapPin, Minus, Navigation, Phone, Plus, Route as RouteIcon, Search, Undo2, Volume2, VolumeX, X,
} from 'lucide-react';
import {
  createMap, formatDistance, formatDuration, geocodeIraq, mapboxgl, precisePosition, prepareMapbox, roadRoute, straightDistance,
} from '../../maps/mapbox';
import { bearing, keepAwake, progress, speak, track, turnArrow, type Progress, type Track } from '../../maps/navigation';
import {
  availableMaps, downloadMap, formatSize, nearestSaved, offlineSupported, PROVINCES, removeMap, savedMaps,
  type Available, type Saved,
} from '../../maps/offline';
import { nearestProvince } from './locations';
import {
  approveMapPlace, createMapPlace, createPlaceMarkerEl, deleteMapPlace, fetchMapPlaces, loadCachedPlaces,
  PLACE_CATEGORIES, PLACE_META, searchLocalAreas,
  type MapPlace, type MapPlaceCategory, type MapSearchResult,
} from './mapPlaces';

// The offline map (MapLibre + the saved province) loads only when the internet is gone.
const OfflineRequestsMap = lazy(() => import('./OfflineMap').then((m) => ({ default: m.OfflineRequestsMap })));

/* Every map of طلبات المساعدة, on Mapbox. Loaded only when a map is on screen.
   - PickMap: the pin stays in the middle and the map moves under it (choosing a request's place).
   - ShowMap: a small still map of one request.
   - RequestsMap: the open requests as pins; a pin shows the family and the request type;
     «المسار» draws the road route, and «ابدأ الملاحة» drives it like Waze: the map follows and
     turns with the car, minutes and metres count down, the next turn is shown and spoken, a
     wrong turn re-routes, and arrival is announced. */

/** Waits for the Mapbox token; `false` while loading, `null` when the site has none yet. */
function useToken(token?: string | null) {
  const [value, setValue] = useState<string | null | false>(false);
  useEffect(() => { let live = true; void prepareMapbox(token).then((t) => live && setValue(t)); return () => { live = false; }; }, [token]);
  return value;
}

function NoMap({ className, text = 'الخريطة غير مفعّلة بعد. أدخل المحافظة والمنطقة يدوياً.' }: { className: string; text?: string }) {
  return (
    <div className={`${className} rq-map-off`}>
      <MapPin size={26} />
      <span>{text}</span>
    </div>
  );
}


// A GPS pin (the same drawing for the pin in the middle of the place picker).
const PIN_SVG = '<svg viewBox="0 0 24 32" aria-hidden="true"><path class="rq-gps-body" d="M12 0C5.4 0 0 5.2 0 11.7 0 20.4 12 32 12 32s12-11.6 12-20.3C24 5.2 18.6 0 12 0z"/><circle class="rq-gps-eye" cx="12" cy="11.5" r="4.6"/></svg>';
function GpsPin({ className }: { className: string }) {
  return <span className={className} aria-hidden dangerouslySetInnerHTML={{ __html: PIN_SVG }} />;
}

/* ───────────── my position: a blue dot (an arrow while driving) and its accuracy circle ───────────── */

const ACC_SOURCE = 'rq-accuracy';

type Feature<G> = { type: 'Feature'; properties: Record<string, never>; geometry: G };

function circle(center: [number, number], metres: number): Feature<{ type: 'Polygon'; coordinates: [number, number][][] }> {
  const pts: [number, number][] = [];
  const dLat = metres / 111320;
  const dLng = metres / (111320 * Math.cos((center[1] * Math.PI) / 180));
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * 2 * Math.PI;
    pts.push([center[0] + dLng * Math.cos(a), center[1] + dLat * Math.sin(a)]);
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [pts] } };
}

class MePuck {
  private marker: mapboxgl.Marker | null = null;
  private el = document.createElement('span');
  private last: { at: [number, number]; accuracy: number } | null = null;
  constructor(private map: mapboxgl.Map) {
    this.el.className = 'rq-me';
    this.el.innerHTML = '<i></i>';
    map.on('style.load', () => this.drawAccuracy());
  }
  set(at: [number, number], accuracy: number, heading?: number | null) {
    this.last = { at, accuracy };
    if (!this.marker) this.marker = new mapboxgl.Marker({ element: this.el, rotationAlignment: 'map' }).setLngLat(at).addTo(this.map);
    else this.marker.setLngLat(at);
    this.el.classList.toggle('heading', heading != null);
    if (heading != null) this.marker.setRotation(heading);
    this.drawAccuracy();
  }
  private drawAccuracy() {
    const m = this.map;
    if (!this.last || !m.isStyleLoaded()) return;
    const data = circle(this.last.at, Math.min(this.last.accuracy, 300));
    const src = m.getSource(ACC_SOURCE) as mapboxgl.GeoJSONSource | undefined;
    if (src) { src.setData(data); return; }
    m.addSource(ACC_SOURCE, { type: 'geojson', data });
    m.addLayer({ id: 'rq-acc-fill', type: 'fill', slot: 'top', source: ACC_SOURCE, paint: { 'fill-color': '#3b82f6', 'fill-opacity': 0.14 } });
    m.addLayer({ id: 'rq-acc-line', type: 'line', slot: 'top', source: ACC_SOURCE, paint: { 'line-color': '#3b82f6', 'line-opacity': 0.45, 'line-width': 1.2 } });
  }
  remove() { this.marker?.remove(); }
}

/** «موقعي»: listens to the GPS until it is precise (or ~9 s), then zooms right in. */
async function locateOn(map: mapboxgl.Map, puck: MePuck, onHint: (t: string) => void) {
  onHint('جارٍ تحديد موقعك بدقة…');
  const fix = await precisePosition(9000, 12);
  puck.set(fix.at, fix.accuracy);
  const zoom = fix.accuracy <= 20 ? 19 : fix.accuracy <= 60 ? 17.5 : 16;
  map.flyTo({ center: fix.at, zoom, speed: 1.4, essential: true });
  onHint(fix.accuracy <= 20 ? `موقعك بدقة ±${Math.round(fix.accuracy)} م` : `دقة الموقع ±${Math.round(fix.accuracy)} م — اخرج إلى مكان مكشوف لدقة أعلى`);
  return fix;
}

/* ───────────── choosing a place ───────────── */

export interface FlyTarget { lat: number; lng: number; zoom: number; seq: number }

export function PickMap({ lat, lng, flyTo, onMove, token }: {
  lat?: number | null; lng?: number | null; token?: string | null;
  flyTo?: FlyTarget | null;
  onMove: (lat: number, lng: number, province: string, zoom: number) => void;
}) {
  const ready = useToken(token);
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const puck = useRef<MePuck | null>(null);
  const moved = useRef(onMove);
  moved.current = onMove;
  const userGesture = useRef(false);
  const appliedSeq = useRef(0);
  const [locating, setLocating] = useState(false);
  const [hint, setHint] = useState('');

  useEffect(() => {
    if (!ready || !box.current) return;
    const has = lat != null && lng != null;
    const initialZoom = flyTo ? flyTo.zoom : has ? 16 : 5.5;
    const initialCenter: [number, number] | undefined = flyTo ? [flyTo.lng, flyTo.lat] : has ? [lng!, lat!] : undefined;
    if (flyTo) appliedSeq.current = flyTo.seq;
    const m = createMap(box.current, { center: initialCenter, zoom: initialZoom, style: 'streets' });
    const markGesture = () => { userGesture.current = true; };
    m.on('dragstart', markGesture);
    m.on('touchstart', markGesture);
    m.on('wheel', markGesture);
    m.on('dblclick', markGesture);
    m.on('moveend', () => {
      if (!userGesture.current) return;
      userGesture.current = false;
      const c = m.getCenter();
      moved.current(c.lat, c.lng, nearestProvince(c.lat, c.lng), m.getZoom());
    });
    map.current = m;
    puck.current = new MePuck(m);
    return () => { puck.current?.remove(); m.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the starting point only
  }, [ready]);

  useEffect(() => {
    const m = map.current;
    if (!m || !flyTo || flyTo.seq === appliedSeq.current) return;
    appliedSeq.current = flyTo.seq;
    userGesture.current = false;
    m.flyTo({ center: [flyTo.lng, flyTo.lat], zoom: flyTo.zoom, speed: 1.5, essential: true });
  }, [flyTo]);

  if (ready === null) return <NoMap className="rq-map-live" />;

  async function locate() {
    if (!map.current || !puck.current) return;
    setLocating(true);
    try {
      const fix = await locateOn(map.current, puck.current, setHint);
      const [fixLng, fixLat] = fix.at;
      const zoom = fix.accuracy <= 20 ? 19 : fix.accuracy <= 60 ? 17.5 : 16;
      userGesture.current = false;
      moved.current(fixLat, fixLng, nearestProvince(fixLat, fixLng), zoom);
    } catch (e) { setHint((e as Error).message); }
    setLocating(false);
  }

  return (
    <div className="rq-map-live">
      <div ref={box} className="rq-map-canvas" />
      <GpsPin className="rq-map-pin" />
      <div className="rq-map-tools">
        <button type="button" onClick={() => map.current?.zoomIn()} aria-label="تكبير"><Plus size={22} /></button>
        <button type="button" onClick={() => map.current?.zoomOut()} aria-label="تصغير"><Minus size={22} /></button>
        <button type="button" className="rq-tool-accent" onClick={locate} aria-label="موقعي" disabled={locating}>
          {locating ? <LoaderCircle size={22} className="rq-spin" /> : <LocateFixed size={22} />}
        </button>
      </div>
      <span className="rq-map-hint">{hint || 'حرّك الخريطة حتى يكون الدبوس على الموقع، أو اضغط «موقعي»'}</span>
    </div>
  );
}

/* ───────────── one request ───────────── */

export function ShowMap({ lat, lng }: { lat: number; lng: number }) {
  const ready = useToken();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ready || !box.current) return;
    const m = createMap(box.current, { center: [lng, lat], zoom: 16.5, style: 'streets', interactive: false });
    return () => { m.remove(); };
  }, [ready, lat, lng]);
  if (ready === null) return null;
  return (
    <div className="rq-map-still">
      <div ref={box} className="rq-map-canvas" />
      <GpsPin className="rq-map-pin" />
    </div>
  );
}

/* ───────────── all open requests, routes and live navigation ───────────── */

export interface MapRequest {
  id: number; name: string; phone: string; kindTitle: string; color: string; lat: number; lng: number;
  priority: 'normal' | 'medium' | 'high'; approved: boolean;
}

/** The pin's state on the map: approved green; waiting red, blinking red for «قصوى» and orange for «متوسطة». */
const pinState = (r: MapRequest) => (r.approved ? 'ok' : r.priority === 'high' ? 'high' : r.priority === 'medium' ? 'mid' : 'wait');
const PIN_LABEL = { ok: 'تمت الموافقة', high: 'أولوية قصوى', mid: 'أولوية متوسطة', wait: 'بانتظار الموافقة' } as const;

const ROUTE_SOURCE = 'rq-route';

function drawLine(map: mapboxgl.Map, coords: [number, number][] | null) {
  if (!map.isStyleLoaded()) return;
  const data: Feature<{ type: 'LineString'; coordinates: [number, number][] }> = { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords ?? [] } };
  const source = map.getSource(ROUTE_SOURCE) as mapboxgl.GeoJSONSource | undefined;
  if (source) { source.setData(data); return; }
  if (!coords) return;
  map.addSource(ROUTE_SOURCE, { type: 'geojson', data });
  map.addLayer({ id: 'rq-route-casing', type: 'line', slot: 'middle', source: ROUTE_SOURCE, layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#1e3a8a', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 7, 18, 18] } });
  map.addLayer({ id: 'rq-route-line', type: 'line', slot: 'middle', source: ROUTE_SOURCE, layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#3b82f6', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 4, 18, 12] } });
}

const ARROWS = {
  right: CornerUpRight, left: CornerUpLeft, 'slight-right': ArrowRight, 'slight-left': ArrowLeft, uturn: Undo2, straight: ArrowUp, arrive: Flag,
} as const;

const clock = (secondsAhead: number) => new Date(Date.now() + secondsAhead * 1000).toLocaleTimeString('ar-IQ-u-nu-latn', { hour: 'numeric', minute: '2-digit' });

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true); const off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online;
}

/** The requests map: Mapbox online; with no internet, the saved province's map. */
export function RequestsMap(props: { items: MapRequest[]; onOpen: (id: number) => void; focus?: number | null; role?: string }) {
  const online = useOnline();
  const [saved, setSaved] = useState<Saved[] | null>(null);
  useEffect(() => { void savedMaps().then(setSaved).catch(() => setSaved([])); }, [online]);
  if (!online && saved && saved.length) {
    const first = props.items[0];
    const slug = nearestSaved(saved, first ? [first.lng, first.lat] : null)!;
    return <Suspense fallback={<div className="rq-map-big" />}><OfflineRequestsMap slug={slug} items={props.items} onOpen={props.onOpen} /></Suspense>;
  }
  if (!online) {
    return <NoMap className="rq-map-big" text="لا يوجد إنترنت. نزّل خريطة محافظتك عندما يتوفر الاتصال لتعمل بدونه." />;
  }
  return <OnlineRequestsMap {...props} onSaved={() => void savedMaps().then(setSaved)} />;
}

/* ───────────── downloading maps for offline use ───────────── */

function DownloadMaps({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [available, setAvailable] = useState<Available[] | null>(null);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [busy, setBusy] = useState<{ slug: string; share: number } | null>(null);
  const [error, setError] = useState('');
  const [space, setSpace] = useState('');

  const refresh = useCallback(async () => {
    setSaved(await savedMaps());
    const est = await navigator.storage?.estimate?.().catch(() => undefined);
    if (est?.quota) setSpace(`المساحة المتاحة للتطبيق: ${formatSize(Math.max(0, est.quota - (est.usage ?? 0)))}`);
  }, []);

  useEffect(() => {
    availableMaps().then(setAvailable).catch((e: Error) => setError(e.message));
    void refresh();
  }, [refresh]);

  async function get(slug: string) {
    setError('');
    setBusy({ slug, share: 0 });
    try {
      await downloadMap(slug, (share) => setBusy({ slug, share }));
      await refresh();
      onSaved();
    } catch (e) { setError((e as Error).message); }
    setBusy(null);
  }

  async function drop(slug: string) {
    await removeMap(slug);
    await refresh();
    onSaved();
  }

  if (!offlineSupported()) return null;
  return (
    <div className="rq-route-card rq-offline-dl" role="dialog" aria-label="تنزيل الخريطة">
      <button type="button" className="rq-route-x" onClick={onClose} aria-label="إغلاق"><X size={18} /></button>
      <strong className="rq-near-title"><CloudDownload size={18} /> تنزيل الخريطة للعمل بدون إنترنت</strong>
      <p className="rq-dl-note">نزّل خريطة محافظتك مرة واحدة على شبكة واي فاي. عند انقطاع الإنترنت تظهر وحدها مع الطلبات وموقعك.</p>
      {error && <p className="rq-route-err" role="alert">{error}</p>}
      {!available ? <p className="rq-dl-note"><LoaderCircle size={14} className="rq-spin" /> جارٍ التحميل…</p> : (
        <ul>
          {PROVINCES.filter((p) => available.some((a) => a.slug === p.slug)).map((p) => {
            const a = available.find((x) => x.slug === p.slug)!;
            const have = saved.find((x) => x.slug === p.slug);
            const running = busy?.slug === p.slug;
            return (
              <li key={p.slug} className={have ? 'have' : ''}>
                <span className="rq-dl-name"><b>{p.name}</b><small>{have ? `محفوظة · ${formatSize(have.size)}` : formatSize(a.size)}</small></span>
                {running ? (
                  <span className="rq-dl-bar" aria-label={`${Math.round(busy!.share * 100)}%`}><i style={{ width: `${Math.round(busy!.share * 100)}%` }} /></span>
                ) : have ? (
                  <button type="button" className="rq-ghost rq-del" onClick={() => drop(p.slug)} disabled={!!busy}><Trash2 size={16} /></button>
                ) : (
                  <button type="button" className="rq-primary" onClick={() => get(p.slug)} disabled={!!busy}><CloudDownload size={16} /> تنزيل</button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {space && <small className="rq-help">{space}</small>}
    </div>
  );
}

interface NavTarget {
  name: string;
  lat: number;
  lng: number;
  phone: string;
}

function OnlineRequestsMap({ items, onOpen, focus, role, onSaved }: { items: MapRequest[]; onOpen: (id: number) => void; focus?: number | null; role?: string; onSaved: () => void }) {
  const isAdmin = role === 'admin';
  const [downloads, setDownloads] = useState(false);
  const ready = useToken();
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const puck = useRef<MePuck | null>(null);
  const markers = useRef<mapboxgl.Marker[]>([]);
  const placeMarkers = useRef<mapboxgl.Marker[]>([]);
  const draftMarker = useRef<mapboxgl.Marker | null>(null);
  const placed = useRef(false);
  const pending = useRef<AbortController | null>(null);
  const trackRef = useRef<Track | null>(null);
  const lineRef = useRef<[number, number][] | null>(null);
  const [selected, setSelected] = useState<MapRequest | null>(null);
  const [places, setPlaces] = useState<MapPlace[]>(() => loadCachedPlaces());
  const [showPlaces, setShowPlaces] = useState(true);
  const [selectedPlace, setSelectedPlace] = useState<MapPlace | null>(null);
  const [pickingPlace, setPickingPlace] = useState(false);
  const pickingRef = useRef(false);
  pickingRef.current = pickingPlace;
  const [draftCoord, setDraftCoord] = useState<{ lat: number; lng: number } | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftCat, setDraftCat] = useState<MapPlaceCategory>('family');
  const [draftPhone, setDraftPhone] = useState('');
  const [draftNote, setDraftNote] = useState('');
  const [savingPlace, setSavingPlace] = useState(false);
  const [placeErr, setPlaceErr] = useState('');
  // Unified map search (saved places + request families + Iraq areas/Mapbox geocoding)
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [geoHits, setGeoHits] = useState<MapSearchResult[]>([]);
  const [geoBusy, setGeoBusy] = useState(false);

  const [trip, setTrip] = useState<Track | null>(null);
  const [straight, setStraight] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [hint, setHint] = useState('');
  const [showSteps, setShowSteps] = useState(false);
  const [is3d, setIs3d] = useState(false);
  const [near, setNear] = useState<{ r: MapRequest; d: number }[] | null>(null);
  // live navigation
  const [driving, setDriving] = useState(false);
  const [live, setLive] = useState<Progress | null>(null);
  const [speed, setSpeed] = useState<number | null>(null);
  const [voice, setVoice] = useState(true);
  const [following, setFollowing] = useState(true);
  const nav = useRef<{ watch: number; release: () => void; seg: number; offCount: number; rerouteAt: number; spoken: Set<string>; last: [number, number] | null; heading: number | null } | null>(null);
  const voiceRef = useRef(voice);
  voiceRef.current = voice;
  const followRef = useRef(following);
  followRef.current = following;

  const activeTarget: NavTarget | null = selected
    ? { name: selected.name, lat: selected.lat, lng: selected.lng, phone: selected.phone }
    : selectedPlace
      ? { name: selectedPlace.name, lat: selectedPlace.lat, lng: selectedPlace.lng, phone: selectedPlace.phone }
      : null;

  const setLine = useCallback((coords: [number, number][] | null) => {
    lineRef.current = coords;
    if (map.current) drawLine(map.current, coords);
  }, []);

  // Load saved map places from server (falls back to cache when offline).
  useEffect(() => {
    let live = true;
    void fetchMapPlaces().then((list) => { if (live) setPlaces(list); }).catch(() => undefined);
    return () => { live = false; };
  }, []);

  // Debounced Mapbox geocoding for Iraqi areas/streets/landmarks when typing in search.
  useEffect(() => {
    const q = searchQ.trim();
    if (!searchOpen || q.length < 2) { setGeoHits([]); setGeoBusy(false); return; }
    const ctrl = new AbortController();
    setGeoBusy(true);
    const timer = window.setTimeout(() => {
      void geocodeIraq(q, ctrl.signal)
        .then((hits) => {
          if (ctrl.signal.aborted) return;
          setGeoHits(hits.map((h) => ({
            key: `geo:${h.id}`,
            group: 'area',
            title: h.name,
            subtitle: h.placeName,
            lat: h.lat,
            lng: h.lng,
            zoom: 15,
          })));
          setGeoBusy(false);
        })
        .catch(() => { if (!ctrl.signal.aborted) { setGeoHits([]); setGeoBusy(false); } });
    }, 300);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [searchQ, searchOpen]);

  // The map itself, once.
  useEffect(() => {
    if (!ready || !box.current) return;
    const m = createMap(box.current, { style: 'streets' });
    m.on('style.load', () => drawLine(m, lineRef.current));
    m.on('click', (ev) => {
      if (nav.current) return;
      if (pickingRef.current) {
        setDraftCoord({ lat: ev.lngLat.lat, lng: ev.lngLat.lng });
        setPlaceErr('');
        return;
      }
      setSelected(null);
      setSelectedPlace(null);
    });
    // A finger on the map while driving: stop following until «إعادة التمركز».
    m.on('dragstart', () => { if (nav.current) setFollowing(false); });
    map.current = m;
    puck.current = new MePuck(m);
    placed.current = false;
    return () => {
      pending.current?.abort();
      if (nav.current) { navigator.geolocation.clearWatch(nav.current.watch); nav.current.release(); nav.current = null; }
      for (const mk of placeMarkers.current) mk.remove();
      placeMarkers.current = [];
      draftMarker.current?.remove();
      draftMarker.current = null;
      puck.current?.remove();
      m.remove();
      map.current = null;
    };
  }, [ready]);

  // Saved places markers (named landmarks & family homes).
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    for (const mk of placeMarkers.current) mk.remove();
    placeMarkers.current = [];
    if (!showPlaces) return;
    placeMarkers.current = places.map((p) => {
      const el = createPlaceMarkerEl(p, () => {
        if (nav.current || pickingRef.current) return;
        choosePlace(p);
      });
      return new mapboxgl.Marker({ element: el, anchor: 'top' }).setLngLat([p.lng, p.lat]).addTo(m);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places, showPlaces, ready]);

  // Temporary marker while picking a new place location.
  useEffect(() => {
    const m = map.current;
    draftMarker.current?.remove();
    draftMarker.current = null;
    if (!m || !draftCoord) return;
    const el = document.createElement('div');
    el.className = 'rq-gps rq-gps-ok';
    el.innerHTML = PIN_SVG;
    draftMarker.current = new mapboxgl.Marker({ element: el, anchor: 'bottom' }).setLngLat([draftCoord.lng, draftCoord.lat]).addTo(m);
  }, [draftCoord, ready]);

  // The pins, whenever the list changes.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    for (const mk of markers.current) mk.remove();
    markers.current = items.map((r) => {
      const state = pinState(r);
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `rq-gps rq-gps-${state}`;
      el.innerHTML = PIN_SVG;
      el.setAttribute('aria-label', `${r.name} — ${r.kindTitle} — ${PIN_LABEL[state]}`);
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (nav.current) return; // while driving, the trip stays on its family
        choose(r);
      });
      return new mapboxgl.Marker({ element: el, anchor: 'bottom' }).setLngLat([r.lng, r.lat]).addTo(m);
    });
    if (placed.current || !items.length) return;
    placed.current = true;
    const focused = focus ? items.find((r) => r.id === focus) : undefined;
    if (focused) {
      m.jumpTo({ center: [focused.lng, focused.lat], zoom: 16 });
      setSelected(focused);
    } else {
      const bounds = new mapboxgl.LngLatBounds();
      for (const r of items) bounds.extend([r.lng, r.lat]);
      m.fitBounds(bounds, { padding: { top: 70, bottom: 70, left: 90, right: 50 }, maxZoom: 15, duration: 0 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- choose only sets state
  }, [items, ready, focus]);

  // A request that left the list (delivered, refused) ends its trip.
  useEffect(() => {
    if (selected && !items.some((r) => r.id === selected.id)) { stopDriving(); clearTrip(); setSelected(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  if (ready === null) return <NoMap className="rq-map-big" text="الخريطة تعمل بعد إضافة مفتاح Mapbox للموقع." />;

  function clearTrip() { pending.current?.abort(); trackRef.current = null; setTrip(null); setLive(null); setStraight(null); setLine(null); }

  function choose(r: MapRequest) {
    clearTrip();
    setSelectedPlace(null);
    setSelected(r); setError(''); setBusy(false); setNear(null);
  }

  function choosePlace(p: MapPlace) {
    clearTrip();
    setSelected(null);
    setSelectedPlace(p); setError(''); setBusy(false); setNear(null);
  }

  function startPickPlace() {
    clearTrip();
    setSelected(null); setSelectedPlace(null); setNear(null); setDownloads(false); setSearchOpen(false);
    setPickingPlace(true); setDraftCoord(null); setDraftName(''); setDraftCat('family'); setDraftPhone(''); setDraftNote(''); setPlaceErr('');
  }

  function cancelPickPlace() {
    setPickingPlace(false); setDraftCoord(null); setPlaceErr('');
  }

  async function useCurrentPosForPlace() {
    setPlaceErr(''); setBusy(true);
    try {
      const fix = await precisePosition(6000, 20);
      puck.current?.set(fix.at, fix.accuracy);
      setDraftCoord({ lat: fix.at[1], lng: fix.at[0] });
      map.current?.flyTo({ center: fix.at, zoom: 17 });
    } catch (e) { setPlaceErr((e as Error).message); }
    setBusy(false);
  }

  async function saveNewPlace(ev: React.FormEvent) {
    ev.preventDefault();
    if (!draftCoord || !draftName.trim()) { setPlaceErr('أدخل اسم النقطة واختر موقعها على الخريطة'); return; }
    setSavingPlace(true); setPlaceErr('');
    try {
      const created = await createMapPlace({
        name: draftName.trim(),
        category: draftCat,
        lat: draftCoord.lat,
        lng: draftCoord.lng,
        phone: draftPhone.trim() || undefined,
        note: draftNote.trim() || undefined,
      });
      setPlaces((prev) => [created, ...prev]);
      setShowPlaces(true);
      setPickingPlace(false);
      setDraftCoord(null);
      map.current?.flyTo({ center: [created.lng, created.lat], zoom: 16.5 });
      setHint(created.status === 'approved' ? 'تم اعتماد النقطة وحفظها على الخريطة' : 'تم إرسال النقطة — بانتظار اعتماد المدير');
    } catch (e) {
      setPlaceErr((e as Error).message);
    } finally {
      setSavingPlace(false);
    }
  }

  async function handleApprovePlace(p: MapPlace) {
    setBusy(true); setError('');
    try {
      const updated = await approveMapPlace(p.id);
      setPlaces((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      setSelectedPlace(updated);
      setHint(`تم اعتماد «${updated.name}» على الخريطة`);
    } catch (e) { setError((e as Error).message); }
    setBusy(false);
  }

  async function handleDeletePlace(p: MapPlace) {
    if (!window.confirm(`حذف «${p.name}» من الخريطة؟`)) return;
    setBusy(true); setError('');
    try {
      await deleteMapPlace(p.id);
      setPlaces((prev) => prev.filter((x) => x.id !== p.id));
      clearTrip();
      setSelectedPlace(null);
    } catch (e) { setError((e as Error).message); }
    setBusy(false);
  }

  async function locate() {
    if (!map.current || !puck.current) return;
    setBusy(true); setError('');
    try { await locateOn(map.current, puck.current, setHint); } catch (e) { setHint(''); setError((e as Error).message); }
    setBusy(false);
  }

  async function routeFrom(from: [number, number], to: NavTarget, signal: AbortSignal) {
    const found = await roadRoute(from, [to.lng, to.lat], signal);
    if (signal.aborted) return null;
    const t = track(found);
    trackRef.current = t;
    setTrip(t);
    setLine(t.coords);
    return t;
  }

  async function routeTo(target: NavTarget) {
    pending.current?.abort();
    const ask = new AbortController();
    pending.current = ask;
    setBusy(true); setError(''); setShowSteps(false);
    try {
      const fix = await precisePosition(4000, 30);
      if (ask.signal.aborted) return;
      puck.current?.set(fix.at, fix.accuracy);
      setStraight(straightDistance(fix.at, [target.lng, target.lat]));
      const t = await routeFrom(fix.at, target, ask.signal);
      if (!t) return;
      const bounds = new mapboxgl.LngLatBounds(fix.at, fix.at);
      for (const c of t.coords) bounds.extend(c);
      map.current?.fitBounds(bounds, { padding: { top: 80, bottom: 260, left: 70, right: 50 }, maxZoom: 17 });
    } catch (e) {
      if (ask.signal.aborted) return;
      clearTrip();
      setError(navigator.onLine ? (e as Error).message : 'لا يوجد إنترنت: المسار يحتاج اتصالاً');
    } finally {
      if (!ask.signal.aborted) setBusy(false);
    }
  }

  // ── live navigation ──
  async function startDriving() {
    const target = activeTarget;
    if (!target || !trackRef.current || !navigator.geolocation) return;
    const release = await keepAwake();
    setDriving(true); setFollowing(true); setShowSteps(false); setNear(null);
    const first = trackRef.current.route.steps[0];
    if (voiceRef.current) speak(`انطلق إلى ${target.name}. ${first?.text ?? ''}`);
    const state = { watch: 0, release, seg: 0, offCount: 0, rerouteAt: 0, spoken: new Set<string>(), last: null as [number, number] | null, heading: null as number | null };
    nav.current = state;
    map.current?.easeTo({ pitch: 60, zoom: 17, duration: 800 });
    state.watch = navigator.geolocation.watchPosition(
      (p) => onFix(target, p),
      (e) => setError(e.code === e.PERMISSION_DENIED ? 'اسمح للتطبيق بالوصول إلى الموقع من إعدادات الهاتف' : 'ضعُف إشارة الموقع… تحرّك إلى مكان مكشوف'),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 },
    );
  }

  function stopDriving() {
    const n = nav.current;
    if (!n) return;
    navigator.geolocation.clearWatch(n.watch);
    n.release();
    nav.current = null;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setDriving(false); setSpeed(null);
    map.current?.easeTo({ pitch: is3d ? 60 : 0, bearing: 0, duration: 700 });
  }

  function onFix(r: NavTarget, p: GeolocationPosition) {
    const n = nav.current;
    const t = trackRef.current;
    if (!n || !t) return;
    const at: [number, number] = [p.coords.longitude, p.coords.latitude];
    // Heading: the phone's own when moving, else from the last two fixes.
    let heading = p.coords.heading != null && !Number.isNaN(p.coords.heading) && (p.coords.speed ?? 0) > 1 ? p.coords.heading : null;
    if (heading == null && n.last && straightDistance(n.last, at) > 4) heading = bearing(n.last, at);
    if (heading != null) n.heading = heading;
    if (!n.last || straightDistance(n.last, at) > 4) n.last = at;
    setSpeed(p.coords.speed != null && p.coords.speed >= 0 ? p.coords.speed * 3.6 : null);
    puck.current?.set(at, p.coords.accuracy, n.heading);

    const pr = progress(t, at, n.seg);
    n.seg = pr.snap.segment;
    setLive(pr);
    setLine(pr.ahead);
    if (followRef.current) {
      map.current?.easeTo({ center: pr.snap.off < 30 ? pr.snap.point : at, bearing: n.heading ?? map.current.getBearing(), pitch: 60, zoom: 17.2, duration: 900, essential: true });
    }

    if (pr.arrived) {
      if (voiceRef.current) speak(`وصلت إلى ${r.name}`);
      setHint(`وصلت إلى ${r.name}`);
      stopDriving();
      return;
    }

    // The turn ahead, said once at ~300 m and again close to it.
    if (pr.next && voiceRef.current) {
      const key = `${pr.next.at.join(',')}`;
      if (pr.toNext < 320 && pr.toNext > 120 && !n.spoken.has(`${key}:far`)) {
        n.spoken.add(`${key}:far`);
        speak(`بعد ${formatDistance(pr.toNext)}، ${pr.next.text}`);
      } else if (pr.toNext <= 60 && !n.spoken.has(`${key}:near`)) {
        n.spoken.add(`${key}:near`);
        speak(pr.next.text);
      }
    }

    // Off the route for a few fixes → a new route from here (at most every 12 s).
    const tooFar = pr.snap.off > Math.max(45, p.coords.accuracy * 1.5);
    n.offCount = tooFar ? n.offCount + 1 : 0;
    if (n.offCount >= 3 && Date.now() - n.rerouteAt > 12000 && navigator.onLine) {
      n.rerouteAt = Date.now();
      n.offCount = 0;
      n.seg = 0;
      n.spoken.clear();
      if (voiceRef.current) speak('جارٍ إعادة حساب المسار');
      pending.current?.abort();
      const ask = new AbortController();
      pending.current = ask;
      void routeFrom(at, r, ask.signal).catch(() => undefined);
    }
  }

  async function nearestFirst() {
    setBusy(true); setError('');
    try {
      const fix = await precisePosition(4000, 40);
      puck.current?.set(fix.at, fix.accuracy);
      setNear(items.map((r) => ({ r, d: straightDistance(fix.at, [r.lng, r.lat]) })).sort((a, b) => a.d - b.d).slice(0, 12));
      setSelected(null); clearTrip();
    } catch (e) { setError((e as Error).message); }
    setBusy(false);
  }

  function toggle3d() {
    const m = map.current;
    if (!m) return;
    const next = !is3d;
    setIs3d(next);
    if (next) m.easeTo({ pitch: 62, bearing: m.getBearing() || -20, zoom: Math.max(m.getZoom(), 16.5), duration: 900 });
    else m.easeTo({ pitch: 0, bearing: 0, duration: 700 });
  }

  // Unified search across saved map places, open request families, and Iraqi areas + Mapbox geocoding.
  const qNorm = searchQ.trim().toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
  const localPlaceHits: MapSearchResult[] = qNorm
    ? places
        .filter((p) => `${p.name} ${p.note} ${p.phone}`.toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').includes(qNorm))
        .slice(0, 8)
        .map((p) => ({
          key: `place:${p.id}`,
          group: 'place',
          title: p.name,
          subtitle: `${PLACE_META.get(p.category)?.label ?? 'نقطة'}${p.status === 'pending' ? ' · بانتظار الاعتماد' : ''}`,
          lat: p.lat,
          lng: p.lng,
          zoom: 16.5,
          placeId: p.id,
        }))
    : places.slice(0, 6).map((p) => ({
        key: `place:${p.id}`,
        group: 'place',
        title: p.name,
        subtitle: `${PLACE_META.get(p.category)?.label ?? 'نقطة'}${p.status === 'pending' ? ' · بانتظار الاعتماد' : ''}`,
        lat: p.lat,
        lng: p.lng,
        zoom: 16.5,
        placeId: p.id,
      }));

  const familyHits: MapSearchResult[] = qNorm
    ? items
        .filter((r) => `${r.name} ${r.kindTitle} ${r.phone}`.toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').includes(qNorm))
        .slice(0, 8)
        .map((r) => ({
          key: `req:${r.id}`,
          group: 'family',
          title: r.name,
          subtitle: `${r.kindTitle} · ${PIN_LABEL[pinState(r)]}`,
          lat: r.lat,
          lng: r.lng,
          zoom: 16.5,
          requestId: r.id,
        }))
    : [];

  const localAreaHits = qNorm ? searchLocalAreas(searchQ) : [];
  const areaHits = [...localAreaHits, ...geoHits.filter((g) => !localAreaHits.some((a) => a.title === g.title))].slice(0, 6);

  function pickSearchResult(hit: MapSearchResult) {
    setSearchOpen(false);
    setPickingPlace(false);
    setDraftCoord(null);
    map.current?.flyTo({ center: [hit.lng, hit.lat], zoom: hit.zoom });
    if (hit.placeId) {
      const p = places.find((x) => x.id === hit.placeId);
      if (p) { setShowPlaces(true); choosePlace(p); }
    } else if (hit.requestId) {
      const r = items.find((x) => x.id === hit.requestId);
      if (r) choose(r);
    } else {
      setHint(hit.title);
    }
  }

  const route = trip?.route ?? null;
  const left = live?.left ?? route?.distance ?? 0;
  const secondsLeft = live?.secondsLeft ?? route?.duration ?? 0;
  const next = live?.next ?? route?.steps[1] ?? null;
  const Arrow = ARROWS[turnArrow(next)];
  const pendingCount = places.filter((p) => p.status === 'pending').length;

  return (
    <div className={`rq-map-big${driving ? ' driving' : ''}${pickingPlace ? ' is-picking' : ''}`}>
      <div ref={box} className="rq-map-canvas" />

      {/* ── Unified search bar (areas, saved places, families) ── */}
      {!driving && searchOpen && (
        <div className="rq-map-search" role="search" aria-label="بحث في الخريطة">
          <div className="rq-map-search-box">
            <Search size={17} aria-hidden />
            <input
              type="search"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="ابحث عن منطقة، نقطة معتمدة، أو عائلة…"
              autoFocus
            />
            {searchQ && (
              <button type="button" className="rq-search-clear" onClick={() => setSearchQ('')} aria-label="مسح"><X size={15} /></button>
            )}
            <button type="button" className="rq-search-close" onClick={() => setSearchOpen(false)} aria-label="إغلاق البحث">إغلاق</button>
          </div>
          <div className="rq-map-search-list">
            {localPlaceHits.length > 0 && (
              <div className="rq-search-sec">
                <small>{qNorm ? 'النقاط المعتمدة' : 'آخر النقاط المضافة'}</small>
                {localPlaceHits.map((hit) => (
                  <button key={hit.key} type="button" onClick={() => pickSearchResult(hit)}>
                    <Bookmark size={15} aria-hidden />
                    <span><b>{hit.title}</b><small>{hit.subtitle}</small></span>
                  </button>
                ))}
              </div>
            )}
            {familyHits.length > 0 && (
              <div className="rq-search-sec">
                <small>العوائل والطلبات على الخريطة</small>
                {familyHits.map((hit) => (
                  <button key={hit.key} type="button" onClick={() => pickSearchResult(hit)}>
                    <MapPin size={15} aria-hidden />
                    <span><b>{hit.title}</b><small>{hit.subtitle}</small></span>
                  </button>
                ))}
              </div>
            )}
            {(areaHits.length > 0 || geoBusy) && (
              <div className="rq-search-sec">
                <small>المناطق والأحياء {geoBusy ? '· جارٍ البحث…' : ''}</small>
                {areaHits.map((hit) => (
                  <button key={hit.key} type="button" onClick={() => pickSearchResult(hit)}>
                    <Search size={15} aria-hidden />
                    <span><b>{hit.title}</b><small>{hit.subtitle}</small></span>
                  </button>
                ))}
              </div>
            )}
            {qNorm && !localPlaceHits.length && !familyHits.length && !areaHits.length && !geoBusy && (
              <p className="rq-search-empty">لا توجد نتائج مطابقة لـ «{searchQ}»</p>
            )}
          </div>
        </div>
      )}

      {/* ── Pick-location banner when adding a new saved place ── */}
      {!driving && pickingPlace && !draftCoord && (
        <div className="rq-pick-banner" role="status">
          <span>اضغط على الموقع في الخريطة لتثبيت النقطة</span>
          <div className="rq-pick-banner-act">
            <button type="button" className="rq-primary" onClick={useCurrentPosForPlace} disabled={busy}>
              {busy ? <LoaderCircle size={15} className="rq-spin" /> : <LocateFixed size={15} />} موقعي الحالي
            </button>
            <button type="button" className="rq-ghost" onClick={cancelPickPlace}>إلغاء</button>
          </div>
          {placeErr && <p className="rq-route-err" role="alert">{placeErr}</p>}
        </div>
      )}

      {!driving && (
        <div className="rq-map-tools">
          <button
            type="button"
            onClick={() => { setSearchOpen((v) => !v); setDownloads(false); setNear(null); }}
            aria-label="بحث عن منطقة أو نقطة أو عائلة"
            title="بحث عن منطقة أو نقطة أو عائلة"
            className={searchOpen ? 'on' : ''}
          >
            <Search size={20} />
          </button>
          <button
            type="button"
            onClick={() => (pickingPlace ? cancelPickPlace() : startPickPlace())}
            aria-label="إضافة نقطة أو عائلة على الخريطة"
            title="إضافة نقطة أو عائلة على الخريطة"
            className={pickingPlace ? 'on' : ''}
          >
            <BookmarkPlus size={20} />
          </button>
          <button
            type="button"
            onClick={() => setShowPlaces((v) => !v)}
            aria-label={showPlaces ? 'إخفاء النقاط المحفوظة' : 'إظهار النقاط المحفوظة'}
            title={showPlaces ? 'إخفاء النقاط المحفوظة' : 'إظهار النقاط المحفوظة'}
            className={showPlaces ? 'on' : ''}
          >
            <Bookmark size={20} />
            {isAdmin && pendingCount > 0 && <i className="rq-tool-dot" aria-label={`${pendingCount} بانتظار الاعتماد`} />}
          </button>
          <button type="button" onClick={toggle3d} aria-label={is3d ? 'عرض مسطح' : 'عرض ثلاثي الأبعاد'} className={is3d ? 'on' : ''}><Box size={21} /></button>
          <button type="button" onClick={() => map.current?.zoomIn()} aria-label="تكبير"><Plus size={22} /></button>
          <button type="button" onClick={() => map.current?.zoomOut()} aria-label="تصغير"><Minus size={22} /></button>
          <button type="button" onClick={nearestFirst} aria-label="الأقرب إليّ" title="الأقرب إليّ" disabled={busy}><ListOrdered size={21} /></button>
          <button type="button" onClick={() => { setDownloads(true); setSelected(null); setSelectedPlace(null); setNear(null); setSearchOpen(false); }} aria-label="تنزيل الخريطة" title="تنزيل الخريطة"><CloudDownload size={21} /></button>
          <button type="button" className="rq-tool-accent" onClick={locate} aria-label="موقعي" disabled={busy}>
            {busy && !activeTarget ? <LoaderCircle size={22} className="rq-spin" /> : <LocateFixed size={22} />}
          </button>
        </div>
      )}

      {!items.length && !places.length && !pickingPlace && <span className="rq-map-hint">لا توجد طلبات مفتوحة لها موقع على الخريطة</span>}
      {hint && !driving && !pickingPlace && <button type="button" className="rq-map-hint rq-hint-btn" onClick={() => setHint('')}>{hint}</button>}

      {/* ── driving: the next turn on top, what is left at the bottom ── */}
      {driving && route && (
        <>
          <div className="rq-nav-turn" role="status" aria-live="polite">
            <span className="rq-nav-arrow"><Arrow size={34} /></span>
            <div>
              <b>{formatDistance(live?.toNext ?? next?.distance ?? 0)}</b>
              <span>{next?.text ?? 'تابع على المسار'}</span>
            </div>
          </div>
          {!following && (
            <button type="button" className="rq-nav-recenter" onClick={() => setFollowing(true)}><Navigation size={18} /> إعادة التمركز</button>
          )}
          <div className="rq-nav-bar">
            <div className="rq-nav-figs">
              <span className="rq-nav-min"><b>{formatDuration(secondsLeft)}</b><small>الوصول {clock(secondsLeft)}</small></span>
              <span><b>{formatDistance(left)}</b><small>متبقٍ</small></span>
              <span><b>{speed != null ? Math.round(speed) : '–'}</b><small><Gauge size={12} /> كم/س</small></span>
            </div>
            <div className="rq-nav-actions">
              <button type="button" className="rq-ghost" onClick={() => setVoice((v) => !v)} aria-label={voice ? 'كتم الصوت' : 'تشغيل الصوت'}>
                {voice ? <Volume2 size={19} /> : <VolumeX size={19} />}
              </button>
              {activeTarget?.phone && <a className="rq-ghost" href={`tel:${activeTarget.phone}`} aria-label="اتصال"><Phone size={19} /></a>}
              <button type="button" className="rq-danger" onClick={stopDriving}>إنهاء</button>
            </div>
            {error && <p className="rq-route-err" role="alert">{error}</p>}
          </div>
        </>
      )}

      {downloads && !driving && <DownloadMaps onClose={() => setDownloads(false)} onSaved={onSaved} />}

      {/* ── Add new saved place form card ── */}
      {!driving && pickingPlace && draftCoord && (
        <form className="rq-route-card rq-add-place" onSubmit={saveNewPlace} role="dialog" aria-label="إضافة نقطة على الخريطة">
          <button type="button" className="rq-route-x" onClick={cancelPickPlace} aria-label="إغلاق"><X size={18} /></button>
          <strong className="rq-near-title"><BookmarkPlus size={18} /> إضافة نقطة معتمدة على الخريطة</strong>
          <label className="rq-add-field">
            <span>الاسم (عائلة، معلم، حسينية، صيدلية…)</span>
            <input type="text" value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder="مثلاً: بيت عائلة أبو علي" required autoFocus />
          </label>
          <div className="rq-cat-pills" role="radiogroup" aria-label="التصنيف">
            {PLACE_CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                className={draftCat === c.id ? 'on' : ''}
                style={{ ['--place-color' as string]: c.color }}
                onClick={() => setDraftCat(c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>
          <div className="rq-add-row">
            <input type="tel" dir="ltr" value={draftPhone} onChange={(e) => setDraftPhone(e.target.value)} placeholder="رقم الهاتف (اختياري)" />
            <input type="text" value={draftNote} onChange={(e) => setDraftNote(e.target.value)} placeholder="ملاحظة أو وصف (اختياري)" />
          </div>
          {placeErr && <p className="rq-route-err" role="alert">{placeErr}</p>}
          <div className="rq-route-actions">
            <button type="submit" className="rq-primary" disabled={savingPlace || !draftName.trim()}>
              {savingPlace ? <LoaderCircle size={17} className="rq-spin" /> : <Check size={17} />}
              {isAdmin ? 'حفظ واعتماد على الخريطة' : 'إرسال للاعتماد'}
            </button>
            <button type="button" className="rq-ghost" onClick={() => setDraftCoord(null)}>تغيير الموقع</button>
          </div>
        </form>
      )}

      {/* ── Selected saved place: route, navigate, approve or delete ── */}
      {selectedPlace && !driving && (() => {
        const meta = PLACE_META.get(selectedPlace.category) ?? PLACE_CATEGORIES[1];
        return (
          <div className="rq-route-card" role="dialog" aria-label={selectedPlace.name}>
            <button type="button" className="rq-route-x" onClick={() => { clearTrip(); setBusy(false); setSelectedPlace(null); }} aria-label="إغلاق"><X size={18} /></button>
            <div className="rq-route-who">
              <span className="rq-route-dot" style={{ ['--pin' as string]: meta.color }} />
              <div>
                <strong>{selectedPlace.name}</strong>
                <small>
                  {meta.label}
                  {selectedPlace.status === 'pending' ? ' · بانتظار اعتماد المدير' : ' · معتمدة على الخريطة'}
                  {selectedPlace.createdByName ? ` · أضافها ${selectedPlace.createdByName}` : ''}
                </small>
              </div>
            </div>
            {selectedPlace.note && <p className="rq-route-note">{selectedPlace.note}</p>}

            {route && (
              <div className="rq-route-figs">
                <span><b>{formatDuration(route.duration)}</b><small><Clock size={13} /> الوصول {clock(route.duration)}</small></span>
                <span><b>{formatDistance(route.distance)}</b><small><RouteIcon size={13} /> بالطريق</small></span>
              </div>
            )}
            {!route && straight !== null && <p className="rq-route-note">المسافة المباشرة {formatDistance(straight)}</p>}
            {error && <p className="rq-route-err" role="alert">{error}</p>}

            {route && showSteps && (
              <ol className="rq-steps">
                {route.steps.map((s, i) => <li key={i}><span>{s.text}</span><small>{formatDistance(s.distance)}</small></li>)}
              </ol>
            )}

            <div className="rq-route-actions">
              {route ? (
                <button type="button" className="rq-primary rq-go" onClick={startDriving}><Navigation size={18} /> ابدأ الملاحة</button>
              ) : (
                <button type="button" className="rq-primary" onClick={() => routeTo({ name: selectedPlace.name, lat: selectedPlace.lat, lng: selectedPlace.lng, phone: selectedPlace.phone })} disabled={busy}>
                  {busy ? <LoaderCircle size={18} className="rq-spin" /> : <RouteIcon size={18} />} المسار
                </button>
              )}
              {route && <button type="button" className="rq-ghost" onClick={() => setShowSteps((v) => !v)}>{showSteps ? 'إخفاء' : 'الاتجاهات'}</button>}
              {selectedPlace.phone && <a className="rq-ghost" href={`tel:${selectedPlace.phone}`} aria-label="اتصال"><Phone size={18} /></a>}
              <a className="rq-ghost" href={`https://waze.com/ul?ll=${selectedPlace.lat},${selectedPlace.lng}&navigate=yes`} target="_blank" rel="noopener noreferrer">Waze</a>
              {isAdmin && selectedPlace.status === 'pending' && (
                <button type="button" className="rq-primary rq-go" onClick={() => handleApprovePlace(selectedPlace)} disabled={busy}>
                  <Check size={17} /> اعتماد
                </button>
              )}
              {(isAdmin || selectedPlace.status === 'pending') && (
                <button type="button" className="rq-ghost rq-del" onClick={() => handleDeletePlace(selectedPlace)} disabled={busy} aria-label="حذف النقطة">
                  <Trash2 size={17} />
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── the nearest requests to me ── */}
      {near && !driving && (
        <div className="rq-route-card rq-near" role="dialog" aria-label="الأقرب إليّ">
          <button type="button" className="rq-route-x" onClick={() => setNear(null)} aria-label="إغلاق"><X size={18} /></button>
          <strong className="rq-near-title"><ListOrdered size={18} /> الأقرب إليك</strong>
          <ol>
            {near.map(({ r, d }) => (
              <li key={r.id}>
                <button type="button" onClick={() => { choose(r); map.current?.flyTo({ center: [r.lng, r.lat], zoom: 16 }); }}>
                  <span className={`rq-near-dot rq-gps-${pinState(r)}`} />
                  <span className="rq-near-name"><b>{r.name}</b><small>{r.kindTitle}</small></span>
                  <span className="rq-near-d">{formatDistance(d)}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* ── one family: route, then «ابدأ الملاحة» ── */}
      {selected && !driving && (
        <div className="rq-route-card" role="dialog" aria-label={selected.name}>
          <button type="button" className="rq-route-x" onClick={() => { clearTrip(); setBusy(false); setSelected(null); }} aria-label="إغلاق"><X size={18} /></button>
          <div className="rq-route-who">
            <span className={`rq-route-dot rq-gps-${pinState(selected)}`} />
            <div>
              <strong>{selected.name}</strong>
              <small>{selected.kindTitle} · {PIN_LABEL[pinState(selected)]}</small>
            </div>
          </div>

          {route && (
            <div className="rq-route-figs">
              <span><b>{formatDuration(route.duration)}</b><small><Clock size={13} /> الوصول {clock(route.duration)}</small></span>
              <span><b>{formatDistance(route.distance)}</b><small><RouteIcon size={13} /> بالطريق</small></span>
            </div>
          )}
          {!route && straight !== null && <p className="rq-route-note">المسافة المباشرة {formatDistance(straight)}</p>}
          {error && <p className="rq-route-err" role="alert">{error}</p>}

          {route && showSteps && (
            <ol className="rq-steps">
              {route.steps.map((s, i) => <li key={i}><span>{s.text}</span><small>{formatDistance(s.distance)}</small></li>)}
            </ol>
          )}

          <div className="rq-route-actions">
            {route ? (
              <button type="button" className="rq-primary rq-go" onClick={startDriving}><Navigation size={18} /> ابدأ الملاحة</button>
            ) : (
              <button type="button" className="rq-primary" onClick={() => routeTo(selected)} disabled={busy}>
                {busy ? <LoaderCircle size={18} className="rq-spin" /> : <RouteIcon size={18} />} المسار
              </button>
            )}
            {route && <button type="button" className="rq-ghost" onClick={() => setShowSteps((v) => !v)}>{showSteps ? 'إخفاء' : 'الاتجاهات'}</button>}
            <a className="rq-ghost" href={`tel:${selected.phone}`} aria-label="اتصال بالعائلة"><Phone size={18} /></a>
            <a className="rq-ghost" href={`https://waze.com/ul?ll=${selected.lat},${selected.lng}&navigate=yes`} target="_blank" rel="noopener noreferrer">Waze</a>
            <button type="button" className="rq-ghost" onClick={() => onOpen(selected.id)}>التفاصيل</button>
          </div>
          {route && <small className="rq-help"><Crosshair size={12} /> الملاحة تتبع موقعك وتعيد حساب المسار إذا خرجت عنه، مع صوت للانعطافات.</small>}
        </div>
      )}
    </div>
  );
}

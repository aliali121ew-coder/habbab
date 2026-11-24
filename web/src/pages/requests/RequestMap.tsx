import { useEffect, useRef, useState } from 'react';
import { Box, Clock, Crosshair, Layers, LoaderCircle, MapPin, Minus, Navigation, Plus, Route as RouteIcon, X } from 'lucide-react';
import {
  createMap, formatDistance, formatDuration, mapboxgl, myPosition, prepareMapbox, roadRoute, straightDistance,
  styleUrl, type MapStyle, type Route,
} from '../../maps/mapbox';

/* Every map of طلبات المساعدة, on Mapbox. Loaded only when a map is on screen.
   - PickMap: the pin stays in the middle and the map moves under it (choosing a request's place).
   - ShowMap: a small still map of one request.
   - RequestsMap: the open requests as pins; tapping a pin shows the family's name and the request
     type; «المسار» draws the road route from the phone's position with minutes and distance. */

// Each province's main city, to suggest the province for a point picked on the map.
const CITIES: [string, number, number][] = [
  ['بغداد', 33.315, 44.366], ['كربلاء', 32.616, 44.024], ['النجف', 32.0, 44.336], ['بابل', 32.468, 44.421],
  ['البصرة', 30.508, 47.783], ['واسط', 32.5, 45.82], ['ذي قار', 31.044, 46.257], ['ميسان', 31.836, 47.145],
  ['الديوانية', 31.99, 44.925], ['المثنى', 31.31, 45.28], ['ديالى', 33.75, 44.64], ['صلاح الدين', 34.6, 43.68],
  ['نينوى', 36.34, 43.13], ['كركوك', 35.468, 44.392], ['الأنبار', 33.42, 43.3], ['أربيل', 36.19, 44.01],
  ['السليمانية', 35.557, 45.435], ['دهوك', 36.867, 42.988],
];
function nearestProvince(lat: number, lng: number) {
  let best = CITIES[0];
  let bestD = Infinity;
  for (const city of CITIES) {
    const d = (city[1] - lat) ** 2 + ((city[2] - lng) * Math.cos((lat * Math.PI) / 180)) ** 2;
    if (d < bestD) { bestD = d; best = city; }
  }
  return best[0];
}

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

function StyleSwitch({ map, style, setStyle }: { map: React.RefObject<mapboxgl.Map | null>; style: MapStyle; setStyle: (s: MapStyle) => void }) {
  return (
    <button type="button" aria-label={style === 'streets' ? 'قمر صناعي' : 'شوارع'} title={style === 'streets' ? 'قمر صناعي' : 'شوارع'}
      onClick={() => { const next = style === 'streets' ? 'satellite' : 'streets'; setStyle(next); map.current?.setStyle(styleUrl(next), { diff: false, localFontFamily: undefined, localIdeographFontFamily: undefined }); }}>
      <Layers size={21} />
    </button>
  );
}

/* ───────────── choosing a place ───────────── */

export function PickMap({ lat, lng, onMove, token }: {
  lat?: number | null; lng?: number | null; token?: string | null;
  onMove: (lat: number, lng: number, province: string) => void;
}) {
  const ready = useToken(token);
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const moved = useRef(onMove);
  moved.current = onMove;
  const [style, setStyle] = useState<MapStyle>('satellite');
  const [locating, setLocating] = useState(false);
  const [hint, setHint] = useState('');

  useEffect(() => {
    if (!ready || !box.current) return;
    const has = lat != null && lng != null;
    const m = createMap(box.current, { center: has ? [lng, lat] : undefined, zoom: has ? 17 : 5.5, style: 'satellite' });
    m.on('moveend', () => { const c = m.getCenter(); moved.current(c.lat, c.lng, nearestProvince(c.lat, c.lng)); });
    map.current = m;
    return () => { m.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the starting point only
  }, [ready]);

  if (ready === null) return <NoMap className="rq-map-live" />;

  async function locate() {
    setLocating(true); setHint('');
    try { const p = await myPosition(); map.current?.flyTo({ center: p, zoom: 18, speed: 1.6 }); } catch (e) { setHint((e as Error).message); }
    setLocating(false);
  }

  return (
    <div className="rq-map-live">
      <div ref={box} className="rq-map-canvas" />
      <span className="rq-map-pin" aria-hidden><MapPin size={26} /></span>
      <div className="rq-map-tools">
        <StyleSwitch map={map} style={style} setStyle={setStyle} />
        <button type="button" onClick={() => map.current?.zoomIn()} aria-label="تكبير"><Plus size={22} /></button>
        <button type="button" onClick={() => map.current?.zoomOut()} aria-label="تصغير"><Minus size={22} /></button>
        <button type="button" className="rq-tool-accent" onClick={locate} aria-label="موقعي" disabled={locating}>
          {locating ? <LoaderCircle size={22} className="rq-spin" /> : <Crosshair size={22} />}
        </button>
      </div>
      <span className="rq-map-hint">{hint || 'حرّك الخريطة حتى يكون الدبوس على الموقع'}</span>
    </div>
  );
}

/* ───────────── one request ───────────── */

export function ShowMap({ lat, lng }: { lat: number; lng: number }) {
  const ready = useToken();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ready || !box.current) return;
    const m = createMap(box.current, { center: [lng, lat], zoom: 16.5, style: 'satellite', interactive: false });
    return () => { m.remove(); };
  }, [ready, lat, lng]);
  if (ready === null) return null;
  return (
    <div className="rq-map-still">
      <div ref={box} className="rq-map-canvas" />
      <span className="rq-map-pin" aria-hidden><MapPin size={22} /></span>
    </div>
  );
}

/* ───────────── all open requests ───────────── */

export interface MapRequest { id: number; name: string; kindTitle: string; color: string; lat: number; lng: number; urgent: boolean }

const ROUTE_SOURCE = 'rq-route';

function drawRoute(map: mapboxgl.Map, route: Route | null) {
  const data = { type: 'Feature' as const, properties: {}, geometry: route?.geometry ?? { type: 'LineString' as const, coordinates: [] } };
  const source = map.getSource(ROUTE_SOURCE) as mapboxgl.GeoJSONSource | undefined;
  if (source) { source.setData(data); return; }
  if (!route) return;
  map.addSource(ROUTE_SOURCE, { type: 'geojson', data });
  map.addLayer({ id: 'rq-route-casing', type: 'line', source: ROUTE_SOURCE, layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#1e3a8a', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 7, 17, 14] } });
  map.addLayer({ id: 'rq-route-line', type: 'line', source: ROUTE_SOURCE, layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#3b82f6', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 4, 17, 9] } });
}

function add3dBuildings(map: mapboxgl.Map) {
  if (map.getLayer('rq-3d') || !map.getSource('composite')) return;
  map.addLayer({
    id: 'rq-3d', source: 'composite', 'source-layer': 'building', type: 'fill-extrusion', minzoom: 14,
    filter: ['==', ['get', 'extrude'], 'true'],
    paint: {
      'fill-extrusion-color': document.documentElement.dataset.theme === 'dark' ? '#3f3f52' : '#d6d3e0',
      'fill-extrusion-height': ['get', 'height'], 'fill-extrusion-base': ['get', 'min_height'], 'fill-extrusion-opacity': 0.75,
    },
  });
}

export function RequestsMap({ items, onOpen, focus }: { items: MapRequest[]; onOpen: (id: number) => void; focus?: number | null }) {
  const ready = useToken();
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const markers = useRef<mapboxgl.Marker[]>([]);
  const me = useRef<mapboxgl.Marker | null>(null);
  const routeRef = useRef<Route | null>(null);
  const tilted = useRef(false);
  const placed = useRef(false);
  const pending = useRef<AbortController | null>(null);
  const [style, setStyle] = useState<MapStyle>('streets');
  const [selected, setSelected] = useState<MapRequest | null>(null);
  const [route, setRoute] = useState<Route | null>(null);
  const [straight, setStraight] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showSteps, setShowSteps] = useState(false);
  const [is3d, setIs3d] = useState(false);

  // The map itself, once.
  useEffect(() => {
    if (!ready || !box.current) return;
    const m = createMap(box.current, { style: 'streets' });
    m.on('style.load', () => {
      drawRoute(m, routeRef.current);
      if (tilted.current) add3dBuildings(m);
    });
    m.on('click', () => setSelected(null));
    map.current = m;
    placed.current = false;
    return () => { pending.current?.abort(); m.remove(); map.current = null; };
  }, [ready]);

  // The pins, whenever the list changes.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    for (const mk of markers.current) mk.remove();
    markers.current = items.map((r) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `rq-marker${r.urgent ? ' urgent' : ''}`;
      el.style.setProperty('--pin', r.color);
      el.setAttribute('aria-label', `${r.name} — ${r.kindTitle}`);
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        pending.current?.abort(); // a route still on its way belongs to the previous family
        setSelected(r); setRoute(null); setStraight(null); setError(''); setBusy(false);
      });
      return new mapboxgl.Marker({ element: el, anchor: 'bottom' }).setLngLat([r.lng, r.lat]).addTo(m);
    });
    // Place the view once (on the focused request, or around all pins); later list changes keep
    // the person's own pan and zoom.
    if (placed.current || !items.length) return;
    placed.current = true;
    const focused = focus ? items.find((r) => r.id === focus) : undefined;
    if (focused) {
      m.jumpTo({ center: [focused.lng, focused.lat], zoom: 16 });
      setSelected(focused);
    } else {
      const bounds = new mapboxgl.LngLatBounds();
      for (const r of items) bounds.extend([r.lng, r.lat]);
      m.fitBounds(bounds, { padding: 70, maxZoom: 15, duration: 0 });
    }
  }, [items, ready, focus]);

  useEffect(() => {
    routeRef.current = route;
    if (map.current?.isStyleLoaded()) drawRoute(map.current, route);
  }, [route]);

  if (ready === null) return <NoMap className="rq-map-big" text="الخريطة تعمل بعد إضافة مفتاح Mapbox للموقع." />;

  async function showMe(): Promise<[number, number]> {
    const p = await myPosition();
    if (map.current) {
      if (!me.current) {
        const dot = document.createElement('span');
        dot.className = 'rq-me';
        me.current = new mapboxgl.Marker({ element: dot }).setLngLat(p).addTo(map.current);
      } else me.current.setLngLat(p);
    }
    return p;
  }

  async function locate() {
    setBusy(true); setError('');
    try { const p = await showMe(); map.current?.flyTo({ center: p, zoom: 15 }); } catch (e) { setError((e as Error).message); }
    setBusy(false);
  }

  async function routeTo(r: MapRequest) {
    pending.current?.abort();
    const ask = new AbortController();
    pending.current = ask;
    setBusy(true); setError(''); setShowSteps(false);
    let from: [number, number];
    try { from = await showMe(); } catch (e) { if (!ask.signal.aborted) { setError((e as Error).message); setBusy(false); } return; }
    if (ask.signal.aborted) return;
    const to: [number, number] = [r.lng, r.lat];
    setStraight(straightDistance(from, to));
    try {
      const found = await roadRoute(from, to, ask.signal);
      if (ask.signal.aborted) return;
      setRoute(found);
      const bounds = new mapboxgl.LngLatBounds(from, from);
      for (const c of found.geometry.coordinates) bounds.extend(c);
      map.current?.fitBounds(bounds, { padding: { top: 80, bottom: 240, left: 60, right: 60 }, maxZoom: 17 });
    } catch (e) {
      if (ask.signal.aborted) return;
      setRoute(null);
      setError(navigator.onLine ? (e as Error).message : 'لا يوجد إنترنت: المسافة المباشرة فقط حتى يعود الاتصال');
    }
    setBusy(false);
  }

  function toggle3d() {
    const m = map.current;
    if (!m) return;
    const next = !is3d;
    tilted.current = next;
    setIs3d(next);
    if (next) { add3dBuildings(m); m.easeTo({ pitch: 60, zoom: Math.max(m.getZoom(), 16) }); } else m.easeTo({ pitch: 0, bearing: 0 });
  }

  const arrival = route ? new Date(Date.now() + route.duration * 1000).toLocaleTimeString('ar-IQ-u-nu-latn', { hour: 'numeric', minute: '2-digit' }) : '';

  return (
    <div className="rq-map-big">
      <div ref={box} className="rq-map-canvas" />
      <div className="rq-map-tools">
        <StyleSwitch map={map} style={style} setStyle={setStyle} />
        <button type="button" onClick={toggle3d} aria-label={is3d ? 'عرض مسطح' : 'عرض ثلاثي الأبعاد'} className={is3d ? 'on' : ''}><Box size={21} /></button>
        <button type="button" onClick={() => map.current?.zoomIn()} aria-label="تكبير"><Plus size={22} /></button>
        <button type="button" onClick={() => map.current?.zoomOut()} aria-label="تصغير"><Minus size={22} /></button>
        <button type="button" className="rq-tool-accent" onClick={locate} aria-label="موقعي" disabled={busy}>
          {busy && !selected ? <LoaderCircle size={22} className="rq-spin" /> : <Crosshair size={22} />}
        </button>
      </div>

      {!items.length && <span className="rq-map-hint">لا توجد طلبات مفتوحة لها موقع على الخريطة</span>}

      {selected && (
        <div className="rq-route-card" role="dialog" aria-label={selected.name}>
          <button type="button" className="rq-route-x" onClick={() => { pending.current?.abort(); setBusy(false); setSelected(null); setRoute(null); setStraight(null); }} aria-label="إغلاق"><X size={18} /></button>
          <div className="rq-route-who">
            <span className="rq-route-dot" style={{ background: selected.color }} />
            <div>
              <strong>{selected.name}</strong>
              <small>{selected.kindTitle}</small>
            </div>
          </div>

          {route && (
            <div className="rq-route-figs">
              <span><b>{formatDuration(route.duration)}</b><small><Clock size={13} /> الوصول {arrival}</small></span>
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
            <button type="button" className="rq-primary" onClick={() => routeTo(selected)} disabled={busy}>
              {busy ? <LoaderCircle size={18} className="rq-spin" /> : <Navigation size={18} />} {route ? 'تحديث المسار' : 'المسار'}
            </button>
            {route && <button type="button" className="rq-ghost" onClick={() => setShowSteps((v) => !v)}>{showSteps ? 'إخفاء الاتجاهات' : 'الاتجاهات'}</button>}
            <button type="button" className="rq-ghost" onClick={() => onOpen(selected.id)}>التفاصيل</button>
          </div>
        </div>
      )}
    </div>
  );
}

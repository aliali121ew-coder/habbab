import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Crosshair, LoaderCircle, MapPin, Minus, Plus } from 'lucide-react';

/* The map for a help request: satellite pictures (Esri World Imagery), a pin fixed in the
   middle and the map moving under it, zoom buttons and «موقعي» (the phone's GPS). Loaded only
   when the location step or a request with a point is opened, so the register stays light. */

const TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const IRAQ: L.LatLngTuple = [33.2, 44.2];

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

function makeMap(el: HTMLElement, center: L.LatLngTuple, zoom: number, still = false) {
  const map = L.map(el, {
    center, zoom, zoomControl: false, attributionControl: true,
    dragging: !still, touchZoom: !still, scrollWheelZoom: !still, doubleClickZoom: !still, boxZoom: false, keyboard: !still,
  });
  L.tileLayer(TILES, { maxZoom: 19, maxNativeZoom: 18, attribution: 'Esri' }).addTo(map);
  map.attributionControl.setPrefix(false);
  return map;
}

export function PickMap({ lat, lng, onMove }: { lat?: number | null; lng?: number | null; onMove: (lat: number, lng: number, province: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const moved = useRef(onMove);
  moved.current = onMove;
  const [locating, setLocating] = useState(false);
  const [gpsError, setGpsError] = useState('');

  useEffect(() => {
    if (!box.current) return;
    const has = lat != null && lng != null;
    const m = makeMap(box.current, has ? [lat, lng] : IRAQ, has ? 17 : 6);
    m.on('moveend', () => { const c = m.getCenter(); moved.current(c.lat, c.lng, nearestProvince(c.lat, c.lng)); });
    map.current = m;
    return () => { m.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the starting point only
  }, []);

  function locate() {
    if (!navigator.geolocation) { setGpsError('هذا الجهاز لا يدعم تحديد الموقع'); return; }
    setLocating(true); setGpsError('');
    navigator.geolocation.getCurrentPosition(
      (p) => { setLocating(false); map.current?.setView([p.coords.latitude, p.coords.longitude], 18); },
      (e) => {
        setLocating(false);
        setGpsError(e.code === e.PERMISSION_DENIED ? 'اسمح للتطبيق بالوصول إلى الموقع من إعدادات الهاتف' : 'تعذّر تحديد موقعك، حرّك الخريطة يدوياً');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  }

  return (
    <div className="rq-map-live">
      <div ref={box} className="rq-map-canvas" dir="ltr" />
      <span className="rq-map-pin" aria-hidden><MapPin size={26} /></span>
      <div className="rq-map-tools">
        <button type="button" onClick={() => map.current?.zoomIn()} aria-label="تكبير"><Plus size={22} /></button>
        <button type="button" onClick={() => map.current?.zoomOut()} aria-label="تصغير"><Minus size={22} /></button>
        <button type="button" onClick={locate} aria-label="موقعي" disabled={locating}>
          {locating ? <LoaderCircle size={22} className="rq-spin" /> : <Crosshair size={22} />}
        </button>
      </div>
      <span className="rq-map-hint">{gpsError || 'حرّك الخريطة حتى يكون الدبوس على موقعك'}</span>
    </div>
  );
}

export function ShowMap({ lat, lng }: { lat: number; lng: number }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!box.current) return;
    const m = makeMap(box.current, [lat, lng], 17, true);
    return () => { m.remove(); };
  }, [lat, lng]);
  return (
    <div className="rq-map-still">
      <div ref={box} className="rq-map-canvas" dir="ltr" />
      <span className="rq-map-pin" aria-hidden><MapPin size={22} /></span>
    </div>
  );
}

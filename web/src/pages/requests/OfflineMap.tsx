import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { FileSource, PMTiles, Protocol } from 'pmtiles';
import { layers, namedFlavor } from '@protomaps/basemaps';
import { ArrowUp, CloudOff, LocateFixed, Minus, Phone, Plus, X } from 'lucide-react';
import { formatDistance, straightDistance } from '../../maps/mapbox';
import { bearing } from '../../maps/navigation';
import { cachedAsset, openMap, PROVINCES } from '../../maps/offline';
import type { MapRequest } from './RequestMap';

/* The requests map with no internet: the delegate's saved province (OpenStreetMap, Protomaps)
   drawn by MapLibre, the same pins, my position, and — since road routes need the internet —
   the straight distance and an arrow pointing at the family's house. */

let ready = false;
const protocol = new Protocol();
function setup() {
  if (ready) return;
  ready = true;
  maplibregl.setWorkerUrl(workerUrl);
  maplibregl.addProtocol('pmtiles', protocol.tile);
  // Fonts and icons from the app's own offline cache (fetched when the map was downloaded).
  maplibregl.addProtocol('offline', async (params: maplibregl.RequestParameters) => {
    const path = params.url.replace('offline://', '/offline-map/').replace(/%20| /g, '-');
    const res = (await cachedAsset(path)) ?? (await fetch(path).catch(() => undefined));
    if (!res || !res.ok) throw new Error(`missing ${path}`);
    if (params.type === 'json') return { data: await res.json() };
    return { data: await res.arrayBuffer() };
  });
}

/** The worker file's address, fetched once at download time so it is on the phone offline. */
export const OFFLINE_WORKER = workerUrl;

const PIN_SVG = '<svg viewBox="0 0 24 32" aria-hidden="true"><path class="rq-gps-body" d="M12 0C5.4 0 0 5.2 0 11.7 0 20.4 12 32 12 32s12-11.6 12-20.3C24 5.2 18.6 0 12 0z"/><circle class="rq-gps-eye" cx="12" cy="11.5" r="4.6"/></svg>';
const pinState = (r: MapRequest) => (r.approved ? 'ok' : r.priority === 'high' ? 'high' : r.priority === 'medium' ? 'mid' : 'wait');
const COMPASS = ['شمال', 'شمال شرق', 'شرق', 'جنوب شرق', 'جنوب', 'جنوب غرب', 'غرب', 'شمال غرب'];

export function OfflineRequestsMap({ slug, items, onOpen }: { slug: string; items: MapRequest[]; onOpen: (id: number) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const meMarker = useRef<maplibregl.Marker | null>(null);
  const [me, setMe] = useState<[number, number] | null>(null);
  const [mapBearing, setMapBearing] = useState(0);
  const [selected, setSelected] = useState<MapRequest | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    let m: maplibregl.Map | null = null;
    void (async () => {
      setup();
      const file = await openMap(slug);
      if (!live || !box.current) return;
      if (!file) { setError('خريطة المحافظة غير محفوظة على هذا الهاتف'); return; }
      const pm = new PMTiles(new FileSource(file));
      protocol.add(pm);
      const dark = document.documentElement.dataset.theme === 'dark';
      Object.assign(box.current.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' });
      const center = PROVINCES.find((p) => p.slug === slug)?.center ?? [44.2, 33.2];
      m = new maplibregl.Map({
        container: box.current,
        center,
        zoom: 12,
        maxZoom: 18,
        attributionControl: { compact: true },
        style: {
          version: 8,
          glyphs: 'offline://fonts/{fontstack}/{range}.pbf',
          sprite: `offline://sprites/${dark ? 'dark' : 'light'}`,
          sources: { protomaps: { type: 'vector', url: `pmtiles://${file.name}`, attribution: '© OpenStreetMap' } },
          layers: layers('protomaps', namedFlavor(dark ? 'dark' : 'light'), { lang: 'ar' }),
        },
      });
      m.on('rotate', () => setMapBearing(m!.getBearing()));
      m.on('click', () => setSelected(null));
      map.current = m;
      for (const r of items) {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = `rq-gps rq-gps-${pinState(r)}`;
        el.innerHTML = PIN_SVG;
        el.setAttribute('aria-label', `${r.name} — ${r.kindTitle}`);
        el.addEventListener('click', (ev) => { ev.stopPropagation(); setSelected(r); });
        new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([r.lng, r.lat]).addTo(m);
      }
      if (items.length) {
        const b = new maplibregl.LngLatBounds();
        for (const r of items) b.extend([r.lng, r.lat]);
        m.fitBounds(b, { padding: { top: 70, bottom: 70, left: 90, right: 50 }, maxZoom: 15, duration: 0 });
      }
    })().catch((e) => live && setError((e as Error).message));
    return () => { live = false; m?.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the pins are placed once per province
  }, [slug]);

  // My position, live (the GPS works without internet).
  useEffect(() => {
    if (!navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition((p) => {
      const at: [number, number] = [p.coords.longitude, p.coords.latitude];
      setMe(at);
      if (!map.current) return;
      if (!meMarker.current) {
        const dot = document.createElement('span');
        dot.className = 'rq-me';
        meMarker.current = new maplibregl.Marker({ element: dot }).setLngLat(at).addTo(map.current);
      } else meMarker.current.setLngLat(at);
    }, () => undefined, { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 });
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  const toward = selected && me ? bearing(me, [selected.lng, selected.lat]) : null;
  const distance = selected && me ? straightDistance(me, [selected.lng, selected.lat]) : null;

  return (
    <div className="rq-map-big rq-offline">
      <div ref={box} className="rq-map-canvas" />
      <span className="rq-offline-badge"><CloudOff size={15} /> بدون إنترنت — خريطة محفوظة</span>
      <div className="rq-map-tools">
        <button type="button" onClick={() => map.current?.zoomIn()} aria-label="تكبير"><Plus size={22} /></button>
        <button type="button" onClick={() => map.current?.zoomOut()} aria-label="تصغير"><Minus size={22} /></button>
        <button type="button" className="rq-tool-accent" aria-label="موقعي" disabled={!me}
          onClick={() => me && map.current?.flyTo({ center: me, zoom: 17 })}><LocateFixed size={22} /></button>
      </div>
      {error && <span className="rq-map-hint">{error}</span>}

      {selected && (
        <div className="rq-route-card" role="dialog" aria-label={selected.name}>
          <button type="button" className="rq-route-x" onClick={() => setSelected(null)} aria-label="إغلاق"><X size={18} /></button>
          <div className="rq-route-who">
            <span className={`rq-route-dot rq-gps-${pinState(selected)}`} />
            <div><strong>{selected.name}</strong><small>{selected.kindTitle}</small></div>
          </div>
          {toward !== null && distance !== null ? (
            <div className="rq-compass">
              <span className="rq-compass-arrow" style={{ transform: `rotate(${toward - mapBearing}deg)` }}><ArrowUp size={30} /></span>
              <div>
                <b>{formatDistance(distance)}</b>
                <small>باتجاه {COMPASS[Math.round(toward / 45) % 8]} — مسافة مباشرة، المسار يحتاج إنترنت</small>
              </div>
            </div>
          ) : <p className="rq-route-note">شغّل الموقع (GPS) لمعرفة المسافة والاتجاه إلى البيت.</p>}
          <div className="rq-route-actions">
            <a className="rq-ghost" href={`tel:${selected.phone}`}><Phone size={18} /> اتصال</a>
            <button type="button" className="rq-ghost" onClick={() => onOpen(selected.id)}>التفاصيل</button>
          </div>
        </div>
      )}
    </div>
  );
}

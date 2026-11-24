import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { fail } from '../lib/http';

// Offline maps: one OpenStreetMap file per province (Protomaps .pmtiles, cut from the daily
// planet build with scripts/offline-maps.mjs), kept in R2 under maps/. A delegate downloads
// their province once; the app then shows it with no internet (Mapbox's own maps cannot be
// stored for offline use on the web).
export const offlineMaps = new Hono<AppEnv>();

const PREFIX = 'maps/';
const SLUG = /^[a-z]{3,20}$/;

offlineMaps.get('/', async (c) => {
  const listed = await c.env.FILES.list({ prefix: PREFIX, limit: 100 });
  const items = listed.objects
    .filter((o) => o.key.endsWith('.pmtiles'))
    .map((o) => ({ slug: o.key.slice(PREFIX.length, -'.pmtiles'.length), size: o.size, version: o.customMetadata?.build ?? o.uploaded.toISOString().slice(0, 10) }));
  return c.json({ items }, 200, { 'cache-control': 'private, max-age=300' });
});

offlineMaps.get('/:slug', async (c) => {
  const slug = c.req.param('slug');
  if (!SLUG.test(slug)) fail(404, 'غير موجود');
  const object = await c.env.FILES.get(`${PREFIX}${slug}.pmtiles`);
  if (!object) fail(404, 'خريطة هذه المحافظة غير متوفرة بعد');
  return new Response(object.body, {
    headers: {
      'content-type': 'application/octet-stream',
      'content-length': String(object.size),
      'cache-control': 'private, no-store',
      'x-map-version': object.customMetadata?.build ?? '',
    },
  });
});

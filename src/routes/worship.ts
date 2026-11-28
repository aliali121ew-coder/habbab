import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { fail } from '../lib/http';

// Proxies and edge-caches Quran surahs (Uthmani script) so the browser never hits CORS/CSP
// issues and every surah loads instantly for all users.
export const worship = new Hono<AppEnv>();

interface AlQuranAyah {
  numberInSurah: number;
  text: string;
}

interface AlQuranResponse {
  status: string;
  data?: {
    number: number;
    name: string;
    ayahs: AlQuranAyah[];
  };
}

worship.get('/surah/:n', async (c) => {
  const n = Number(c.req.param('n'));
  if (!Number.isInteger(n) || n < 1 || n > 114) fail(400, 'رقم السورة غير صحيح');

  const key = `quran:uthmani:v1:${n}`;
  const cached = await c.env.CACHE?.get(key);
  if (cached) {
    c.header('cache-control', 'public, max-age=86400');
    return c.body(cached, 200, { 'content-type': 'application/json; charset=utf-8' });
  }

  const res = await fetch(`https://api.alquran.cloud/v1/surah/${n}/quran-uthmani`);
  if (!res.ok) return c.json({ error: 'تعذّر تحميل السورة حالياً، حاول مرة أخرى' }, 502);
  const json = (await res.json()) as AlQuranResponse;
  if (json.status !== 'OK' || !json.data) return c.json({ error: 'تعذّر قراءة بيانات السورة' }, 502);

  const payload = JSON.stringify({
    number: json.data.number,
    name: json.data.name,
    ayahs: json.data.ayahs.map((a) => ({ n: a.numberInSurah, text: a.text })),
  });
  await c.env.CACHE?.put(key, payload, { expirationTtl: 60 * 60 * 24 * 30 }).catch(() => undefined);
  c.header('cache-control', 'public, max-age=86400');
  return c.body(payload, 200, { 'content-type': 'application/json; charset=utf-8' });
});

interface AlQuranSearchMatch {
  numberInSurah: number;
  text: string;
  surah: { number: number; name: string };
}

interface AlQuranSearchResponse {
  status: string;
  data?: {
    count: number;
    matches: AlQuranSearchMatch[];
  };
}

// Comprehensive full-Quran ayah search (all 6,236 ayahs) with 7-day KV edge caching.
worship.get('/search', async (c) => {
  const raw = (c.req.query('q') ?? '').trim();
  if (raw.length < 2 || raw.length > 80) {
    return c.json({ count: 0, matches: [] });
  }
  const normalized = raw
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/\s+/g, ' ')
    .trim();
  if (normalized.length < 2) {
    return c.json({ count: 0, matches: [] });
  }

  const key = `quran:search:v1:${normalized}`;
  const cached = await c.env.CACHE?.get(key);
  if (cached) {
    c.header('cache-control', 'public, max-age=3600');
    return c.body(cached, 200, { 'content-type': 'application/json; charset=utf-8' });
  }

  const url = `https://api.alquran.cloud/v1/search/${encodeURIComponent(normalized)}/all/quran-simple-clean`;
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 404) {
      const empty = JSON.stringify({ count: 0, matches: [] });
      return c.body(empty, 200, { 'content-type': 'application/json; charset=utf-8' });
    }
    return c.json({ error: 'تعذّر البحث في الآيات حالياً، حاول مرة أخرى' }, 502);
  }
  const json = (await res.json()) as AlQuranSearchResponse;
  const matches = (json.data?.matches ?? []).slice(0, 60).map((m) => ({
    surah: m.surah.number,
    ayah: m.numberInSurah,
    text: m.text,
  }));
  const payload = JSON.stringify({ count: json.data?.count ?? matches.length, matches });
  await c.env.CACHE?.put(key, payload, { expirationTtl: 60 * 60 * 24 * 7 }).catch(() => undefined);
  c.header('cache-control', 'public, max-age=3600');
  return c.body(payload, 200, { 'content-type': 'application/json; charset=utf-8' });
});

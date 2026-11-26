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

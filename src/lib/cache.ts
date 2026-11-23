import type { Context } from 'hono';
import type { AppEnv } from '../env';
import { all, fid } from './db';

export interface RefData {
  programs: { id: number; name: string; active: number }[];
  delegates: { id: number; full_name: string }[];
}

// Cache API: free and write-unlimited, so it holds dashboards. It only works on a
// custom domain; on workers.dev it silently misses and the code falls back to D1.
export async function edgeCached<T>(c: Context<AppEnv>, key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const cache = await caches.open('app');
  const request = new Request(`https://cache.internal/${key}`);
  const hit = await cache.match(request);
  if (hit) return hit.json() as Promise<T>;
  const data = await load();
  const response = new Response(JSON.stringify(data), {
    headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${ttl}` },
  });
  c.executionCtx.waitUntil(cache.put(request, response));
  return data;
}

// KV for slow aggregates that may be a few minutes old. Works on workers.dev too, unlike
// edgeCached. Keep ttl >= 300 so a hot key costs at most ~288 KV writes a day.
export async function kvCached<T>(c: Context<AppEnv>, key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const hit = await c.env.CACHE.get<T>(key, 'json');
  if (hit !== null) return hit;
  const data = await load();
  c.executionCtx.waitUntil(c.env.CACHE.put(key, JSON.stringify(data), { expirationTtl: ttl }));
  return data;
}

// One reference list per foundation.
const refKey = (c: Context<AppEnv>) => `ref:v2:${fid(c)}`;

// KV: shared across colos and explicitly invalidated, so it holds reference lists.
export async function refData(c: Context<AppEnv>): Promise<RefData> {
  const key = refKey(c);
  const hit = await c.env.CACHE.get<RefData>(key, 'json');
  if (hit) return hit;
  const [programs, delegates] = await Promise.all([
    all<RefData['programs'][number]>(c, 'SELECT id, name, active FROM programs WHERE foundation_id = ? ORDER BY id', fid(c)),
    all<RefData['delegates'][number]>(c,
      "SELECT id, full_name FROM users WHERE foundation_id = ? AND role = 'delegate' AND active = 1 ORDER BY id", fid(c)),
  ]);
  const data = { programs, delegates };
  c.executionCtx.waitUntil(c.env.CACHE.put(key, JSON.stringify(data), { expirationTtl: 120 }));
  return data;
}

export function invalidateRefData(c: Context<AppEnv>) {
  c.executionCtx.waitUntil(c.env.CACHE.delete(refKey(c)));
}

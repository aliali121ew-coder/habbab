import type { Context } from 'hono';
import type { AppEnv } from '../env';
import { all } from './db';

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

const REF_KEY = 'ref:v1';

// KV: shared across colos and explicitly invalidated, so it holds reference lists.
export async function refData(c: Context<AppEnv>): Promise<RefData> {
  const hit = await c.env.CACHE.get<RefData>(REF_KEY, 'json');
  if (hit) return hit;
  const [programs, delegates] = await Promise.all([
    all<RefData['programs'][number]>(c, 'SELECT id, name, active FROM programs ORDER BY id'),
    all<RefData['delegates'][number]>(c, "SELECT id, full_name FROM users WHERE role = 'delegate' AND active = 1 ORDER BY id"),
  ]);
  const data = { programs, delegates };
  c.executionCtx.waitUntil(c.env.CACHE.put(REF_KEY, JSON.stringify(data), { expirationTtl: 120 }));
  return data;
}

export function invalidateRefData(c: Context<AppEnv>) {
  c.executionCtx.waitUntil(c.env.CACHE.delete(REF_KEY));
}

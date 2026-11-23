import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from '../env';
import { fail } from './http';

// What a foundation can use. The system admin switches these on per foundation; a foundation
// whose list is NULL has all of them (foundation 1, and any made before features existed).
export const FEATURES = [
  'subscribers', // المشتركون والتحصيل: subscribers, delegates, collections, closings
  'aid', // المساعدات: programs and aid entries
  'expenses', // الحركات المالية
  'families', // العوائل المتعففة
  'patients', // المرضى والوصفات
  'donations', // التبرعات
  'requests', // طلبات المساعدة
  'worship', // العبادات
  'contests', // المسابقات والجوائز
  'reports', // التقارير
] as const;
export type Feature = (typeof FEATURES)[number];

export function parseFeatures(stored: string | null): Feature[] {
  if (stored === null) return [...FEATURES];
  try {
    const list = JSON.parse(stored) as unknown;
    return Array.isArray(list) ? FEATURES.filter((key) => list.includes(key)) : [...FEATURES];
  } catch {
    return [...FEATURES];
  }
}

// Refuses a route whose feature the foundation does not have. The list comes from the session,
// so a change by the system admin reaches the server within one token refresh (15 minutes);
// the menu, read from /auth/me, changes at once.
export function requireFeature(feature: Feature, ...openPaths: string[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    // Paths other pages read too (e.g. the overview totals on home); they only ever return
    // this foundation's own rows, which are empty when it does not use the feature.
    const open = openPaths.some((path) => c.req.path.endsWith(path));
    if (!open && !c.get('user').features.includes(feature)) fail(403, 'هذه الخدمة غير مفعّلة لمؤسستك');
    await next();
  };
}

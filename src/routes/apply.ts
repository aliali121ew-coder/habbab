import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { all, first, stmt } from '../lib/db';
import { parseFeatures } from '../lib/features';
import { fail, readJson } from '../lib/http';
import { REQUEST_COLUMNS, requestColumns, windowState, zRequest, type RequestRow } from './requests';

// The public link a foundation gives to families: /#/apply/<code>. No account. It accepts
// requests only while the foundation's window is open (checked here on every send), from an
// active foundation that has طلبات المساعدة switched on. Guarded by a per-address limit, a daily
// ceiling per foundation, a
// hidden field that people leave empty, and one open request per phone number a day.
export const apply = new Hono<AppEnv>();

const DAILY_PUBLIC_LIMIT = 1000;

type Ctx = Context<AppEnv>;
interface FoundationRow {
  id: number; name: string; status: string; features: string | null;
  requests_open_from: string | null; requests_open_until: string | null;
}

async function foundationByCode(c: Ctx, code: string) {
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(code)) fail(404, 'الرابط غير صحيح');
  const row = await first<FoundationRow>(c,
    'SELECT id, name, status, features, requests_open_from, requests_open_until FROM foundations WHERE requests_code = ?', code);
  if (!row || row.status !== 'active' || !parseFeatures(row.features).includes('requests')) fail(404, 'الرابط غير صحيح');
  return row;
}

apply.get('/:code', async (c) => {
  const f = await foundationByCode(c, c.req.param('code'));
  return c.json({
    foundation: f.name,
    state: windowState({ from: f.requests_open_from, until: f.requests_open_until }),
    from: f.requests_open_from,
    until: f.requests_open_until,
    mapToken: c.env.MAPBOX_TOKEN ?? null,
  });
});

apply.post('/:code', async (c) => {
  const ip = c.req.header('cf-connecting-ip') ?? 'local';
  const limit = await c.env.APPLY_LIMITER?.limit({ key: ip });
  if (limit && !limit.success) fail(429, 'محاولات كثيرة، حاول بعد دقيقة');

  const f = await foundationByCode(c, c.req.param('code'));
  if (windowState({ from: f.requests_open_from, until: f.requests_open_until }) !== 'open') {
    fail(409, 'التسجيل مغلق حالياً');
  }
  const body = await readJson(c, z.intersection(zRequest, z.object({ website: z.string().max(0, 'طلب غير مسموح').optional() })));
  const v = requestColumns(body);

  const recent = await all<{ id: number }>(c,
    `SELECT id FROM help_requests WHERE foundation_id = ? AND phone = ? AND status IN ('pending', 'review')
     AND created_at > ? AND deleted_at IS NULL LIMIT 1`,
    f.id, v.phone, new Date(Date.now() - 24 * 3600 * 1000).toISOString());
  if (recent.length) fail(409, 'لديك طلب قيد المتابعة بهذا الرقم، سنتواصل معك');

  // A ceiling per foundation per day, so a leaked link cannot bury the register in junk.
  const today = await first<{ n: number }>(c,
    "SELECT COUNT(*) AS n FROM help_requests WHERE foundation_id = ? AND source = 'public' AND created_at > ?",
    f.id, new Date(Date.now() - 24 * 3600 * 1000).toISOString());
  if ((today?.n ?? 0) >= DAILY_PUBLIC_LIMIT) fail(429, 'وصل عدد الطلبات اليوم إلى الحد، حاول غداً');

  const [created] = await c.env.DB.batch([
    stmt(c, `INSERT INTO help_requests (foundation_id, kind, title, details, name, phone, province, area, landmark, members, urgent, lat, lng, source, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'public', NULL) RETURNING ${REQUEST_COLUMNS}`,
      f.id, v.kind, v.title, v.details, v.name, v.phone, v.province, v.area, v.landmark, v.members, v.urgent, v.lat, v.lng),
    stmt(c, `INSERT INTO audit_log (foundation_id, user_id, action, entity, entity_id, detail)
             VALUES (?, NULL, 'create_public', 'help_request', last_insert_rowid(), ?)`,
      f.id, JSON.stringify({ label: `${v.title} — ${v.name}` })),
  ]);
  const row = created.results[0] as RequestRow;
  return c.json({ id: row.id }, 201);
});

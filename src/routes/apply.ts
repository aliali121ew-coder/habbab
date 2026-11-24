import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { all, first, stmt } from '../lib/db';
import { parseFeatures } from '../lib/features';
import { fail, readJson } from '../lib/http';
import { normalizeName } from '../lib/text';
import { REQUEST_COLUMNS, requestColumns, windowState, zRequest, type RequestRow } from './requests';

// The public link a foundation gives to families: /#/apply/<code>. No account. It accepts
// requests only while the foundation's window is open (checked here on every send), from an
// active foundation that has طلبات المساعدة switched on. Guarded by a per-address limit, a daily
// ceiling per foundation, a hidden field that people leave empty, and one open request per
// phone number a day.
// The foundation's delegates are never listed here. A family already registered with the
// foundation (the head's name and phone both match its file) sees its own delegate, and the
// request goes to that delegate; anyone else sees no delegate at all.
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

const digits = (phone: string) => phone.replace(/\D/g, '');

/** The registered family whose head's name and phone both match, with its active delegate. */
async function registeredFamily(c: Ctx, foundationId: number, name: string, phone: string) {
  const want = digits(phone);
  if (want.length < 10) return null;
  const rows = await all<{ id: number; phone: string | null; delegate_id: number | null; delegate_name: string | null }>(c,
    `SELECT f.id, f.phone, u.id AS delegate_id, u.full_name AS delegate_name
     FROM families f LEFT JOIN users u ON u.id = f.delegate_id AND u.foundation_id = f.foundation_id AND u.role = 'delegate' AND u.active = 1
     WHERE f.foundation_id = ? AND f.head_norm = ? AND f.deleted_at IS NULL LIMIT 20`,
    foundationId, normalizeName(name));
  return rows.find((r) => r.phone && digits(r.phone) === want) ?? null;
}

const zWho = z.object({
  name: z.string().trim().min(3).max(120),
  phone: z.string().trim().regex(/^07\d{9}$/),
});

// A family checks whether it is registered: its delegate, or nothing.
apply.post('/:code/family', async (c) => {
  const ip = c.req.header('cf-connecting-ip') ?? 'local';
  const limit = await c.env.APPLY_LIMITER?.limit({ key: ip });
  if (limit && !limit.success) fail(429, 'محاولات كثيرة، حاول بعد دقيقة');
  const f = await foundationByCode(c, c.req.param('code'));
  if (windowState({ from: f.requests_open_from, until: f.requests_open_until }) !== 'open') fail(409, 'التسجيل مغلق حالياً');
  const { name, phone } = await readJson(c, zWho);
  const family = await registeredFamily(c, f.id, name, phone);
  return c.json({ registered: !!family, delegate: family?.delegate_id ? family.delegate_name : null });
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
  // The family's own delegate when it is registered; a delegate sent by the page is ignored.
  const family = await registeredFamily(c, f.id, v.name, v.phone);
  const delegateId = family?.delegate_id ?? null;

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
    stmt(c, `INSERT INTO help_requests (foundation_id, kind, title, details, name, phone, province, area, landmark, members, priority, delegate_id, lat, lng, source, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'public', NULL) RETURNING ${REQUEST_COLUMNS}`,
      f.id, v.kind, v.title, v.details, v.name, v.phone, v.province, v.area, v.landmark, v.members, v.priority, delegateId, v.lat, v.lng),
    stmt(c, `INSERT INTO audit_log (foundation_id, user_id, action, entity, entity_id, detail)
             VALUES (?, NULL, 'create_public', 'help_request', last_insert_rowid(), ?)`,
      f.id, JSON.stringify({ label: `${v.title} — ${v.name}` })),
    ...(delegateId !== null
      ? [stmt(c, "INSERT INTO notifications (foundation_id, user_id, kind, title, body, link) VALUES (?, ?, 'request_assigned', 'طلب جديد مسند إليك', ?, '#/soon/requests')",
          f.id, delegateId, `${v.name} — ${v.title}`)]
      : []),
  ]);
  const row = created.results[0] as RequestRow;
  return c.json({ id: row.id }, 201);
});

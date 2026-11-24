import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { requireRole } from '../lib/auth';
import { all, auditDetail, auditInsertedStmt, auditStmt, batch, diff, fid, first, stmt } from '../lib/db';
import { fail, idParam, readJson } from '../lib/http';
import { notifyStmt } from './notifications';

// طلبات المساعدة. The foundation's own requests only.
//  * The manager sees and manages them all, assigns each to a delegate, and opens or closes the
//    window in which families can send requests from the public link (routes/apply.ts).
//  * A delegate sees only the requests given to them, to reach them on the map; nothing else.
// A request can be changed for one hour after it is sent (checked here, not on the screen).
export const requests = new Hono<AppEnv>();
requests.use('*', requireRole('admin', 'delegate'));
requests.use('*', async (c, next) => {
  // A delegate may only read their own list.
  const listing = c.req.method === 'GET' && /\/requests\/?$/.test(c.req.path);
  if (c.get('user').role !== 'admin' && !listing) fail(403, 'ليست لديك صلاحية لهذا الإجراء');
  await next();
});

type Ctx = Context<AppEnv>;

const EDIT_WINDOW_MS = 60 * 60 * 1000;

export interface RequestRow {
  id: number; kind: string; title: string; details: string | null; name: string; phone: string;
  province: string; area: string | null; landmark: string | null; members: number; priority: string; lat: number | null; lng: number | null;
  status: string; delegate_id: number | null; source: string; created_at: string;
  delivered_at: string | null; delivered_note: string | null;
}
export const REQUEST_COLUMNS = 'id, kind, title, details, name, phone, province, area, landmark, members, priority, lat, lng, status, delegate_id, source, created_at, delivered_at, delivered_note';

export const shapeRequest = (r: RequestRow) => ({
  id: r.id, kind: r.kind, title: r.title, details: r.details ?? '', name: r.name, phone: r.phone,
  province: r.province, area: r.area ?? '', landmark: r.landmark ?? '', members: r.members, priority: r.priority, lat: r.lat, lng: r.lng,
  status: r.status, delegateId: r.delegate_id, source: r.source, createdAt: r.created_at,
  deliveredAt: r.delivered_at, deliveredNote: r.delivered_note ?? '',
});

async function load(c: Ctx, id: number) {
  const row = await first<RequestRow>(c, `SELECT ${REQUEST_COLUMNS} FROM help_requests WHERE id = ? AND foundation_id = ? AND deleted_at IS NULL`, id, fid(c));
  if (!row) fail(404, 'الطلب غير موجود');
  return row;
}

export const zRequest = z.object({
  kind: z.enum(['general', 'doctor', 'medicine', 'food', 'money', 'home'], { error: 'نوع الطلب غير صحيح' }),
  title: z.string({ error: 'عنوان الطلب مطلوب' }).trim().min(3, 'عنوان الطلب قصير جداً').max(120),
  details: z.string().trim().max(2000).optional(),
  name: z.string({ error: 'الاسم مطلوب' }).trim().min(3, 'الاسم قصير جداً').max(120),
  phone: z.string({ error: 'رقم الهاتف مطلوب' }).trim().regex(/^07\d{9}$/, 'رقم الهاتف يبدأ بـ 07 ومن 11 رقماً'),
  province: z.string({ error: 'المحافظة مطلوبة' }).trim().min(2).max(40),
  area: z.string().trim().max(120).optional(),
  landmark: z.string().trim().max(200).optional(),
  members: z.coerce.number().int().min(1).max(30).default(1),
  priority: z.enum(['normal', 'medium', 'high']).default('normal'),
  delegateId: z.number().int().positive().nullable().optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
}).refine((b) => (b.lat == null) === (b.lng == null), { message: 'الموقع على الخريطة غير مكتمل' });

export async function ensureActiveDelegate(c: Ctx, foundationId: number, delegateId: number | null) {
  if (delegateId === null) return;
  const row = await first<{ id: number }>(c,
    "SELECT id FROM users WHERE id = ? AND foundation_id = ? AND role = 'delegate' AND active = 1",
    delegateId, foundationId);
  if (!row) fail(422, 'المندوب غير موجود أو موقوف');
}

export const requestColumns = (b: z.infer<typeof zRequest>) => ({
  kind: b.kind, title: b.title, details: b.details || null, name: b.name, phone: b.phone, province: b.province,
  area: b.area || null, landmark: b.landmark || null, members: b.members, priority: b.priority,
  lat: b.lat == null ? null : Math.round(b.lat * 1e6) / 1e6, lng: b.lng == null ? null : Math.round(b.lng * 1e6) / 1e6,
});

requests.get('/', async (c) => {
  const user = c.get('user');
  const rows = user.role === 'admin'
    ? await all<RequestRow>(c, `SELECT ${REQUEST_COLUMNS} FROM help_requests WHERE foundation_id = ? AND deleted_at IS NULL ORDER BY id DESC LIMIT 2000`, fid(c))
    : await all<RequestRow>(c, `SELECT ${REQUEST_COLUMNS} FROM help_requests
        WHERE foundation_id = ? AND delegate_id = ? AND deleted_at IS NULL ORDER BY id DESC LIMIT 2000`, fid(c), user.id);
  return c.json({ items: rows.map(shapeRequest) });
});

// The delegates a request can be given to.
requests.get('/delegates', async (c) => {
  const rows = await all<{ id: number; full_name: string }>(c,
    "SELECT id, full_name FROM users WHERE foundation_id = ? AND role = 'delegate' AND active = 1 ORDER BY full_name", fid(c));
  return c.json({ items: rows.map((r) => ({ id: r.id, name: r.full_name })) });
});

// ── the window for families' requests from the public link ──
interface WindowRow { requests_code: string | null; requests_open_from: string | null; requests_open_until: string | null }

export function windowState(w: { from: string | null; until: string | null }, now = Date.now()) {
  if (!w.from || !w.until) return 'closed' as const;
  if (Date.parse(w.until) <= Date.parse(w.from)) return 'closed' as const; // closed early by the manager
  if (now < Date.parse(w.from)) return 'scheduled' as const;
  if (now >= Date.parse(w.until)) return 'closed' as const;
  return 'open' as const;
}

const newCode = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

async function windowFor(c: Ctx) {
  const row = await first<WindowRow>(c, 'SELECT requests_code, requests_open_from, requests_open_until FROM foundations WHERE id = ?', fid(c));
  const from = row?.requests_open_from ?? null;
  const until = row?.requests_open_until ?? null;
  return { code: row?.requests_code ?? null, from, until, state: windowState({ from, until }) };
}

requests.get('/window', async (c) => c.json(await windowFor(c)));

const zIso = z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'وقت غير صحيح');

requests.put('/window', async (c) => {
  const body = await readJson(c, z.object({ from: zIso, until: zIso }).refine((b) => Date.parse(b.until) > Date.parse(b.from), {
    message: 'وقت الإغلاق يجب أن يكون بعد وقت الفتح',
  }).refine((b) => Date.parse(b.until) - Date.parse(b.from) <= 60 * 24 * 3600 * 1000, { message: 'أطول مدة للتسجيل 60 يوماً' }));
  const current = await windowFor(c);
  const code = current.code ?? newCode();
  const from = new Date(body.from).toISOString();
  const until = new Date(body.until).toISOString();
  await batch(c, [
    stmt(c, 'UPDATE foundations SET requests_code = ?, requests_open_from = ?, requests_open_until = ? WHERE id = ?', code, from, until, fid(c)),
    auditStmt(c, 'window', 'help_request', null, auditDetail('فترة استقبال الطلبات', { open_from: [current.from, from], open_until: [current.until, until] })),
  ]);
  return c.json(await windowFor(c));
});

// Closes the window now (the link stays the same for next time).
requests.delete('/window', async (c) => {
  const current = await windowFor(c);
  if (current.state === 'closed') return c.json(current);
  const now = new Date().toISOString();
  await batch(c, [
    // A scheduled window is closed too: its start moves to now, so it never opens.
    stmt(c, 'UPDATE foundations SET requests_open_from = MIN(COALESCE(requests_open_from, ?), ?), requests_open_until = ? WHERE id = ?', now, now, now, fid(c)),
    auditStmt(c, 'window_close', 'help_request', null, auditDetail('فترة استقبال الطلبات')),
  ]);
  return c.json(await windowFor(c));
});

// A new link (when the old one was passed to the wrong people); the old link stops working.
requests.post('/window/link', async (c) => {
  await batch(c, [
    stmt(c, 'UPDATE foundations SET requests_code = ? WHERE id = ?', newCode(), fid(c)),
    auditStmt(c, 'window_link', 'help_request', null, auditDetail('رابط استقبال الطلبات')),
  ]);
  return c.json(await windowFor(c));
});

requests.post('/', async (c) => {
  const body = await readJson(c, zRequest);
  const v = requestColumns(body);
  const delegateId = body.delegateId ?? null;
  await ensureActiveDelegate(c, fid(c), delegateId);
  const [created] = await batch(c, [
    stmt(c, `INSERT INTO help_requests (foundation_id, kind, title, details, name, phone, province, area, landmark, members, priority, delegate_id, lat, lng, source, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'staff', ?) RETURNING ${REQUEST_COLUMNS}`,
      fid(c), v.kind, v.title, v.details, v.name, v.phone, v.province, v.area, v.landmark, v.members, v.priority, delegateId, v.lat, v.lng, c.get('user').id),
    auditInsertedStmt(c, 'create', 'help_request', auditDetail(`${v.title} — ${v.name}`)),
    ...(delegateId !== null
      ? [notifyStmt(c, delegateId, 'request_assigned', 'طلب جديد مسند إليك', `${v.name} — ${v.title}`, '#/soon/requests')]
      : []),
  ]);
  return c.json(shapeRequest(created.results[0] as RequestRow), 201);
});

requests.patch('/:id', async (c) => {
  const id = idParam(c.req.param('id'));
  const body = await readJson(c, zRequest);
  const current = await load(c, id);
  if (Date.now() - Date.parse(current.created_at) > EDIT_WINDOW_MS) fail(409, 'انتهت مهلة التعديل');
  const nextDelegateId = body.delegateId === undefined ? current.delegate_id : body.delegateId;
  if (nextDelegateId !== current.delegate_id) await ensureActiveDelegate(c, fid(c), nextDelegateId);
  const next = { ...requestColumns(body), delegate_id: nextDelegateId };
  const changes = diff(current as unknown as Record<string, unknown>, next);
  if (!Object.keys(changes).length) return c.json(shapeRequest(current));
  const keys = Object.keys(next) as (keyof typeof next)[];
  const [updated] = await batch(c, [
    // scope-ok: ends with AND foundation_id = ? (the checker cuts nested templates)
    stmt(c, `UPDATE help_requests SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ? AND foundation_id = ? RETURNING ${REQUEST_COLUMNS}`,
      ...keys.map((k) => next[k]), new Date().toISOString(), id, fid(c)),
    auditStmt(c, 'update', 'help_request', id, auditDetail(`${next.title} — ${next.name}`, changes)),
    ...(nextDelegateId !== null && nextDelegateId !== current.delegate_id
      ? [notifyStmt(c, nextDelegateId, 'request_assigned', 'طلب جديد مسند إليك', `${next.name} — ${next.title}`, '#/soon/requests')]
      : []),
  ]);
  return c.json(shapeRequest(updated.results[0] as RequestRow));
});

const STATUS_LABEL: Record<string, string> = { pending: 'قيد الانتظار', review: 'قيد المراجعة', approved: 'تمت الموافقة', rejected: 'مرفوض', delivered: 'تم التسليم' };

requests.patch('/:id/status', async (c) => {
  const id = idParam(c.req.param('id'));
  const { status } = await readJson(c, z.object({ status: z.enum(['pending', 'review', 'approved', 'rejected']) }));
  const current = await load(c, id);
  if (current.status === status) return c.json(shapeRequest(current));
  const [updated] = await batch(c, [
    stmt(c, `UPDATE help_requests SET status = ?, updated_at = ? WHERE id = ? AND foundation_id = ? RETURNING ${REQUEST_COLUMNS}`,
      status, new Date().toISOString(), id, fid(c)),
    auditStmt(c, 'status', 'help_request', id,
      auditDetail(`${current.title} — ${current.name}`, { status: [STATUS_LABEL[current.status], STATUS_LABEL[status]] })),
  ]);
  return c.json(shapeRequest(updated.results[0] as RequestRow));
});

requests.patch('/:id/delegate', async (c) => {
  const id = idParam(c.req.param('id'));
  const { delegateId } = await readJson(c, z.object({ delegateId: z.number().int().positive().nullable() }));
  const current = await load(c, id);
  if (current.delegate_id === delegateId) return c.json(shapeRequest(current));
  const names = await all<{ id: number; full_name: string; active: number }>(c,
    "SELECT id, full_name, active FROM users WHERE foundation_id = ? AND role = 'delegate' AND id IN (?, ?)", fid(c), delegateId ?? 0, current.delegate_id ?? 0);
  const nameOf = (uid: number | null) => (uid === null ? null : names.find((n) => n.id === uid)?.full_name ?? null);
  if (delegateId !== null && !names.some((n) => n.id === delegateId && n.active === 1)) fail(422, 'المندوب غير موجود أو موقوف');
  const [updated] = await batch(c, [
    stmt(c, `UPDATE help_requests SET delegate_id = ?, updated_at = ? WHERE id = ? AND foundation_id = ? RETURNING ${REQUEST_COLUMNS}`,
      delegateId, new Date().toISOString(), id, fid(c)),
    auditStmt(c, 'assign', 'help_request', id,
      auditDetail(`${current.title} — ${current.name}`, { delegate: [nameOf(current.delegate_id), nameOf(delegateId)] })),
    ...(delegateId !== null
      ? [notifyStmt(c, delegateId, 'request_assigned', 'طلب جديد مسند إليك', `${current.name} — ${current.title}`, '#/soon/requests')]
      : []),
  ]);
  return c.json(shapeRequest(updated.results[0] as RequestRow));
});

// «تم التسليم»: the foundation's staff record that the help was handed over (and what it was).
// The request leaves the map, and its delegate gets a notification straight away.
requests.patch('/:id/deliver', async (c) => {
  const id = idParam(c.req.param('id'));
  const { note } = await readJson(c, z.object({ note: z.string().trim().min(2, 'اكتب ما تم تسليمه').max(300) }));
  const current = await load(c, id);
  if (current.status === 'delivered') fail(409, 'تم تسليم هذا الطلب مسبقاً');
  if (current.status === 'rejected') fail(409, 'لا يمكن تسليم طلب مرفوض');
  const now = new Date().toISOString();
  const [updated] = await batch(c, [
    stmt(c, `UPDATE help_requests SET status = 'delivered', delivered_at = ?, delivered_by = ?, delivered_note = ?, updated_at = ?
             WHERE id = ? AND foundation_id = ? RETURNING ${REQUEST_COLUMNS}`,
      now, c.get('user').id, note, now, id, fid(c)),
    auditStmt(c, 'deliver', 'help_request', id, auditDetail(`${current.title} — ${current.name}`, undefined, note)),
    ...(current.delegate_id !== null
      ? [notifyStmt(c, current.delegate_id, 'request_delivered', 'تم تسليم المساعدة', `${current.name}: ${note}`, '#/soon/requests')]
      : []),
  ]);
  return c.json(shapeRequest(updated.results[0] as RequestRow));
});

requests.delete('/:id', async (c) => {
  const id = idParam(c.req.param('id'));
  const current = await load(c, id);
  await batch(c, [
    stmt(c, 'UPDATE help_requests SET deleted_at = ? WHERE id = ? AND foundation_id = ?', new Date().toISOString(), id, fid(c)),
    auditStmt(c, 'delete', 'help_request', id, auditDetail(`${current.title} — ${current.name}`)),
  ]);
  return c.json({ ok: true });
});

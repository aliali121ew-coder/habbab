import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { requireRole } from '../lib/auth';
import { all, auditDetail, auditInsertedStmt, auditStmt, batch, diff, fid, first, stmt } from '../lib/db';
import { fail, idParam, readJson } from '../lib/http';

// طلبات المساعدة. The foundation's own requests only. A request can be changed for one hour after
// it is sent (the server checks the time, not the screen); the manager can move its status and
// remove it at any time.
export const requests = new Hono<AppEnv>();
requests.use('*', requireRole('admin'));

type Ctx = Context<AppEnv>;

const EDIT_WINDOW_MS = 60 * 60 * 1000;

interface Row {
  id: number; kind: string; title: string; details: string | null; name: string; phone: string;
  province: string; area: string | null; landmark: string | null; members: number; urgent: number;
  status: string; created_at: string;
}
const COLUMNS = 'id, kind, title, details, name, phone, province, area, landmark, members, urgent, status, created_at';

const shape = (r: Row) => ({
  id: r.id, kind: r.kind, title: r.title, details: r.details ?? '', name: r.name, phone: r.phone,
  province: r.province, area: r.area ?? '', landmark: r.landmark ?? '', members: r.members, urgent: r.urgent === 1,
  status: r.status, createdAt: r.created_at,
});

async function load(c: Ctx, id: number) {
  const row = await first<Row>(c, `SELECT ${COLUMNS} FROM help_requests WHERE id = ? AND foundation_id = ? AND deleted_at IS NULL`, id, fid(c));
  if (!row) fail(404, 'الطلب غير موجود');
  return row;
}

const zRequest = z.object({
  kind: z.enum(['general', 'doctor', 'medicine', 'food', 'money', 'home'], { error: 'نوع الطلب غير صحيح' }),
  title: z.string({ error: 'عنوان الطلب مطلوب' }).trim().min(3, 'عنوان الطلب قصير جداً').max(120),
  details: z.string().trim().max(2000).optional(),
  name: z.string({ error: 'الاسم مطلوب' }).trim().min(3, 'الاسم قصير جداً').max(120),
  phone: z.string({ error: 'رقم الهاتف مطلوب' }).trim().regex(/^07\d{9}$/, 'رقم الهاتف يبدأ بـ 07 ومن 11 رقماً'),
  province: z.string({ error: 'المحافظة مطلوبة' }).trim().min(2).max(40),
  area: z.string().trim().max(120).optional(),
  landmark: z.string().trim().max(200).optional(),
  members: z.coerce.number().int().min(1).max(30).default(1),
  urgent: z.boolean().default(false),
});

const toColumns = (b: z.infer<typeof zRequest>) => ({
  kind: b.kind, title: b.title, details: b.details || null, name: b.name, phone: b.phone, province: b.province,
  area: b.area || null, landmark: b.landmark || null, members: b.members, urgent: b.urgent ? 1 : 0,
});

requests.get('/', async (c) => {
  const rows = await all<Row>(c, `SELECT ${COLUMNS} FROM help_requests WHERE foundation_id = ? AND deleted_at IS NULL ORDER BY id DESC LIMIT 2000`, fid(c));
  return c.json({ items: rows.map(shape) });
});

requests.post('/', async (c) => {
  const body = await readJson(c, zRequest);
  const v = toColumns(body);
  const [created] = await batch(c, [
    stmt(c, `INSERT INTO help_requests (foundation_id, kind, title, details, name, phone, province, area, landmark, members, urgent, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING ${COLUMNS}`,
      fid(c), v.kind, v.title, v.details, v.name, v.phone, v.province, v.area, v.landmark, v.members, v.urgent, c.get('user').id),
    auditInsertedStmt(c, 'create', 'help_request', auditDetail(`${v.title} — ${v.name}`)),
  ]);
  return c.json(shape(created.results[0] as Row), 201);
});

requests.patch('/:id', async (c) => {
  const id = idParam(c.req.param('id'));
  const body = await readJson(c, zRequest);
  const current = await load(c, id);
  if (Date.now() - Date.parse(current.created_at) > EDIT_WINDOW_MS) fail(409, 'انتهت مهلة التعديل');
  const next = toColumns(body);
  const changes = diff(current as unknown as Record<string, unknown>, next);
  if (!Object.keys(changes).length) return c.json(shape(current));
  const keys = Object.keys(next) as (keyof typeof next)[];
  const [updated] = await batch(c, [
    // scope-ok: ends with AND foundation_id = ? (the checker cuts nested templates)
    stmt(c, `UPDATE help_requests SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ? AND foundation_id = ? RETURNING ${COLUMNS}`,
      ...keys.map((k) => next[k]), new Date().toISOString(), id, fid(c)),
    auditStmt(c, 'update', 'help_request', id, auditDetail(`${next.title} — ${next.name}`, changes)),
  ]);
  return c.json(shape(updated.results[0] as Row));
});

const STATUS_LABEL: Record<string, string> = { pending: 'قيد الانتظار', review: 'قيد المراجعة', approved: 'تمت الموافقة', rejected: 'مرفوض' };

requests.patch('/:id/status', async (c) => {
  const id = idParam(c.req.param('id'));
  const { status } = await readJson(c, z.object({ status: z.enum(['pending', 'review', 'approved', 'rejected']) }));
  const current = await load(c, id);
  if (current.status === status) return c.json(shape(current));
  const [updated] = await batch(c, [
    stmt(c, `UPDATE help_requests SET status = ?, updated_at = ? WHERE id = ? AND foundation_id = ? RETURNING ${COLUMNS}`,
      status, new Date().toISOString(), id, fid(c)),
    auditStmt(c, 'status', 'help_request', id,
      auditDetail(`${current.title} — ${current.name}`, { status: [STATUS_LABEL[current.status], STATUS_LABEL[status]] })),
  ]);
  return c.json(shape(updated.results[0] as Row));
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

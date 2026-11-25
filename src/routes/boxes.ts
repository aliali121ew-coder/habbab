import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { requireRole } from '../lib/auth';
import { all, auditDetail, auditInsertedStmt, auditStmt, batch, fid, first, stmt } from '../lib/db';
import { fail, idParam, parseOrFail, readJson, zAmount, zDate, zId, zText } from '../lib/http';
import { currentMonth } from '../lib/text';

// Charity boxes (صناديق الصدقات): who holds each box and what was collected from it, month by month.
export const boxes = new Hono<AppEnv>();
boxes.use('*', requireRole('admin', 'accountant'));

const zYear = z.coerce.number().int().min(2000).max(2100);
const optionalText = (max: number) => zText(max).nullable().optional().transform((value) => (value ? value : null));

const boxBody = {
  code: optionalText(20),
  holder_name: zText(120),
  delegate_id: zId.nullable().optional(),
  phone: optionalText(30),
  work: optionalText(80),
  address: optionalText(160),
  delivered_on: zDate,
  status: z.enum(['active', 'returned']).optional(),
  notes: optionalText(300),
};

const collectionBody = {
  amount: zAmount,
  collected_on: zDate,
  note: optionalText(200),
};

interface BoxRow {
  id: number;
  code: string | null;
  holder_name: string;
  delegate_id: number | null;
  phone: string | null;
  work: string | null;
  address: string | null;
  delivered_on: string;
  status: 'active' | 'returned';
  notes: string | null;
}

const BOX_COLUMNS = 'b.id, b.code, b.holder_name, b.delegate_id, b.phone, b.work, b.address, b.delivered_on, b.status, b.notes';

// A delegate holder's name comes from the users table, so the box never drifts from it.
async function holder(c: Parameters<typeof first>[0], delegateId: number | null | undefined, name: string) {
  if (!delegateId) {
    if (name.trim().length < 2) fail(422, 'اسم صاحب الصندوق مطلوب');
    return { delegate_id: null, holder_name: name.trim() };
  }
  const person = await first<{ full_name: string }>(c,
    "SELECT full_name FROM users WHERE id = ? AND foundation_id = ? AND role = 'delegate'", delegateId, fid(c));
  if (!person) fail(422, 'المندوب غير موجود');
  return { delegate_id: delegateId, holder_name: person.full_name };
}

// The year's boxes with each one's twelve monthly totals and its latest collection, plus the
// delegates (for the holder picker) and the foundation's monthly box income for the year before
// January (for January's change).
boxes.get('/', async (c) => {
  const year = parseOrFail(zYear, c.req.query('year') || currentMonth().slice(0, 4));
  const [rows, cells, latest, delegates, december] = await Promise.all([
    all<BoxRow & { delegate_name: string | null }>(c,
      `SELECT ${BOX_COLUMNS}, u.full_name AS delegate_name FROM charity_boxes b LEFT JOIN users u ON u.id = b.delegate_id
       WHERE b.foundation_id = ? AND b.deleted_at IS NULL ORDER BY b.status, b.holder_name`, fid(c)),
    all<{ box_id: number; month: string; total: number; count: number }>(c,
      `SELECT box_id, month, SUM(amount) AS total, COUNT(*) AS count FROM charity_box_collections
       WHERE foundation_id = ? AND month BETWEEN ? AND ? AND deleted_at IS NULL GROUP BY box_id, month`,
      fid(c), `${year}-01`, `${year}-12`),
    all<{ box_id: number; collected_on: string; amount: number }>(c,
      `SELECT box_id, collected_on, amount FROM charity_box_collections x
       WHERE foundation_id = ? AND deleted_at IS NULL AND collected_on = (
         SELECT MAX(collected_on) FROM charity_box_collections y WHERE y.box_id = x.box_id AND y.foundation_id = ? AND y.deleted_at IS NULL)`,
      fid(c), fid(c)),
    all<{ id: number; full_name: string }>(c,
      "SELECT id, full_name FROM users WHERE foundation_id = ? AND role = 'delegate' AND active = 1 ORDER BY full_name", fid(c)),
    all<{ box_id: number; total: number }>(c,
      `SELECT box_id, SUM(amount) AS total FROM charity_box_collections
       WHERE foundation_id = ? AND month = ? AND deleted_at IS NULL GROUP BY box_id`, fid(c), `${year - 1}-12`),
  ]);
  const months = new Map<number, number[]>();
  const counts = new Map<number, number[]>();
  cells.forEach((cell) => {
    const at = Number(cell.month.slice(5, 7)) - 1;
    const row = months.get(cell.box_id) ?? Array<number>(12).fill(0);
    const count = counts.get(cell.box_id) ?? Array<number>(12).fill(0);
    row[at] += cell.total;
    count[at] += cell.count;
    months.set(cell.box_id, row);
    counts.set(cell.box_id, count);
  });
  const last = new Map<number, { collected_on: string; amount: number }>();
  latest.forEach((row) => {
    const seen = last.get(row.box_id);
    last.set(row.box_id, { collected_on: row.collected_on, amount: (seen?.collected_on === row.collected_on ? seen.amount : 0) + row.amount });
  });
  const before = new Map(december.map((row) => [row.box_id, row.total]));
  return c.json({
    year,
    delegates,
    boxes: rows.map((row) => ({
      ...row,
      months: months.get(row.id) ?? Array<number>(12).fill(0),
      counts: counts.get(row.id) ?? Array<number>(12).fill(0),
      previous_december: before.get(row.id) ?? 0,
      last_collected_on: last.get(row.id)?.collected_on ?? null,
      last_amount: last.get(row.id)?.amount ?? null,
    })),
  });
});

// The foundation's box income per month of a year, for the yearly money record.
boxes.get('/monthly', async (c) => {
  const year = parseOrFail(zYear, c.req.query('year') || currentMonth().slice(0, 4));
  const rows = await all<{ month: string; total: number }>(c,
    `SELECT month, SUM(amount) AS total FROM charity_box_collections
     WHERE foundation_id = ? AND month BETWEEN ? AND ? AND deleted_at IS NULL GROUP BY month`,
    fid(c), `${year}-01`, `${year}-12`);
  const months = Array<number>(12).fill(0);
  rows.forEach((row) => { months[Number(row.month.slice(5, 7)) - 1] = row.total; });
  return c.json({ year, months });
});

// One box in full: its details and every collection, newest first.
boxes.get('/:id', async (c) => {
  const id = idParam(c.req.param('id'));
  const box = await first<BoxRow & { delegate_name: string | null; created_at: string }>(c,
    `SELECT ${BOX_COLUMNS}, b.created_at, u.full_name AS delegate_name FROM charity_boxes b LEFT JOIN users u ON u.id = b.delegate_id
     WHERE b.id = ? AND b.foundation_id = ? AND b.deleted_at IS NULL`, id, fid(c));
  if (!box) fail(404, 'الصندوق غير موجود');
  const [collections, delegates] = await Promise.all([
    all<{ id: number; amount: number; month: string; collected_on: string; note: string | null; created_by_name: string | null }>(c,
      `SELECT x.id, x.amount, x.month, x.collected_on, x.note, u.full_name AS created_by_name
       FROM charity_box_collections x LEFT JOIN users u ON u.id = x.created_by
       WHERE x.box_id = ? AND x.foundation_id = ? AND x.deleted_at IS NULL ORDER BY x.collected_on DESC, x.id DESC`, id, fid(c)),
    all<{ id: number; full_name: string }>(c,
      "SELECT id, full_name FROM users WHERE foundation_id = ? AND role = 'delegate' AND active = 1 ORDER BY full_name", fid(c)),
  ]);
  return c.json({ ...box, collections, delegates });
});

boxes.post('/', async (c) => {
  const body = await readJson(c, z.object(boxBody));
  const person = await holder(c, body.delegate_id, body.holder_name);
  const [inserted] = await batch(c, [
    stmt(c,
      `INSERT INTO charity_boxes (foundation_id, code, holder_name, delegate_id, phone, work, address, delivered_on, status, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      fid(c), body.code ?? null, person.holder_name, person.delegate_id, body.phone ?? null, body.work ?? null,
      body.address ?? null, body.delivered_on, body.status ?? 'active', body.notes ?? null, c.get('user').id),
    auditInsertedStmt(c, 'create', 'charity_box', auditDetail(person.holder_name)),
  ]);
  return c.json({ ok: true, id: inserted.meta.last_row_id }, 201);
});

boxes.patch('/:id', async (c) => {
  const id = idParam(c.req.param('id'));
  const body = await readJson(c, z.object(boxBody).partial().strict());
  const current = await first<BoxRow>(c, `SELECT ${BOX_COLUMNS} FROM charity_boxes b WHERE b.id = ? AND b.foundation_id = ? AND b.deleted_at IS NULL`, id, fid(c));
  if (!current) fail(404, 'الصندوق غير موجود');
  const next: Partial<BoxRow> = {};
  (['code', 'phone', 'work', 'address', 'delivered_on', 'status', 'notes'] as const).forEach((key) => {
    if (body[key] !== undefined) (next as Record<string, unknown>)[key] = body[key];
  });
  if (body.delegate_id !== undefined || body.holder_name !== undefined) {
    const person = await holder(c, body.delegate_id === undefined ? current.delegate_id : body.delegate_id, body.holder_name ?? current.holder_name);
    next.delegate_id = person.delegate_id;
    next.holder_name = person.holder_name;
  }
  const changes: Record<string, [unknown, unknown]> = {};
  for (const [key, value] of Object.entries(next) as [keyof BoxRow, unknown][]) {
    if (value !== current[key]) changes[key] = [current[key], value];
  }
  if (!Object.keys(changes).length) return c.json({ ok: true });
  const set = ['updated_at = ?'];
  const params: unknown[] = [new Date().toISOString()];
  Object.keys(changes).forEach((key) => { set.push(`${key} = ?`); params.push(next[key as keyof BoxRow]); });
  await batch(c, [
    stmt(c, `UPDATE charity_boxes SET ${set.join(', ')} WHERE id = ? AND foundation_id = ?`, ...params, id, fid(c)),
    auditStmt(c, 'update', 'charity_box', id, auditDetail(current.holder_name, changes)),
  ]);
  return c.json({ ok: true });
});

boxes.delete('/:id', async (c) => {
  const id = idParam(c.req.param('id'));
  const row = await first<{ holder_name: string }>(c, 'SELECT holder_name FROM charity_boxes WHERE id = ? AND foundation_id = ? AND deleted_at IS NULL', id, fid(c));
  if (!row) fail(404, 'الصندوق غير موجود');
  const now = new Date().toISOString();
  await batch(c, [
    stmt(c, 'UPDATE charity_boxes SET deleted_at = ? WHERE id = ? AND foundation_id = ?', now, id, fid(c)),
    stmt(c, 'UPDATE charity_box_collections SET deleted_at = ? WHERE box_id = ? AND foundation_id = ? AND deleted_at IS NULL', now, id, fid(c)),
    auditStmt(c, 'delete', 'charity_box', id, auditDetail(row.holder_name)),
  ]);
  return c.json({ ok: true });
});

boxes.post('/:id/collections', async (c) => {
  const id = idParam(c.req.param('id'));
  const body = await readJson(c, z.object(collectionBody));
  const box = await first<{ holder_name: string }>(c, 'SELECT holder_name FROM charity_boxes WHERE id = ? AND foundation_id = ? AND deleted_at IS NULL', id, fid(c));
  if (!box) fail(404, 'الصندوق غير موجود');
  if (body.collected_on > new Date().toISOString().slice(0, 10)) fail(422, 'تاريخ الاستلام في المستقبل');
  const [inserted] = await batch(c, [
    stmt(c,
      `INSERT INTO charity_box_collections (foundation_id, box_id, amount, month, collected_on, note, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      fid(c), id, body.amount, body.collected_on.slice(0, 7), body.collected_on, body.note ?? null, c.get('user').id),
    auditInsertedStmt(c, 'create', 'charity_box_collection', auditDetail(box.holder_name, undefined, JSON.stringify({ amount: body.amount, collected_on: body.collected_on }))),
  ]);
  return c.json({ ok: true, id: inserted.meta.last_row_id }, 201);
});

boxes.patch('/collections/:cid', async (c) => {
  const cid = idParam(c.req.param('cid'));
  const body = await readJson(c, z.object(collectionBody).partial().strict());
  const current = await first<{ amount: number; collected_on: string; note: string | null; holder_name: string }>(c,
    `SELECT x.amount, x.collected_on, x.note, b.holder_name FROM charity_box_collections x JOIN charity_boxes b ON b.id = x.box_id
     WHERE x.id = ? AND x.foundation_id = ? AND x.deleted_at IS NULL`, cid, fid(c));
  if (!current) fail(404, 'الاستلام غير موجود');
  if (body.collected_on && body.collected_on > new Date().toISOString().slice(0, 10)) fail(422, 'تاريخ الاستلام في المستقبل');
  const changes: Record<string, [unknown, unknown]> = {};
  (['amount', 'collected_on', 'note'] as const).forEach((key) => {
    if (body[key] !== undefined && body[key] !== current[key]) changes[key] = [current[key], body[key]];
  });
  if (!Object.keys(changes).length) return c.json({ ok: true });
  const set = ['updated_at = ?'];
  const params: unknown[] = [new Date().toISOString()];
  Object.keys(changes).forEach((key) => { set.push(`${key} = ?`); params.push(changes[key][1]); });
  if ('collected_on' in changes) { set.push('month = ?'); params.push(String(changes.collected_on[1]).slice(0, 7)); }
  await batch(c, [
    stmt(c, `UPDATE charity_box_collections SET ${set.join(', ')} WHERE id = ? AND foundation_id = ?`, ...params, cid, fid(c)),
    auditStmt(c, 'update', 'charity_box_collection', cid, auditDetail(current.holder_name, changes)),
  ]);
  return c.json({ ok: true });
});

boxes.delete('/collections/:cid', async (c) => {
  const cid = idParam(c.req.param('cid'));
  const row = await first<{ amount: number; holder_name: string }>(c,
    `SELECT x.amount, b.holder_name FROM charity_box_collections x JOIN charity_boxes b ON b.id = x.box_id
     WHERE x.id = ? AND x.foundation_id = ? AND x.deleted_at IS NULL`, cid, fid(c));
  if (!row) fail(404, 'الاستلام غير موجود');
  await batch(c, [
    stmt(c, 'UPDATE charity_box_collections SET deleted_at = ? WHERE id = ? AND foundation_id = ?', new Date().toISOString(), cid, fid(c)),
    auditStmt(c, 'delete', 'charity_box_collection', cid, auditDetail(row.holder_name, undefined, JSON.stringify({ amount: row.amount }))),
  ]);
  return c.json({ ok: true });
});

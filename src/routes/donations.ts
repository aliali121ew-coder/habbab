import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { requireRole } from '../lib/auth';
import { all, auditDetail, auditInsertedStmt, auditStmt, batch, fid, first, stmt } from '../lib/db';
import { fail, idParam, parseOrFail, readJson, zDate, zText } from '../lib/http';
import { currentMonth } from '../lib/text';

// Donations received (المساعدات): the donor — inside the foundation or outside it — and what they
// gave, money or goods. Cash donations are the «التبرعات المالية» figure on the money pages.
export const donations = new Hono<AppEnv>();
donations.use('*', requireRole('admin', 'accountant'));

const zYear = z.coerce.number().int().min(2000).max(2100);
const optionalText = (max: number) => zText(max).nullable().optional().transform((value) => (value ? value : null));
const zMoney = z.number().int().positive().max(10_000_000_000).nullable().optional();

const body = {
  donor_name: zText(120).min(2, 'اسم المتبرع مطلوب'),
  donor_type: z.enum(['internal', 'external']),
  donor_phone: optionalText(30),
  kind: z.enum(['cash', 'in_kind']),
  amount: zMoney,
  item: optionalText(120),
  quantity: z.number().positive().max(1_000_000).nullable().optional(),
  unit: optionalText(30),
  purpose: optionalText(80),
  received_on: zDate,
  receipt_no: optionalText(40),
  note: optionalText(300),
};

type Row = {
  id: number;
  donor_name: string;
  donor_type: 'internal' | 'external';
  donor_phone: string | null;
  kind: 'cash' | 'in_kind';
  amount: number | null;
  item: string | null;
  quantity: number | null;
  unit: string | null;
  purpose: string | null;
  received_on: string;
  receipt_no: string | null;
  note: string | null;
};

const COLUMNS = 'd.id, d.donor_name, d.donor_type, d.donor_phone, d.kind, d.amount, d.item, d.quantity, d.unit, d.purpose, d.received_on, d.receipt_no, d.note';

function check(entry: { kind: 'cash' | 'in_kind'; amount?: number | null; item?: string | null }) {
  if (entry.kind === 'cash' && !entry.amount) fail(422, 'اكتب مبلغ التبرع');
  if (entry.kind === 'in_kind' && !entry.item) fail(422, 'اكتب ما تم التبرع به');
}

// A year of donations with who recorded each, newest first. A year holds a few thousand at most.
donations.get('/', async (c) => {
  const year = parseOrFail(zYear, c.req.query('year') || currentMonth().slice(0, 4));
  const [items, before] = await Promise.all([
    all<Row & { created_by_name: string | null }>(c,
      `SELECT ${COLUMNS}, u.full_name AS created_by_name FROM donations d LEFT JOIN users u ON u.id = d.created_by
       WHERE d.foundation_id = ? AND d.month BETWEEN ? AND ? AND d.deleted_at IS NULL
       ORDER BY d.received_on DESC, d.id DESC LIMIT 5000`, fid(c), `${year}-01`, `${year}-12`),
    // Last December's cash, for January's change.
    first<{ total: number | null }>(c,
      "SELECT SUM(amount) AS total FROM donations WHERE foundation_id = ? AND month = ? AND kind = 'cash' AND deleted_at IS NULL",
      fid(c), `${year - 1}-12`),
  ]);
  return c.json({ year, items, previous_december_cash: before?.total ?? 0 });
});

// Cash donations per month of a year, for the money pages' cards and balance.
donations.get('/monthly', async (c) => {
  const year = parseOrFail(zYear, c.req.query('year') || currentMonth().slice(0, 4));
  const rows = await all<{ month: string; total: number; donors: number }>(c,
    `SELECT month, SUM(amount) AS total, COUNT(DISTINCT donor_name) AS donors FROM donations
     WHERE foundation_id = ? AND month BETWEEN ? AND ? AND kind = 'cash' AND deleted_at IS NULL GROUP BY month`,
    fid(c), `${year}-01`, `${year}-12`);
  const months = Array<number>(12).fill(0);
  const donors = Array<number>(12).fill(0);
  rows.forEach((row) => {
    const at = Number(row.month.slice(5, 7)) - 1;
    months[at] = row.total;
    donors[at] = row.donors;
  });
  return c.json({ year, months, donors });
});

// One donor's file: every gift they ever gave (by name, as the register keys donors), plus where
// they stand in the year — their rank among cash donors and their share of the year's cash.
donations.get('/donor', async (c) => {
  const name = parseOrFail(zText(120).min(1, 'اسم المتبرع مطلوب'), c.req.query('name'));
  const year = parseOrFail(zYear, c.req.query('year') || currentMonth().slice(0, 4));
  const [items, totals] = await Promise.all([
    all<Row & { created_by_name: string | null }>(c,
      `SELECT ${COLUMNS}, u.full_name AS created_by_name FROM donations d LEFT JOIN users u ON u.id = d.created_by
       WHERE d.foundation_id = ? AND d.donor_name = ? AND d.deleted_at IS NULL
       ORDER BY d.received_on DESC, d.id DESC LIMIT 2000`, fid(c), name),
    all<{ donor_name: string; total: number }>(c,
      `SELECT donor_name, SUM(amount) AS total FROM donations
       WHERE foundation_id = ? AND month BETWEEN ? AND ? AND kind = 'cash' AND deleted_at IS NULL
       GROUP BY donor_name ORDER BY total DESC`, fid(c), `${year}-01`, `${year}-12`),
  ]);
  if (!items.length) fail(404, 'لا تبرعات بهذا الاسم');
  const yearCash = totals.reduce((sum, row) => sum + row.total, 0);
  const at = totals.findIndex((row) => row.donor_name === name);
  return c.json({
    name,
    year,
    items,
    year_cash: yearCash,
    donors_count: totals.length,
    rank: at >= 0 ? at + 1 : null,
  });
});

donations.post('/', async (c) => {
  const entry = await readJson(c, z.object(body));
  check(entry);
  if (entry.received_on > new Date().toISOString().slice(0, 10)) fail(422, 'التاريخ في المستقبل');
  const [inserted] = await batch(c, [
    stmt(c,
      `INSERT INTO donations (foundation_id, donor_name, donor_type, donor_phone, kind, amount, item, quantity, unit, purpose, received_on, month, receipt_no, note, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      fid(c), entry.donor_name, entry.donor_type, entry.donor_phone ?? null, entry.kind, entry.amount ?? null,
      entry.kind === 'in_kind' ? entry.item ?? null : null, entry.kind === 'in_kind' ? entry.quantity ?? null : null,
      entry.kind === 'in_kind' ? entry.unit ?? null : null, entry.purpose ?? null, entry.received_on, entry.received_on.slice(0, 7),
      entry.receipt_no ?? null, entry.note ?? null, c.get('user').id),
    auditInsertedStmt(c, 'create', 'donation', auditDetail(entry.donor_name, undefined, JSON.stringify({ kind: entry.kind, amount: entry.amount ?? null, item: entry.item ?? null }))),
  ]);
  return c.json({ ok: true, id: inserted.meta.last_row_id }, 201);
});

donations.patch('/:id', async (c) => {
  const id = idParam(c.req.param('id'));
  const entry = await readJson(c, z.object(body).partial().strict());
  const current = await first<Row>(c, `SELECT ${COLUMNS} FROM donations d WHERE d.id = ? AND d.foundation_id = ? AND d.deleted_at IS NULL`, id, fid(c));
  if (!current) fail(404, 'التبرع غير موجود');
  const next = { ...current, ...Object.fromEntries(Object.entries(entry).filter(([, value]) => value !== undefined)) } as Row;
  if (next.kind === 'cash') { next.item = null; next.quantity = null; next.unit = null; }
  check(next);
  if (next.received_on > new Date().toISOString().slice(0, 10)) fail(422, 'التاريخ في المستقبل');
  const changes: Record<string, [unknown, unknown]> = {};
  (Object.keys(next) as (keyof Row)[]).forEach((key) => {
    if (key !== 'id' && next[key] !== current[key]) changes[key] = [current[key], next[key]];
  });
  if (!Object.keys(changes).length) return c.json({ ok: true });
  const set = ['updated_at = ?'];
  const params: unknown[] = [new Date().toISOString()];
  Object.keys(changes).forEach((key) => { set.push(`${key} = ?`); params.push(changes[key][1]); });
  if ('received_on' in changes) { set.push('month = ?'); params.push(next.received_on.slice(0, 7)); }
  await batch(c, [
    stmt(c, `UPDATE donations SET ${set.join(', ')} WHERE id = ? AND foundation_id = ?`, ...params, id, fid(c)),
    auditStmt(c, 'update', 'donation', id, auditDetail(current.donor_name, changes)),
  ]);
  return c.json({ ok: true });
});

donations.delete('/:id', async (c) => {
  const id = idParam(c.req.param('id'));
  const row = await first<{ donor_name: string; kind: string; amount: number | null }>(c,
    'SELECT donor_name, kind, amount FROM donations WHERE id = ? AND foundation_id = ? AND deleted_at IS NULL', id, fid(c));
  if (!row) fail(404, 'التبرع غير موجود');
  await batch(c, [
    stmt(c, 'UPDATE donations SET deleted_at = ? WHERE id = ? AND foundation_id = ?', new Date().toISOString(), id, fid(c)),
    auditStmt(c, 'delete', 'donation', id, auditDetail(row.donor_name, undefined, JSON.stringify({ kind: row.kind, amount: row.amount }))),
  ]);
  return c.json({ ok: true });
});

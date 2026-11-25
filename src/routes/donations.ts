import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { requireRole } from '../lib/auth';
import { all, auditDetail, auditInsertedStmt, auditStmt, batch, fid, first, stmt } from '../lib/db';
import { fail, idParam, parseOrFail, readJson, zDate, zText } from '../lib/http';
import { currentMonth } from '../lib/text';
import { putEncrypted, readImage, signFileLink } from './prescriptions';

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
  donor_address: optionalText(160),
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
  donor_address: string | null;
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

const COLUMNS = 'd.id, d.donor_name, d.donor_type, d.donor_phone, d.donor_address, d.kind, d.amount, d.item, d.quantity, d.unit, d.purpose, d.received_on, d.receipt_no, d.note';

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

// The foundation's active delegates, offered as donors «من داخل المؤسسة».
donations.get('/delegates', async (c) => {
  const delegates = await all<{ id: number; full_name: string; phone: string | null }>(c,
    "SELECT id, full_name, phone FROM users WHERE foundation_id = ? AND role = 'delegate' AND active = 1 ORDER BY full_name", fid(c));
  return c.json({ delegates });
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
  const photo = await first<{ file_key: string }>(c, 'SELECT file_key FROM donor_photos WHERE foundation_id = ? AND donor_name = ?', fid(c), name);
  const yearCash = totals.reduce((sum, row) => sum + row.total, 0);
  const at = totals.findIndex((row) => row.donor_name === name);
  return c.json({
    name,
    year,
    items,
    year_cash: yearCash,
    donors_count: totals.length,
    rank: at >= 0 ? at + 1 : null,
    photo_url: photo ? await signFileLink(c, photo.file_key) : null,
  });
});

// Every donor in the register (all years): their total cash, how many gifts, in-kind gifts, first
// and last gift, how to reach them and their photo. Largest givers first.
donations.get('/donors', async (c) => {
  const [rows, photos] = await Promise.all([
    all<{
      donor_name: string; gifts: number; cash: number; goods: number; first_on: string; last_on: string;
      phone: string | null; address: string | null; internal: number;
    }>(c,
      `SELECT donor_name, COUNT(*) AS gifts,
         SUM(CASE WHEN kind = 'cash' THEN amount ELSE 0 END) AS cash,
         SUM(CASE WHEN kind = 'in_kind' THEN 1 ELSE 0 END) AS goods,
         MIN(received_on) AS first_on, MAX(received_on) AS last_on,
         MAX(donor_phone) AS phone, MAX(donor_address) AS address,
         MAX(CASE WHEN donor_type = 'internal' THEN 1 ELSE 0 END) AS internal
       FROM donations WHERE foundation_id = ? AND deleted_at IS NULL
       GROUP BY donor_name ORDER BY cash DESC, gifts DESC LIMIT 3000`, fid(c)),
    all<{ donor_name: string; file_key: string }>(c, 'SELECT donor_name, file_key FROM donor_photos WHERE foundation_id = ?', fid(c)),
  ]);
  const keys = new Map(photos.map((row) => [row.donor_name, row.file_key]));
  const donors = await Promise.all(rows.map(async (row) => ({
    name: row.donor_name,
    gifts: row.gifts,
    cash: row.cash ?? 0,
    goods: row.goods ?? 0,
    first_on: row.first_on,
    last_on: row.last_on,
    phone: row.phone,
    address: row.address,
    type: row.internal ? 'internal' : 'external',
    photo_url: keys.has(row.donor_name) ? await signFileLink(c, keys.get(row.donor_name)!) : null,
  })));
  return c.json({ donors });
});

// A donor's photo: multipart with `name` and `image` (already squared and compressed on the device).
donations.post('/donor/photo', async (c) => {
  const form = await c.req.formData().catch(() => fail(400, 'صيغة الطلب غير صحيحة'));
  const name = parseOrFail(zText(120).min(1, 'اسم المتبرع مطلوب'), form.get('name'));
  const image = await readImage(form.get('image'), 400 * 1024);
  if (!image) fail(422, 'الصورة مطلوبة');
  const known = await first(c, 'SELECT 1 FROM donations WHERE foundation_id = ? AND donor_name = ? AND deleted_at IS NULL LIMIT 1', fid(c), name);
  if (!known) fail(404, 'لا تبرعات بهذا الاسم');
  const old = await first<{ file_key: string }>(c, 'SELECT file_key FROM donor_photos WHERE foundation_id = ? AND donor_name = ?', fid(c), name);
  const key = `donors/${crypto.randomUUID()}.bin`;
  await putEncrypted(c, key, image);
  await batch(c, [
    stmt(c,
      `INSERT INTO donor_photos (foundation_id, donor_name, file_key, updated_by) VALUES (?, ?, ?, ?)
       ON CONFLICT(foundation_id, donor_name) DO UPDATE SET file_key = excluded.file_key, updated_by = excluded.updated_by,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
      fid(c), name, key, c.get('user').id),
    auditStmt(c, 'update_photo', 'donor', null, auditDetail(name)),
  ]);
  if (old) c.executionCtx.waitUntil(c.env.FILES.delete(old.file_key));
  return c.json({ photo_url: await signFileLink(c, key) });
});

donations.post('/', async (c) => {
  const entry = await readJson(c, z.object(body));
  check(entry);
  // A new donation always says how to reach the donor.
  if (!entry.donor_phone || entry.donor_phone.replace(/\D/g, '').length < 7) fail(422, 'رقم هاتف المتبرع مطلوب');
  if (!entry.donor_address || entry.donor_address.trim().length < 3) fail(422, 'عنوان المتبرع مطلوب');
  if (entry.received_on > new Date().toISOString().slice(0, 10)) fail(422, 'التاريخ في المستقبل');
  const [inserted] = await batch(c, [
    stmt(c,
      `INSERT INTO donations (foundation_id, donor_name, donor_type, donor_phone, donor_address, kind, amount, item, quantity, unit, purpose, received_on, month, receipt_no, note, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      fid(c), entry.donor_name, entry.donor_type, entry.donor_phone ?? null, entry.donor_address ?? null, entry.kind, entry.amount ?? null,
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

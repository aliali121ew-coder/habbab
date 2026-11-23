import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { requireRole } from '../lib/auth';
import { all, auditDetail, auditInsertedStmt, auditStmt, batch, fid, first, stmt } from '../lib/db';
import { fail, idParam, parseOrFail, readJson, zAmount, zDate, zId, zMonth, zText } from '../lib/http';
import { currentMonth } from '../lib/text';
import { putEncrypted, signFileLink } from './prescriptions';

// The seventeen headings of the paper sheet, in its order.
export const EXPENSE_CATEGORIES = [
  'cash_gift', 'medicine', 'foundation_balance', 'patient_aid', 'salaries', 'building_aid',
  'operation_aid', 'marriage_aid', 'food', 'general_aid', 'cattle', 'foundation_costs',
  'appliances', 'prayer_fasting', 'religious_events', 'appliance_repair', 'other_aid',
] as const;

const zCategory = z.enum(EXPENSE_CATEGORIES, { error: 'نوع الصرف غير صحيح' });

// A month holds a few hundred entries at most; the cap keeps one response bounded.
const MONTH_LIMIT = 5000;
// Receipts: a compressed photo or a scanned PDF.
const MAX_FILE = 2 * 1024 * 1024;
const MAX_FILES_PER_EXPENSE = 10;

// Every entry says who received it and what it was for; a subscriber picked from the register
// is linked by id, anyone else (a supplier, a member of staff) is named only.
const entry = {
  category: zCategory,
  amount: zAmount,
  spent_on: zDate,
  beneficiary_id: zId.nullable().optional(),
  beneficiary_name: zText(120).min(2, 'اسم المستفيد مطلوب'),
  details: zText(300).min(2, 'وصف الصرف مطلوب'),
};

type Row = {
  id: number;
  category: string;
  amount: number;
  spent_on: string;
  details: string | null;
  beneficiary_id: number | null;
  beneficiary_name: string | null;
};

const COLUMNS = 'e.id, e.category, e.amount, e.spent_on, e.details, e.beneficiary_id, e.beneficiary_name';

// The subscriber's name as the register holds it, so a linked entry never drifts from it.
async function beneficiary(c: Parameters<typeof first>[0], id: number | null | undefined, name: string) {
  if (!id) return { id: null, name };
  const person = await first<{ full_name: string }>(c,
    'SELECT full_name FROM subscribers WHERE id = ? AND foundation_id = ? AND deleted_at IS NULL', id, fid(c));
  if (!person) fail(422, 'المستفيد غير موجود في سجل المشتركين');
  return { id, name: person.full_name };
}

function fileType(bytes: Uint8Array): string | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (ascii(0, 5) === '%PDF-') return 'application/pdf';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && ascii(1, 4) === 'PNG') return 'image/png';
  return null;
}

export const expenses = new Hono<AppEnv>();
expenses.use('*', requireRole('admin', 'accountant'));

// The longest span one request may cover: a year and a day, so a full year from any date fits.
const MAX_SPAN_DAYS = 366;

// The entries of a period with who recorded them, plus the twelve monthly totals of the year the
// period ends in. The period is ?from=YYYY-MM-DD&to=YYYY-MM-DD (days by spent_on), or ?month=YYYY-MM.
expenses.get('/', async (c) => {
  let from: string;
  let to: string;
  if (c.req.query('from') || c.req.query('to')) {
    from = parseOrFail(zDate, c.req.query('from'));
    to = parseOrFail(zDate, c.req.query('to'));
    const start = Date.parse(`${from}T00:00:00Z`);
    const end = Date.parse(`${to}T00:00:00Z`);
    if (Number.isNaN(start) || Number.isNaN(end)) fail(422, 'تاريخ غير صحيح');
    if (end < start) fail(422, 'بداية المدة بعد نهايتها');
    if ((end - start) / 86_400_000 > MAX_SPAN_DAYS) fail(422, 'المدة أطول من سنة');
  } else {
    const month = parseOrFail(zMonth, c.req.query('month') || currentMonth());
    from = `${month}-01`;
    to = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
  }
  const year = to.slice(0, 4);
  const [items, totals] = await Promise.all([
    all<Row & { created_at: string; created_by_name: string | null; files: number }>(
      c,
      // The month bounds let the month index narrow the scan before the day filter.
      `SELECT ${COLUMNS}, e.created_at, u.full_name AS created_by_name,
         (SELECT COUNT(*) FROM expense_files f WHERE f.expense_id = e.id AND f.deleted_at IS NULL) AS files
       FROM expenses e LEFT JOIN users u ON u.id = e.created_by
       WHERE e.foundation_id = ? AND e.month BETWEEN ? AND ? AND e.spent_on BETWEEN ? AND ? AND e.deleted_at IS NULL
       ORDER BY e.spent_on DESC, e.id DESC LIMIT ${MONTH_LIMIT}`,
      fid(c), from.slice(0, 7), to.slice(0, 7), from, to,
    ),
    all<{ month: string; total: number; count: number }>(
      c,
      `SELECT month, SUM(amount) AS total, COUNT(*) AS count FROM expenses
       WHERE foundation_id = ? AND month BETWEEN ? AND ? AND deleted_at IS NULL GROUP BY month`,
      fid(c), `${year}-01`, `${year}-12`,
    ),
  ]);
  const byMonth = new Map(totals.map((row) => [Number(row.month.slice(5, 7)) - 1, row]));
  return c.json({
    month: to.slice(0, 7),
    from,
    to,
    items,
    year: Array.from({ length: 12 }, (_, index) => ({ total: byMonth.get(index)?.total ?? 0, count: byMonth.get(index)?.count ?? 0 })),
  });
});

// The year's ledger: one total per month and heading, for the month-by-month comparison page.
// Only the pairs that had spending come back; the page builds its columns from them.
expenses.get('/ledger', async (c) => {
  const year = parseOrFail(z.coerce.number().int().min(2000).max(2100), c.req.query('year') || currentMonth().slice(0, 4));
  const cells = await all<{ month: string; category: string; total: number; count: number }>(
    c,
    `SELECT month, category, SUM(amount) AS total, COUNT(*) AS count FROM expenses
     WHERE foundation_id = ? AND month BETWEEN ? AND ? AND deleted_at IS NULL GROUP BY month, category`,
    fid(c), `${year}-01`, `${year}-12`,
  );
  return c.json({
    year,
    cells: cells.map((cell) => ({ month: Number(cell.month.slice(5, 7)) - 1, category: cell.category, total: cell.total, count: cell.count })),
  });
});

// One entry in full: its receipts and every change made to it, newest first.
expenses.get('/:id', async (c) => {
  const id = idParam(c.req.param('id'));
  const row = await first<Row & { created_at: string; updated_at: string | null; created_by_name: string | null }>(
    c,
    `SELECT ${COLUMNS}, e.created_at, e.updated_at, u.full_name AS created_by_name
     FROM expenses e LEFT JOIN users u ON u.id = e.created_by WHERE e.id = ? AND e.foundation_id = ? AND e.deleted_at IS NULL`,
    id, fid(c),
  );
  if (!row) fail(404, 'القيد غير موجود');
  const [files, history] = await Promise.all([
    all<{ id: number; file_key: string; name: string; type: string; size: number; created_at: string }>(
      c, 'SELECT id, file_key, name, type, size, created_at FROM expense_files WHERE expense_id = ? AND foundation_id = ? AND deleted_at IS NULL ORDER BY id', id, fid(c),
    ),
    all<{ action: string; detail: string | null; created_at: string; user_name: string | null }>(
      c,
      `SELECT a.action, a.detail, a.created_at, u.full_name AS user_name
       FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
       WHERE a.entity = 'expense' AND a.entity_id = ? AND a.foundation_id = ? ORDER BY a.id DESC LIMIT 50`,
      id, fid(c),
    ),
  ]);
  return c.json({
    ...row,
    files: await Promise.all(files.map(async ({ file_key, ...file }) => ({ ...file, url: await signFileLink(c, file_key) }))),
    history,
  });
});

expenses.post('/', async (c) => {
  const body = await readJson(c, z.object(entry));
  const person = await beneficiary(c, body.beneficiary_id, body.beneficiary_name);
  const [inserted] = await batch(c, [
    stmt(c,
      `INSERT INTO expenses (foundation_id, category, amount, month, spent_on, details, beneficiary_id, beneficiary_name, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      fid(c), body.category, body.amount, body.spent_on.slice(0, 7), body.spent_on, body.details, person.id, person.name, c.get('user').id),
    auditInsertedStmt(c, 'create', 'expense', auditDetail(person.name, undefined, JSON.stringify({ category: body.category, amount: body.amount }))),
  ]);
  // The new id lets the dialog attach receipts straight after saving.
  return c.json({ ok: true, id: inserted.meta.last_row_id }, 201);
});

// The audit detail records each changed field as [before, after], so the history shows what moved.
expenses.patch('/:id', async (c) => {
  const id = idParam(c.req.param('id'));
  const body = await readJson(c, z.object(entry).partial().strict());
  const current = await first<Row>(c, `SELECT ${COLUMNS} FROM expenses e WHERE e.id = ? AND e.foundation_id = ? AND e.deleted_at IS NULL`, id, fid(c));
  if (!current) fail(404, 'القيد غير موجود');

  const next: Partial<Row> = {};
  if (body.category !== undefined) next.category = body.category;
  if (body.amount !== undefined) next.amount = body.amount;
  if (body.spent_on !== undefined) next.spent_on = body.spent_on;
  if (body.details !== undefined) next.details = body.details;
  if (body.beneficiary_name !== undefined || body.beneficiary_id !== undefined) {
    const person = await beneficiary(c, body.beneficiary_id ?? null, body.beneficiary_name ?? current.beneficiary_name ?? '');
    next.beneficiary_id = person.id;
    next.beneficiary_name = person.name;
  }

  const changes: Record<string, [unknown, unknown]> = {};
  for (const [key, value] of Object.entries(next) as [keyof Row, unknown][]) {
    if (value !== current[key]) changes[key] = [current[key], value];
  }
  if (!Object.keys(changes).length) return c.json({ ok: true });

  const set = ['updated_at = ?'];
  const params: unknown[] = [new Date().toISOString()];
  for (const key of Object.keys(changes)) {
    set.push(`${key} = ?`);
    params.push(next[key as keyof Row]);
  }
  if ('spent_on' in changes) {
    set.push('month = ?');
    params.push(String(next.spent_on).slice(0, 7));
  }
  await batch(c, [
    stmt(c, `UPDATE expenses SET ${set.join(', ')} WHERE id = ? AND foundation_id = ?`, ...params, id, fid(c)),
    auditStmt(c, 'update', 'expense', id, auditDetail(current.beneficiary_name, changes)),
  ]);
  return c.json({ ok: true });
});

expenses.delete('/:id', async (c) => {
  const id = idParam(c.req.param('id'));
  const row = await first<{ beneficiary_name: string | null; category: string; amount: number }>(c,
    'SELECT beneficiary_name, category, amount FROM expenses WHERE id = ? AND foundation_id = ? AND deleted_at IS NULL', id, fid(c));
  if (!row) fail(404, 'القيد غير موجود');
  await batch(c, [
    stmt(c, 'UPDATE expenses SET deleted_at = ? WHERE id = ? AND foundation_id = ?', new Date().toISOString(), id, fid(c)),
    auditStmt(c, 'delete', 'expense', id, auditDetail(row.beneficiary_name, undefined, JSON.stringify({ category: row.category, amount: row.amount }))),
  ]);
  return c.json({ ok: true });
});

// One receipt per request: multipart with a single `file`.
expenses.post('/:id/files', async (c) => {
  const id = idParam(c.req.param('id'));
  const length = Number(c.req.header('content-length') ?? 0);
  if (length > MAX_FILE + 8 * 1024) fail(413, 'حجم الملف أكبر من 2 ميغابايت');
  if (!(await first(c, 'SELECT id FROM expenses WHERE id = ? AND foundation_id = ? AND deleted_at IS NULL', id, fid(c)))) fail(404, 'القيد غير موجود');
  const count = await first<{ n: number }>(c, 'SELECT COUNT(*) AS n FROM expense_files WHERE expense_id = ? AND foundation_id = ? AND deleted_at IS NULL', id, fid(c));
  if ((count?.n ?? 0) >= MAX_FILES_PER_EXPENSE) fail(422, 'وصل القيد إلى الحد الأعلى للمرفقات');

  const form = await c.req.formData().catch(() => fail(400, 'صيغة الطلب غير صحيحة'));
  const file = form.get('file');
  if (!file || typeof file === 'string') fail(422, 'لم يُرفق ملف');
  if (file.size > MAX_FILE) fail(413, 'حجم الملف أكبر من 2 ميغابايت');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = fileType(bytes);
  if (!type) fail(422, 'نوع الملف غير مدعوم: صورة أو PDF فقط');
  const name = (file.name || 'مرفق').slice(0, 120);

  // A random key: nothing about the expense appears in storage paths or links.
  const key = `exp/${crypto.randomUUID()}.bin`;
  await putEncrypted(c, key, { bytes, contentType: type });
  try {
    await batch(c, [
      stmt(c, 'INSERT INTO expense_files (foundation_id, expense_id, file_key, name, type, size, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
        fid(c), id, key, name, type, bytes.length, c.get('user').id),
      auditStmt(c, 'attach', 'expense', id, auditDetail(null, undefined, name)),
    ]);
  } catch (error) {
    c.executionCtx.waitUntil(c.env.FILES.delete(key));
    throw error;
  }
  return c.json({ ok: true }, 201);
});

expenses.delete('/:id/files/:fileId', async (c) => {
  const id = idParam(c.req.param('id'));
  const fileId = idParam(c.req.param('fileId'));
  const file = await first<{ name: string }>(c,
    'SELECT name FROM expense_files WHERE id = ? AND expense_id = ? AND foundation_id = ? AND deleted_at IS NULL', fileId, id, fid(c));
  if (!file) fail(404, 'المرفق غير موجود');
  await batch(c, [
    stmt(c, 'UPDATE expense_files SET deleted_at = ? WHERE id = ? AND foundation_id = ?', new Date().toISOString(), fileId, fid(c)),
    auditStmt(c, 'detach', 'expense', id, auditDetail(null, undefined, file.name)),
  ]);
  return c.json({ ok: true });
});

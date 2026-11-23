import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { requireRole } from '../lib/auth';
import { invalidateRefData, kvCached, refData } from '../lib/cache';
import { hashPassword } from '../lib/crypto';
import { all, auditInsertedStmt, auditStmt, batch, fid, first, nextCursor, PAGE_SIZE, stmt } from '../lib/db';
import { cursorParam, fail, idParam, parseOrFail, readJson, zAmount, zDate, zId, zMonth } from '../lib/http';
import { currentMonth, maskPhone } from '../lib/text';
import { zPassword } from './auth';
import { putEncrypted, readImage, signFileLink } from './prescriptions';
import { searchRows } from './subscribers';

const zYear = z.coerce.number().int().min(2000).max(2100);
const zStatus = z.enum(['alive', 'deceased']);
const zPayState = z.enum(['all', 'unpaid', 'paid', 'overdue']).default('all');
const zMonthIndex = z.coerce.number().int().min(0).max(11);

interface GridRow {
  id: number;
  full_name: string;
  phone: string | null;
  status: string;
  delegate_id: number | null;
  family_size: number;
  monthly_fee: number;
  paid_mask: number | null;
}

// One primary-key probe per listed row, and year is its bound parameter. A second
// query with IN cost about 86 rows a page; this costs 60.
const GRID_COLUMNS = `id, full_name, phone, status, delegate_id, family_size, monthly_fee,
  (SELECT paid_mask FROM subscriber_year WHERE subscriber_id = subscribers.id AND year = ?) AS paid_mask`;

const isDelegate = (c: Context<AppEnv>) => c.get('user').role === 'delegate';

// A delegate's scope comes from the session; any id in the request is ignored.
function scopedDelegate(c: Context<AppEnv>, requested: number | null | undefined): number | null {
  return isDelegate(c) ? c.get('user').id : requested ?? null;
}

const optionalId = (value: string | undefined) => (value ? idParam(value) : null);

function latestPaidDate(year: number, mask: number): string | null {
  if (!mask) return null;
  const highestMonth = 32 - Math.clz32(mask);
  if (highestMonth < 1 || highestMonth > 12) return null;
  return `${year}-${String(highestMonth).padStart(2, '0')}-10`;
}

const gridItem = (year: number) => ({ phone, paid_mask, ...row }: GridRow) => {
  const mask = paid_mask ?? 0;
  return {
    ...row,
    phone: maskPhone(phone),
    paid_mask: mask,
    last_paid_date: latestPaidDate(year, mask),
  };
};

const avatarUrl = (c: Context<AppEnv>, key: string | null) => (key ? signFileLink(c, key) : Promise.resolve(null));

export const collections = new Hono<AppEnv>();

collections.use('*', requireRole('admin', 'delegate'));

// Built from summary tables (about 15 rows at any register size, plus 4 per delegate), and
// the patients count, which reads each prescription once.
collections.get('/overview', async (c) => {
  const year = parseOrFail(zYear, c.req.query('year'));
  const delegateId = scopedDelegate(c, optionalId(c.req.query('delegate')));
  const key = delegateId ?? 0;

  const [periods, counts, patients] = await Promise.all([
    all<{ period: string; paid_count: number; paid_amount: number }>(
      c,
      'SELECT period, paid_count, paid_amount FROM delegate_period WHERE foundation_id = ? AND delegate_id = ? AND period >= ? AND period <= ?',
      fid(c), key, `${year}-01`, `${year}-12`,
    ),
    delegateId === null
      ? all<{ key: string; value: number }>(c, "SELECT key, value FROM stats_totals WHERE foundation_id = ? AND key IN ('subs_alive', 'subs_deceased')", fid(c))
      : first<{ subs_alive: number; subs_deceased: number }>(c,
          `SELECT t.subs_alive, t.subs_deceased FROM delegate_totals t JOIN users u ON u.id = t.delegate_id
           WHERE t.delegate_id = ? AND u.foundation_id = ?`, delegateId, fid(c)),
    // A patient is a subscriber with at least one prescription on file. CROSS JOIN keeps SQLite
    // walking the prescriptions and probing each subscriber, not scanning the delegate's register.
    delegateId === null
      ? first<{ n: number }>(c, 'SELECT COUNT(DISTINCT subscriber_id) AS n FROM prescriptions WHERE foundation_id = ? AND deleted_at IS NULL', fid(c))
      : first<{ n: number }>(c,
          `SELECT COUNT(DISTINCT p.subscriber_id) AS n FROM prescriptions p CROSS JOIN subscribers s ON s.id = p.subscriber_id
           WHERE p.foundation_id = ? AND p.deleted_at IS NULL AND s.deleted_at IS NULL AND s.delegate_id = ?`, fid(c), delegateId),
  ]);

  const totals = Array.isArray(counts)
    ? { alive: counts.find((row) => row.key === 'subs_alive')?.value ?? 0, deceased: counts.find((row) => row.key === 'subs_deceased')?.value ?? 0 }
    : { alive: counts?.subs_alive ?? 0, deceased: counts?.subs_deceased ?? 0 };

  const byPeriod = new Map(periods.map((row) => [row.period, row]));
  const months = Array.from({ length: 12 }, (_, index) => {
    const period = `${year}-${String(index + 1).padStart(2, '0')}`;
    return { period, paid_count: byPeriod.get(period)?.paid_count ?? 0, paid_amount: byPeriod.get(period)?.paid_amount ?? 0 };
  });

  const current = currentMonth();
  const focus = current.startsWith(`${year}-`) ? current : `${year}-12`;
  const delegateRow = delegateId === null ? null : await first<{ id: number; full_name: string; avatar_key: string | null; phone: string | null; address: string | null }>(
    c, "SELECT id, full_name, avatar_key, phone, address FROM users WHERE id = ? AND foundation_id = ? AND role = 'delegate'", delegateId, fid(c),
  );
  if (delegateId !== null && !delegateRow) fail(404, 'المندوب غير موجود');

  // «متأخرون»: living subscribers with no payment in the focus month or the three before it,
  // counting only those registered before that four-month window began.
  const lateWindow = [0, 1, 2, 3].map((back) => {
    const d = new Date(Date.UTC(Number(focus.slice(0, 4)), Number(focus.slice(5, 7)) - 1 - back, 1));
    return d.toISOString().slice(0, 7);
  });
  // The late count walks the whole living register (one subscriber row plus up to four
  // transaction probes each), so it is shared from KV for 5 minutes; the cheap per-delegate
  // figures beside it stay live, and photo links are signed per user after the cache.
  // `delegates=0`: the caller needs the totals and months only (home, expenses), so skip the
  // per-delegate list — one row and one signed photo link per delegate — and send its count.
  const withList = c.req.query('delegates') !== '0';
  const delegateCount = isDelegate(c) ? 0 : (await refData(c)).delegates.length;
  const lateByDelegate = isDelegate(c) || !withList ? null : await kvCached(c, `coll:late:v2:${fid(c)}:${focus}`, 300, async () => {
    const rows = await all<{ delegate_id: number; late: number }>(
      c,
      `SELECT s.delegate_id, COUNT(*) AS late FROM subscribers s
       WHERE s.foundation_id = ? AND s.status = 'alive' AND s.deleted_at IS NULL AND s.delegate_id IS NOT NULL AND s.created_at < ?
         AND NOT EXISTS (SELECT 1 FROM transactions x WHERE x.subscriber_id = s.id AND x.deleted_at IS NULL AND x.period IN (?, ?, ?, ?))
       GROUP BY s.delegate_id`,
      fid(c), `${lateWindow[3]}-01`, ...lateWindow,
    );
    return Object.fromEntries(rows.map((row) => [row.delegate_id, row.late])) as Record<string, number>;
  });
  const delegates = lateByDelegate === null ? [] : await Promise.all((await all<{
    id: number; full_name: string; avatar_key: string | null; alive: number; paid_count: number; paid_amount: number;
  }>(
    c,
    `SELECT u.id, u.full_name, u.avatar_key, COALESCE(t.subs_alive, 0) AS alive,
       COALESCE(p.paid_count, 0) AS paid_count, COALESCE(p.paid_amount, 0) AS paid_amount
     FROM users u
     LEFT JOIN delegate_totals t ON t.delegate_id = u.id
     LEFT JOIN delegate_period p ON p.foundation_id = u.foundation_id AND p.delegate_id = u.id AND p.period = ?
     WHERE u.foundation_id = ? AND u.role = 'delegate' AND u.active = 1
     ORDER BY paid_amount DESC, u.id`,
    focus, fid(c),
  )).map(async ({ avatar_key, ...row }) => ({ ...row, late: lateByDelegate[row.id] ?? 0, avatar_url: await avatarUrl(c, avatar_key) })));

  return c.json({
    year,
    focus,
    ...totals,
    patients: patients?.n ?? 0,
    months,
    delegate: delegateRow && {
      id: delegateRow.id,
      full_name: delegateRow.full_name,
      phone: delegateRow.phone,
      address: delegateRow.address,
      avatar_url: await avatarUrl(c, delegateRow.avatar_key),
    },
    delegates,
    delegate_count: delegateCount,
  });
});

// The highest paid month in a year's mask (1-12), so the last payment's date costs one
// index probe per subscriber instead of reading all twelve of its transactions.
const LAST_PAID_MONTH = `CASE ${Array.from({ length: 12 }, (_, i) => 11 - i)
  .map((bit) => `WHEN paid_mask >= ${1 << bit} THEN ${bit + 1}`).join(' ')} END`;
const PRINT_LIMIT = 40000;

// The whole printed register: every living subscriber in one response, by name. About three
// rows read per subscriber (the subscriber, its year and its last payment).
// With `until` (the month index chosen on the page, -1 for a year still ahead) the register is
// as it stood at that month: later payments are left out of the marks, the totals and the last date.
collections.get('/print', async (c) => {
  const year = parseOrFail(zYear, c.req.query('year'));
  const delegateId = scopedDelegate(c, optionalId(c.req.query('delegate')));
  const untilParam = c.req.query('until');
  const until = untilParam === undefined ? 11 : parseOrFail(z.coerce.number().int().min(-1).max(11), untilParam);
  const mask = (1 << (until + 1)) - 1;
  const status = parseOrFail(zStatus.default('alive'), c.req.query('status'));
  // The whole year keeps the stored total; part of it is summed from its payments.
  const paidTotal = until === 11
    ? 'COALESCE(y.paid_total, 0)'
    // scope-ok: correlated to s.id, and the outer query keeps s to this foundation
    : `COALESCE((SELECT SUM(t.amount) FROM transactions t WHERE t.subscriber_id = s.id AND t.deleted_at IS NULL
         AND t.period BETWEEN '${year}-01' AND '${year}-${String(until + 1).padStart(2, '0')}'), 0)`;
  const rows = await all<{ id: number; full_name: string; area: string | null; monthly_fee: number; paid_mask: number; paid_total: number; last_paid: string | null }>(
    c,
    `WITH base AS (
       SELECT s.id, s.full_name, s.area, s.name_norm, s.monthly_fee,
         COALESCE(y.paid_mask, 0) & ${mask} AS paid_mask, ${until < 0 ? '0' : paidTotal} AS paid_total
       FROM subscribers s
       LEFT JOIN subscriber_year y ON y.subscriber_id = s.id AND y.year = ?
       WHERE ${delegateId === null ? 's.foundation_id = ? AND ' : '+s.foundation_id = ? AND s.delegate_id = ? AND '}s.status = ? AND s.deleted_at IS NULL
       ORDER BY ${delegateId === null ? '' : "COALESCE(s.area, ''), "}s.name_norm
       LIMIT ${PRINT_LIMIT + 1}
     )
     SELECT id, full_name, area, monthly_fee, paid_mask, paid_total,
       (SELECT tx_date FROM transactions t WHERE t.subscriber_id = base.id AND t.deleted_at IS NULL
          AND t.period = ? || '-' || printf('%02d', ${LAST_PAID_MONTH})) AS last_paid
     FROM base`,
    ...(delegateId === null ? [year, fid(c), status, String(year)] : [year, fid(c), delegateId, status, String(year)]),
  );
  if (rows.length > PRINT_LIMIT) fail(413, 'السجل أكبر من أن يُطبع دفعة واحدة؛ اختر مندوباً');
  return c.json({ items: rows });
});

collections.get('/grid', async (c) => {
  const year = parseOrFail(zYear, c.req.query('year'));
  const status = parseOrFail(zStatus.default('alive'), c.req.query('status'));
  const cursor = cursorParam(c.req.query('cursor'));
  const delegateId = scopedDelegate(c, optionalId(c.req.query('delegate')));
  const payState = parseOrFail(zPayState, c.req.query('pay_state'));
  const monthParam = c.req.query('month');

  let maskExpr = '';
  const maskParams: unknown[] = [];
  if (payState !== 'all') {
    const m = monthParam ? parseOrFail(zMonthIndex, monthParam) : Number(currentMonth().slice(5, 7)) - 1;
    const elapsedCount = m + 1;
    const fullMask = (1 << elapsedCount) - 1;
    const maskSql = 'COALESCE((SELECT paid_mask FROM subscriber_year WHERE subscriber_id = subscribers.id AND year = ?), 0)';
    if (payState === 'paid') {
      maskExpr = ` AND (${maskSql} & ?) = ?`;
      maskParams.push(year, fullMask, fullMask);
    } else if (payState === 'unpaid') {
      maskExpr = ` AND (${maskSql} & ?) <> ?`;
      maskParams.push(year, fullMask, fullMask);
    } else if (payState === 'overdue') {
      if (elapsedCount < 4) {
        maskExpr = ' AND 1 = 0';
      } else {
        const bitTerms: string[] = [];
        for (let b = 0; b <= m; b++) {
          bitTerms.push(`((${maskSql} >> ${b}) & 1)`);
          maskParams.push(year);
        }
        const last4Mask = ((1 << 4) - 1) << (m - 3);
        maskExpr = ` AND ((${elapsedCount} - (${bitTerms.join(' + ')})) >= 4 OR (${maskSql} & ?) = 0)`;
        maskParams.push(year, last4Mask);
      }
    }
  }

  const rows = delegateId !== null
    ? await all<GridRow>(c, `SELECT ${GRID_COLUMNS} FROM subscribers
        WHERE delegate_id = ? AND +foundation_id = ? AND status = ? AND deleted_at IS NULL AND id < ?${maskExpr} ORDER BY id DESC LIMIT ${PAGE_SIZE}`,
        year, delegateId, fid(c), status, cursor, ...maskParams)
    : await all<GridRow>(c, `SELECT ${GRID_COLUMNS} FROM subscribers
        WHERE foundation_id = ? AND status = ? AND deleted_at IS NULL AND id < ?${maskExpr} ORDER BY id DESC LIMIT ${PAGE_SIZE}`,
        year, fid(c), status, cursor, ...maskParams);
  const toItem = gridItem(year);
  return c.json({ items: rows.map(toItem), next: nextCursor(rows) });
});

// How many living subscribers each /grid pay_state filter would list, by the very same rules,
// so a figure on the full-list page always matches the rows its card shows.
collections.get('/pay-counts', async (c) => {
  const year = parseOrFail(zYear, c.req.query('year'));
  const delegateId = scopedDelegate(c, optionalId(c.req.query('delegate')));
  if (delegateId === null) fail(422, 'اختر مندوباً');
  const m = parseOrFail(zMonthIndex, c.req.query('month'));
  const elapsedCount = m + 1;
  const fullMask = (1 << elapsedCount) - 1;
  const mask = 'COALESCE(y.paid_mask, 0)';
  const paidBits = Array.from({ length: elapsedCount }, (_, b) => `((${mask} >> ${b}) & 1)`).join(' + ');
  const overdue = elapsedCount < 4
    ? '0'
    : `SUM(CASE WHEN (${elapsedCount} - (${paidBits})) >= 4 OR (${mask} & ${((1 << 4) - 1) << (m - 3)}) = 0 THEN 1 ELSE 0 END)`;
  const row = await first<{ alive: number; paid: number | null; unpaid: number | null; overdue: number | null }>(
    c,
    `SELECT COUNT(*) AS alive,
       SUM(CASE WHEN (${mask} & ${fullMask}) = ${fullMask} THEN 1 ELSE 0 END) AS paid,
       SUM(CASE WHEN (${mask} & ${fullMask}) <> ${fullMask} THEN 1 ELSE 0 END) AS unpaid,
       ${overdue} AS overdue
     FROM subscribers s LEFT JOIN subscriber_year y ON y.subscriber_id = s.id AND y.year = ?
     WHERE s.delegate_id = ? AND +s.foundation_id = ? AND s.status = 'alive' AND s.deleted_at IS NULL`,
    year, delegateId, fid(c),
  );
  return c.json({ alive: row?.alive ?? 0, paid: row?.paid ?? 0, unpaid: row?.unpaid ?? 0, overdue: row?.overdue ?? 0 });
});

// POST keeps the searched name out of URLs and request logs.
collections.post('/search', async (c) => {
  const body = await readJson(c, z.object({
    q: z.string().trim().max(60),
    year: zYear,
    status: zStatus,
    delegate_id: zId.nullable().optional(),
  }));
  const rows = await searchRows<GridRow>(c, GRID_COLUMNS, body.q, body.status, scopedDelegate(c, body.delegate_id), [body.year]);
  const toItem = gridItem(body.year);
  return c.json({ items: rows.map(toItem), next: null });
});

collections.get('/subscriber/:id', async (c) => {
  const id = idParam(c.req.param('id'));
  const year = parseOrFail(zYear, c.req.query('year') ?? String(new Date().getUTCFullYear()));
  const row = await first<{
    id: number;
    full_name: string;
    phone: string | null;
    status: string;
    death_date: string | null;
    delegate_id: number | null;
    family_size: number;
    monthly_fee: number;
    address: string | null;
    notes: string | null;
    created_at: string;
    delegate_name: string | null;
  }>(
    c,
    `SELECT s.id, s.full_name, s.phone, s.status, s.death_date, s.delegate_id,
            s.family_size, s.monthly_fee, s.address, s.notes, s.created_at,
            u.full_name AS delegate_name
     FROM subscribers s
     LEFT JOIN users u ON u.id = s.delegate_id
     WHERE s.id = ? AND s.foundation_id = ? AND s.deleted_at IS NULL`,
    id, fid(c),
  );
  if (!row || (isDelegate(c) && row.delegate_id !== c.get('user').id)) fail(404, 'المشترك غير موجود');

  const payments = await all<{ period: string; amount: number; tx_date: string }>(
    c,
    `SELECT period, amount, tx_date
     FROM transactions
     WHERE subscriber_id = ? AND +foundation_id = ? AND period >= ? AND period <= ? AND deleted_at IS NULL
     ORDER BY period DESC`,
    id, fid(c), `${year}-01`, `${year}-12`,
  );

  // The administration, and a delegate for their own subscribers, see and edit the full number;
  // the other roles keep the masked one.
  const role = c.get('user').role;
  return c.json({
    ...row,
    phone: role === 'admin' || role === 'delegate' ? row.phone : maskPhone(row.phone),
    payments,
  });
});

// Iraqi numbers are kept as 07XXXXXXXXX; WhatsApp wants 9647XXXXXXXXX.
function whatsappNumber(phone: string) {
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = `964${digits.slice(1)}`;
  else if (digits.length === 10 && digits.startsWith('7')) digits = `964${digits}`;
  if (digits.length < 11 || digits.length > 15) fail(422, 'رقم الهاتف غير صالح لواتساب');
  return digits;
}

// The subscriber's full number in international form, for opening a WhatsApp chat. The grid
// only ever sees masked numbers, so each reveal is asked for one subscriber at a time and
// recorded in the audit log. Messaging subscribers is the administration's job alone.
collections.post('/subscriber/:id/whatsapp', requireRole('admin'), async (c) => {
  const id = idParam(c.req.param('id'));
  const row = await first<{ phone: string | null }>(
    c, 'SELECT phone FROM subscribers WHERE id = ? AND foundation_id = ? AND deleted_at IS NULL', id, fid(c),
  );
  if (!row) fail(404, 'المشترك غير موجود');
  if (!row.phone) fail(422, 'لا يوجد رقم هاتف لهذا المشترك');
  const phone = whatsappNumber(row.phone);
  await batch(c, [auditStmt(c, 'reveal_phone', 'subscriber', id, 'whatsapp')]);
  return c.json({ phone });
});

// The delegate's own number, for sending them their register. Admin only, and audited.
collections.post('/delegates/:id/whatsapp', requireRole('admin'), async (c) => {
  const id = idParam(c.req.param('id'));
  const row = await first<{ phone: string | null }>(
    c, "SELECT phone FROM users WHERE id = ? AND foundation_id = ? AND role = 'delegate' AND active = 1", id, fid(c),
  );
  if (!row) fail(404, 'المندوب غير موجود');
  if (!row.phone) fail(422, 'لا يوجد رقم هاتف لهذا المندوب');
  const phone = whatsappNumber(row.phone);
  await batch(c, [auditStmt(c, 'reveal_phone', 'user', id, 'whatsapp')]);
  return c.json({ phone });
});

collections.post('/pay', async (c) => {
  const body = await readJson(c, z.object({
    subscriber_id: zId,
    period: zMonth,
    amount: zAmount,
    tx_date: zDate,
  }));
  const subscriber = await first<{ full_name: string; delegate_id: number | null }>(
    c, 'SELECT full_name, delegate_id FROM subscribers WHERE id = ? AND foundation_id = ? AND deleted_at IS NULL', body.subscriber_id, fid(c),
  );
  if (!subscriber || (isDelegate(c) && subscriber.delegate_id !== c.get('user').id)) fail(404, 'المشترك غير موجود');

  await batch(c, [
    stmt(c,
      `INSERT INTO transactions (foundation_id, type, amount, month, tx_date, subscriber_id, party_name, delegate_id, period, created_by)
       VALUES (?, 'delegate_receipt', ?, ?, ?, ?, ?, ?, ?, ?)`,
      fid(c), body.amount, body.tx_date.slice(0, 7), body.tx_date, body.subscriber_id, subscriber.full_name,
      subscriber.delegate_id, body.period, c.get('user').id),
    auditInsertedStmt(c, 'create', 'transaction'),
  ]);
  return c.json({ ok: true }, 201);
});

// Reversal is admin-only: a delegate who collected money cannot erase the record.
collections.post('/undo', requireRole('admin'), async (c) => {
  const body = await readJson(c, z.object({ subscriber_id: zId, period: zMonth }));
  await batch(c, [
    stmt(c, 'UPDATE transactions SET deleted_at = ?, deleted_by = ? WHERE subscriber_id = ? AND foundation_id = ? AND period = ? AND deleted_at IS NULL',
      new Date().toISOString(), c.get('user').id, body.subscriber_id, fid(c), body.period),
    auditStmt(c, 'undo_payment', 'subscriber', body.subscriber_id, body.period),
  ]);
  return c.json({ ok: true });
});

interface DelegateProfile {
  id: number;
  username: string;
  full_name: string;
  phone: string | null;
  address: string | null;
  birth_date: string | null;
  joined_year: number | null;
  created_at: string;
  avatar_key: string | null;
}

const findDelegate = (c: Context<AppEnv>, id: number) => first<DelegateProfile>(
  c,
  `SELECT id, username, full_name, phone, address, birth_date, joined_year, created_at, avatar_key
   FROM users WHERE id = ? AND foundation_id = ? AND role = 'delegate' AND active = 1`,
  id, fid(c),
);

// The profile drawer on the delegates page. Admin only: it carries the delegate's phone.
collections.get('/delegates/:id/profile', requireRole('admin'), async (c) => {
  const id = idParam(c.req.param('id'));
  const [person, totals] = await Promise.all([
    findDelegate(c, id),
    first<{ subs_alive: number; subs_deceased: number }>(c,
      `SELECT t.subs_alive, t.subs_deceased FROM delegate_totals t JOIN users u ON u.id = t.delegate_id
       WHERE t.delegate_id = ? AND u.foundation_id = ?`, id, fid(c)),
  ]);
  if (!person) fail(404, 'المندوب غير موجود');
  const { avatar_key, ...profile } = person;
  return c.json({
    ...profile,
    joined_year: profile.joined_year ?? Number(profile.created_at.slice(0, 4)),
    alive: totals?.subs_alive ?? 0,
    deceased: totals?.subs_deceased ?? 0,
    avatar_url: await avatarUrl(c, avatar_key),
  });
});

const optionalText = (max: number) => z.string().trim().max(max).transform((value) => value || null).nullable().optional();

function randomSecret(length = 16): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => (b % 36).toString(36)).join('');
}

collections.post('/delegates', requireRole('admin'), async (c) => {
  const currentYear = new Date().getUTCFullYear();
  const body = await readJson(c, z.object({
    full_name: z.string({ error: 'الاسم مطلوب' }).trim().min(3, 'الاسم قصير جداً').max(120),
    age: z.coerce.number().int().min(15, 'العمر يجب أن يكون 15 سنة على الأقل').max(120, 'العمر غير صالح').nullable().optional(),
    phone: z.string().trim().regex(/^\+?[\d\s-]{7,20}$/, 'رقم الهاتف غير صالح').or(z.literal('')).transform((value) => value || null).nullable().optional(),
    address: optionalText(200),
    alive_count: z.coerce.number().int().min(0, 'العدد غير صالح').max(100000).default(0),
    deceased_count: z.coerce.number().int().min(0, 'العدد غير صالح').max(100000).default(0),
    username: z.string().trim().regex(/^[a-zA-Z0-9._-]{3,32}$/, 'اسم المستخدم: 3 أحرف لاتينية أو أرقام على الأقل').or(z.literal('')).optional(),
    password: zPassword.or(z.literal('')).optional(),
  }));

  const username = body.username || `delegate_${Date.now().toString(36)}${randomSecret(4)}`;
  const password = body.password || randomSecret(16);
  const birthDate = body.age != null ? `${currentYear - body.age}-01-01` : null;

  const created = await batch(c, [
    stmt(
      c,
      `INSERT INTO users (foundation_id, username, full_name, role, password_hash, phone, address, birth_date, joined_year)
       VALUES (?, ?, ?, 'delegate', ?, ?, ?, ?, ?) RETURNING id`,
      fid(c),
      username,
      body.full_name,
      await hashPassword(password),
      body.phone ?? null,
      body.address ?? null,
      birthDate,
      currentYear,
    ),
    auditInsertedStmt(c, 'create_delegate', 'user'),
  ]);

  const id = (created[0].results[0] as { id: number }).id;
  const followUp = [];
  if (body.alive_count > 0 || body.deceased_count > 0) {
    followUp.push(
      stmt(
        c,
        `INSERT INTO delegate_totals (delegate_id, subs_alive, subs_deceased) VALUES (?, ?, ?)
         ON CONFLICT(delegate_id) DO UPDATE SET
           subs_alive = subs_alive + excluded.subs_alive,
           subs_deceased = subs_deceased + excluded.subs_deceased`,
        id,
        body.alive_count,
        body.deceased_count,
      ),
    );
  }
  if (body.alive_count > 0) {
    followUp.push(
      stmt(
        c,
        `INSERT INTO stats_totals (foundation_id, key, value) VALUES (?, 'subs_alive', ?)
         ON CONFLICT(foundation_id, key) DO UPDATE SET value = value + excluded.value`,
        fid(c),
        body.alive_count,
      ),
    );
  }
  if (body.deceased_count > 0) {
    followUp.push(
      stmt(
        c,
        `INSERT INTO stats_totals (foundation_id, key, value) VALUES (?, 'subs_deceased', ?)
         ON CONFLICT(foundation_id, key) DO UPDATE SET value = value + excluded.value`,
        fid(c),
        body.deceased_count,
      ),
    );
  }
  if (followUp.length) await batch(c, followUp);

  invalidateRefData(c);
  return c.json({ id }, 201);
});

collections.patch('/delegates/:id/profile', requireRole('admin'), async (c) => {
  const id = idParam(c.req.param('id'));
  const body = await readJson(c, z.object({
    full_name: z.string().trim().min(3, 'الاسم قصير جداً').max(120).optional(),
    phone: z.string().trim().regex(/^\+?[\d\s-]{7,20}$/, 'رقم الهاتف غير صالح').or(z.literal('')).transform((value) => value || null).nullable().optional(),
    address: optionalText(200),
    birth_date: zDate.or(z.literal('')).transform((value) => value || null).nullable().optional(),
    joined_year: z.coerce.number().int().min(1990, 'سنة غير صالحة').max(new Date().getUTCFullYear(), 'سنة غير صالحة').nullable().optional(),
  }));
  if (!(await findDelegate(c, id))) fail(404, 'المندوب غير موجود');

  const set: string[] = [];
  const params: unknown[] = [];
  for (const key of ['full_name', 'phone', 'address', 'birth_date', 'joined_year'] as const) {
    if (body[key] !== undefined) { set.push(`${key} = ?`); params.push(body[key]); }
  }
  if (!set.length) fail(422, 'لا توجد تعديلات');
  await batch(c, [
    stmt(c, `UPDATE users SET ${set.join(', ')} WHERE id = ? AND foundation_id = ?`, ...params, id, fid(c)),
    auditStmt(c, 'update_profile', 'user', id, set.map((s) => s.split(' ')[0]).join(',')),
  ]);
  if (body.full_name !== undefined) invalidateRefData(c);
  return c.json({ ok: true });
});

// "Delete" deactivates: the delegate leaves the cards and can no longer sign in, while their
// subscribers and payments stay in the register. The users page can switch them back on.
collections.delete('/delegates/:id', requireRole('admin'), async (c) => {
  const id = idParam(c.req.param('id'));
  if (!(await findDelegate(c, id))) fail(404, 'المندوب غير موجود');
  await batch(c, [
    stmt(c, 'UPDATE users SET active = 0, token_version = token_version + 1 WHERE id = ? AND foundation_id = ?', id, fid(c)),
    auditStmt(c, 'deactivate', 'user', id),
  ]);
  invalidateRefData(c);
  return c.json({ ok: true });
});

collections.post('/delegates/:id/photo', async (c) => {
  const id = idParam(c.req.param('id'));
  if (isDelegate(c) && c.get('user').id !== id) fail(404, 'المندوب غير موجود');

  const form = await c.req.formData().catch(() => fail(400, 'صيغة الطلب غير صحيحة'));
  const image = await readImage(form.get('image'), 300 * 1024);
  if (!image) fail(422, 'الصورة مطلوبة');
  const delegate = await first<{ avatar_key: string | null }>(c,
    "SELECT avatar_key FROM users WHERE id = ? AND foundation_id = ? AND role = 'delegate'", id, fid(c));
  if (!delegate) fail(404, 'المندوب غير موجود');

  const key = `avatars/${crypto.randomUUID()}.bin`;
  await putEncrypted(c, key, image);
  await batch(c, [
    stmt(c, 'UPDATE users SET avatar_key = ? WHERE id = ? AND foundation_id = ?', key, id, fid(c)),
    auditStmt(c, 'update_photo', 'user', id),
  ]);
  if (delegate.avatar_key) c.executionCtx.waitUntil(c.env.FILES.delete(delegate.avatar_key));
  return c.json({ avatar_url: await signFileLink(c, key) });
});

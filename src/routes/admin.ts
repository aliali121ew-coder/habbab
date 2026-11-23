import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { requireRole } from '../lib/auth';
import { edgeCached, invalidateRefData, refData } from '../lib/cache';
import { hashPassword } from '../lib/crypto';
import { all, auditInsertedStmt, auditStmt, batch, fid, first, nextCursor, PAGE_SIZE, stmt } from '../lib/db';
import { cursorParam, fail, idParam, readJson } from '../lib/http';
import { currentMonth } from '../lib/text';
import { zPassword } from './auth';

const zRole = z.enum(['admin', 'accountant', 'delegate', 'health']);

interface Totals {
  [key: string]: number;
}

async function loadTotals(c: Context<AppEnv>): Promise<Totals> {
  const rows = await all<{ key: string; value: number }>(c, 'SELECT key, value FROM stats_totals WHERE foundation_id = ?', fid(c));
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

const delegateRow = (c: Context<AppEnv>, id: number) =>
  first<{ subs_alive: number; subs_deceased: number; received_total: number; disbursed_total: number }>(
    c, `SELECT t.subs_alive, t.subs_deceased, t.received_total, t.disbursed_total
        FROM delegate_totals t JOIN users u ON u.id = t.delegate_id WHERE t.delegate_id = ? AND u.foundation_id = ?`, id, fid(c),
  );

const emptyDelegate = { subs_alive: 0, subs_deceased: 0, received_total: 0, disbursed_total: 0 };

const recentMonths = (c: Context<AppEnv>) =>
  all<{ month: string; general_aid: number; monthly_aid: number; program_aid: number; delegate_receipt: number; tx_count: number }>(
    c, 'SELECT month, general_aid, monthly_aid, program_aid, delegate_receipt, tx_count FROM stats_monthly WHERE foundation_id = ? ORDER BY month DESC LIMIT 6', fid(c),
  );

export const dashboard = new Hono<AppEnv>();

// Each role gets only its own summary, and is cached under that role, so a
// cached admin payload can never be served to another role.
dashboard.get('/', async (c) => {
  const user = c.get('user');
  const month = currentMonth();

  if (user.role === 'delegate') {
    const data = await edgeCached(c, `dash/delegate/${user.id}`, 60, async () => ({
      kind: 'delegate', totals: (await delegateRow(c, user.id)) ?? emptyDelegate,
    }));
    return c.json(data);
  }
  if (user.role === 'health') {
    const data = await edgeCached(c, `dash/health/${user.foundation}`, 60, async () => {
      const totals = await loadTotals(c);
      return { kind: 'health', rx_total: totals.rx_total ?? 0, rx_pending: totals.rx_pending ?? 0 };
    });
    return c.json(data);
  }
  if (user.role === 'accountant') {
    const data = await edgeCached(c, `dash/accountant/${user.foundation}/${month}`, 60, async () => ({ kind: 'accountant', month, months: await recentMonths(c) }));
    return c.json(data);
  }
  const data = await edgeCached(c, `dash/admin/${user.foundation}/${month}`, 60, async () => {
    const [totals, months] = await Promise.all([loadTotals(c), recentMonths(c)]);
    return { kind: 'admin', month, totals, months };
  });
  return c.json(data);
});

// Income and spending per day for a short range (at most 62 days), for the home chart's week
// and month views. Income comes from stats_daily, which the transaction triggers keep up to date;
// spending from the expenses table. Days with nothing recorded come back as zeros.
dashboard.get('/daily', requireRole('admin', 'accountant'), async (c) => {
  const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
  const from = day.safeParse(c.req.query('from'));
  const to = day.safeParse(c.req.query('to'));
  if (!from.success || !to.success || from.data > to.data) fail(422, 'نطاق التاريخ غير صحيح');
  const span = (Date.parse(to.data) - Date.parse(from.data)) / 86_400_000;
  if (span > 62) fail(422, 'النطاق أطول من المسموح');

  const months = [...new Set([from.data.slice(0, 7), to.data.slice(0, 7)])];
  const [incoming, outgoing] = await Promise.all([
    all<{ day: string; total: number }>(c,
      'SELECT day, total_in AS total FROM stats_daily WHERE foundation_id = ? AND day BETWEEN ? AND ?', fid(c), from.data, to.data),
    all<{ day: string; total: number }>(c,
      `SELECT spent_on AS day, SUM(amount) AS total FROM expenses
       WHERE foundation_id = ? AND deleted_at IS NULL AND month IN (${months.map(() => '?').join(', ')}) AND spent_on BETWEEN ? AND ?
       GROUP BY spent_on`,
      fid(c), ...months, from.data, to.data),
  ]);

  const inBy = new Map(incoming.map((r) => [r.day, r.total]));
  const outBy = new Map(outgoing.map((r) => [r.day, r.total]));
  const days: { day: string; in: number; out: number }[] = [];
  for (let t = Date.parse(from.data); t <= Date.parse(to.data); t += 86_400_000) {
    const d = new Date(t).toISOString().slice(0, 10);
    days.push({ day: d, in: inBy.get(d) ?? 0, out: outBy.get(d) ?? 0 });
  }
  return c.json({ days });
});

export const meta = new Hono<AppEnv>();

meta.get('/', async (c) => {
  const { programs, delegates } = await refData(c);
  const { role } = c.get('user');
  return c.json({ programs, delegates: role === 'admin' || role === 'accountant' ? delegates : [] });
});

export const delegates = new Hono<AppEnv>();

delegates.get('/', requireRole('admin', 'accountant'), async (c) => {
  const rows = await all(
    c,
    `SELECT u.id, u.full_name, COALESCE(t.subs_alive, 0) AS subs_alive, COALESCE(t.subs_deceased, 0) AS subs_deceased,
       COALESCE(t.received_total, 0) AS received_total, COALESCE(t.disbursed_total, 0) AS disbursed_total
     FROM users u LEFT JOIN delegate_totals t ON t.delegate_id = u.id
     WHERE u.foundation_id = ? AND u.role = 'delegate' AND u.active = 1 ORDER BY u.id`,
    fid(c),
  );
  return c.json({ items: rows, next: null });
});

delegates.get('/:id', requireRole('admin', 'accountant', 'delegate'), async (c) => {
  const id = idParam(c.req.param('id'));
  const user = c.get('user');
  if (user.role === 'delegate' && user.id !== id) fail(404, 'السجل غير موجود');
  const [person, totals] = await Promise.all([
    first<{ full_name: string }>(c, "SELECT full_name FROM users WHERE id = ? AND foundation_id = ? AND role = 'delegate'", id, fid(c)),
    delegateRow(c, id),
  ]);
  if (!person) fail(404, 'السجل غير موجود');
  return c.json({ id, full_name: person.full_name, totals: totals ?? emptyDelegate });
});

export const users = new Hono<AppEnv>();

users.use('*', requireRole('admin'));

users.get('/', async (c) => {
  const cursor = cursorParam(c.req.query('cursor'));
  const rows = await all<{ id: number }>(
    c,
    `SELECT id, username, full_name, role, active FROM users WHERE foundation_id = ? AND id < ? ORDER BY id DESC LIMIT ${PAGE_SIZE}`,
    fid(c), cursor,
  );
  return c.json({ items: rows, next: nextCursor(rows) });
});

users.post('/', async (c) => {
  const body = await readJson(c, z.object({
    username: z.string({ error: 'اسم المستخدم مطلوب' }).trim().regex(/^[a-zA-Z0-9._-]{3,32}$/, 'اسم المستخدم: 3 أحرف لاتينية أو أرقام على الأقل'),
    full_name: z.string({ error: 'الاسم مطلوب' }).trim().min(3, 'الاسم قصير جداً').max(120),
    role: zRole,
    password: zPassword,
  }));
  await batch(c, [
    stmt(c, 'INSERT INTO users (foundation_id, username, full_name, role, password_hash) VALUES (?, ?, ?, ?, ?)',
      fid(c), body.username, body.full_name, body.role, await hashPassword(body.password)),
    auditInsertedStmt(c, 'create', 'user'),
  ]);
  invalidateRefData(c);
  return c.json({ ok: true }, 201);
});

users.patch('/:id', async (c) => {
  const id = idParam(c.req.param('id'));
  const body = await readJson(c, z.object({
    full_name: z.string().trim().min(3, 'الاسم قصير جداً').max(120).optional(),
    role: zRole.optional(),
    active: z.boolean().optional(),
    password: zPassword.optional(),
  }));
  if (id === c.get('user').id && (body.active === false || (body.role && body.role !== 'admin'))) {
    fail(422, 'لا يمكنك تعطيل حسابك أو تغيير دورك');
  }

  const set: string[] = [];
  const params: unknown[] = [];
  if (body.full_name !== undefined) { set.push('full_name = ?'); params.push(body.full_name); }
  if (body.role !== undefined) { set.push('role = ?'); params.push(body.role); }
  if (body.active !== undefined) { set.push('active = ?'); params.push(body.active ? 1 : 0); }
  if (body.password !== undefined) {
    set.push('password_hash = ?', 'must_change_password = 1');
    params.push(await hashPassword(body.password));
  }
  if (!set.length) fail(422, 'لا توجد تعديلات');
  // Any security-relevant change ends the user's existing sessions at next refresh.
  set.push('token_version = token_version + 1', 'failed_logins = 0', 'locked_until = NULL');

  await batch(c, [
    stmt(c, `UPDATE users SET ${set.join(', ')} WHERE id = ? AND foundation_id = ?`, ...params, id, fid(c)),
    auditStmt(c, 'update', 'user', id, Object.keys(body).join(',')),
  ]);
  invalidateRefData(c);
  return c.json({ ok: true });
});

export const audit = new Hono<AppEnv>();

audit.use('*', requireRole('admin'));

audit.get('/', async (c) => {
  const cursor = cursorParam(c.req.query('cursor'));
  const rows = await all<{ id: number }>(
    c,
    `SELECT a.id, a.action, a.entity, a.entity_id, a.detail, a.created_at, u.full_name AS user_name
     FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
     WHERE a.foundation_id = ? AND a.id < ? ORDER BY a.id DESC LIMIT ${PAGE_SIZE}`,
    fid(c), cursor,
  );
  return c.json({ items: rows, next: nextCursor(rows) });
});

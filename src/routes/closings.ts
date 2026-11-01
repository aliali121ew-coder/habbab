import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { requireRole } from '../lib/auth';
import { all, auditStmt, batch, first, nextCursor, PAGE_SIZE, stmt } from '../lib/db';
import { fail, parseOrFail, readJson, zMonth } from '../lib/http';
import { currentMonth } from '../lib/text';

interface ClosingRow {
  month: string;
  status: string;
  opening_balance: number;
  total_in: number;
  total_out: number;
  closing_balance: number;
  tx_count: number;
  closed_at: string;
}

const COLUMNS = 'month, status, opening_balance, total_in, total_out, closing_balance, tx_count, closed_at';

const previousClosing = (c: Parameters<typeof first>[0], month: string) =>
  first<{ month: string; closing_balance: number }>(
    c,
    "SELECT month, closing_balance FROM monthly_closings WHERE status = 'closed' AND month < ? ORDER BY month DESC LIMIT 1",
    month,
  );

export const closings = new Hono<AppEnv>();

closings.use('*', requireRole('admin', 'accountant'));

closings.get('/', async (c) => {
  const cursor = c.req.query('cursor');
  const rows = cursor
    ? await all<ClosingRow>(c, `SELECT ${COLUMNS} FROM monthly_closings WHERE month < ? ORDER BY month DESC LIMIT ${PAGE_SIZE}`,
        parseOrFail(zMonth, cursor))
    : await all<ClosingRow>(c, `SELECT ${COLUMNS} FROM monthly_closings ORDER BY month DESC LIMIT ${PAGE_SIZE}`);
  const items = rows.map((row) => ({ ...row, id: row.month }));
  return c.json({ items, next: rows.length === PAGE_SIZE ? rows[rows.length - 1].month : null });
});

closings.get('/preview', async (c) => {
  const month = parseOrFail(zMonth, c.req.query('month'));
  const [stats, previous] = await Promise.all([
    first<{ general_aid: number; monthly_aid: number; program_aid: number; delegate_receipt: number; tx_count: number }>(
      c, 'SELECT general_aid, monthly_aid, program_aid, delegate_receipt, tx_count FROM stats_monthly WHERE month = ?', month,
    ),
    previousClosing(c, month),
  ]);
  const totalIn = stats?.delegate_receipt ?? 0;
  const totalOut = (stats?.general_aid ?? 0) + (stats?.monthly_aid ?? 0) + (stats?.program_aid ?? 0);
  const opening = previous?.closing_balance ?? 0;
  return c.json({
    month,
    opening_balance: opening,
    total_in: totalIn,
    total_out: totalOut,
    closing_balance: opening + totalIn - totalOut,
    tx_count: stats?.tx_count ?? 0,
    general_aid: stats?.general_aid ?? 0,
    monthly_aid: stats?.monthly_aid ?? 0,
    program_aid: stats?.program_aid ?? 0,
  });
});

closings.post('/', async (c) => {
  const { month } = await readJson(c, z.object({ month: zMonth }));
  if (month >= currentMonth()) fail(422, 'لا يمكن إقفال شهر لم ينتهِ بعد');

  const [existing, later, previous] = await Promise.all([
    first<{ status: string }>(c, 'SELECT status FROM monthly_closings WHERE month = ?', month),
    first<{ month: string }>(c, "SELECT month FROM monthly_closings WHERE status = 'closed' AND month > ? LIMIT 1", month),
    previousClosing(c, month),
  ]);
  if (existing?.status === 'closed') fail(409, 'هذا الشهر مقفل مسبقاً');
  if (later) fail(409, 'يوجد شهر لاحق مقفل، أعد فتحه أولاً');
  const opening = previous?.closing_balance ?? 0;

  // Totals are read inside the write, so an entry racing the close cannot be missed.
  await batch(c, [
    stmt(c,
      `INSERT INTO monthly_closings (month, status, opening_balance, total_in, total_out, closing_balance, tx_count, closed_by)
       SELECT ?1, 'closed', ?2, t.total_in, t.total_out, ?2 + t.total_in - t.total_out, t.tx_count, ?3
       FROM (SELECT
           COALESCE(SUM(delegate_receipt), 0) AS total_in,
           COALESCE(SUM(general_aid + monthly_aid + program_aid), 0) AS total_out,
           COALESCE(SUM(tx_count), 0) AS tx_count
         FROM stats_monthly WHERE month = ?1) AS t
       WHERE 1
       ON CONFLICT(month) DO UPDATE SET
         status = 'closed', opening_balance = excluded.opening_balance, total_in = excluded.total_in,
         total_out = excluded.total_out, closing_balance = excluded.closing_balance, tx_count = excluded.tx_count,
         closed_by = excluded.closed_by, closed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
      month, opening, c.get('user').id),
    auditStmt(c, 'close_month', 'closing', null, month),
  ]);
  return c.json({ ok: true }, 201);
});

closings.post('/:month/reopen', requireRole('admin'), async (c) => {
  const month = parseOrFail(zMonth, c.req.param('month'));
  const later = await first<{ month: string }>(
    c, "SELECT month FROM monthly_closings WHERE status = 'closed' AND month > ? LIMIT 1", month,
  );
  if (later) fail(409, 'أعد فتح الأشهر اللاحقة أولاً');
  await batch(c, [
    stmt(c, "UPDATE monthly_closings SET status = 'reopened' WHERE month = ? AND status = 'closed'", month),
    auditStmt(c, 'reopen_month', 'closing', null, month),
  ]);
  return c.json({ ok: true });
});

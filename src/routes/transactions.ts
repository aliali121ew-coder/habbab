import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { requireRole } from '../lib/auth';
import { all, auditInsertedStmt, auditStmt, batch, fid, first, nextCursor, PAGE_SIZE, stmt } from '../lib/db';
import { cursorParam, fail, idParam, parseOrFail, readJson, zAmount, zDate, zId, zMonth, zText } from '../lib/http';
import { currentMonth } from '../lib/text';

const zType = z.enum(['general_aid', 'monthly_aid', 'program_aid', 'delegate_receipt']);

const COLUMNS = 'id, type, amount, month, tx_date, subscriber_id, party_name, delegate_id, program_id, receipt_no, note';

export const transactions = new Hono<AppEnv>();

transactions.get('/', requireRole('admin', 'accountant', 'delegate'), async (c) => {
  const user = c.get('user');
  const cursor = cursorParam(c.req.query('cursor'));
  const type = parseOrFail(zType.optional(), c.req.query('type'));
  const monthParam = parseOrFail(zMonth.optional(), c.req.query('month') || undefined);
  const delegateParam = c.req.query('delegate') ? idParam(c.req.query('delegate')!) : null;
  const subscriberParam = c.req.query('subscriber') ? idParam(c.req.query('subscriber')!) : null;
  const delegate = user.role === 'delegate' ? user.id : delegateParam;

  // A person filter has its own narrower index; unary + keeps the foundation check a filter there.
  const where = [delegate !== null || subscriberParam !== null ? '+foundation_id = ?' : 'foundation_id = ?', 'deleted_at IS NULL', 'id < ?'];
  const params: unknown[] = [fid(c), cursor];
  const add = (clause: string, value: unknown) => {
    where.push(clause);
    params.push(value);
  };

  if (subscriberParam !== null) add('subscriber_id = ?', subscriberParam);
  if (delegate !== null) add('delegate_id = ?', delegate);
  if (type) add('type = ?', type);
  // Without a person filter the list is bound to a month so it stays on the type+month index.
  if (monthParam) add('month = ?', monthParam);
  else if (delegate === null && subscriberParam === null) add('month = ?', currentMonth());
  if (!type && delegate === null && subscriberParam === null) fail(422, 'نوع السجل مطلوب');

  const rows = await all<{ id: number }>(
    c,
    // scope-ok: `where` starts with foundation_id = ?
    `SELECT ${COLUMNS} FROM transactions WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ${PAGE_SIZE}`,
    ...params,
  );
  return c.json({ items: rows, next: nextCursor(rows) });
});

transactions.post('/', requireRole('admin', 'accountant'), async (c) => {
  const body = await readJson(c, z.object({
    type: zType,
    amount: zAmount,
    tx_date: zDate,
    subscriber_id: zId.nullable().optional(),
    delegate_id: zId.nullable().optional(),
    program_id: zId.nullable().optional(),
    receipt_no: zText(40).nullable().optional(),
    note: zText(300).nullable().optional(),
  }));

  let partyName: string;
  let delegateId = body.delegate_id ?? null;
  let subscriberId: number | null = null;

  if (body.type === 'delegate_receipt') {
    if (!delegateId) fail(422, 'اختر المندوب');
    const delegate = await first<{ full_name: string }>(
      c, "SELECT full_name FROM users WHERE id = ? AND foundation_id = ? AND role = 'delegate'", delegateId, fid(c),
    );
    if (!delegate) fail(422, 'المندوب غير موجود');
    partyName = delegate.full_name;
  } else {
    if (!body.subscriber_id) fail(422, 'اختر المشترك');
    const subscriber = await first<{ full_name: string; delegate_id: number | null }>(
      c, 'SELECT full_name, delegate_id FROM subscribers WHERE id = ? AND foundation_id = ? AND deleted_at IS NULL', body.subscriber_id, fid(c),
    );
    if (!subscriber) fail(422, 'المشترك غير موجود');
    partyName = subscriber.full_name;
    subscriberId = body.subscriber_id;
    delegateId = subscriber.delegate_id;
  }
  if (body.type === 'program_aid') {
    if (!body.program_id) fail(422, 'اختر البرنامج');
    const program = await first<{ id: number }>(c, 'SELECT id FROM programs WHERE id = ? AND foundation_id = ?', body.program_id, fid(c));
    if (!program) fail(422, 'البرنامج غير موجود');
  }

  await batch(c, [
    stmt(c,
      `INSERT INTO transactions (foundation_id, type, amount, month, tx_date, subscriber_id, party_name, delegate_id, program_id, receipt_no, note, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      fid(c), body.type, body.amount, body.tx_date.slice(0, 7), body.tx_date, subscriberId, partyName, delegateId,
      body.type === 'program_aid' ? body.program_id : null, body.receipt_no ?? null, body.note ?? null, c.get('user').id),
    auditInsertedStmt(c, 'create', 'transaction'),
  ]);
  return c.json({ ok: true }, 201);
});

transactions.delete('/:id', requireRole('admin', 'accountant'), async (c) => {
  const id = idParam(c.req.param('id'));
  const user = c.get('user');
  await batch(c, [
    stmt(c, 'UPDATE transactions SET deleted_at = ?, deleted_by = ? WHERE id = ? AND foundation_id = ? AND deleted_at IS NULL',
      new Date().toISOString(), user.id, id, fid(c)),
    auditStmt(c, 'delete', 'transaction', id),
  ]);
  return c.json({ ok: true });
});

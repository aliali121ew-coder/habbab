import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { requireRole } from '../lib/auth';
import { decryptText, encryptText, hmac } from '../lib/crypto';
import { all, auditInsertedStmt, auditStmt, batch, first, nextCursor, PAGE_SIZE, stmt } from '../lib/db';
import { cursorParam, fail, idParam, parseOrFail, readJson, zDate, zId, zText } from '../lib/http';
import { maskNationalId, maskPhone, normalizeDigits, normalizeName, prefixRange } from '../lib/text';

const zPhone = z.string().transform(normalizeDigits).pipe(z.string().min(7, 'رقم هاتف غير صحيح').max(15, 'رقم هاتف غير صحيح'));
const zNational = z.string().transform(normalizeDigits).pipe(z.string().min(6, 'رقم هوية غير صحيح').max(20, 'رقم هوية غير صحيح'));

const fields = {
  full_name: z.string({ error: 'الاسم مطلوب' }).trim().min(3, 'الاسم قصير جداً').max(120, 'الاسم طويل جداً'),
  phone: zPhone.nullable().optional(),
  national_id: zNational.nullable().optional(),
  status: z.enum(['alive', 'deceased']).optional(),
  death_date: zDate.nullable().optional(),
  delegate_id: zId.nullable().optional(),
  family_size: z.number().int().min(1).max(50).optional(),
  monthly_fee: z.number().int().min(0).max(1_000_000_000).optional(),
  address: zText(200).nullable().optional(),
  notes: zText(500).nullable().optional(),
};

interface ListRow {
  id: number;
  full_name: string;
  phone: string | null;
  national_id_last4: string | null;
  status: string;
  delegate_id: number | null;
  family_size: number;
}

const LIST_COLUMNS = 'id, full_name, phone, national_id_last4, status, delegate_id, family_size';

const masked = ({ phone, national_id_last4, ...row }: ListRow) => ({
  ...row,
  phone: maskPhone(phone),
  national_id: maskNationalId(national_id_last4),
});

const delegateScope = (c: Context<AppEnv>) => (c.get('user').role === 'delegate' ? c.get('user').id : null);

// 404 rather than 403, so a delegate cannot probe which ids exist.
async function loadScoped<T extends { delegate_id: number | null }>(c: Context<AppEnv>, columns: string, id: number) {
  const row = await first<T>(c, `SELECT ${columns} FROM subscribers WHERE id = ? AND deleted_at IS NULL`, id);
  const scope = delegateScope(c);
  if (!row || (scope !== null && row.delegate_id !== scope)) fail(404, 'السجل غير موجود');
  return row;
}

export async function searchRows<T>(c: Context<AppEnv>, columns: string, q: string, status?: string, delegate?: number | null, columnParams: unknown[] = []): Promise<T[]> {
  const digits = normalizeDigits(q);
  const isPhone = digits.length >= 3 && /^[\d\s+\-٠-٩۰-۹]+$/.test(q);
  const term = isPhone ? digits : normalizeName(q);
  if (term.length < 3) fail(422, 'أدخل 3 أحرف على الأقل');
  const [from, to] = prefixRange(term);
  const column = isPhone ? 'phone' : 'name_norm';

  const where = ['deleted_at IS NULL', `${column} >= ?`, `${column} < ?`];
  const params: unknown[] = [from, to];
  if (isPhone) where.push('phone IS NOT NULL');
  const scope = delegateScope(c) ?? delegate ?? null;
  if (scope !== null) {
    where.push('delegate_id = ?');
    params.push(scope);
  }
  // Unary + keeps the planner off the status index: it would scan every subscriber
  // of that status and sort them, about 25,000 rows instead of 30.
  if (status) {
    where.push('+status = ?');
    params.push(status);
  }
  return all<T>(c, `SELECT ${columns} FROM subscribers WHERE ${where.join(' AND ')} ORDER BY ${column} LIMIT ${PAGE_SIZE}`, ...columnParams, ...params);
}

export const subscribers = new Hono<AppEnv>();

subscribers.get('/', requireRole('admin', 'delegate'), async (c) => {
  const status = parseOrFail(z.enum(['alive', 'deceased']).default('alive'), c.req.query('status'));
  const cursor = cursorParam(c.req.query('cursor'));
  const scope = delegateScope(c);
  const delegate = scope ?? (c.req.query('delegate') ? idParam(c.req.query('delegate')!) : null);

  const rows = delegate !== null
    ? await all<ListRow>(c, `SELECT ${LIST_COLUMNS} FROM subscribers
        WHERE delegate_id = ? AND status = ? AND deleted_at IS NULL AND id < ? ORDER BY id DESC LIMIT ${PAGE_SIZE}`,
        delegate, status, cursor)
    : await all<ListRow>(c, `SELECT ${LIST_COLUMNS} FROM subscribers
        WHERE status = ? AND deleted_at IS NULL AND id < ? ORDER BY id DESC LIMIT ${PAGE_SIZE}`,
        status, cursor);
  return c.json({ items: rows.map(masked), next: nextCursor(rows) });
});

// POST keeps names and phone numbers out of URLs and therefore out of request logs.
subscribers.post('/search', requireRole('admin', 'delegate'), async (c) => {
  const { q, status } = await readJson(c, z.object({
    q: z.string().trim().max(60),
    status: z.enum(['alive', 'deceased']).optional(),
  }));
  const rows = await searchRows<ListRow>(c, LIST_COLUMNS, q, status);
  return c.json({ items: rows.map(masked), next: null });
});

// Id and name only: lets accountants and health officers pick a person without opening the register.
subscribers.post('/lookup', requireRole('admin', 'accountant', 'health', 'delegate'), async (c) => {
  const { q } = await readJson(c, z.object({ q: z.string().trim().max(60) }));
  const items = await searchRows<{ id: number; full_name: string }>(c, 'id, full_name', q);
  return c.json({ items });
});

subscribers.post('/', requireRole('admin', 'delegate'), async (c) => {
  const body = await readJson(c, z.object({ ...fields, confirm_other_delegate: z.boolean().optional() }));
  const user = c.get('user');
  const delegateId = delegateScope(c) ?? body.delegate_id ?? null;
  const status = body.status ?? 'alive';

  // The same name under another delegate is reported before anything is added. Only an admin
  // can then add it anyway; a delegate is told to go through the administration. The same name
  // twice under one delegate (e.g. alive and paying for a deceased relative) is normal.
  if (!body.confirm_other_delegate || delegateScope(c) !== null) {
    const conflicts = await all<{ id: number; full_name: string; status: string; delegate_id: number | null; delegate_name: string | null }>(
      c,
      `SELECT s.id, s.full_name, s.status, s.delegate_id, u.full_name AS delegate_name
       FROM subscribers s LEFT JOIN users u ON u.id = s.delegate_id
       WHERE s.name_norm = ? AND s.deleted_at IS NULL AND s.delegate_id IS NOT ? LIMIT 10`,
      normalizeName(body.full_name), delegateId,
    );
    if (conflicts.length) {
      const where = [...new Set(conflicts.map((row) => row.delegate_name ?? 'بدون مندوب'))].join('، ');
      return c.json({
        error: delegateScope(c) !== null
          ? `هذا الاسم مسجّل عند مندوب آخر (${where}). راجع الإدارة لإضافته أو نقله إليك.`
          : `هذا الاسم مسجّل عند مندوب آخر: ${where}`,
        conflicts: delegateScope(c) !== null ? [] : conflicts,
      }, 409);
    }
  }

  const nationalId = body.national_id ?? null;
  const statements = [
    stmt(c,
      `INSERT INTO subscribers (full_name, name_norm, phone, national_id_enc, national_id_bidx, national_id_last4,
         status, death_date, delegate_id, family_size, monthly_fee, address, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      body.full_name, normalizeName(body.full_name), body.phone ?? null,
      nationalId ? await encryptText(c.env.DATA_KEY, nationalId) : null,
      nationalId ? await hmac(c.env.BLIND_KEY, nationalId) : null,
      nationalId ? nationalId.slice(-4) : null,
      status, status === 'deceased' ? body.death_date ?? null : null, delegateId,
      body.family_size ?? 1, body.monthly_fee ?? 0, body.address ?? null, body.notes ?? null, user.id),
    auditInsertedStmt(c, 'create', 'subscriber'),
  ];
  const results = await batch(c, statements);
  return c.json({ id: (results[0].results[0] as { id: number }).id }, 201);
});

subscribers.get('/:id', requireRole('admin', 'delegate'), async (c) => {
  const row = await loadScoped<ListRow & { death_date: string | null; address: string | null; notes: string | null; created_at: string }>(
    c,
    `${LIST_COLUMNS}, death_date, address, notes, created_at`,
    idParam(c.req.param('id')),
  );
  return c.json(masked(row));
});

subscribers.post('/:id/reveal', requireRole('admin', 'delegate'), async (c) => {
  const id = idParam(c.req.param('id'));
  const row = await loadScoped<{ delegate_id: number | null; phone: string | null; national_id_enc: string | null }>(
    c, 'delegate_id, phone, national_id_enc', id,
  );
  await batch(c, [auditStmt(c, 'reveal', 'subscriber', id)]);
  return c.json({
    phone: row.phone,
    national_id: row.national_id_enc ? await decryptText(c.env.DATA_KEY, row.national_id_enc) : null,
  });
});

subscribers.patch('/:id', requireRole('admin', 'delegate'), async (c) => {
  const id = idParam(c.req.param('id'));
  const body = await readJson(c, z.object(fields).partial().strict());
  const current = await loadScoped<{ delegate_id: number | null; full_name: string }>(c, 'delegate_id, full_name', id);
  if (body.delegate_id !== undefined && delegateScope(c) !== null) fail(403, 'لا يمكن للمندوب نقل المشتركين');

  const set: string[] = ['updated_at = ?'];
  const params: unknown[] = [new Date().toISOString()];
  const put = (column: string, value: unknown) => {
    set.push(`${column} = ?`);
    params.push(value);
  };

  if (body.full_name !== undefined) {
    put('full_name', body.full_name);
    put('name_norm', normalizeName(body.full_name));
  }
  if (body.national_id !== undefined) {
    const value = body.national_id;
    put('national_id_enc', value ? await encryptText(c.env.DATA_KEY, value) : null);
    put('national_id_bidx', value ? await hmac(c.env.BLIND_KEY, value) : null);
    put('national_id_last4', value ? value.slice(-4) : null);
  }
  for (const column of ['phone', 'status', 'death_date', 'delegate_id', 'family_size', 'monthly_fee', 'address', 'notes'] as const) {
    if (body[column] !== undefined) put(column, body[column]);
  }
  if (body.status === 'alive') put('death_date', null);

  const statements = [
    stmt(c, `UPDATE subscribers SET ${set.join(', ')} WHERE id = ? AND deleted_at IS NULL`, ...params, id),
    auditStmt(c, 'update', 'subscriber', id, Object.keys(body).join(',')),
  ];
  const name = body.full_name ?? current.full_name;
  const delegateId = body.delegate_id === undefined ? current.delegate_id : body.delegate_id;
  if (name !== current.full_name || delegateId !== current.delegate_id) {
    statements.push(stmt(c,
      'UPDATE subscriber_programs SET subscriber_name = ?, delegate_id = ? WHERE subscriber_id = ? AND ended_at IS NULL',
      name, delegateId, id));
  }
  await batch(c, statements);
  return c.json({ ok: true });
});

subscribers.delete('/:id', requireRole('admin'), async (c) => {
  const id = idParam(c.req.param('id'));
  await batch(c, [
    stmt(c, 'UPDATE subscribers SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL', new Date().toISOString(), id),
    auditStmt(c, 'delete', 'subscriber', id),
  ]);
  return c.json({ ok: true });
});

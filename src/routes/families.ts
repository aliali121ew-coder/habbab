import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { requireRole } from '../lib/auth';
import { all, auditDetail, auditStmt, batch, diff, fid, first, stmt } from '../lib/db';
import { fail, idParam, readJson, zDate } from '../lib/http';
import { currentMonth, normalizeName } from '../lib/text';
import { putEncrypted, readImage, signFileLink } from './prescriptions';

// العوائل المتعففة. Answers in the shape the families pages already use (camelCase, nested
// delegate and entitlements), so the pages only change where their data comes from.
// A delegate sees and edits only the families assigned to them; the manager sees all.
export const families = new Hono<AppEnv>();
families.use('*', requireRole('admin', 'delegate'));

type Ctx = Context<AppEnv>;
const isDelegate = (c: Ctx) => c.get('user').role === 'delegate';

interface FamilyRow {
  id: number; file_no: string; name: string; head_name: string; phone: string | null; category: string;
  social_status: string | null; region: string | null; address: string | null; housing: string | null; rent: number;
  income: string | null; delegate_id: number | null; delegate_name: string | null; delegate_phone: string | null; delegate_address: string | null;
  ent_salary: number; ent_aid: number; ent_medicine: number; ent_checkups: number; notes: string | null; photo_key: string | null;
  link_id: number | null; created_at: string;
}
interface MemberRow { id: number; family_id: number; name: string; relation: string | null; age: number | null; gender: string | null; status: string | null; chronic: string | null; phone: string | null; notes: string | null }
interface PaymentRow { id: number; family_id: number; paid_on: string; amount: number; type: string; received_by: string | null; paid_by: string | null }
interface VisitRow { id: number; family_id: number; visited_on: string; delegate_name: string | null; note: string | null }

const FAMILY_COLUMNS = `f.id, f.file_no, f.name, f.head_name, f.phone, f.category, f.social_status, f.region, f.address, f.housing,
  f.rent, f.income, f.delegate_id, u.full_name AS delegate_name, u.phone AS delegate_phone, u.address AS delegate_address,
  f.ent_salary, f.ent_aid, f.ent_medicine, f.ent_checkups, f.notes, f.photo_key, f.link_id, f.created_at`;

// One family as the pages read it.
async function shape(c: Ctx, row: FamilyRow, members: MemberRow[], payments: PaymentRow[], visits: VisitRow[], monthPaid: number) {
  const due = row.ent_salary + row.ent_aid + row.ent_medicine + row.ent_checkups;
  const arrears = Math.max(0, due - monthPaid);
  return {
    id: row.id,
    fileNo: row.file_no,
    name: row.name,
    headName: row.head_name,
    phone: row.phone ?? '',
    category: row.category,
    socialStatus: row.social_status ?? '',
    region: row.region ?? '',
    address: row.address ?? '',
    housing: row.housing ?? '',
    rent: row.rent,
    income: row.income ?? '',
    delegate: row.delegate_id ? { id: row.delegate_id, name: row.delegate_name ?? '', phone: row.delegate_phone ?? '', region: row.delegate_address ?? '' } : null,
    entitlements: { salary: row.ent_salary, aid: row.ent_aid, medicine: row.ent_medicine, checkups: row.ent_checkups },
    paidThisMonth: monthPaid,
    arrears,
    arrearsMonths: arrears > 0 ? 1 : 0,
    lastVisit: visits[0]?.visited_on ?? null,
    notes: row.notes ?? '',
    photo: row.photo_key ? await signFileLink(c, row.photo_key) : null,
    linked: row.link_id !== null,
    createdAt: row.created_at,
    members: members.map((m) => ({
      id: m.id, name: m.name, relation: m.relation ?? '', age: m.age ?? 0, gender: m.gender ?? undefined,
      status: m.status ?? '', chronic: m.chronic ?? undefined, phone: m.phone ?? undefined, notes: m.notes ?? undefined,
    })),
    patients: [] as unknown[],
    payments: payments.map((p) => ({ id: p.id, date: p.paid_on, amount: p.amount, type: p.type, receivedBy: p.received_by ?? '', by: p.paid_by ?? '' })),
    visits: visits.map((v) => ({ id: v.id, date: v.visited_on, delegateName: v.delegate_name ?? '', note: v.note ?? '' })),
  };
}

// The family if this user may see it (404 otherwise, so other ids cannot be probed).
async function loadFamily(c: Ctx, id: number) {
  const row = await first<FamilyRow>(c,
    `SELECT ${FAMILY_COLUMNS} FROM families f LEFT JOIN users u ON u.id = f.delegate_id
     WHERE f.id = ? AND f.foundation_id = ? AND f.deleted_at IS NULL`, id, fid(c));
  if (!row || (isDelegate(c) && row.delegate_id !== c.get('user').id)) fail(404, 'ملف العائلة غير موجود');
  return row;
}

// Every family of the foundation (a delegate: their own), with members, this month's payments
// and visits, and its last visit. Hundreds of families at most per foundation.
// This month's families figures for the home page, counted in the database instead of sending
// every family with its members, payments and visits: how many families, how many still owe
// this month, the visits and the families they covered, and the aid paid out.
families.get('/summary', async (c) => {
  const month = currentMonth();
  const scope = isDelegate(c) ? c.get('user').id : null;
  const byDelegate = scope === null ? '' : ' AND f.delegate_id = ?';
  const scopeParams = scope === null ? [] : [scope];
  const [counts, visits, aid] = await Promise.all([
    first<{ total: number; arrears: number | null }>(c, `SELECT COUNT(*) AS total,
        SUM(CASE WHEN f.ent_salary + f.ent_aid + f.ent_medicine + f.ent_checkups > COALESCE(p.paid, 0) THEN 1 ELSE 0 END) AS arrears
      FROM families f
      LEFT JOIN (SELECT family_id, SUM(amount) AS paid FROM family_payments
        WHERE foundation_id = ? AND month = ? AND deleted_at IS NULL GROUP BY family_id) p ON p.family_id = f.id
      WHERE f.foundation_id = ? AND f.deleted_at IS NULL${byDelegate}`, fid(c), month, fid(c), ...scopeParams),
    first<{ visits: number; visited: number }>(c, `SELECT COUNT(*) AS visits, COUNT(DISTINCT v.family_id) AS visited
      FROM family_visits v JOIN families f ON f.id = v.family_id
      WHERE v.foundation_id = ? AND v.visited_on >= ? AND v.deleted_at IS NULL AND f.deleted_at IS NULL${byDelegate}`,
      fid(c), `${month}-01`, ...scopeParams),
    first<{ count: number; amount: number }>(c, `SELECT COUNT(*) AS count, COALESCE(SUM(p.amount), 0) AS amount
      FROM family_payments p JOIN families f ON f.id = p.family_id
      WHERE p.foundation_id = ? AND p.month = ? AND p.deleted_at IS NULL AND f.deleted_at IS NULL${byDelegate}`,
      fid(c), month, ...scopeParams),
  ]);
  return c.json({
    month,
    total: counts?.total ?? 0,
    arrears: counts?.arrears ?? 0,
    visits: visits?.visits ?? 0,
    visited: visits?.visited ?? 0,
    aid_count: aid?.count ?? 0,
    aid_amount: aid?.amount ?? 0,
  });
});

families.get('/', async (c) => {
  const month = currentMonth();
  const scope = isDelegate(c) ? c.get('user').id : null;
  const byDelegate = scope === null ? '' : ' AND f.delegate_id = ?';
  const scopeParams = scope === null ? [] : [scope];
  const [rows, members, payments, visits, lastVisits] = await Promise.all([
    all<FamilyRow>(c, `SELECT ${FAMILY_COLUMNS} FROM families f LEFT JOIN users u ON u.id = f.delegate_id
      WHERE f.foundation_id = ? AND f.deleted_at IS NULL${byDelegate} ORDER BY f.id DESC LIMIT 5000`, fid(c), ...scopeParams),
    all<MemberRow>(c, `SELECT m.id, m.family_id, m.name, m.relation, m.age, m.gender, m.status, m.chronic, m.phone, m.notes
      FROM family_members m JOIN families f ON f.id = m.family_id
      WHERE m.foundation_id = ? AND m.deleted_at IS NULL AND f.deleted_at IS NULL${byDelegate} ORDER BY m.family_id, m.sort, m.id`, fid(c), ...scopeParams),
    all<PaymentRow>(c, `SELECT p.id, p.family_id, p.paid_on, p.amount, p.type, p.received_by, p.paid_by
      FROM family_payments p JOIN families f ON f.id = p.family_id
      WHERE p.foundation_id = ? AND p.month = ? AND p.deleted_at IS NULL AND f.deleted_at IS NULL${byDelegate} ORDER BY p.paid_on DESC, p.id DESC`,
      fid(c), month, ...scopeParams),
    all<VisitRow>(c, `SELECT v.id, v.family_id, v.visited_on, v.delegate_name, v.note
      FROM family_visits v JOIN families f ON f.id = v.family_id
      WHERE v.foundation_id = ? AND v.visited_on >= ? AND v.deleted_at IS NULL AND f.deleted_at IS NULL${byDelegate} ORDER BY v.visited_on DESC, v.id DESC`,
      fid(c), `${month}-01`, ...scopeParams),
    all<{ family_id: number; last: string }>(c, `SELECT v.family_id, MAX(v.visited_on) AS last
      FROM family_visits v JOIN families f ON f.id = v.family_id
      WHERE v.foundation_id = ? AND v.deleted_at IS NULL AND f.deleted_at IS NULL${byDelegate} GROUP BY v.family_id`, fid(c), ...scopeParams),
  ]);
  const group = <T extends { family_id: number }>(list: T[]) => {
    const map = new Map<number, T[]>();
    for (const item of list) map.set(item.family_id, [...(map.get(item.family_id) ?? []), item]);
    return map;
  };
  const membersBy = group(members);
  const paymentsBy = group(payments);
  const visitsBy = group(visits);
  const lastBy = new Map(lastVisits.map((v) => [v.family_id, v.last]));
  const items = await Promise.all(rows.map(async (row) => {
    const own = paymentsBy.get(row.id) ?? [];
    const shaped = await shape(c, row, membersBy.get(row.id) ?? [], own, visitsBy.get(row.id) ?? [], own.reduce((sum, p) => sum + p.amount, 0));
    return { ...shaped, lastVisit: lastBy.get(row.id) ?? null };
  }));
  return c.json({ items, month });
});

// One family in full, with what other foundations that confirmed the same family gave it.
families.get('/:id', async (c) => {
  const row = await loadFamily(c, idParam(c.req.param('id')));
  const month = currentMonth();
  const [members, payments, visits, shared] = await Promise.all([
    all<MemberRow>(c, `SELECT id, family_id, name, relation, age, gender, status, chronic, phone, notes FROM family_members
      WHERE family_id = ? AND foundation_id = ? AND deleted_at IS NULL ORDER BY sort, id`, row.id, fid(c)),
    all<PaymentRow>(c, `SELECT id, family_id, paid_on, amount, type, received_by, paid_by FROM family_payments
      WHERE family_id = ? AND foundation_id = ? AND deleted_at IS NULL ORDER BY paid_on DESC, id DESC LIMIT 500`, row.id, fid(c)),
    all<VisitRow>(c, `SELECT id, family_id, visited_on, delegate_name, note FROM family_visits
      WHERE family_id = ? AND foundation_id = ? AND deleted_at IS NULL ORDER BY visited_on DESC, id DESC LIMIT 200`, row.id, fid(c)),
    row.link_id === null ? Promise.resolve([]) : all<{ foundation_id: number; foundation: string; paid_on: string; amount: number; type: string }>(c,
      // scope-ok: shared on purpose — only type, amount, date and foundation name of the same family elsewhere
      `SELECT f.foundation_id, fo.name AS foundation, p.paid_on, p.amount, p.type
       FROM families f JOIN foundations fo ON fo.id = f.foundation_id
       JOIN family_payments p ON p.family_id = f.id AND p.deleted_at IS NULL
       WHERE f.link_id = ? AND f.foundation_id <> ? AND f.deleted_at IS NULL
       ORDER BY p.paid_on DESC LIMIT 300`, row.link_id, fid(c)),
  ]);
  const monthPaid = payments.filter((p) => p.paid_on.startsWith(month)).reduce((sum, p) => sum + p.amount, 0);
  return c.json({ ...(await shape(c, row, members, payments, visits, monthPaid)), shared, month });
});

const zMember = z.object({
  name: z.string().trim().min(2, 'اسم الفرد مطلوب').max(120),
  relation: z.string().trim().max(60).optional(),
  age: z.coerce.number().int().min(0).max(130).optional(),
  gender: z.string().trim().max(10).optional(),
  status: z.string().trim().max(80).optional(),
  chronic: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(20).optional(),
  notes: z.string().trim().max(300).optional(),
});
const zEnt = z.object({
  salary: z.coerce.number().int().min(0).max(100_000_000).default(0),
  aid: z.coerce.number().int().min(0).max(100_000_000).default(0),
  medicine: z.coerce.number().int().min(0).max(100_000_000).default(0),
  checkups: z.coerce.number().int().min(0).max(100_000_000).default(0),
});
const zFamily = {
  name: z.string({ error: 'اسم العائلة مطلوب' }).trim().min(3, 'اسم العائلة قصير جداً').max(160),
  headName: z.string({ error: 'اسم رب الأسرة مطلوب' }).trim().min(3, 'اسم رب الأسرة قصير جداً').max(120),
  phone: z.string().trim().max(20).optional(),
  category: z.enum(['critical', 'intensive', 'stable']).optional(),
  socialStatus: z.string().trim().max(80).optional(),
  region: z.string().trim().max(80).optional(),
  address: z.string().trim().max(200).optional(),
  housing: z.string().trim().max(60).optional(),
  rent: z.coerce.number().int().min(0).max(100_000_000).optional(),
  income: z.string().trim().max(160).optional(),
  delegateId: z.number().int().positive().nullable().optional(),
  entitlements: zEnt.optional(),
  notes: z.string().trim().max(1000).optional(),
};

// A delegate files families under themselves; the manager picks a delegate of this foundation.
async function delegateFor(c: Ctx, requested: number | null | undefined): Promise<number | null> {
  if (isDelegate(c)) return c.get('user').id;
  if (!requested) return null;
  const ok = await first(c, "SELECT id FROM users WHERE id = ? AND foundation_id = ? AND role = 'delegate'", requested, fid(c));
  if (!ok) fail(422, 'المندوب غير موجود');
  return requested;
}

// Files of the same family at other foundations, by the head's four-part name: only the
// foundation's name and the region are shown, so the user can say whether it is the same family.
families.post('/match', async (c) => {
  const { headName } = await readJson(c, z.object({ headName: z.string().trim().min(3).max(120) }));
  const rows = await all<{ id: number; foundation: string; region: string | null }>(c,
    // scope-ok: looks across foundations on purpose; returns no personal details
    `SELECT f.id, fo.name AS foundation, f.region FROM families f JOIN foundations fo ON fo.id = f.foundation_id
     WHERE f.head_norm = ? AND f.foundation_id <> ? AND f.deleted_at IS NULL AND fo.status = 'active' LIMIT 5`,
    normalizeName(headName), fid(c));
  return c.json({ items: rows });
});

// The link group a confirmed match joins (creating it on the other file if it had none).
async function linkTo(c: Ctx, targetId: number, expectedNorm: string): Promise<{ group: number; statements: D1PreparedStatement[] }> {
  if (c.get('user').role !== 'admin') fail(403, 'ربط الملفات متاح للمدير فقط');
  const target = await first<{ id: number; link_id: number | null }>(c,
    // scope-ok: the other foundation's file, verified by exact normalized name and active foundation
    `SELECT f.id, f.link_id FROM families f JOIN foundations fo ON fo.id = f.foundation_id
     WHERE f.id = ? AND f.foundation_id <> ? AND f.deleted_at IS NULL AND fo.status = 'active' AND f.head_norm = ?`,
    targetId, fid(c), expectedNorm);
  if (!target) fail(422, 'الملف المطابق غير موجود');
  const group = target.link_id ?? target.id;
  return {
    group,
    // scope-ok: sets only the shared link on the other foundation's verified matching file
    statements: target.link_id === null ? [stmt(c, 'UPDATE families SET link_id = ? WHERE id = ?', group, target.id)] : [],
  };
}

families.post('/', async (c) => {
  const body = await readJson(c, z.object({
    ...zFamily,
    members: z.array(zMember).max(30).optional(),
    linkTo: z.number().int().positive().optional(),
  }));
  const delegateId = await delegateFor(c, body.delegateId);
  const ent = body.entitlements ?? { salary: 0, aid: 0, medicine: 0, checkups: 0 };
  const headNorm = normalizeName(body.headName);
  const link = body.linkTo ? await linkTo(c, body.linkTo, headNorm) : null;
  const [created] = await batch(c, [
    stmt(c, `INSERT INTO families (foundation_id, file_no, name, head_name, head_norm, phone, category, social_status, region, address,
               housing, rent, income, delegate_id, ent_salary, ent_aid, ent_medicine, ent_checkups, notes, link_id, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      fid(c), `tmp-${crypto.randomUUID()}`, body.name, body.headName, headNorm, body.phone ?? null, body.category ?? 'intensive',
      body.socialStatus ?? null, body.region ?? null, body.address ?? null, body.housing ?? null, body.rent ?? 0, body.income ?? null,
      delegateId, ent.salary, ent.aid, ent.medicine, ent.checkups, body.notes ?? null, link?.group ?? null, c.get('user').id),
  ]);
  const id = (created.results[0] as { id: number }).id;
  await batch(c, [
    stmt(c, 'UPDATE families SET file_no = ? WHERE id = ? AND foundation_id = ?', `FM-${4000 + id}`, id, fid(c)),
    ...(body.members ?? []).map((m, sort) => stmt(c,
      `INSERT INTO family_members (foundation_id, family_id, name, relation, age, gender, status, chronic, phone, notes, sort)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      fid(c), id, m.name, m.relation ?? '', m.age ?? 0, m.gender ?? null, m.status ?? '', m.chronic ?? null, m.phone ?? null, m.notes ?? null, sort)),
    ...(link?.statements ?? []),
    auditStmt(c, 'create', 'family', id, auditDetail(body.name, undefined, link ? 'مرتبطة بمؤسسة أخرى' : undefined)),
  ]);
  return c.json({ id }, 201);
});

families.patch('/:id', async (c) => {
  const id = idParam(c.req.param('id'));
  const body = await readJson(c, z.object(zFamily).partial().strict());
  const current = await loadFamily(c, id);
  if (body.delegateId !== undefined && isDelegate(c)) fail(403, 'لا يمكن للمندوب نقل العائلة');
  const delegateId = body.delegateId === undefined ? undefined : await delegateFor(c, body.delegateId);

  const next: Record<string, unknown> = {};
  if (body.name !== undefined) next.name = body.name;
  if (body.headName !== undefined) { next.head_name = body.headName; next.head_norm = normalizeName(body.headName); }
  if (body.phone !== undefined) next.phone = body.phone || null;
  if (body.category !== undefined) next.category = body.category;
  if (body.socialStatus !== undefined) next.social_status = body.socialStatus || null;
  if (body.region !== undefined) next.region = body.region || null;
  if (body.address !== undefined) next.address = body.address || null;
  if (body.housing !== undefined) next.housing = body.housing || null;
  if (body.rent !== undefined) next.rent = body.rent;
  if (body.income !== undefined) next.income = body.income || null;
  if (body.notes !== undefined) next.notes = body.notes || null;
  if (delegateId !== undefined) next.delegate_id = delegateId;
  if (body.entitlements) {
    next.ent_salary = body.entitlements.salary; next.ent_aid = body.entitlements.aid;
    next.ent_medicine = body.entitlements.medicine; next.ent_checkups = body.entitlements.checkups;
  }
  const changes = diff(current as unknown as Record<string, unknown>, next);
  delete changes.head_norm;
  if (!Object.keys(next).length) fail(422, 'لا توجد تعديلات');
  const keys = Object.keys(next);
  await batch(c, [
    // scope-ok: ends with AND foundation_id = ? (the checker cuts nested templates)
    stmt(c, `UPDATE families SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ? AND foundation_id = ?`,
      ...keys.map((k) => next[k]), new Date().toISOString(), id, fid(c)),
    auditStmt(c, 'update', 'family', id, auditDetail(current.name, changes)),
  ]);
  return c.json({ ok: true });
});

const zPayment = z.object({
  date: zDate,
  amount: z.coerce.number().int().positive().max(100_000_000),
  type: z.string().trim().min(2).max(60),
  receivedBy: z.string().trim().max(120).optional(),
  by: z.string().trim().max(120).optional(),
});

families.post('/:id/payments', async (c) => {
  const id = idParam(c.req.param('id'));
  const body = await readJson(c, zPayment);
  const family = await loadFamily(c, id);
  await batch(c, [
    stmt(c, `INSERT INTO family_payments (foundation_id, family_id, paid_on, month, amount, type, received_by, paid_by, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      fid(c), id, body.date, body.date.slice(0, 7), body.amount, body.type, body.receivedBy ?? null, body.by ?? null, c.get('user').id),
    auditStmt(c, 'pay', 'family', id, auditDetail(family.name, undefined, JSON.stringify({ amount: body.amount, type: body.type }))),
  ]);
  return c.json({ ok: true }, 201);
});

// Pays each listed family what is still due this month (the manager's «صرف جماعي»).
families.post('/bulk-pay', requireRole('admin'), async (c) => {
  const { ids, date, type } = await readJson(c, z.object({
    ids: z.array(z.number().int().positive()).min(1).max(100),
    date: zDate,
    type: z.string().trim().min(2).max(60).default('راتب شهري'),
  }));
  const month = date.slice(0, 7);
  const rows = await all<{ id: number; name: string; head_name: string; due: number; paid: number; delegate_name: string | null }>(c,
    `SELECT f.id, f.name, f.head_name, f.ent_salary + f.ent_aid + f.ent_medicine + f.ent_checkups AS due,
       COALESCE((SELECT SUM(p.amount) FROM family_payments p WHERE p.family_id = f.id AND p.month = ? AND p.deleted_at IS NULL), 0) AS paid,
       u.full_name AS delegate_name
     FROM families f LEFT JOIN users u ON u.id = f.delegate_id AND u.foundation_id = f.foundation_id
     WHERE f.foundation_id = ? AND f.deleted_at IS NULL AND f.id IN (SELECT value FROM json_each(?))`,
    month, fid(c), JSON.stringify(ids));
  const owing = rows.filter((r) => r.due > r.paid);
  if (!owing.length) return c.json({ paid: 0 });
  const results = await batch(c, owing.map((r) =>
    stmt(c, `INSERT INTO family_payments (foundation_id, family_id, paid_on, month, amount, type, received_by, paid_by, created_by)
             SELECT f.foundation_id, f.id, ?1, ?2,
               (f.ent_salary + f.ent_aid + f.ent_medicine + f.ent_checkups)
                 - COALESCE((SELECT SUM(p.amount) FROM family_payments p WHERE p.family_id = f.id AND p.month = ?2 AND p.deleted_at IS NULL), 0),
               ?3, f.head_name, ?4, ?5
             FROM families f
             WHERE f.id = ?6 AND f.foundation_id = ?7 AND f.deleted_at IS NULL
               AND (f.ent_salary + f.ent_aid + f.ent_medicine + f.ent_checkups)
                 > COALESCE((SELECT SUM(p.amount) FROM family_payments p WHERE p.family_id = f.id AND p.month = ?2 AND p.deleted_at IS NULL), 0)`,
      date, month, type, r.delegate_name ?? 'الصرف الجماعي', c.get('user').id, r.id, fid(c))));
  const paidRows = owing.filter((_, i) => (results[i]?.meta?.changes ?? 0) > 0);
  if (paidRows.length) {
    await batch(c, paidRows.map((r) =>
      auditStmt(c, 'pay', 'family', r.id, auditDetail(r.name, undefined, JSON.stringify({ amount: r.due - r.paid, type })))));
  }
  return c.json({ paid: paidRows.length });
});

families.post('/:id/visits', async (c) => {
  const id = idParam(c.req.param('id'));
  const body = await readJson(c, z.object({ date: zDate, delegateName: z.string().trim().max(120).optional(), note: z.string().trim().max(1000).optional() }));
  const family = await loadFamily(c, id);
  await batch(c, [
    stmt(c, `INSERT INTO family_visits (foundation_id, family_id, visited_on, delegate_name, note, created_by) VALUES (?, ?, ?, ?, ?, ?)`,
      fid(c), id, body.date, body.delegateName ?? null, body.note ?? null, c.get('user').id),
    auditStmt(c, 'visit', 'family', id, auditDetail(family.name, undefined, body.date)),
  ]);
  return c.json({ ok: true }, 201);
});

families.post('/:id/members', async (c) => {
  const id = idParam(c.req.param('id'));
  const m = await readJson(c, zMember);
  const family = await loadFamily(c, id);
  await batch(c, [
    stmt(c, `INSERT INTO family_members (foundation_id, family_id, name, relation, age, gender, status, chronic, phone, notes, sort)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(sort), -1) + 1 FROM family_members WHERE family_id = ?))`,
      fid(c), id, m.name, m.relation ?? '', m.age ?? 0, m.gender ?? null, m.status ?? '', m.chronic ?? null, m.phone ?? null, m.notes ?? null, id),
    auditStmt(c, 'add_member', 'family', id, auditDetail(family.name, undefined, m.name)),
  ]);
  return c.json({ ok: true }, 201);
});

families.patch('/:id/members/:memberId', async (c) => {
  const id = idParam(c.req.param('id'));
  const memberId = idParam(c.req.param('memberId'));
  const m = await readJson(c, zMember.partial());
  const family = await loadFamily(c, id);
  const current = await first<MemberRow>(c,
    'SELECT id, family_id, name, relation, age, gender, status, chronic, phone, notes FROM family_members WHERE id = ? AND family_id = ? AND foundation_id = ? AND deleted_at IS NULL',
    memberId, id, fid(c));
  if (!current) fail(404, 'الفرد غير موجود');
  const next = Object.fromEntries(Object.entries(m).filter(([, value]) => value !== undefined));
  if (!Object.keys(next).length) fail(422, 'لا توجد تعديلات');
  await batch(c, [
    // scope-ok: ends with AND foundation_id = ? (the checker cuts nested templates)
    stmt(c, `UPDATE family_members SET ${Object.keys(next).map((k) => `${k} = ?`).join(', ')} WHERE id = ? AND foundation_id = ?`,
      ...Object.values(next), memberId, fid(c)),
    auditStmt(c, 'update_member', 'family', id, auditDetail(family.name, diff(current as unknown as Record<string, unknown>, next), current.name)),
  ]);
  return c.json({ ok: true });
});

families.delete('/:id/members/:memberId', async (c) => {
  const id = idParam(c.req.param('id'));
  const memberId = idParam(c.req.param('memberId'));
  const family = await loadFamily(c, id);
  const current = await first<{ name: string }>(c,
    'SELECT name FROM family_members WHERE id = ? AND family_id = ? AND foundation_id = ? AND deleted_at IS NULL', memberId, id, fid(c));
  if (!current) fail(404, 'الفرد غير موجود');
  await batch(c, [
    stmt(c, 'UPDATE family_members SET deleted_at = ? WHERE id = ? AND foundation_id = ?', new Date().toISOString(), memberId, fid(c)),
    auditStmt(c, 'remove_member', 'family', id, auditDetail(family.name, undefined, current.name)),
  ]);
  return c.json({ ok: true });
});

families.post('/:id/photo', async (c) => {
  const id = idParam(c.req.param('id'));
  const family = await loadFamily(c, id);
  const form = await c.req.formData().catch(() => fail(400, 'صيغة الطلب غير صحيحة'));
  const image = await readImage(form.get('image'), 300 * 1024);
  if (!image) fail(422, 'الصورة مطلوبة');
  const key = `families/${crypto.randomUUID()}.bin`;
  await putEncrypted(c, key, image);
  await batch(c, [
    stmt(c, 'UPDATE families SET photo_key = ? WHERE id = ? AND foundation_id = ?', key, id, fid(c)),
    auditStmt(c, 'update_photo', 'family', id, auditDetail(family.name)),
  ]);
  if (family.photo_key) c.executionCtx.waitUntil(c.env.FILES.delete(family.photo_key));
  return c.json({ photo: await signFileLink(c, key) });
});

// Confirm later that a file is the same family as one at another foundation, or undo it.
families.post('/:id/link', requireRole('admin'), async (c) => {
  const id = idParam(c.req.param('id'));
  const { target } = await readJson(c, z.object({ target: z.number().int().positive() }));
  const family = await loadFamily(c, id);
  const link = await linkTo(c, target, normalizeName(family.head_name));
  await batch(c, [
    ...link.statements,
    stmt(c, 'UPDATE families SET link_id = ? WHERE id = ? AND foundation_id = ?', link.group, id, fid(c)),
    auditStmt(c, 'link', 'family', id, auditDetail(family.name)),
  ]);
  return c.json({ ok: true });
});

families.delete('/:id/link', requireRole('admin'), async (c) => {
  const id = idParam(c.req.param('id'));
  const family = await loadFamily(c, id);
  await batch(c, [
    stmt(c, 'UPDATE families SET link_id = NULL WHERE id = ? AND foundation_id = ?', id, fid(c)),
    auditStmt(c, 'unlink', 'family', id, auditDetail(family.name)),
  ]);
  return c.json({ ok: true });
});

import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { requireRole } from '../lib/auth';
import { all, auditDetail, auditStmt, batch, diff, fid, first, stmt } from '../lib/db';
import { fail, idParam, readJson, zDate } from '../lib/http';
import { normalizeName } from '../lib/text';
import { putEncrypted, readImage, signFileLink } from './prescriptions';

// المرضى. Each patient comes with every aid it received: this foundation's in full, and, when
// another foundation confirmed it holds the same patient, that foundation's aid too (cash,
// medicine, exam fee, date and foundation name; its doctor, delegate and notes stay its own).
export const patients = new Hono<AppEnv>();
patients.use('*', requireRole('admin', 'health', 'delegate'));
// A delegate reads the patients they follow (through the family, or given to them) and changes nothing.
patients.use('*', async (c, next) => {
  if (c.get('user').role === 'delegate' && c.req.method !== 'GET') fail(403, 'ليست لديك صلاحية لهذا الإجراء');
  await next();
});

type Ctx = Context<AppEnv>;

interface PatientRow {
  id: number; file_no: string; name: string; age: number | null; gender: string | null; condition: string | null;
  address: string | null; phone: string | null; notes: string | null; photo_key: string | null; link_id: number | null; created_at: string;
  family_id: number | null; delegate_id: number | null; family_name: string | null; eff_delegate_id: number | null; eff_delegate_name: string | null;
}
interface AidRow {
  id: number; patient_id: number; given_on: string; cash: number; medicine: number; exams: number;
  doctor: string | null; delegate: string | null; note: string | null;
}
interface SharedRow { link_id: number; foundation: string; given_on: string; cash: number; medicine: number; exams: number }

// The patient, their family (when linked) and the delegate who follows them: the one given
// directly, else the family's. Every read of a patient goes through this.
const SELECT_PATIENT = `SELECT p.id, p.file_no, p.name, p.age, p.gender, p.condition, p.address, p.phone, p.notes, p.photo_key,
    p.link_id, p.created_at, p.family_id, p.delegate_id, f.name AS family_name,
    COALESCE(p.delegate_id, f.delegate_id) AS eff_delegate_id, u.full_name AS eff_delegate_name
  FROM patients p
  LEFT JOIN families f ON f.id = p.family_id AND f.foundation_id = p.foundation_id AND f.deleted_at IS NULL
  LEFT JOIN users u ON u.id = COALESCE(p.delegate_id, f.delegate_id) AND u.foundation_id = p.foundation_id`;
const DIFF_COLUMNS = ['name', 'age', 'gender', 'condition', 'address', 'phone', 'notes', 'family_id', 'delegate_id'];

const ownName = async (c: Ctx) => (await first<{ name: string }>(c, 'SELECT name FROM foundations WHERE id = ?', fid(c)))?.name ?? '';

async function shape(c: Ctx, row: PatientRow, own: AidRow[], shared: SharedRow[], foundation: string) {
  const records = [
    ...own.map((a) => ({
      id: a.id, own: true, foundation, date: a.given_on, cash: a.cash, medicine: a.medicine, exams: a.exams,
      doctor: a.doctor ?? '', delegate: a.delegate ?? '', note: a.note ?? '',
    })),
    ...shared.map((a, i) => ({
      id: -(i + 1), own: false, foundation: a.foundation, date: a.given_on, cash: a.cash, medicine: a.medicine, exams: a.exams,
      doctor: '', delegate: '', note: '',
    })),
  ].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  return {
    id: row.id,
    file: row.file_no,
    name: row.name,
    age: row.age ?? 0,
    gender: row.gender ?? undefined,
    condition: row.condition ?? '',
    address: row.address ?? '',
    phone: row.phone ?? '',
    notes: row.notes ?? '',
    photo: row.photo_key ? await signFileLink(c, row.photo_key) : null,
    linked: row.link_id !== null,
    createdAt: row.created_at,
    family: row.family_id && row.family_name ? { id: row.family_id, name: row.family_name } : null,
    // Who follows the patient, and how: given directly, or through the family.
    delegate: row.eff_delegate_id ? { id: row.eff_delegate_id, name: row.eff_delegate_name ?? '', via: row.delegate_id ? 'direct' : 'family' } : null,
    directDelegateId: row.delegate_id,
    records,
  };
}

// What other foundations gave the patients of these link groups.
function sharedFor(c: Ctx, links: number[]) {
  if (!links.length) return Promise.resolve([] as SharedRow[]);
  return all<SharedRow>(c,
    // scope-ok: shared on purpose — only the amounts, date and foundation name of the same patient elsewhere
    `SELECT p.link_id, fo.name AS foundation, a.given_on, a.cash, a.medicine, a.exams
     FROM patients p JOIN foundations fo ON fo.id = p.foundation_id
     JOIN patient_aids a ON a.patient_id = p.id AND a.deleted_at IS NULL
     WHERE p.link_id IN (SELECT value FROM json_each(?)) AND p.foundation_id <> ? AND p.deleted_at IS NULL
     ORDER BY a.given_on DESC LIMIT 5000`, JSON.stringify(links), fid(c));
}

async function loadPatient(c: Ctx, id: number) {
  const row = await first<PatientRow>(c, `${SELECT_PATIENT} WHERE p.id = ? AND p.foundation_id = ? AND p.deleted_at IS NULL`, id, fid(c));
  // A delegate sees only the patients they follow.
  if (!row || (c.get('user').role === 'delegate' && row.eff_delegate_id !== c.get('user').id)) fail(404, 'ملف المريض غير موجود');
  return row;
}

// The families and delegates a patient can be linked to (for the manager and health officer,
// who have no families page of their own).
patients.get('/links', async (c) => {
  if (c.get('user').role === 'delegate') fail(403, 'ليست لديك صلاحية لهذا الإجراء');
  const [families, delegates] = await Promise.all([
    all<{ id: number; name: string; delegate_name: string | null }>(c,
      `SELECT f.id, f.name, u.full_name AS delegate_name FROM families f LEFT JOIN users u ON u.id = f.delegate_id AND u.foundation_id = f.foundation_id
       WHERE f.foundation_id = ? AND f.deleted_at IS NULL ORDER BY f.name LIMIT 5000`, fid(c)),
    all<{ id: number; full_name: string }>(c,
      "SELECT id, full_name FROM users WHERE foundation_id = ? AND role = 'delegate' AND active = 1 ORDER BY full_name", fid(c)),
  ]);
  return c.json({
    families: families.map((f) => ({ id: f.id, name: f.name, delegate: f.delegate_name })),
    delegates: delegates.map((d) => ({ id: d.id, name: d.full_name })),
  });
});

// How many patients there are (for the home page), without sending the list and its aid records.
patients.get('/count', async (c) => {
  const row = c.get('user').role === 'delegate'
    ? await first<{ n: number }>(c, `SELECT COUNT(*) AS n FROM patients p
        LEFT JOIN families f ON f.id = p.family_id AND f.foundation_id = p.foundation_id AND f.deleted_at IS NULL
        WHERE p.foundation_id = ? AND p.deleted_at IS NULL AND COALESCE(p.delegate_id, f.delegate_id) = ?`, fid(c), c.get('user').id)
    : await first<{ n: number }>(c, 'SELECT COUNT(*) AS n FROM patients WHERE foundation_id = ? AND deleted_at IS NULL', fid(c));
  return c.json({ total: row?.n ?? 0 });
});

patients.get('/', async (c) => {
  const [rows, aids, foundation] = await Promise.all([
    c.get('user').role === 'delegate'
      ? all<PatientRow>(c, `${SELECT_PATIENT} WHERE p.foundation_id = ? AND p.deleted_at IS NULL AND COALESCE(p.delegate_id, f.delegate_id) = ? ORDER BY p.id DESC LIMIT 5000`, fid(c), c.get('user').id)
      : all<PatientRow>(c, `${SELECT_PATIENT} WHERE p.foundation_id = ? AND p.deleted_at IS NULL ORDER BY p.id DESC LIMIT 5000`, fid(c)),
    all<AidRow>(c, `SELECT a.id, a.patient_id, a.given_on, a.cash, a.medicine, a.exams, a.doctor, a.delegate, a.note
      FROM patient_aids a JOIN patients p ON p.id = a.patient_id
      WHERE a.foundation_id = ? AND a.deleted_at IS NULL AND p.deleted_at IS NULL ORDER BY a.given_on DESC, a.id DESC LIMIT 20000`, fid(c)),
    ownName(c),
  ]);
  const shared = await sharedFor(c, [...new Set(rows.map((r) => r.link_id).filter((l): l is number => l !== null))]);
  const aidsBy = new Map<number, AidRow[]>();
  for (const a of aids) aidsBy.set(a.patient_id, [...(aidsBy.get(a.patient_id) ?? []), a]);
  const sharedBy = new Map<number, SharedRow[]>();
  for (const s of shared) sharedBy.set(s.link_id, [...(sharedBy.get(s.link_id) ?? []), s]);
  const items = await Promise.all(rows.map((row) => shape(c, row, aidsBy.get(row.id) ?? [], row.link_id === null ? [] : sharedBy.get(row.link_id) ?? [], foundation)));
  return c.json({ items, foundation });
});

patients.get('/:id', async (c) => {
  const row = await loadPatient(c, idParam(c.req.param('id')));
  const [aids, shared, foundation] = await Promise.all([
    all<AidRow>(c, `SELECT id, patient_id, given_on, cash, medicine, exams, doctor, delegate, note FROM patient_aids
      WHERE patient_id = ? AND foundation_id = ? AND deleted_at IS NULL ORDER BY given_on DESC, id DESC LIMIT 2000`, row.id, fid(c)),
    row.link_id === null ? Promise.resolve([]) : sharedFor(c, [row.link_id]),
    ownName(c),
  ]);
  return c.json({ ...(await shape(c, row, aids, shared, foundation)), foundation });
});

const zPatient = {
  familyId: z.number().int().positive().nullable().optional(),
  delegateId: z.number().int().positive().nullable().optional(),
  name: z.string({ error: 'اسم المريض مطلوب' }).trim().min(3, 'اسم المريض قصير جداً').max(120),
  age: z.coerce.number().int().min(0).max(130).optional(),
  gender: z.enum(['male', 'female']).optional(),
  condition: z.string().trim().max(120).optional(),
  address: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(20).optional(),
  notes: z.string().trim().max(1000).optional(),
};

// Files of the same patient at other foundations, by the four-part name: the foundation's name
// and nothing else of the file, so the user can say whether it is the same person.
patients.post('/match', async (c) => {
  const { name } = await readJson(c, z.object({ name: z.string().trim().min(3).max(120) }));
  const rows = await all<{ id: number; foundation: string }>(c,
    // scope-ok: looks across foundations on purpose; returns no personal details
    `SELECT p.id, fo.name AS foundation FROM patients p JOIN foundations fo ON fo.id = p.foundation_id
     WHERE p.name_norm = ? AND p.foundation_id <> ? AND p.deleted_at IS NULL AND fo.status = 'active' LIMIT 5`,
    normalizeName(name), fid(c));
  return c.json({ items: rows.map((r) => ({ ...r, region: null })) });
});

async function linkTo(c: Ctx, targetId: number, expectedNorm: string) {
  if (c.get('user').role !== 'admin') fail(403, 'ربط الملفات متاح للمدير فقط');
  const target = await first<{ id: number; link_id: number | null }>(c,
    // scope-ok: the other foundation's file, verified by exact normalized name and active foundation
    `SELECT p.id, p.link_id FROM patients p JOIN foundations fo ON fo.id = p.foundation_id
     WHERE p.id = ? AND p.foundation_id <> ? AND p.deleted_at IS NULL AND fo.status = 'active' AND p.name_norm = ?`,
    targetId, fid(c), expectedNorm);
  if (!target) fail(422, 'الملف المطابق غير موجود');
  const group = target.link_id ?? target.id;
  return {
    group,
    // scope-ok: sets only the shared link on the other foundation's verified matching file
    statements: target.link_id === null ? [stmt(c, 'UPDATE patients SET link_id = ? WHERE id = ?', group, target.id)] : [],
  };
}

/** The family must be this foundation's, and the delegate an active delegate of it. */
async function checkLinks(c: Ctx, familyId: number | null, delegateId: number | null) {
  if (familyId !== null && !(await first(c, 'SELECT id FROM families WHERE id = ? AND foundation_id = ? AND deleted_at IS NULL', familyId, fid(c)))) {
    fail(422, 'العائلة غير موجودة');
  }
  if (delegateId !== null && !(await first(c, "SELECT id FROM users WHERE id = ? AND foundation_id = ? AND role = 'delegate' AND active = 1", delegateId, fid(c)))) {
    fail(422, 'المندوب غير موجود أو موقوف');
  }
}

patients.post('/', async (c) => {
  const body = await readJson(c, z.object({ ...zPatient, linkTo: z.number().int().positive().optional() }));
  const nameNorm = normalizeName(body.name);
  const link = body.linkTo ? await linkTo(c, body.linkTo, nameNorm) : null;
  await checkLinks(c, body.familyId ?? null, body.delegateId ?? null);
  const [created] = await batch(c, [
    stmt(c, `INSERT INTO patients (foundation_id, file_no, name, name_norm, age, gender, condition, address, phone, notes, link_id, family_id, delegate_id, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      fid(c), `tmp-${crypto.randomUUID()}`, body.name, nameNorm, body.age ?? null, body.gender ?? null,
      body.condition ?? null, body.address ?? null, body.phone ?? null, body.notes ?? null, link?.group ?? null,
      body.familyId ?? null, body.delegateId ?? null, c.get('user').id),
  ]);
  const id = (created.results[0] as { id: number }).id;
  await batch(c, [
    stmt(c, 'UPDATE patients SET file_no = ? WHERE id = ? AND foundation_id = ?', `PT-${1000 + id}`, id, fid(c)),
    ...(link?.statements ?? []),
    auditStmt(c, 'create', 'patient', id, auditDetail(body.name, undefined, link ? 'مرتبط بمؤسسة أخرى' : undefined)),
  ]);
  return c.json({ id }, 201);
});

patients.patch('/:id', async (c) => {
  const id = idParam(c.req.param('id'));
  const body = await readJson(c, z.object(zPatient).partial().strict());
  const current = await loadPatient(c, id);
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (value === undefined) continue;
    const column = key === 'familyId' ? 'family_id' : key === 'delegateId' ? 'delegate_id' : key;
    next[column] = typeof value === 'string' && key !== 'name' ? value || null : value;
  }
  if (body.familyId !== undefined || body.delegateId !== undefined) {
    await checkLinks(c, body.familyId ?? null, body.delegateId ?? null);
  }
  if (!Object.keys(next).length) fail(422, 'لا توجد تعديلات');
  const changes = diff(Object.fromEntries(DIFF_COLUMNS.map((k) => [k, (current as unknown as Record<string, unknown>)[k]])), next);
  if (body.name !== undefined) next.name_norm = normalizeName(body.name);
  const keys = Object.keys(next);
  await batch(c, [
    // scope-ok: ends with AND foundation_id = ? (the checker cuts nested templates)
    stmt(c, `UPDATE patients SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ? AND foundation_id = ?`,
      ...keys.map((k) => next[k]), new Date().toISOString(), id, fid(c)),
    auditStmt(c, 'update', 'patient', id, auditDetail(current.name, changes)),
  ]);
  return c.json({ ok: true });
});

patients.delete('/:id', requireRole('admin'), async (c) => {
  const id = idParam(c.req.param('id'));
  const current = await loadPatient(c, id);
  await batch(c, [
    stmt(c, 'UPDATE patients SET deleted_at = ? WHERE id = ? AND foundation_id = ?', new Date().toISOString(), id, fid(c)),
    auditStmt(c, 'delete', 'patient', id, auditDetail(current.name)),
  ]);
  return c.json({ ok: true });
});

const zAid = z.object({
  date: zDate,
  cash: z.coerce.number().int().min(0).max(100_000_000).default(0),
  medicine: z.coerce.number().int().min(0).max(100_000_000).default(0),
  exams: z.coerce.number().int().min(0).max(100_000_000).default(0),
  doctor: z.string().trim().max(120).optional(),
  delegate: z.string().trim().max(120).optional(),
  note: z.string().trim().max(500).optional(),
}).refine((a) => a.cash + a.medicine + a.exams > 0, { message: 'أدخل مبلغاً واحداً على الأقل' });

const aidNote = (a: { cash: number; medicine: number; exams: number }) => JSON.stringify({ cash: a.cash, medicine: a.medicine, exams: a.exams });

patients.post('/:id/aids', async (c) => {
  const id = idParam(c.req.param('id'));
  const body = await readJson(c, zAid);
  const patient = await loadPatient(c, id);
  await batch(c, [
    stmt(c, `INSERT INTO patient_aids (foundation_id, patient_id, given_on, cash, medicine, exams, doctor, delegate, note, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      fid(c), id, body.date, body.cash, body.medicine, body.exams, body.doctor ?? null, body.delegate ?? null, body.note ?? null, c.get('user').id),
    auditStmt(c, 'aid', 'patient', id, auditDetail(patient.name, undefined, aidNote(body))),
  ]);
  return c.json({ ok: true }, 201);
});

patients.patch('/:id/aids/:aidId', async (c) => {
  const id = idParam(c.req.param('id'));
  const aidId = idParam(c.req.param('aidId'));
  const body = await readJson(c, zAid);
  const patient = await loadPatient(c, id);
  const current = await first<AidRow>(c,
    'SELECT id, patient_id, given_on, cash, medicine, exams, doctor, delegate, note FROM patient_aids WHERE id = ? AND patient_id = ? AND foundation_id = ? AND deleted_at IS NULL',
    aidId, id, fid(c));
  if (!current) fail(404, 'المساعدة غير موجودة');
  const next = {
    given_on: body.date, cash: body.cash, medicine: body.medicine, exams: body.exams,
    doctor: body.doctor || null, delegate: body.delegate || null, note: body.note || null,
  };
  await batch(c, [
    stmt(c, `UPDATE patient_aids SET given_on = ?, cash = ?, medicine = ?, exams = ?, doctor = ?, delegate = ?, note = ?
             WHERE id = ? AND foundation_id = ?`,
      next.given_on, next.cash, next.medicine, next.exams, next.doctor, next.delegate, next.note, aidId, fid(c)),
    auditStmt(c, 'update_aid', 'patient', id, auditDetail(patient.name, diff(current as unknown as Record<string, unknown>, next))),
  ]);
  return c.json({ ok: true });
});

patients.delete('/:id/aids/:aidId', requireRole('admin'), async (c) => {
  const id = idParam(c.req.param('id'));
  const aidId = idParam(c.req.param('aidId'));
  const patient = await loadPatient(c, id);
  const current = await first<AidRow>(c,
    'SELECT id, patient_id, given_on, cash, medicine, exams, doctor, delegate, note FROM patient_aids WHERE id = ? AND patient_id = ? AND foundation_id = ? AND deleted_at IS NULL',
    aidId, id, fid(c));
  if (!current) fail(404, 'المساعدة غير موجودة');
  await batch(c, [
    stmt(c, 'UPDATE patient_aids SET deleted_at = ? WHERE id = ? AND foundation_id = ?', new Date().toISOString(), aidId, fid(c)),
    auditStmt(c, 'remove_aid', 'patient', id, auditDetail(patient.name, undefined, aidNote(current))),
  ]);
  return c.json({ ok: true });
});

patients.post('/:id/photo', async (c) => {
  const id = idParam(c.req.param('id'));
  const patient = await loadPatient(c, id);
  const form = await c.req.formData().catch(() => fail(400, 'صيغة الطلب غير صحيحة'));
  const image = await readImage(form.get('image'), 300 * 1024);
  if (!image) fail(422, 'الصورة مطلوبة');
  const key = `patients/${crypto.randomUUID()}.bin`;
  await putEncrypted(c, key, image);
  await batch(c, [
    stmt(c, 'UPDATE patients SET photo_key = ? WHERE id = ? AND foundation_id = ?', key, id, fid(c)),
    auditStmt(c, 'update_photo', 'patient', id, auditDetail(patient.name)),
  ]);
  if (patient.photo_key) c.executionCtx.waitUntil(c.env.FILES.delete(patient.photo_key));
  return c.json({ photo: await signFileLink(c, key) });
});

patients.post('/:id/link', requireRole('admin'), async (c) => {
  const id = idParam(c.req.param('id'));
  const { target } = await readJson(c, z.object({ target: z.number().int().positive() }));
  const patient = await loadPatient(c, id);
  const link = await linkTo(c, target, normalizeName(patient.name));
  await batch(c, [
    ...link.statements,
    stmt(c, 'UPDATE patients SET link_id = ? WHERE id = ? AND foundation_id = ?', link.group, id, fid(c)),
    auditStmt(c, 'link', 'patient', id, auditDetail(patient.name)),
  ]);
  return c.json({ ok: true });
});

patients.delete('/:id/link', requireRole('admin'), async (c) => {
  const id = idParam(c.req.param('id'));
  const patient = await loadPatient(c, id);
  await batch(c, [
    stmt(c, 'UPDATE patients SET link_id = NULL WHERE id = ? AND foundation_id = ?', id, fid(c)),
    auditStmt(c, 'unlink', 'patient', id, auditDetail(patient.name)),
  ]);
  return c.json({ ok: true });
});

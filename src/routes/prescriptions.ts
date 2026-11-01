import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { requireRole } from '../lib/auth';
import { decryptBytes, decryptText, encryptBytes, encryptText, fromB64Url, hmac, hmacVerify, toB64Url } from '../lib/crypto';
import { all, auditInsertedStmt, auditStmt, batch, first, nextCursor, PAGE_SIZE, stmt } from '../lib/db';
import { cursorParam, fail, idParam, parseOrFail, readJson, zDate, zId, zText } from '../lib/http';

const MAX_IMAGE = 300 * 1024;
const MAX_THUMB = 40 * 1024;
const LINK_WINDOW = 300;

const zStatus = z.enum(['pending', 'approved', 'dispensed', 'rejected']);

const zCreate = z.object({
  subscriber_id: zId,
  rx_date: zDate,
  diagnosis: zText(300).min(1, 'التشخيص مطلوب'),
  medicines: zText(1000).min(1, 'الأدوية مطلوبة'),
  notes: zText(500).optional(),
});

function imageType(bytes: Uint8Array): string | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  // Safari cannot encode WebP from a canvas, so JPEG is the accepted fallback.
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  return null;
}

async function readImage(file: FormDataEntryValue | null, maxSize: number) {
  if (file === null) return null;
  if (typeof file === 'string') fail(422, 'ملف غير صالح');
  if (file.size > maxSize) fail(413, 'حجم الصورة أكبر من المسموح');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const contentType = imageType(bytes);
  if (!contentType) fail(422, 'نوع الصورة غير مدعوم');
  return { bytes, contentType };
}

async function putEncrypted(c: Context<AppEnv>, key: string, image: { bytes: Uint8Array<ArrayBuffer>; contentType: string }) {
  await c.env.FILES.put(key, await encryptBytes(c.env.DATA_KEY, image.bytes), {
    customMetadata: { type: image.contentType },
  });
}

// Links expire on fixed 5-minute boundaries, so repeat views inside a window
// reuse the same URL and hit the browser cache rather than an R2 read.
async function signFileLink(c: Context<AppEnv>, key: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const exp = (Math.floor(now / LINK_WINDOW) + 2) * LINK_WINDOW;
  const body = toB64Url(new TextEncoder().encode(JSON.stringify({ k: key, e: exp, u: c.get('user').id })));
  return `/api/files/${body}.${await hmac(c.env.JWT_SECRET, `file:${body}`)}`;
}

export const prescriptions = new Hono<AppEnv>();

prescriptions.use('*', requireRole('admin', 'health'));

prescriptions.get('/', async (c) => {
  const status = parseOrFail(zStatus.optional(), c.req.query('status') || undefined);
  const subscriber = c.req.query('subscriber') ? idParam(c.req.query('subscriber')!) : null;
  const cursor = cursorParam(c.req.query('cursor'));

  const where = ['deleted_at IS NULL', 'id < ?'];
  const params: unknown[] = [cursor];
  if (subscriber !== null) {
    where.push('subscriber_id = ?');
    params.push(subscriber);
  }
  if (status) {
    where.push('status = ?');
    params.push(status);
  }
  const rows = await all<{ id: number; thumb_key: string | null }>(
    c,
    `SELECT id, subscriber_id, patient_name, rx_date, status, thumb_key FROM prescriptions
     WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ${PAGE_SIZE}`,
    ...params,
  );
  const items = await Promise.all(rows.map(async ({ thumb_key, ...row }) => ({
    ...row,
    thumb_url: thumb_key ? await signFileLink(c, thumb_key) : null,
  })));
  return c.json({ items, next: nextCursor(rows) });
});

// Multipart so the image and record are saved together: nothing reaches R2 before "حفظ".
prescriptions.post('/', async (c) => {
  const length = Number(c.req.header('content-length') ?? 0);
  if (length > MAX_IMAGE + MAX_THUMB + 8 * 1024) fail(413, 'حجم الطلب أكبر من المسموح');

  const form = await c.req.formData().catch(() => fail(400, 'صيغة الطلب غير صحيحة'));
  const raw = form.get('data');
  let fields: unknown = null;
  try {
    fields = typeof raw === 'string' ? JSON.parse(raw) : null;
  } catch {
    fail(400, 'صيغة الطلب غير صحيحة');
  }
  const body = parseOrFail(zCreate, fields);
  const image = await readImage(form.get('image'), MAX_IMAGE);
  const thumb = await readImage(form.get('thumb'), MAX_THUMB);

  const patient = await first<{ full_name: string }>(
    c, 'SELECT full_name FROM subscribers WHERE id = ? AND deleted_at IS NULL', body.subscriber_id,
  );
  if (!patient) fail(422, 'المريض غير موجود');

  // Random keys: nothing about the patient appears in storage paths or links.
  const uuid = crypto.randomUUID();
  const imageKey = image ? `rx/${uuid}.bin` : null;
  const thumbKey = thumb ? `rx/${uuid}_t.bin` : null;
  if (imageKey && image) await putEncrypted(c, imageKey, image);
  if (thumbKey && thumb) await putEncrypted(c, thumbKey, thumb);

  const details = JSON.stringify({ diagnosis: body.diagnosis, medicines: body.medicines, notes: body.notes ?? '' });
  try {
    await batch(c, [
      stmt(c,
        `INSERT INTO prescriptions (subscriber_id, patient_name, rx_date, details_enc, image_key, thumb_key, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        body.subscriber_id, patient.full_name, body.rx_date, await encryptText(c.env.DATA_KEY, details),
        imageKey, thumbKey, c.get('user').id),
      auditInsertedStmt(c, 'create', 'prescription'),
    ]);
  } catch (error) {
    const orphans = [imageKey, thumbKey].filter((key): key is string => key !== null);
    if (orphans.length) c.executionCtx.waitUntil(c.env.FILES.delete(orphans));
    throw error;
  }
  return c.json({ ok: true }, 201);
});

prescriptions.get('/:id', async (c) => {
  const id = idParam(c.req.param('id'));
  const row = await first<{
    id: number; subscriber_id: number; patient_name: string; rx_date: string; status: string; details_enc: string; image_key: string | null;
  }>(
    c,
    `SELECT id, subscriber_id, patient_name, rx_date, status, details_enc, image_key
     FROM prescriptions WHERE id = ? AND deleted_at IS NULL`,
    id,
  );
  if (!row) fail(404, 'السجل غير موجود');
  await batch(c, [auditStmt(c, 'view', 'prescription', id)]);
  const { details_enc, image_key, ...rest } = row;
  return c.json({
    ...rest,
    ...JSON.parse(await decryptText(c.env.DATA_KEY, details_enc)),
    image_url: image_key ? await signFileLink(c, image_key) : null,
  });
});

prescriptions.patch('/:id/status', async (c) => {
  const id = idParam(c.req.param('id'));
  const { status } = await readJson(c, z.object({ status: zStatus }));
  await batch(c, [
    stmt(c, 'UPDATE prescriptions SET status = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL', status, new Date().toISOString(), id),
    auditStmt(c, 'update_status', 'prescription', id, status),
  ]);
  return c.json({ ok: true });
});

prescriptions.delete('/:id', requireRole('admin'), async (c) => {
  const id = idParam(c.req.param('id'));
  await batch(c, [
    stmt(c, 'UPDATE prescriptions SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL', new Date().toISOString(), id),
    auditStmt(c, 'delete', 'prescription', id),
  ]);
  return c.json({ ok: true });
});

export const files = new Hono<AppEnv>();

files.get('/:token', requireRole('admin', 'health'), async (c) => {
  const [body, signature] = c.req.param('token').split('.');
  if (!body || !signature) fail(404, 'الملف غير موجود');
  if (!(await hmacVerify(c.env.JWT_SECRET, `file:${body}`, signature).catch(() => false))) fail(404, 'الملف غير موجود');
  const link = JSON.parse(new TextDecoder().decode(fromB64Url(body))) as { k: string; e: number; u: number };
  if (link.e < Date.now() / 1000 || link.u !== c.get('user').id) fail(403, 'انتهت صلاحية الرابط');

  const object = await c.env.FILES.get(link.k);
  if (!object) fail(404, 'الملف غير موجود');
  const plain = await decryptBytes(c.env.DATA_KEY, new Uint8Array(await object.arrayBuffer()));
  return c.body(plain, 200, {
    'content-type': object.customMetadata?.type ?? 'application/octet-stream',
    'cache-control': `private, max-age=${LINK_WINDOW}`,
    'x-content-type-options': 'nosniff',
  });
});

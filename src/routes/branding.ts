import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { requireRole } from '../lib/auth';
import { decryptBytes } from '../lib/crypto';
import { auditStmt, batch, fid, first, stmt } from '../lib/db';
import { fail, readJson } from '../lib/http';
import { putEncrypted } from './prescriptions';

// Each foundation's letterhead: its name, address, phones and the four images printed on its
// sheets. Everything is read and written for the signed-in foundation only.
export const branding = new Hono<AppEnv>();

const KINDS = ['logo', 'stamp', 'signature', 'signature2'] as const;
type Kind = (typeof KINDS)[number];
const COLUMN: Record<Kind, string> = { logo: 'logo_key', stamp: 'stamp_key', signature: 'signature_key', signature2: 'signature2_key' };
const MAX_IMAGE = 600 * 1024;

// Foundation 1 printed these before foundations existed; they stay its images until replaced.
const BUILT_IN: Record<number, Partial<Record<Kind, string>>> = {
  1: { logo: '/logo.jpg', stamp: '/stamp.png', signature: '/signature.png', signature2: '/signature-manager.png' },
};

interface Row {
  name: string;
  address: string | null;
  stamp_place: string | null;
  phones: string | null;
  accountant_name: string | null;
  manager_name: string | null;
  logo_key: string | null;
  stamp_key: string | null;
  signature_key: string | null;
  signature2_key: string | null;
}

const kindParam = (value: string): Kind => {
  if (!(KINDS as readonly string[]).includes(value)) fail(404, 'غير موجود');
  return value as Kind;
};

// PNG is accepted here (unlike photos): a stamp or signature needs its transparent background.
function imageType(bytes: Uint8Array): string | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  if (bytes[0] === 0x89 && ascii(1, 4) === 'PNG') return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  return null;
}

const loadRow = (c: Parameters<typeof fid>[0]) => first<Row>(
  c,
  `SELECT name, address, stamp_place, phones, accountant_name, manager_name, logo_key, stamp_key, signature_key, signature2_key
   FROM foundations WHERE id = ?`,
  fid(c),
);

// The letterhead with a link per image. A stored image's link carries its key's tail, so a new
// upload is a new address and the browser may keep each one for a long time.
branding.get('/', async (c) => {
  const row = await loadRow(c);
  if (!row) fail(404, 'المؤسسة غير موجودة');
  const images = Object.fromEntries(KINDS.map((kind) => {
    const key = row[COLUMN[kind] as keyof Row];
    if (key) return [kind, `/api/branding/image/${kind}?v=${key.slice(-12, -4)}`];
    return [kind, BUILT_IN[fid(c)]?.[kind] ?? null];
  }));
  let phones: string[] = [];
  try { phones = row.phones ? (JSON.parse(row.phones) as string[]) : []; } catch { /* stored by hand */ }
  return c.json({
    name: row.name, address: row.address, stamp_place: row.stamp_place, phones,
    accountant_name: row.accountant_name, manager_name: row.manager_name, ...images,
  });
});

branding.get('/image/:kind', async (c) => {
  const kind = kindParam(c.req.param('kind'));
  const row = await loadRow(c);
  const key = row?.[COLUMN[kind] as keyof Row];
  if (!key) fail(404, 'الصورة غير موجودة');
  const object = await c.env.FILES.get(key);
  if (!object) fail(404, 'الصورة غير موجودة');
  const plain = await decryptBytes(c.env.DATA_KEY, new Uint8Array(await object.arrayBuffer()));
  return c.body(plain, 200, {
    'content-type': object.customMetadata?.type ?? 'application/octet-stream',
    // Versioned address (?v=): safe to keep for a day on this device only.
    'cache-control': 'private, max-age=86400',
    'x-content-type-options': 'nosniff',
  });
});

// The foundation's manager edits its letterhead. The name is the system admin's to change.
branding.patch('/', requireRole('admin'), async (c) => {
  const body = await readJson(c, z.object({
    address: z.string().trim().max(160).nullable().optional(),
    stamp_place: z.string().trim().max(60).nullable().optional(),
    phones: z.array(z.string().trim().regex(/^\+?[\d\s-]{7,20}$/, 'رقم الهاتف غير صالح')).max(4).optional(),
    accountant_name: z.string().trim().max(80).nullable().optional(),
    manager_name: z.string().trim().max(80).nullable().optional(),
  }).strict());
  const set: string[] = [];
  const params: unknown[] = [];
  if (body.accountant_name !== undefined) { set.push('accountant_name = ?'); params.push(body.accountant_name || null); }
  if (body.manager_name !== undefined) { set.push('manager_name = ?'); params.push(body.manager_name || null); }
  if (body.address !== undefined) { set.push('address = ?'); params.push(body.address || null); }
  if (body.stamp_place !== undefined) { set.push('stamp_place = ?'); params.push(body.stamp_place || null); }
  if (body.phones !== undefined) { set.push('phones = ?'); params.push(JSON.stringify(body.phones)); }
  if (!set.length) fail(422, 'لا توجد تعديلات');
  await batch(c, [
    stmt(c, `UPDATE foundations SET ${set.join(', ')} WHERE id = ?`, ...params, fid(c)),
    auditStmt(c, 'update_letterhead', 'foundation', fid(c), Object.keys(body).join(',')),
  ]);
  return c.json({ ok: true });
});

branding.put('/image/:kind', requireRole('admin'), async (c) => {
  const kind = kindParam(c.req.param('kind'));
  const length = Number(c.req.header('content-length') ?? 0);
  if (length > MAX_IMAGE + 8 * 1024) fail(413, 'حجم الصورة أكبر من 600 كيلوبايت');
  const form = await c.req.formData().catch(() => fail(400, 'صيغة الطلب غير صحيحة'));
  const file = form.get('image');
  if (!file || typeof file === 'string') fail(422, 'الصورة مطلوبة');
  if (file.size > MAX_IMAGE) fail(413, 'حجم الصورة أكبر من 600 كيلوبايت');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const contentType = imageType(bytes);
  if (!contentType) fail(422, 'نوع الصورة غير مدعوم: PNG أو JPEG أو WebP');

  const previous = await loadRow(c);
  const key = `brand/${crypto.randomUUID()}.bin`;
  await putEncrypted(c, key, { bytes, contentType });
  try {
    await batch(c, [
      stmt(c, `UPDATE foundations SET ${COLUMN[kind]} = ? WHERE id = ?`, key, fid(c)),
      auditStmt(c, 'update_image', 'foundation', fid(c), kind),
    ]);
  } catch (error) {
    c.executionCtx.waitUntil(c.env.FILES.delete(key));
    throw error;
  }
  const old = previous?.[COLUMN[kind] as keyof Row];
  if (old) c.executionCtx.waitUntil(c.env.FILES.delete(old));
  return c.json({ ok: true });
});

// Back to no image (foundation 1: back to its built-in one).
branding.delete('/image/:kind', requireRole('admin'), async (c) => {
  const kind = kindParam(c.req.param('kind'));
  const previous = await loadRow(c);
  await batch(c, [
    stmt(c, `UPDATE foundations SET ${COLUMN[kind]} = NULL WHERE id = ?`, fid(c)),
    auditStmt(c, 'remove_image', 'foundation', fid(c), kind),
  ]);
  const old = previous?.[COLUMN[kind] as keyof Row];
  if (old) c.executionCtx.waitUntil(c.env.FILES.delete(old));
  return c.json({ ok: true });
});

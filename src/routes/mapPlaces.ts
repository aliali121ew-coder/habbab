import { Hono, type Context } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { all, auditInsertedStmt, auditStmt, batch, fid, first, stmt } from '../lib/db';
import { fail, idParam, readJson } from '../lib/http';

// Permanent named places pinned on the requests map (family homes, landmarks, mosques, clinics,
// distribution points). Admin additions are approved right away; delegate/staff additions wait
// for admin approval before showing to everyone.
export const mapPlaces = new Hono<AppEnv>();

type Ctx = Context<AppEnv>;

export type MapPlaceCategory = 'family' | 'landmark' | 'mosque' | 'health' | 'office';

interface MapPlaceRow {
  id: number;
  name: string;
  category: MapPlaceCategory;
  lat: number;
  lng: number;
  phone: string | null;
  note: string | null;
  status: 'pending' | 'approved';
  created_by: number;
  created_by_name: string | null;
  created_at: string;
  approved_at: string | null;
}

const shape = (r: MapPlaceRow) => ({
  id: r.id,
  name: r.name,
  category: r.category,
  lat: r.lat,
  lng: r.lng,
  phone: r.phone ?? '',
  note: r.note ?? '',
  status: r.status,
  createdBy: r.created_by,
  createdByName: r.created_by_name ?? '',
  createdAt: r.created_at,
  approvedAt: r.approved_at,
});

const zCreate = z.object({
  name: z.string().trim().min(2, 'أدخل اسم النقطة أو العائلة').max(120, 'الاسم طويل جداً'),
  category: z.enum(['family', 'landmark', 'mosque', 'health', 'office']).default('landmark'),
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
  phone: z.string().trim().max(32).optional().default(''),
  note: z.string().trim().max(300).optional().default(''),
});

async function load(c: Ctx, id: number) {
  const row = await first<MapPlaceRow>(
    c,
    `SELECT p.id, p.name, p.category, p.lat, p.lng, p.phone, p.note, p.status,
            p.created_by, u.full_name AS created_by_name, p.created_at, p.approved_at
     FROM map_places p
     LEFT JOIN users u ON u.id = p.created_by
     WHERE p.id = ? AND p.foundation_id = ? AND p.deleted_at IS NULL`,
    id,
    fid(c),
  );
  if (!row) fail(404, 'النقطة غير موجودة');
  return row;
}

mapPlaces.get('/', async (c) => {
  const user = c.get('user');
  const isAdmin = user.role === 'admin';
  const rows = isAdmin
    ? await all<MapPlaceRow>(
        c,
        `SELECT p.id, p.name, p.category, p.lat, p.lng, p.phone, p.note, p.status,
                p.created_by, u.full_name AS created_by_name, p.created_at, p.approved_at
         FROM map_places p
         LEFT JOIN users u ON u.id = p.created_by
         WHERE p.foundation_id = ? AND p.deleted_at IS NULL
         ORDER BY CASE p.status WHEN 'pending' THEN 0 ELSE 1 END, p.id DESC`,
        fid(c),
      )
    : await all<MapPlaceRow>(
        c,
        `SELECT p.id, p.name, p.category, p.lat, p.lng, p.phone, p.note, p.status,
                p.created_by, u.full_name AS created_by_name, p.created_at, p.approved_at
         FROM map_places p
         LEFT JOIN users u ON u.id = p.created_by
         WHERE p.foundation_id = ? AND p.deleted_at IS NULL
           AND (p.status = 'approved' OR p.created_by = ?)
         ORDER BY CASE p.status WHEN 'pending' THEN 0 ELSE 1 END, p.id DESC`,
        fid(c),
        user.id,
      );
  return c.json({ places: rows.map(shape) });
});

mapPlaces.post('/', async (c) => {
  const user = c.get('user');
  const body = await readJson(c, zCreate);
  const autoApprove = user.role === 'admin';
  const status = autoApprove ? 'approved' : 'pending';
  const approvedBy = autoApprove ? user.id : null;

  const insert = stmt(
    c,
    `INSERT INTO map_places (foundation_id, name, category, lat, lng, phone, note, status, created_by, approved_by, approved_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'approved' THEN datetime('now') ELSE NULL END)`,
    fid(c),
    body.name,
    body.category,
    body.lat,
    body.lng,
    body.phone || null,
    body.note || null,
    status,
    user.id,
    approvedBy,
    status,
  );
  const audit = auditInsertedStmt(c, 'map_place.create', 'map_place', `${body.name} (${body.category})`);
  const [res] = await batch(c, [insert, audit]);
  const id = Number(res.meta.last_row_id);
  const created = await load(c, id);
  return c.json({ place: shape(created) }, 201);
});

mapPlaces.post('/:id/approve', async (c) => {
  const user = c.get('user');
  if (user.role !== 'admin') fail(403, 'الاعتماد متاح للمدير العام فقط');
  const id = idParam(c.req.param('id'));
  const existing = await load(c, id);
  if (existing.status === 'approved') return c.json({ place: shape(existing) });

  await batch(c, [
    stmt(
      c,
      `UPDATE map_places SET status = 'approved', approved_by = ?, approved_at = datetime('now')
       WHERE id = ? AND foundation_id = ? AND deleted_at IS NULL`,
      user.id,
      id,
      fid(c),
    ),
    auditStmt(c, 'map_place.approve', 'map_place', id, existing.name),
  ]);
  const updated = await load(c, id);
  return c.json({ place: shape(updated) });
});

mapPlaces.delete('/:id', async (c) => {
  const user = c.get('user');
  const id = idParam(c.req.param('id'));
  const existing = await load(c, id);
  const canDelete = user.role === 'admin' || (existing.created_by === user.id && existing.status === 'pending');
  if (!canDelete) fail(403, 'ليست لديك صلاحية حذف هذه النقطة');

  await batch(c, [
    stmt(
      c,
      `UPDATE map_places SET deleted_at = datetime('now')
       WHERE id = ? AND foundation_id = ? AND deleted_at IS NULL`,
      id,
      fid(c),
    ),
    auditStmt(c, 'map_place.delete', 'map_place', id, existing.name),
  ]);
  return c.json({ ok: true });
});

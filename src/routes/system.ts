import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { requireSystem, startSession } from '../lib/auth';
import { hashPassword } from '../lib/crypto';
import { all, batch, first, stmt } from '../lib/db';
import { FEATURES, parseFeatures } from '../lib/features';
import { fail, idParam, readJson } from '../lib/http';
import { zPassword } from './auth';

// مدير النظام: the foundations themselves. Everything here is across foundations on purpose,
// so it is open to the system admin only; what happens inside a foundation still goes through
// the ordinary routes after "entering" it, and is scoped and audited there like any user's work.
export const system = new Hono<AppEnv>();
system.use('*', requireSystem);

const zFeatures = z.array(z.enum(FEATURES)).max(FEATURES.length);
const zName = z.string({ error: 'اسم المؤسسة مطلوب' }).trim().min(3, 'اسم المؤسسة قصير جداً').max(120, 'اسم المؤسسة طويل جداً');

// Every foundation with its size, newest last. A few hundred rows at most.
system.get('/foundations', async (c) => {
  const rows = await all<{ id: number; name: string; status: string; features: string | null; created_at: string; users: number; subscribers: number }>(
    c,
    `SELECT f.id, f.name, f.status, f.features, f.created_at,
       (SELECT COUNT(*) FROM users u WHERE u.foundation_id = f.id AND u.active = 1) AS users,
       COALESCE((SELECT value FROM stats_totals s WHERE s.foundation_id = f.id AND s.key = 'subs_alive'), 0) AS subscribers
     FROM foundations f ORDER BY f.id`,
  );
  const session = c.get('user');
  return c.json({
    items: rows.map(({ features, ...row }) => ({ ...row, features: parseFeatures(features) })),
    current: session.foundation,
  });
});

// A new foundation and its first manager, who must change the password at first sign-in.
system.post('/foundations', async (c) => {
  const body = await readJson(c, z.object({
    name: zName,
    features: zFeatures,
    admin_full_name: z.string({ error: 'اسم المدير مطلوب' }).trim().min(3, 'اسم المدير قصير جداً').max(120),
    admin_username: z.string({ error: 'اسم المستخدم مطلوب' }).trim().regex(/^[a-zA-Z0-9._-]{3,32}$/, 'اسم المستخدم: 3 أحرف لاتينية أو أرقام على الأقل'),
    admin_password: zPassword,
  }));
  if (await first(c, 'SELECT id FROM foundations WHERE name = ?', body.name)) fail(409, 'توجد مؤسسة بهذا الاسم');
  // scope-ok: usernames are unique across the whole app (sign-in has no foundation field)
  if (await first(c, 'SELECT id FROM users WHERE username = ?', body.admin_username)) fail(409, 'اسم المستخدم مستعمل، اختر غيره');

  const [created] = await batch(c, [
    stmt(c, 'INSERT INTO foundations (name, features) VALUES (?, ?) RETURNING id', body.name, JSON.stringify(body.features)),
  ]);
  const id = (created.results[0] as { id: number }).id;
  await batch(c, [
    stmt(c, `INSERT INTO users (foundation_id, username, full_name, role, password_hash, must_change_password)
             VALUES (?, ?, ?, 'admin', ?, 1)`,
      id, body.admin_username, body.admin_full_name, await hashPassword(body.admin_password)),
    stmt(c, `INSERT INTO audit_log (foundation_id, user_id, action, entity, entity_id, detail)
             VALUES (?, ?, 'create_foundation', 'foundation', ?, ?)`, id, c.get('user').id, id, body.name),
  ]);
  return c.json({ id }, 201);
});

system.patch('/foundations/:id', async (c) => {
  const id = idParam(c.req.param('id'));
  const body = await readJson(c, z.object({
    name: zName.optional(),
    status: z.enum(['active', 'suspended']).optional(),
    features: zFeatures.optional(),
  }).strict());
  const current = await first<{ id: number }>(c, 'SELECT id FROM foundations WHERE id = ?', id);
  if (!current) fail(404, 'المؤسسة غير موجودة');
  // The system admin's own foundation stays open, so its staff are never locked out by mistake.
  if (body.status === 'suspended') {
    const home = await first<{ foundation_id: number }>(c, 'SELECT foundation_id FROM users WHERE id = ?', c.get('user').id);
    if (home?.foundation_id === id) fail(422, 'لا يمكن إيقاف مؤسستك');
  }
  if (body.name !== undefined && await first(c, 'SELECT id FROM foundations WHERE name = ? AND id <> ?', body.name, id)) {
    fail(409, 'توجد مؤسسة بهذا الاسم');
  }

  const set: string[] = [];
  const params: unknown[] = [];
  if (body.name !== undefined) { set.push('name = ?'); params.push(body.name); }
  if (body.status !== undefined) { set.push('status = ?'); params.push(body.status); }
  if (body.features !== undefined) { set.push('features = ?'); params.push(JSON.stringify(body.features)); }
  if (!set.length) fail(422, 'لا توجد تعديلات');
  await batch(c, [
    stmt(c, `UPDATE foundations SET ${set.join(', ')} WHERE id = ?`, ...params, id),
    stmt(c, `INSERT INTO audit_log (foundation_id, user_id, action, entity, entity_id, detail)
             VALUES (?, ?, 'update_foundation', 'foundation', ?, ?)`, id, c.get('user').id, id, JSON.stringify(body)),
  ]);
  return c.json({ ok: true });
});

// Work inside another foundation (or come back to one's own). The session is reissued for it;
// every entry is written to that foundation's own audit log, under the system admin's name.
system.post('/enter', async (c) => {
  const { foundation_id: target } = await readJson(c, z.object({ foundation_id: z.number().int().positive() }));
  const [place, me] = await Promise.all([
    first<{ id: number; features: string | null }>(c, 'SELECT id, features FROM foundations WHERE id = ?', target),
    first<{ id: number; role: 'admin'; foundation_id: number; is_system: number; token_version: number; must_change_password: number }>(
      c, 'SELECT id, role, foundation_id, is_system, token_version, must_change_password FROM users WHERE id = ?', c.get('user').id,
    ),
  ]);
  if (!place) fail(404, 'المؤسسة غير موجودة');
  if (!me?.is_system) fail(403, 'هذه الصفحة لمدير النظام فقط');
  await batch(c, [
    stmt(c, `INSERT INTO audit_log (foundation_id, user_id, action, entity, entity_id)
             VALUES (?, ?, 'system_enter', 'foundation', ?)`, target, me.id, target),
  ]);
  await startSession(c, { ...me, foundation_id: target, features: parseFeatures(place.features) });
  return c.json({ ok: true });
});

import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv, Role } from '../env';
import { endSession, requireAuth, startSession } from '../lib/auth';
import { hashPassword, verifyPassword } from '../lib/crypto';
import { auditStmt, batch, first, stmt } from '../lib/db';
import { parseFeatures } from '../lib/features';
import { fail, readJson } from '../lib/http';

const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;
// Verified when the username is unknown, so response time does not reveal which usernames exist.
const DUMMY_HASH = 'pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

export const zPassword = z.string().min(10, 'كلمة المرور يجب ألا تقل عن 10 أحرف').max(128, 'كلمة المرور طويلة جداً');

interface UserRow {
  id: number;
  full_name: string;
  role: Role;
  foundation_id: number;
  foundation_status: string;
  foundation_features: string | null;
  is_system: number;
  password_hash: string;
  token_version: number;
  active: number;
  must_change_password: number;
  failed_logins: number;
  locked_until: number | null;
}

export const auth = new Hono<AppEnv>();

auth.post('/login', async (c) => {
  const ip = c.req.header('cf-connecting-ip') ?? 'local';
  const limiter = await c.env.LOGIN_LIMITER?.limit({ key: ip });
  if (limiter && !limiter.success) fail(429, 'محاولات كثيرة، حاول بعد دقيقة');

  const { username, password, remember } = await readJson(c, z.object({
    username: z.string().trim().min(1, 'اسم المستخدم مطلوب').max(64),
    password: z.string().min(1, 'كلمة المرور مطلوبة').max(128),
    remember: z.boolean().optional(),
  }));

  const user = await first<UserRow>(
    c,
    `SELECT u.id, u.full_name, u.role, u.foundation_id, f.status AS foundation_status, f.features AS foundation_features,
       u.is_system, u.password_hash, u.token_version, u.active, u.must_change_password, u.failed_logins, u.locked_until
     FROM users u JOIN foundations f ON f.id = u.foundation_id WHERE u.username = ?`,
    username,
  );
  const ok = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
  const invalid = 'اسم المستخدم أو كلمة المرور غير صحيحة';
  if (!user || !user.active) fail(401, invalid);
  if (user.foundation_status !== 'active' && !user.is_system) fail(403, 'حساب المؤسسة موقوف، راجع مدير النظام');
  if (user.locked_until && user.locked_until > Date.now()) fail(429, 'الحساب مقفل مؤقتاً، حاول لاحقاً');

  if (!ok) {
    const failures = user.failed_logins + 1;
    const lock = failures >= MAX_FAILURES ? Date.now() + LOCK_MINUTES * 60_000 : null;
    await batch(c, [
      // scope-ok: the row just found by its unique username
      stmt(c, 'UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?', lock ? 0 : failures, lock, user.id),
      stmt(c, "INSERT INTO audit_log (foundation_id, user_id, action, entity, entity_id) VALUES (?, ?, 'login_failed', 'user', ?)", user.foundation_id, user.id, user.id),
    ]);
    fail(401, invalid);
  }

  await batch(c, [
    // scope-ok: the row just found by its unique username
    stmt(c, 'UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?', user.id),
    stmt(c, "INSERT INTO audit_log (foundation_id, user_id, action, entity, entity_id) VALUES (?, ?, 'login', 'user', ?)", user.foundation_id, user.id, user.id),
  ]);
  await startSession(c, { ...user, features: parseFeatures(user.foundation_features) }, { remember });
  return c.json({ id: user.id, full_name: user.full_name, role: user.role, must_change_password: user.must_change_password === 1 });
});

auth.post('/logout', (c) => {
  endSession(c);
  return c.json({ ok: true });
});

// The foundation shown is the one being worked in (for a system admin, the one they entered),
// with its features read fresh, so the menu follows a change at once.
auth.get('/me', requireAuth, async (c) => {
  const session = c.get('user');
  const [row, place] = await Promise.all([
    first<{ id: number; full_name: string; role: Role; must_change_password: number; foundation_id: number }>(
      c, 'SELECT id, full_name, role, must_change_password, foundation_id FROM users WHERE id = ?', session.id,
    ),
    first<{ name: string; status: string; features: string | null }>(
      c, 'SELECT name, status, features FROM foundations WHERE id = ?', session.foundation,
    ),
  ]);
  if (!row || !place) fail(401, 'انتهت الجلسة، يرجى تسجيل الدخول');
  return c.json({
    id: row.id,
    full_name: row.full_name,
    role: row.role,
    must_change_password: row.must_change_password === 1,
    currency: c.env.CURRENCY,
    foundation_id: session.foundation,
    foundation_name: place.name,
    foundation_status: place.status,
    home_foundation_id: row.foundation_id,
    features: parseFeatures(place.features),
    is_system: session.system,
  });
});

auth.post('/change-password', requireAuth, async (c) => {
  const { current, next } = await readJson(c, z.object({ current: z.string().max(128), next: zPassword }));
  const user = await first<UserRow>(
    c,
    'SELECT id, role, foundation_id, is_system, password_hash, token_version FROM users WHERE id = ?',
    c.get('user').id,
  );
  if (!user || !(await verifyPassword(current, user.password_hash))) fail(422, 'كلمة المرور الحالية غير صحيحة');
  if (current === next) fail(422, 'اختر كلمة مرور مختلفة عن الحالية');

  await batch(c, [
    // scope-ok: the signed-in user's own row
    stmt(c, 'UPDATE users SET password_hash = ?, token_version = token_version + 1, must_change_password = 0 WHERE id = ?',
      await hashPassword(next), user.id),
    auditStmt(c, 'change_password', 'user', user.id),
  ]);
  const session = c.get('user');
  await startSession(c, {
    ...user, foundation_id: session.foundation, features: session.features, token_version: user.token_version + 1, must_change_password: 0,
  });
  return c.json({ ok: true });
});

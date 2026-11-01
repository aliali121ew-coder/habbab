import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv, Role } from '../env';
import { endSession, requireAuth, startSession } from '../lib/auth';
import { hashPassword, verifyPassword } from '../lib/crypto';
import { auditStmt, batch, first, stmt } from '../lib/db';
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

  const { username, password } = await readJson(c, z.object({
    username: z.string().trim().min(1, 'اسم المستخدم مطلوب').max(64),
    password: z.string().min(1, 'كلمة المرور مطلوبة').max(128),
  }));

  const user = await first<UserRow>(
    c,
    `SELECT id, full_name, role, password_hash, token_version, active, must_change_password, failed_logins, locked_until
     FROM users WHERE username = ?`,
    username,
  );
  const ok = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
  const invalid = 'اسم المستخدم أو كلمة المرور غير صحيحة';
  if (!user || !user.active) fail(401, invalid);
  if (user.locked_until && user.locked_until > Date.now()) fail(429, 'الحساب مقفل مؤقتاً، حاول لاحقاً');

  if (!ok) {
    const failures = user.failed_logins + 1;
    const lock = failures >= MAX_FAILURES ? Date.now() + LOCK_MINUTES * 60_000 : null;
    await batch(c, [
      stmt(c, 'UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?', lock ? 0 : failures, lock, user.id),
      stmt(c, "INSERT INTO audit_log (user_id, action, entity, entity_id) VALUES (?, 'login_failed', 'user', ?)", user.id, user.id),
    ]);
    fail(401, invalid);
  }

  await batch(c, [
    stmt(c, 'UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?', user.id),
    stmt(c, "INSERT INTO audit_log (user_id, action, entity, entity_id) VALUES (?, 'login', 'user', ?)", user.id, user.id),
  ]);
  await startSession(c, user);
  return c.json({ id: user.id, full_name: user.full_name, role: user.role, must_change_password: user.must_change_password === 1 });
});

auth.post('/logout', (c) => {
  endSession(c);
  return c.json({ ok: true });
});

auth.get('/me', requireAuth, async (c) => {
  const row = await first<{ id: number; full_name: string; role: Role; must_change_password: number }>(
    c,
    'SELECT id, full_name, role, must_change_password FROM users WHERE id = ?',
    c.get('user').id,
  );
  if (!row) fail(401, 'انتهت الجلسة، يرجى تسجيل الدخول');
  return c.json({ ...row, must_change_password: row.must_change_password === 1, currency: c.env.CURRENCY });
});

auth.post('/change-password', requireAuth, async (c) => {
  const { current, next } = await readJson(c, z.object({ current: z.string().max(128), next: zPassword }));
  const user = await first<UserRow>(
    c,
    'SELECT id, role, password_hash, token_version FROM users WHERE id = ?',
    c.get('user').id,
  );
  if (!user || !(await verifyPassword(current, user.password_hash))) fail(422, 'كلمة المرور الحالية غير صحيحة');
  if (current === next) fail(422, 'اختر كلمة مرور مختلفة عن الحالية');

  await batch(c, [
    stmt(c, 'UPDATE users SET password_hash = ?, token_version = token_version + 1, must_change_password = 0 WHERE id = ?',
      await hashPassword(next), user.id),
    auditStmt(c, 'change_password', 'user', user.id),
  ]);
  await startSession(c, { ...user, token_version: user.token_version + 1, must_change_password: 0 });
  return c.json({ ok: true });
});

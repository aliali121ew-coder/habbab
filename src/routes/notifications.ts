import { Hono, type Context } from 'hono';
import type { AppEnv } from '../env';
import { all, fid, first, stmt } from '../lib/db';

// الإشعارات: short messages to one user of the foundation (a request given to a delegate, help
// delivered for a request of theirs). Each user reads and clears only their own.
export const notifications = new Hono<AppEnv>();

type Ctx = Context<AppEnv>;

/** A statement that leaves a message for one user of the signed-in user's foundation. */
export function notifyStmt(c: Ctx, userId: number, kind: string, title: string, body?: string, link?: string) {
  return stmt(c, 'INSERT INTO notifications (foundation_id, user_id, kind, title, body, link) VALUES (?, ?, ?, ?, ?, ?)',
    fid(c), userId, kind, title, body ?? null, link ?? null);
}

interface Row { id: number; kind: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string }

notifications.get('/', async (c) => {
  const user = c.get('user');
  const [rows, unread] = await Promise.all([
    all<Row>(c, `SELECT id, kind, title, body, link, read_at, created_at FROM notifications
      WHERE foundation_id = ? AND user_id = ? ORDER BY id DESC LIMIT 50`, fid(c), user.id),
    first<{ n: number }>(c, 'SELECT COUNT(*) AS n FROM notifications WHERE foundation_id = ? AND user_id = ? AND read_at IS NULL', fid(c), user.id),
  ]);
  return c.json({
    unread: unread?.n ?? 0,
    items: rows.map((r) => ({ id: r.id, kind: r.kind, title: r.title, body: r.body ?? '', link: r.link, read: r.read_at !== null, createdAt: r.created_at })),
  });
});

// Marks all of the user's messages as read (opening the bell).
notifications.post('/read', async (c) => {
  await stmt(c, 'UPDATE notifications SET read_at = ? WHERE foundation_id = ? AND user_id = ? AND read_at IS NULL',
    new Date().toISOString(), fid(c), c.get('user').id).run();
  return c.json({ ok: true });
});

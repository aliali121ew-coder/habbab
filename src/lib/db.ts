import type { Context } from 'hono';
import type { AppEnv } from '../env';

export const PAGE_SIZE = 30;

type Ctx = Context<AppEnv>;

function track(c: Ctx, meta: { rows_read?: number; rows_written?: number }) {
  c.set('d1Read', (c.get('d1Read') ?? 0) + (meta.rows_read ?? 0));
  c.set('d1Written', (c.get('d1Written') ?? 0) + (meta.rows_written ?? 0));
}

export function stmt(c: Ctx, sql: string, ...params: unknown[]): D1PreparedStatement {
  return c.env.DB.prepare(sql).bind(...params);
}

export async function all<T = Record<string, unknown>>(c: Ctx, sql: string, ...params: unknown[]): Promise<T[]> {
  const result = await stmt(c, sql, ...params).all<T>();
  track(c, result.meta);
  return result.results;
}

export async function first<T = Record<string, unknown>>(c: Ctx, sql: string, ...params: unknown[]): Promise<T | null> {
  const rows = await all<T>(c, sql, ...params);
  return rows[0] ?? null;
}

export async function batch(c: Ctx, statements: D1PreparedStatement[]) {
  const results = await c.env.DB.batch(statements);
  for (const result of results) track(c, result.meta);
  return results;
}

// The signed-in user's foundation. Every query on foundation data binds this; a foundation id
// sent in a request is never used for scoping.
export const fid = (c: Ctx): number => c.get('user').foundation;

export function auditStmt(c: Ctx, action: string, entity: string, entityId: number | null, detail?: string) {
  return stmt(
    c,
    'INSERT INTO audit_log (foundation_id, user_id, action, entity, entity_id, detail) VALUES (?, ?, ?, ?, ?, ?)',
    c.get('user')?.foundation ?? 1, c.get('user')?.id ?? null, action, entity, entityId, detail ?? null,
  );
}

// For a row inserted by the previous statement in the same batch.
export function auditInsertedStmt(c: Ctx, action: string, entity: string, detail?: string) {
  return stmt(
    c,
    'INSERT INTO audit_log (foundation_id, user_id, action, entity, entity_id, detail) VALUES (?, ?, ?, ?, last_insert_rowid(), ?)',
    fid(c), c.get('user').id, action, entity, detail ?? null,
  );
}

/** A field whose value is never written to the log (only that it changed). */
export const SECRET = '••';

// What the activity log shows for an entry: the record's name, and for an edit each changed
// field as [before, after]. Stored as JSON in audit_log.detail; older entries hold plain text.
export function auditDetail(label: string | null | undefined, changes?: Record<string, [unknown, unknown]>, note?: string): string {
  return JSON.stringify({ label: label ?? undefined, changes: changes && Object.keys(changes).length ? changes : undefined, note });
}

/** Each field of `next` that differs from `current`, as [before, after]; secret fields as «••». */
export function diff<T extends Record<string, unknown>>(current: T, next: Partial<T>, secret: string[] = []): Record<string, [unknown, unknown]> {
  const out: Record<string, [unknown, unknown]> = {};
  for (const [key, value] of Object.entries(next)) {
    if (value === undefined || value === current[key]) continue;
    out[key] = secret.includes(key) ? [SECRET, SECRET] : [current[key] ?? null, value];
  }
  return out;
}

export function nextCursor<T extends { id: number }>(rows: T[]): number | null {
  return rows.length === PAGE_SIZE ? rows[rows.length - 1].id : null;
}

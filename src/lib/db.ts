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

export function auditStmt(c: Ctx, action: string, entity: string, entityId: number | null, detail?: string) {
  return stmt(
    c,
    'INSERT INTO audit_log (user_id, action, entity, entity_id, detail) VALUES (?, ?, ?, ?, ?)',
    c.get('user')?.id ?? null, action, entity, entityId, detail ?? null,
  );
}

// For a row inserted by the previous statement in the same batch.
export function auditInsertedStmt(c: Ctx, action: string, entity: string) {
  return stmt(
    c,
    'INSERT INTO audit_log (user_id, action, entity, entity_id) VALUES (?, ?, ?, last_insert_rowid())',
    c.get('user').id, action, entity,
  );
}

export function nextCursor<T extends { id: number }>(rows: T[]): number | null {
  return rows.length === PAGE_SIZE ? rows[rows.length - 1].id : null;
}

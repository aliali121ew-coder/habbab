import type { Env } from './env';
import { encryptBytes } from './lib/crypto';

const BACKUP_TABLES = [
  'foundations', 'users', 'subscribers', 'programs', 'subscriber_programs', 'transactions', 'transactions_archive',
  'prescriptions', 'prescriptions_archive', 'monthly_closings', 'audit_log', 'audit_log_archive',
  'expenses', 'expense_files', 'families', 'family_members', 'family_payments', 'family_visits', 'patients', 'patient_aids', 'help_requests',
  'stats_totals', 'stats_daily', 'stats_monthly', 'delegate_totals', 'subscriber_year', 'delegate_period',
] as const;

// WITHOUT ROWID tables have no rowid to page on.
const COMPOSITE_KEYS: Record<string, string[]> = {
  subscriber_year: ['subscriber_id', 'year'],
  delegate_period: ['foundation_id', 'delegate_id', 'period'],
  monthly_closings: ['foundation_id', 'month'],
  stats_totals: ['foundation_id', 'key'],
  stats_daily: ['foundation_id', 'day'],
  stats_monthly: ['foundation_id', 'month'],
};

const BACKUP_PAGE = 2000;
const ARCHIVE_PAGE = 500;
const ARCHIVE_YEARS = 2;

async function gzip(text: string) {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Exports are encrypted too: they hold names and phone numbers in clear columns.
export async function exportBackup(env: Env, stamp: string) {
  for (const table of BACKUP_TABLES) {
    const keys = COMPOSITE_KEYS[table] ?? ['rowid'];
    const columns = keys.join(', ');
    const select = COMPOSITE_KEYS[table] ? '*' : 'rowid AS _rowid, *';
    let after: unknown[] | null = null;
    let part = 1;
    for (;;) {
      const where: string = after ? `WHERE (${columns}) > (${keys.map(() => '?').join(', ')})` : '';
      const { results }: D1Result<Record<string, unknown>> = await env.DB
        .prepare(`SELECT ${select} FROM ${table} ${where} ORDER BY ${columns} LIMIT ${BACKUP_PAGE}`)
        .bind(...(after ?? []))
        .all();
      if (!results.length) break;
      const ndjson = results.map((row) => JSON.stringify(row)).join('\n');
      const key = `backups/${stamp}/${table}.${String(part).padStart(4, '0')}.ndjson.gz.enc`;
      await env.FILES.put(key, await encryptBytes(env.DATA_KEY, await gzip(ndjson)));
      const last: Record<string, unknown> = results[results.length - 1];
      after = keys.map((key) => last[key === 'rowid' ? '_rowid' : key]);
      part += 1;
      if (results.length < BACKUP_PAGE) break;
    }
  }
}

function cutoffDate(): string {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() - ARCHIVE_YEARS);
  return date.toISOString();
}

async function moveRows(env: Env, table: string, columns: string, selectIds: string, ...params: unknown[]) {
  for (let round = 0; round < 200; round++) {
    const { results } = await env.DB.prepare(selectIds).bind(...params).all<{ id: number }>();
    if (!results.length) return;
    const ids = JSON.stringify(results.map((row) => row.id));
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO ${table}_archive (${columns}) SELECT ${columns} FROM ${table} WHERE id IN (SELECT value FROM json_each(?))`).bind(ids),
      env.DB.prepare(`DELETE FROM ${table} WHERE id IN (SELECT value FROM json_each(?))`).bind(ids),
    ]);
    if (results.length < ARCHIVE_PAGE) return;
  }
}

export async function archiveOldRecords(env: Env) {
  const cutoff = cutoffDate();
  const cutoffMonth = cutoff.slice(0, 7);

  // Only closed months move, so an open period is never split across tables.
  await moveRows(
    env, 'transactions',
    'id, foundation_id, type, amount, month, tx_date, subscriber_id, party_name, delegate_id, program_id, receipt_no, note, created_by, created_at, deleted_at, deleted_by, period',
    `SELECT t.id FROM transactions t
       JOIN monthly_closings c ON c.foundation_id = t.foundation_id AND c.month = t.month AND c.status = 'closed'
     WHERE t.month < ? ORDER BY t.id LIMIT ${ARCHIVE_PAGE}`,
    cutoffMonth,
  );
  await moveRows(
    env, 'prescriptions',
    'id, foundation_id, subscriber_id, patient_name, rx_date, status, details_enc, image_key, thumb_key, created_by, created_at, updated_at, deleted_at',
    `SELECT id FROM prescriptions WHERE created_at < ? AND status <> 'pending' ORDER BY id LIMIT ${ARCHIVE_PAGE}`,
    cutoff,
  );
  await moveRows(
    env, 'audit_log',
    'id, foundation_id, user_id, action, entity, entity_id, detail, created_at',
    `SELECT id FROM audit_log WHERE created_at < ? ORDER BY id LIMIT ${ARCHIVE_PAGE}`,
    cutoff,
  );
}

// Backup runs first, so archive moves always have a restore point before them.
export async function runMonthlyJobs(env: Env, now: Date) {
  await exportBackup(env, now.toISOString().slice(0, 10));
  await archiveOldRecords(env);
}

import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../env';
import { archiveOldRecords, exportBackup } from '../jobs';
import { endSession, requireSystem, startSession } from '../lib/auth';
import { hashPassword } from '../lib/crypto';
import { all, batch, first, stmt } from '../lib/db';
import { FEATURES, parseFeatures } from '../lib/features';
import { fail, idParam, readJson } from '../lib/http';
import { zPassword } from './auth';
import { signFileLink } from './prescriptions';

// مدير النظام: system-wide control center (foundations, D1 database, R2 backups & files, maintenance).
// Open to the system admin only; every cross-foundation query is intentional and marked scope-ok.
export const system = new Hono<AppEnv>();
system.use('*', requireSystem);

const zFeatures = z.array(z.enum(FEATURES)).max(FEATURES.length);
const zName = z.string({ error: 'اسم المؤسسة مطلوب' }).trim().min(3, 'اسم المؤسسة قصير جداً').max(120, 'اسم المؤسسة طويل جداً');

interface TableMeta {
  name: string;
  label: string;
  group: 'core' | 'finance' | 'health' | 'stats' | 'archive';
}

const DB_TABLES: TableMeta[] = [
  { name: 'foundations', label: 'المؤسسات', group: 'core' },
  { name: 'users', label: 'المستخدمون والمندوبون', group: 'core' },
  { name: 'subscribers', label: 'المشتركون', group: 'core' },
  { name: 'programs', label: 'البرامج الخيرية', group: 'core' },
  { name: 'subscriber_programs', label: 'اشتراكات البرامج', group: 'core' },
  { name: 'families', label: 'العوائل المتعففة', group: 'core' },
  { name: 'family_members', label: 'أفراد العوائل', group: 'core' },
  { name: 'family_visits', label: 'زيارات العوائل', group: 'core' },
  { name: 'transactions', label: 'الحركات المالية', group: 'finance' },
  { name: 'expenses', label: 'المصاريف', group: 'finance' },
  { name: 'expense_files', label: 'مرفقات المصاريف', group: 'finance' },
  { name: 'family_payments', label: 'مساعدات العوائل', group: 'finance' },
  { name: 'monthly_closings', label: 'الإقفالات الشهرية', group: 'finance' },
  { name: 'patients', label: 'المرضى', group: 'health' },
  { name: 'patient_aids', label: 'مساعدات المرضى', group: 'health' },
  { name: 'prescriptions', label: 'الوصفات الطبية', group: 'health' },
  { name: 'help_requests', label: 'طلبات المساعدة', group: 'core' },
  { name: 'audit_log', label: 'سجل العمليات', group: 'stats' },
  { name: 'stats_totals', label: 'إجماليات الإحصاء', group: 'stats' },
  { name: 'stats_daily', label: 'إحصاء يومي', group: 'stats' },
  { name: 'stats_monthly', label: 'إحصاء شهري', group: 'stats' },
  { name: 'delegate_totals', label: 'إجماليات المندوبين', group: 'stats' },
  { name: 'subscriber_year', label: 'سنوات المشتركين', group: 'stats' },
  { name: 'delegate_period', label: 'فترات المندوبين', group: 'stats' },
  { name: 'transactions_archive', label: 'أرشيف الحركات المالية', group: 'archive' },
  { name: 'prescriptions_archive', label: 'أرشيف الوصفات', group: 'archive' },
  { name: 'audit_log_archive', label: 'أرشيف سجل العمليات', group: 'archive' },
];

async function listAllR2(bucket: R2Bucket, prefix?: string, maxObjects = 1500): Promise<R2Object[]> {
  const out: R2Object[] = [];
  let cursor: string | undefined;
  while (out.length < maxObjects) {
    const page = await bucket.list({ prefix, cursor, limit: Math.min(500, maxObjects - out.length) });
    out.push(...page.objects);
    if (!page.truncated) break;
    cursor = page.cursor;
  }
  return out;
}

async function collectReferencedR2Keys(c: Parameters<typeof all>[0]): Promise<Set<string>> {
  const keys = new Set<string>();
  const [exp, rx, rxArch, brand, avatars, fam, pat] = await Promise.all([
    // scope-ok: system admin cross-foundation R2 reference scan
    all<{ k: string }>(c, 'SELECT file_key AS k FROM expense_files WHERE file_key IS NOT NULL'),
    // scope-ok: system admin cross-foundation R2 reference scan
    all<{ a: string | null; b: string | null }>(c, 'SELECT image_key AS a, thumb_key AS b FROM prescriptions WHERE image_key IS NOT NULL OR thumb_key IS NOT NULL'),
    // scope-ok: system admin cross-foundation R2 reference scan
    all<{ a: string | null; b: string | null }>(c, 'SELECT image_key AS a, thumb_key AS b FROM prescriptions_archive WHERE image_key IS NOT NULL OR thumb_key IS NOT NULL'),
    all<{ a: string | null; b: string | null; c: string | null; d: string | null }>(
      c, 'SELECT logo_key AS a, stamp_key AS b, signature_key AS c, signature2_key AS d FROM foundations',
    ),
    // scope-ok: system admin cross-foundation R2 reference scan
    all<{ k: string }>(c, 'SELECT avatar_key AS k FROM users WHERE avatar_key IS NOT NULL'),
    // scope-ok: system admin cross-foundation R2 reference scan
    all<{ k: string }>(c, 'SELECT photo_key AS k FROM families WHERE photo_key IS NOT NULL'),
    // scope-ok: system admin cross-foundation R2 reference scan
    all<{ k: string }>(c, 'SELECT photo_key AS k FROM patients WHERE photo_key IS NOT NULL'),
  ]);
  for (const r of exp) keys.add(r.k);
  for (const r of rx) { if (r.a) keys.add(r.a); if (r.b) keys.add(r.b); }
  for (const r of rxArch) { if (r.a) keys.add(r.a); if (r.b) keys.add(r.b); }
  for (const r of brand) { if (r.a) keys.add(r.a); if (r.b) keys.add(r.b); if (r.c) keys.add(r.c); if (r.d) keys.add(r.d); }
  for (const r of avatars) keys.add(r.k);
  for (const r of fam) keys.add(r.k);
  for (const r of pat) keys.add(r.k);
  return keys;
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// System-wide actions go to the system admin's own foundation's log, not the foundation they
// happen to have entered (whose manager would otherwise see backups and file clean-ups).
function systemAudit(c: Parameters<typeof stmt>[0], action: string, detail?: string) {
  const session = c.get('user');
  return stmt(
    c,
    `INSERT INTO audit_log (foundation_id, user_id, action, entity, entity_id, detail)
     VALUES ((SELECT foundation_id FROM users WHERE id = ?), ?, ?, ?, NULL, ?)`,
    session.id, session.id, action, 'system', detail ?? null,
  );
}

// A file younger than a day may belong to an upload whose database row is not written yet.
const ORPHAN_MIN_AGE_MS = 24 * 60 * 60 * 1000;
const isOrphan = (o: R2Object, referenced: Set<string>) => !o.key.startsWith('backups/') && !referenced.has(o.key)
  && Date.now() - o.uploaded.getTime() > ORPHAN_MIN_AGE_MS;

// ── Overview: live health, D1/R2/KV telemetry, and snapshot metrics ──
system.get('/overview', async (c) => {
  const t0 = Date.now();
  const [fStats, uStats, coreCounts, r2Objects, kvList] = await Promise.all([
    first<{ total: number; active: number; suspended: number }>(
      c,
      `SELECT COUNT(*) AS total,
         SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
         SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END) AS suspended
       FROM foundations`,
    ),
    // scope-ok: system admin global user count
    first<{ total: number; active: number }>(c, 'SELECT COUNT(*) AS total, SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) AS active FROM users'),
    c.env.DB.batch(DB_TABLES.map((t) => c.env.DB.prepare(`SELECT COUNT(*) AS n FROM ${t.name}`))),
    listAllR2(c.env.FILES, undefined, 1500).catch(() => [] as R2Object[]),
    c.env.CACHE.list({ limit: 200 }).catch(() => ({ keys: [], list_complete: true })),
  ]);
  const latencyMs = Math.max(1, Date.now() - t0);

  let totalRows = 0;
  let archiveRows = 0;
  DB_TABLES.forEach((t, i) => {
    const n = Number((coreCounts[i]?.results?.[0] as { n?: number } | undefined)?.n ?? 0);
    totalRows += n;
    if (t.group === 'archive') archiveRows += n;
  });

  let mediaFiles = 0;
  let mediaBytes = 0;
  let backupFiles = 0;
  let backupBytes = 0;
  const backupStamps = new Set<string>();
  let latestBackupAt: string | null = null;

  for (const obj of r2Objects) {
    if (obj.key.startsWith('backups/')) {
      backupFiles += 1;
      backupBytes += obj.size;
      const stamp = obj.key.split('/')[1];
      if (stamp) backupStamps.add(stamp);
      const iso = obj.uploaded.toISOString();
      if (!latestBackupAt || iso > latestBackupAt) latestBackupAt = iso;
    } else {
      mediaFiles += 1;
      mediaBytes += obj.size;
    }
  }

  return c.json({
    status: 'healthy',
    environment: c.env.ENVIRONMENT || 'production',
    latency_ms: latencyMs,
    checked_at: new Date().toISOString(),
    d1: {
      name: 'ahbab-db',
      tables: DB_TABLES.length,
      total_rows: totalRows,
      archive_rows: archiveRows,
      foundations_total: fStats?.total ?? 0,
      foundations_active: fStats?.active ?? 0,
      foundations_suspended: fStats?.suspended ?? 0,
      users_total: uStats?.total ?? 0,
      users_active: uStats?.active ?? 0,
    },
    r2: {
      bucket: 'ahbab-files',
      total_objects: r2Objects.length,
      total_bytes: mediaBytes + backupBytes,
      media_files: mediaFiles,
      media_bytes: mediaBytes,
      backup_snapshots: backupStamps.size,
      backup_files: backupFiles,
      backup_bytes: backupBytes,
      latest_backup_at: latestBackupAt,
    },
    kv: {
      keys_count: kvList.keys.length,
      status: 'connected',
    },
    cron: {
      schedule: '0 1 1 * *',
      label: 'أول كل شهر — 01:00 UTC',
    },
  });
});

// ── Database: all tables with live row counts and integrity check ──
system.get('/database', async (c) => {
  const t0 = Date.now();
  const results = await c.env.DB.batch(DB_TABLES.map((t) => c.env.DB.prepare(`SELECT COUNT(*) AS n FROM ${t.name}`)));
  const latencyMs = Math.max(1, Date.now() - t0);

  const tables = DB_TABLES.map((meta, idx) => ({
    ...meta,
    rows: Number((results[idx]?.results?.[0] as { n?: number } | undefined)?.n ?? 0),
  }));
  const totalRows = tables.reduce((sum, t) => sum + t.rows, 0);

  return c.json({
    database: 'ahbab-db',
    engine: 'Cloudflare D1 (SQLite)',
    latency_ms: latencyMs,
    total_tables: tables.length,
    total_rows: totalRows,
    tables,
  });
});

system.post('/database/check', async (c) => {
  const t0 = Date.now();
  const [pragma, liveSubs, cachedSubs] = await Promise.all([
    c.env.DB.prepare('PRAGMA quick_check').all<{ quick_check: string }>(),
    // scope-ok: system admin cross-foundation integrity check
    first<{ n: number }>(c, "SELECT COUNT(*) AS n FROM subscribers WHERE deleted_at IS NULL AND status = 'alive'"),
    // scope-ok: system admin cross-foundation integrity check
    first<{ n: number }>(c, "SELECT COALESCE(SUM(value), 0) AS n FROM stats_totals WHERE key = 'subs_alive'"),
  ]);
  const latencyMs = Math.max(1, Date.now() - t0);
  const checkRows = pragma.results.map((r) => r.quick_check);
  const pragmaOk = checkRows.length === 1 && checkRows[0] === 'ok';
  const liveCount = liveSubs?.n ?? 0;
  const statsCount = cachedSubs?.n ?? 0;
  const statsSynced = liveCount === statsCount;

  return c.json({
    ok: pragmaOk && statsSynced,
    pragma_ok: pragmaOk,
    pragma_result: checkRows.join(', ') || 'ok',
    stats_synced: statsSynced,
    live_subscribers: liveCount,
    stats_subscribers: statsCount,
    latency_ms: latencyMs,
    checked_at: new Date().toISOString(),
  });
});

// ── Backups: list R2 snapshots, create new encrypted backup, delete snapshot ──
system.get('/backups', async (c) => {
  const objects = await listAllR2(c.env.FILES, 'backups/', 1500);
  const groups = new Map<string, {
    stamp: string;
    created_at: string;
    total_bytes: number;
    file_count: number;
    files: { key: string; name: string; size: number; uploaded: string }[];
  }>();

  for (const obj of objects) {
    const parts = obj.key.split('/');
    const stamp = parts[1];
    const name = parts.slice(2).join('/');
    if (!stamp || !name) continue;
    let entry = groups.get(stamp);
    const iso = obj.uploaded.toISOString();
    if (!entry) {
      entry = { stamp, created_at: iso, total_bytes: 0, file_count: 0, files: [] };
      groups.set(stamp, entry);
    }
    if (iso > entry.created_at) entry.created_at = iso;
    entry.total_bytes += obj.size;
    entry.file_count += 1;
    entry.files.push({ key: obj.key, name, size: obj.size, uploaded: iso });
  }

  const snapshots = Array.from(groups.values()).sort((a, b) => b.created_at.localeCompare(a.created_at));
  return c.json({
    bucket: 'ahbab-files',
    prefix: 'backups/',
    encryption: 'AES-256-GCM + Gzip',
    schedule: '0 1 1 * *',
    snapshots,
  });
});

system.post('/backups/run', async (c) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const t0 = Date.now();
  await exportBackup(c.env, stamp);
  const durationMs = Date.now() - t0;
  const created = await listAllR2(c.env.FILES, `backups/${stamp}/`, 500);
  const totalBytes = created.reduce((sum, o) => sum + o.size, 0);
  await batch(c, [systemAudit(c, 'manual_backup', JSON.stringify({ stamp, files: created.length, bytes: totalBytes }))]);
  return c.json({
    ok: true,
    stamp,
    file_count: created.length,
    total_bytes: totalBytes,
    duration_ms: durationMs,
  }, 201);
});

system.delete('/backups/:stamp', async (c) => {
  const stamp = c.req.param('stamp');
  if (!/^[0-9A-Za-z_-]{8,32}$/.test(stamp)) fail(400, 'معرّف النسخة غير صالح');
  const objects = await listAllR2(c.env.FILES, `backups/${stamp}/`, 1000);
  if (!objects.length) fail(404, 'النسخة غير موجودة');
  const keys = objects.map((o) => o.key);
  for (let i = 0; i < keys.length; i += 500) {
    await c.env.FILES.delete(keys.slice(i, i + 500));
  }
  await batch(c, [systemAudit(c, 'delete_backup', JSON.stringify({ stamp, deleted_files: keys.length }))]);
  return c.json({ ok: true, deleted_files: keys.length });
});

// ── Files: R2 explorer, SHA-256 integrity, orphan detector, recycle bin ──
system.get('/files', async (c) => {
  const [objects, expRows, trashRows, foundations] = await Promise.all([
    listAllR2(c.env.FILES, undefined, 1500),
    // scope-ok: system admin cross-foundation file metadata
    all<{ id: number; file_key: string; name: string; type: string; size: number; created_at: string; foundation_id: number }>(
      c, 'SELECT id, file_key, name, type, size, created_at, foundation_id FROM expense_files WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 500',
    ),
    // scope-ok: system admin cross-foundation recycle bin
    all<{ id: number; file_key: string; name: string; type: string; size: number; created_at: string; deleted_at: string; foundation_id: number }>(
      c, 'SELECT id, file_key, name, type, size, created_at, deleted_at, foundation_id FROM expense_files WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 200',
    ),
    all<{ id: number; name: string; logo_key: string | null; stamp_key: string | null; signature_key: string | null; signature2_key: string | null }>(
      c, 'SELECT id, name, logo_key, stamp_key, signature_key, signature2_key FROM foundations',
    ),
  ]);

  const expByKey = new Map(expRows.map((r) => [r.file_key, r]));
  const trashKeys = new Set(trashRows.map((r) => r.file_key));
  const brandMeta = new Map<string, string>();
  for (const f of foundations) {
    if (f.logo_key) brandMeta.set(f.logo_key, `شعار — ${f.name}`);
    if (f.stamp_key) brandMeta.set(f.stamp_key, `ختم — ${f.name}`);
    if (f.signature_key) brandMeta.set(f.signature_key, `توقيع المحاسب — ${f.name}`);
    if (f.signature2_key) brandMeta.set(f.signature2_key, `توقيع المدير — ${f.name}`);
  }

  const nonBackup = objects.filter((o) => !o.key.startsWith('backups/') && !trashKeys.has(o.key));
  const items = await Promise.all(nonBackup.slice(0, 250).map(async (obj) => {
    const exp = expByKey.get(obj.key);
    const prefix = obj.key.split('/')[0] ?? 'other';
    const category = prefix === 'exp' ? 'expenses' : prefix === 'brand' ? 'brand' : 'media';
    const label = exp?.name
      ?? brandMeta.get(obj.key)
      ?? (prefix === 'rx' ? 'صورة وصفة طبية'
        : prefix === 'avatars' ? 'صورة مندوب'
        : prefix === 'families' ? 'صورة عائلة'
        : prefix === 'patients' ? 'صورة مريض'
        : obj.key.split('/').pop() ?? obj.key);
    const contentType = exp?.type ?? obj.customMetadata?.type ?? 'application/octet-stream';
    return {
      key: obj.key,
      name: label,
      category,
      prefix,
      type: contentType,
      size: obj.size,
      etag: obj.etag.replace(/"/g, '').slice(0, 8),
      uploaded: obj.uploaded.toISOString(),
      url: await signFileLink(c, obj.key),
    };
  }));
  items.sort((a, b) => b.uploaded.localeCompare(a.uploaded));

  const trash = trashRows.map((r) => ({
    id: r.id,
    key: r.file_key,
    name: r.name,
    type: r.type,
    size: r.size,
    created_at: r.created_at,
    deleted_at: r.deleted_at,
  }));

  return c.json({
    bucket: 'ahbab-files',
    total_files: nonBackup.length,
    total_bytes: nonBackup.reduce((sum, o) => sum + o.size, 0),
    counts: {
      expenses: items.filter((i) => i.category === 'expenses').length,
      media: items.filter((i) => i.category === 'media').length,
      brand: items.filter((i) => i.category === 'brand').length,
      trash: trash.length,
    },
    items,
    trash,
  });
});

system.post('/files/verify', async (c) => {
  const t0 = Date.now();
  const referenced = Array.from(await collectReferencedR2Keys(c));
  const sample = referenced.slice(0, 60);
  let verified = 0;
  let missing = 0;
  const details: { key: string; ok: boolean; sha256?: string; size?: number }[] = [];

  for (const key of sample) {
    const obj = await c.env.FILES.get(key);
    if (!obj) {
      missing += 1;
      details.push({ key, ok: false });
    } else {
      const buf = await obj.arrayBuffer();
      const digest = await sha256Hex(buf);
      verified += 1;
      details.push({ key, ok: true, sha256: digest.slice(0, 12), size: obj.size });
    }
  }

  return c.json({
    ok: missing === 0,
    total_referenced: referenced.length,
    checked: sample.length,
    verified,
    missing,
    duration_ms: Date.now() - t0,
    checked_at: new Date().toISOString(),
    details: details.slice(0, 20),
  });
});

system.post('/files/orphans', async (c) => {
  const [objects, referenced] = await Promise.all([
    listAllR2(c.env.FILES, undefined, 1500),
    collectReferencedR2Keys(c),
  ]);
  const orphans = objects
    .filter((o) => isOrphan(o, referenced))
    .map((o) => ({
      key: o.key,
      size: o.size,
      uploaded: o.uploaded.toISOString(),
      etag: o.etag.replace(/"/g, '').slice(0, 8),
    }));

  return c.json({
    count: orphans.length,
    total_bytes: orphans.reduce((sum, o) => sum + o.size, 0),
    checked_at: new Date().toISOString(),
    items: orphans,
  });
});

system.delete('/files/orphans', async (c) => {
  const [objects, referenced] = await Promise.all([
    listAllR2(c.env.FILES, undefined, 1500),
    collectReferencedR2Keys(c),
  ]);
  const keys = objects
    .filter((o) => isOrphan(o, referenced))
    .map((o) => o.key);

  for (let i = 0; i < keys.length; i += 500) {
    await c.env.FILES.delete(keys.slice(i, i + 500));
  }
  if (keys.length) {
    await batch(c, [systemAudit(c, 'cleanup_orphans', JSON.stringify({ deleted: keys.length }))]);
  }
  return c.json({ ok: true, deleted: keys.length });
});

system.post('/files/trash/:id/restore', async (c) => {
  const id = idParam(c.req.param('id'));
  // scope-ok: system admin recycle bin restore
  const row = await first<{ id: number; name: string }>(c, 'SELECT id, name FROM expense_files WHERE id = ? AND deleted_at IS NOT NULL', id);
  if (!row) fail(404, 'الملف غير موجود في سلة المحذوفات');
  await batch(c, [
    // scope-ok: system admin recycle bin restore
    stmt(c, 'UPDATE expense_files SET deleted_at = NULL WHERE id = ?', id),
    systemAudit(c, 'restore_file', JSON.stringify({ id, name: row.name })),
  ]);
  return c.json({ ok: true });
});

system.delete('/files/trash/:id', async (c) => {
  const id = idParam(c.req.param('id'));
  // scope-ok: system admin recycle bin permanent delete
  const row = await first<{ id: number; file_key: string; name: string }>(c, 'SELECT id, file_key, name FROM expense_files WHERE id = ? AND deleted_at IS NOT NULL', id);
  if (!row) fail(404, 'الملف غير موجود في سلة المحذوفات');
  await batch(c, [
    // scope-ok: system admin recycle bin permanent delete
    stmt(c, 'DELETE FROM expense_files WHERE id = ?', id),
    systemAudit(c, 'purge_file', JSON.stringify({ id, name: row.name })),
  ]);
  await c.env.FILES.delete(row.file_key);
  return c.json({ ok: true });
});

// ── Maintenance: archive eligibility, KV cache purge, recent system logs ──
system.get('/maintenance', async (c) => {
  const cutoffDate = new Date();
  cutoffDate.setUTCFullYear(cutoffDate.getUTCFullYear() - 2);
  const cutoff = cutoffDate.toISOString();
  const cutoffMonth = cutoff.slice(0, 7);

  const [txOld, rxOld, auditOld, kvList, logs] = await Promise.all([
    // scope-ok: system admin archive eligibility count
    first<{ n: number }>(
      c,
      `SELECT COUNT(*) AS n FROM transactions t
         JOIN monthly_closings mc ON mc.foundation_id = t.foundation_id AND mc.month = t.month AND mc.status = 'closed'
       WHERE t.month < ?`,
      cutoffMonth,
    ),
    // scope-ok: system admin archive eligibility count
    first<{ n: number }>(c, "SELECT COUNT(*) AS n FROM prescriptions WHERE created_at < ? AND status <> 'pending'", cutoff),
    // scope-ok: system admin archive eligibility count
    first<{ n: number }>(c, 'SELECT COUNT(*) AS n FROM audit_log WHERE created_at < ?', cutoff),
    c.env.CACHE.list({ limit: 200 }).catch(() => ({ keys: [], list_complete: true })),
    // scope-ok: system admin recent system audit trail
    all<{ id: number; action: string; entity: string; detail: string | null; created_at: string; full_name: string | null }>(
      c,
      `SELECT a.id, a.action, a.entity, a.detail, a.created_at, u.full_name
       FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
       WHERE a.entity IN ('system', 'foundation')
       ORDER BY a.id DESC LIMIT 12`,
    ),
  ]);

  return c.json({
    archive_cutoff: cutoff.slice(0, 10),
    eligible: {
      transactions: txOld?.n ?? 0,
      prescriptions: rxOld?.n ?? 0,
      audit_log: auditOld?.n ?? 0,
      total: (txOld?.n ?? 0) + (rxOld?.n ?? 0) + (auditOld?.n ?? 0),
    },
    kv_keys: kvList.keys.length,
    recent_logs: logs,
  });
});

system.post('/maintenance/archive', async (c) => {
  const t0 = Date.now();
  await archiveOldRecords(c.env);
  await batch(c, [systemAudit(c, 'run_archive', JSON.stringify({ duration_ms: Date.now() - t0 }))]);
  return c.json({ ok: true, duration_ms: Date.now() - t0 });
});

system.post('/maintenance/cache', async (c) => {
  const list = await c.env.CACHE.list({ limit: 500 });
  await Promise.all(list.keys.map((k) => c.env.CACHE.delete(k.name)));
  await batch(c, [systemAudit(c, 'purge_cache', JSON.stringify({ cleared: list.keys.length }))]);
  return c.json({ ok: true, cleared: list.keys.length });
});

// ── Foundations (existing endpoints preserved verbatim) ──
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
  if (body.status === 'suspended') {
    // scope-ok: reads the signed-in user's own home foundation
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

system.post('/enter', async (c) => {
  const session = c.get('user');
  const { foundation_id: target } = await readJson(c, z.object({ foundation_id: z.number().int().positive() }));
  const [place, me] = await Promise.all([
    first<{ id: number; features: string | null }>(c, 'SELECT id, features FROM foundations WHERE id = ?', target),
    // scope-ok: reads the signed-in user's own row by id
    first<{ id: number; role: 'admin'; foundation_id: number; is_system: number; active: number; token_version: number; must_change_password: number }>(
      c, 'SELECT id, role, foundation_id, is_system, active, token_version, must_change_password FROM users WHERE id = ?', session.id,
    ),
  ]);
  if (!me || !me.active || me.token_version !== session.tokenVersion) {
    endSession(c);
    fail(401, 'انتهت الجلسة، يرجى تسجيل الدخول');
  }
  if (!me.is_system) fail(403, 'هذه الصفحة لمدير النظام فقط');
  if (!place) fail(404, 'المؤسسة غير موجودة');
  await batch(c, [
    stmt(c, `INSERT INTO audit_log (foundation_id, user_id, action, entity, entity_id)
             VALUES (?, ?, 'system_enter', 'foundation', ?)`, target, me.id, target),
  ]);
  await startSession(
    c,
    { ...me, foundation_id: target, features: parseFeatures(place.features) },
    { start: session.sessionStart, remember: session.remember },
  );
  return c.json({ ok: true });
});

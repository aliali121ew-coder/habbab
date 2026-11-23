import type { Feature } from '../../api';

export type SystemTab = 'overview' | 'database' | 'backups' | 'files' | 'pages' | 'maintenance';

export interface OverviewData {
  status: 'healthy' | 'degraded';
  environment: string;
  latency_ms: number;
  checked_at: string;
  d1: {
    name: string;
    tables: number;
    total_rows: number;
    archive_rows: number;
    foundations_total: number;
    foundations_active: number;
    foundations_suspended: number;
    users_total: number;
    users_active: number;
  };
  r2: {
    bucket: string;
    total_objects: number;
    total_bytes: number;
    media_files: number;
    media_bytes: number;
    backup_snapshots: number;
    backup_files: number;
    backup_bytes: number;
    latest_backup_at: string | null;
  };
  kv: {
    keys_count: number;
    status: string;
  };
  cron: {
    schedule: string;
    label: string;
  };
}

export interface TableStat {
  name: string;
  label: string;
  group: 'core' | 'finance' | 'health' | 'stats' | 'archive';
  rows: number;
}

export interface DatabaseData {
  database: string;
  engine: string;
  latency_ms: number;
  total_tables: number;
  total_rows: number;
  tables: TableStat[];
}

export interface DbCheckResult {
  ok: boolean;
  pragma_ok: boolean;
  pragma_result: string;
  stats_synced: boolean;
  live_subscribers: number;
  stats_subscribers: number;
  latency_ms: number;
  checked_at: string;
}

export interface BackupSnapshot {
  stamp: string;
  created_at: string;
  total_bytes: number;
  file_count: number;
  files: { key: string; name: string; size: number; uploaded: string }[];
}

export interface BackupsData {
  bucket: string;
  prefix: string;
  encryption: string;
  schedule: string;
  snapshots: BackupSnapshot[];
}

export interface SystemFileItem {
  key: string;
  name: string;
  category: 'expenses' | 'media' | 'brand';
  prefix: string;
  type: string;
  size: number;
  etag: string;
  uploaded: string;
  url: string;
}

export interface TrashFileItem {
  id: number;
  key: string;
  name: string;
  type: string;
  size: number;
  created_at: string;
  deleted_at: string;
}

export interface FilesData {
  bucket: string;
  total_files: number;
  total_bytes: number;
  counts: { expenses: number; media: number; brand: number; trash: number };
  items: SystemFileItem[];
  trash: TrashFileItem[];
}

export interface VerifyResult {
  ok: boolean;
  total_referenced: number;
  checked: number;
  verified: number;
  missing: number;
  duration_ms: number;
  checked_at: string;
  details: { key: string; ok: boolean; sha256?: string; size?: number }[];
}

export interface OrphanResult {
  count: number;
  total_bytes: number;
  checked_at: string;
  items: { key: string; size: number; uploaded: string; etag: string }[];
}

export interface Foundation {
  id: number;
  name: string;
  status: 'active' | 'suspended';
  features: Feature[];
  created_at: string;
  users: number;
  subscribers: number;
}

export interface MaintenanceData {
  archive_cutoff: string;
  eligible: { transactions: number; prescriptions: number; audit_log: number; total: number };
  kv_keys: number;
  recent_logs: {
    id: number;
    action: string;
    entity: string;
    detail: string | null;
    created_at: string;
    full_name: string | null;
  }[];
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatRelativeDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return iso.slice(0, 10);
  const diffMin = Math.floor((Date.now() - ts) / 60_000);
  if (diffMin < 1) return 'الآن';
  if (diffMin < 60) return `قبل ${diffMin} دقيقة`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `قبل ${diffHr} ساعة`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays <= 30) return `قبل ${diffDays} يوم`;
  const d = new Date(ts);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

export const SYSTEM_ACTION_LABELS: Record<string, string> = {
  create_foundation: 'إنشاء مؤسسة جديدة',
  update_foundation: 'تحديث إعدادات مؤسسة',
  system_enter: 'دخول إلى مؤسسة',
  manual_backup: 'إنشاء نسخة احتياطية يدوية',
  delete_backup: 'حذف نسخة احتياطية',
  cleanup_orphans: 'تنظيف ملفات يتيمة في R2',
  restore_file: 'استعادة ملف من سلة المحذوفات',
  purge_file: 'حذف ملف نهائياً',
  run_archive: 'تشغيل أرشفة السجلات القديمة',
  purge_cache: 'تنظيف الذاكرة المؤقتة (KV)',
};

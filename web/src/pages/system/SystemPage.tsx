import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { AnimatePresence, motion, MotionConfig } from 'framer-motion';
import {
  Activity,
  Archive,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Cloud,
  Cpu,
  Database,
  ExternalLink,
  FileImage,
  FileText,
  FolderLock,
  Gauge,
  HardDrive,
  HardDriveDownload,
  Hash,
  Layers,
  Loader2,
  Lock,
  LogIn,
  PauseCircle,
  PlayCircle,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Server,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Users,
  Wrench,
  XCircle,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { api, forgetRecent, type Feature, type Me } from '../../api';
import { Modal } from '../../components/Modal';
import { StateMessage } from '../../components/StateMessage';
import { enterFoundation } from '../../components/Shell';
import { FEATURE_LIST } from '../../features';
import { formatNumber } from '../../format';
import {
  formatBytes,
  formatRelativeDate,
  formatShortDate,
  SYSTEM_ACTION_LABELS,
  type BackupsData,
  type DatabaseData,
  type DbCheckResult,
  type FilesData,
  type Foundation,
  type MaintenanceData,
  type OrphanResult,
  type OverviewData,
  type SystemTab,
  type TableStat,
  type VerifyResult,
} from './types';

const ALL_FEATURES: Feature[] = FEATURE_LIST.map((item) => item.id);
const FEATURE_LABEL = new Map(FEATURE_LIST.map((f) => [f.id, f.label]));

const TABS: { id: SystemTab; label: string; icon: LucideIcon }[] = [
  { id: 'overview', label: 'نظرة عامة', icon: Gauge },
  { id: 'database', label: 'قاعدة البيانات', icon: Database },
  { id: 'backups', label: 'النسخ', icon: HardDriveDownload },
  { id: 'files', label: 'الملفات', icon: FolderLock },
  { id: 'pages', label: 'الصفحات', icon: SlidersHorizontal },
  { id: 'maintenance', label: 'الصيانة', icon: Wrench },
];

const GROUP_LABELS: Record<TableStat['group'], string> = {
  core: 'أساسية',
  finance: 'مالية',
  health: 'صحية',
  stats: 'إحصاء',
  archive: 'أرشيف',
};

// ── Feature Picker (used for New & Edit Foundation modals) ──
function FeaturePicker({ value, onChange }: { value: Feature[]; onChange: (next: Feature[]) => void }) {
  const toggle = (id: Feature) => onChange(value.includes(id) ? value.filter((k) => k !== id) : [...value, id]);
  return (
    <fieldset className="sys-features">
      <legend>الصفحات المفعّلة</legend>
      {FEATURE_LIST.map((item) => (
        <label key={item.id} className={value.includes(item.id) ? 'on' : undefined}>
          <input type="checkbox" checked={value.includes(item.id)} onChange={() => toggle(item.id)} />
          <span className="sys-tick" aria-hidden><Check size={14} /></span>
          <span className="sys-feature-text">
            <b>{item.label}</b>
            <small>{item.hint}</small>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

function NewFoundationModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [adminName, setAdminName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [features, setFeatures] = useState<Feature[]>(ALL_FEATURES);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/system/foundations', {
        method: 'POST',
        body: { name, features, admin_full_name: adminName, admin_username: username, admin_password: password },
      });
      onSaved();
    } catch (failure) {
      setError((failure as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal title="مؤسسة جديدة" onClose={onClose}>
      <form className="sys-form" onSubmit={submit}>
        <label className="field">
          <span>اسم المؤسسة</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required minLength={3} maxLength={120} autoFocus />
        </label>
        <p className="sys-form-note">مدير المؤسسة: يغيّر كلمة المرور عند أول دخول، ثم يضيف موظفيه ومندوبيه.</p>
        <label className="field">
          <span>اسم المدير</span>
          <input value={adminName} onChange={(e) => setAdminName(e.target.value)} required minLength={3} maxLength={120} />
        </label>
        <div className="sys-form-row">
          <label className="field">
            <span>اسم المستخدم</span>
            <input dir="ltr" value={username} onChange={(e) => setUsername(e.target.value)} required pattern="[a-zA-Z0-9._\-]{3,32}" autoComplete="off" />
          </label>
          <label className="field">
            <span>كلمة مرور مؤقتة</span>
            <input dir="ltr" type="text" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={10} autoComplete="off" />
          </label>
        </div>
        <FeaturePicker value={features} onChange={setFeatures} />
        {error && <p className="sys-error" role="alert">{error}</p>}
        <div className="sys-form-actions">
          <button type="button" className="btn" onClick={onClose}>إلغاء</button>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? 'جارٍ الحفظ…' : 'إنشاء المؤسسة'}</button>
        </div>
      </form>
    </Modal>
  );
}

function EditFeaturesModal({ foundation, onClose, onSaved }: { foundation: Foundation; onClose: () => void; onSaved: () => void }) {
  const [features, setFeatures] = useState<Feature[]>(foundation.features);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(`/system/foundations/${foundation.id}`, { method: 'PATCH', body: { features } });
      onSaved();
    } catch (failure) {
      setError((failure as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal title={`صفحات ${foundation.name}`} onClose={onClose}>
      <form className="sys-form" onSubmit={submit}>
        <FeaturePicker value={features} onChange={setFeatures} />
        <p className="sys-form-note">يظهر التغيير في قائمة المؤسسة فوراً، ويرفض الخادم الصفحات المطفأة خلال 15 دقيقة.</p>
        {error && <p className="sys-error" role="alert">{error}</p>}
        <div className="sys-form-actions">
          <button type="button" className="btn" onClick={onClose}>إلغاء</button>
          <button type="submit" className="btn primary" disabled={busy}>{busy ? 'جارٍ الحفظ…' : 'حفظ'}</button>
        </div>
      </form>
    </Modal>
  );
}

// ── Main System Control Center ──
export function SystemPage({ me }: { me: Me }) {
  const [tab, setTab] = useState<SystemTab>('overview');
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone: 'ok' | 'warn' | 'err' } | null>(null);

  // Per-tab data states
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [overviewErr, setOverviewErr] = useState('');

  const [dbData, setDbData] = useState<DatabaseData | null>(null);
  const [dbSearch, setDbSearch] = useState('');
  const [dbGroup, setDbGroup] = useState<'all' | TableStat['group']>('all');
  const [dbCheck, setDbCheck] = useState<DbCheckResult | null>(null);
  const [dbChecking, setDbChecking] = useState(false);

  const [backups, setBackups] = useState<BackupsData | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const [expandedSnap, setExpandedSnap] = useState<string | null>(null);
  const [deletingSnap, setDeletingSnap] = useState<string | null>(null);

  const [filesData, setFilesData] = useState<FilesData | null>(null);
  const [fileSubTab, setFileSubTab] = useState<'expenses' | 'media' | 'brand' | 'trash'>('expenses');
  const [fileSearch, setFileSearch] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [scanningOrphans, setScanningOrphans] = useState(false);
  const [orphanResult, setOrphanResult] = useState<OrphanResult | null>(null);
  const [cleaningOrphans, setCleaningOrphans] = useState(false);
  const [trashBusyId, setTrashBusyId] = useState<number | null>(null);

  const [foundations, setFoundations] = useState<Foundation[] | null>(null);
  const [addingFoundation, setAddingFoundation] = useState(false);
  const [editingFoundation, setEditingFoundation] = useState<Foundation | null>(null);
  const [foundationBusyId, setFoundationBusyId] = useState<number | null>(null);

  const [maintData, setMaintData] = useState<MaintenanceData | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [purgingCache, setPurgingCache] = useState(false);

  const notify = useCallback((text: string, tone: 'ok' | 'warn' | 'err' = 'ok') => {
    setToast({ text, tone });
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const id = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(id);
  }, [toast]);

  // Loaders
  const loadOverview = useCallback(async () => {
    setOverviewErr('');
    try {
      setOverview(await api<OverviewData>('/system/overview'));
    } catch (e) {
      setOverviewErr((e as Error).message);
    }
  }, []);

  const loadDatabase = useCallback(async () => {
    try { setDbData(await api<DatabaseData>('/system/database')); }
    catch (e) { notify((e as Error).message, 'err'); }
  }, [notify]);

  const loadBackups = useCallback(async () => {
    try { setBackups(await api<BackupsData>('/system/backups')); }
    catch (e) { notify((e as Error).message, 'err'); }
  }, [notify]);

  const loadFiles = useCallback(async () => {
    try { setFilesData(await api<FilesData>('/system/files')); }
    catch (e) { notify((e as Error).message, 'err'); }
  }, [notify]);

  const loadFoundations = useCallback(async () => {
    try {
      const data = await api<{ items: Foundation[] }>('/system/foundations');
      setFoundations(data.items);
    } catch (e) { notify((e as Error).message, 'err'); }
  }, [notify]);

  const loadMaintenance = useCallback(async () => {
    try { setMaintData(await api<MaintenanceData>('/system/maintenance')); }
    catch (e) { notify((e as Error).message, 'err'); }
  }, [notify]);

  useEffect(() => { void loadOverview(); }, [loadOverview]);

  useEffect(() => {
    if (tab === 'database' && !dbData) void loadDatabase();
    if (tab === 'backups' && !backups) void loadBackups();
    if (tab === 'files' && !filesData) void loadFiles();
    if (tab === 'pages' && !foundations) void loadFoundations();
    if (tab === 'maintenance' && !maintData) void loadMaintenance();
  }, [tab, dbData, backups, filesData, foundations, maintData, loadDatabase, loadBackups, loadFiles, loadFoundations, loadMaintenance]);

  const handleRefresh = async () => {
    setRefreshing(true);
    forgetRecent();
    try {
      await loadOverview();
      if (tab === 'database') await loadDatabase();
      if (tab === 'backups') await loadBackups();
      if (tab === 'files') await loadFiles();
      if (tab === 'pages') await loadFoundations();
      if (tab === 'maintenance') await loadMaintenance();
      notify('تم تحديث بيانات النظام بنجاح');
    } finally {
      setRefreshing(false);
    }
  };

  // Actions
  const runDbCheck = async () => {
    setDbChecking(true);
    try {
      const res = await api<DbCheckResult>('/system/database/check', { method: 'POST' });
      setDbCheck(res);
      notify(res.ok ? 'قاعدة البيانات سليمة ومتزامنة بالكامل' : 'تم رصد ملاحظة في تزامن الإحصاءات', res.ok ? 'ok' : 'warn');
    } catch (e) {
      notify((e as Error).message, 'err');
    } finally {
      setDbChecking(false);
    }
  };

  const runBackupNow = async () => {
    setBackupBusy(true);
    try {
      const res = await api<{ stamp: string; file_count: number; total_bytes: number }>('/system/backups/run', { method: 'POST' });
      notify(`تم إنشاء النسخة الاحتياطية (${res.file_count} ملف • ${formatBytes(res.total_bytes)})`);
      await Promise.all([loadBackups(), loadOverview()]);
    } catch (e) {
      notify((e as Error).message, 'err');
    } finally {
      setBackupBusy(false);
    }
  };

  const deleteSnapshot = async (stamp: string) => {
    if (!window.confirm(`حذف النسخة الاحتياطية «${stamp}» نهائياً من R2؟`)) return;
    setDeletingSnap(stamp);
    try {
      await api(`/system/backups/${encodeURIComponent(stamp)}`, { method: 'DELETE' });
      notify('تم حذف النسخة الاحتياطية');
      await Promise.all([loadBackups(), loadOverview()]);
    } catch (e) {
      notify((e as Error).message, 'err');
    } finally {
      setDeletingSnap(null);
    }
  };

  const runVerifyFiles = async () => {
    setVerifying(true);
    try {
      const res = await api<VerifyResult>('/system/files/verify', { method: 'POST' });
      setVerifyResult(res);
      notify(
        res.missing === 0
          ? `تم التحقق من ${formatNumber(res.verified)} ملف ببصمة SHA-256 بنجاح`
          : `تنبيه: ${formatNumber(res.missing)} ملف مفقود من أصل ${formatNumber(res.checked)}`,
        res.missing === 0 ? 'ok' : 'warn',
      );
    } catch (e) {
      notify((e as Error).message, 'err');
    } finally {
      setVerifying(false);
    }
  };

  const runScanOrphans = async () => {
    setScanningOrphans(true);
    try {
      const res = await api<OrphanResult>('/system/files/orphans', { method: 'POST' });
      setOrphanResult(res);
      notify(
        res.count === 0
          ? 'ممتاز! لا توجد أي ملفات يتيمة في R2'
          : `تم العثور على ${formatNumber(res.count)} ملف يتيم (${formatBytes(res.total_bytes)})`,
        res.count === 0 ? 'ok' : 'warn',
      );
    } catch (e) {
      notify((e as Error).message, 'err');
    } finally {
      setScanningOrphans(false);
    }
  };

  const runCleanupOrphans = async () => {
    if (!orphanResult?.count) return;
    if (!window.confirm(`حذف ${orphanResult.count} ملف يتيم نهائياً من R2؟ لا يمكن التراجع عن هذا الإجراء.`)) return;
    setCleaningOrphans(true);
    try {
      const res = await api<{ deleted: number }>('/system/files/orphans', { method: 'DELETE' });
      notify(`تم تنظيف ${formatNumber(res.deleted)} ملف يتيم`);
      setOrphanResult({ count: 0, total_bytes: 0, checked_at: new Date().toISOString(), items: [] });
      await Promise.all([loadFiles(), loadOverview()]);
    } catch (e) {
      notify((e as Error).message, 'err');
    } finally {
      setCleaningOrphans(false);
    }
  };

  const restoreTrashFile = async (id: number) => {
    setTrashBusyId(id);
    try {
      await api(`/system/files/trash/${id}/restore`, { method: 'POST' });
      notify('تمت استعادة الملف بنجاح');
      await loadFiles();
    } catch (e) {
      notify((e as Error).message, 'err');
    } finally {
      setTrashBusyId(null);
    }
  };

  const purgeTrashFile = async (id: number, name: string) => {
    if (!window.confirm(`حذف «${name}» نهائياً من قاعدة البيانات و R2؟`)) return;
    setTrashBusyId(id);
    try {
      await api(`/system/files/trash/${id}`, { method: 'DELETE' });
      notify('تم حذف الملف نهائياً');
      await Promise.all([loadFiles(), loadOverview()]);
    } catch (e) {
      notify((e as Error).message, 'err');
    } finally {
      setTrashBusyId(null);
    }
  };

  const setFoundationStatus = async (foundation: Foundation) => {
    const next = foundation.status === 'active' ? 'suspended' : 'active';
    if (next === 'suspended' && !window.confirm(`إيقاف «${foundation.name}»؟\nلن يستطيع موظفوها الدخول حتى تعيد تفعيلها. لا تُحذف أي بيانات.`)) return;
    setFoundationBusyId(foundation.id);
    try {
      await api(`/system/foundations/${foundation.id}`, { method: 'PATCH', body: { status: next } });
      notify(next === 'suspended' ? `تم إيقاف «${foundation.name}»` : `تم تفعيل «${foundation.name}»`);
      await Promise.all([loadFoundations(), loadOverview()]);
    } catch (e) {
      notify((e as Error).message, 'err');
    } finally {
      setFoundationBusyId(null);
    }
  };

  const enterSelectedFoundation = async (foundation: Foundation) => {
    setFoundationBusyId(foundation.id);
    try {
      await enterFoundation(foundation.id);
    } catch (e) {
      notify((e as Error).message, 'err');
      setFoundationBusyId(null);
    }
  };

  const runArchiveNow = async () => {
    if (!window.confirm('تشغيل أرشفة السجلات الأقدم من سنتين الآن؟ تُنقل السجلات المغلقة إلى جداول الأرشيف دون حذف.')) return;
    setArchiving(true);
    try {
      await api('/system/maintenance/archive', { method: 'POST' });
      notify('اكتملت عملية الأرشفة بنجاح');
      await Promise.all([loadMaintenance(), loadOverview()]);
    } catch (e) {
      notify((e as Error).message, 'err');
    } finally {
      setArchiving(false);
    }
  };

  const runPurgeCache = async () => {
    setPurgingCache(true);
    try {
      const res = await api<{ cleared: number }>('/system/maintenance/cache', { method: 'POST' });
      notify(`تم تنظيف الذاكرة المؤقتة (${formatNumber(res.cleared)} مفتاح)`);
      await Promise.all([loadMaintenance(), loadOverview()]);
    } catch (e) {
      notify((e as Error).message, 'err');
    } finally {
      setPurgingCache(false);
    }
  };

  // Filtered tables
  const filteredTables = useMemo(() => {
    if (!dbData) return [];
    const q = dbSearch.trim().toLowerCase();
    return dbData.tables
      .filter((t) => (dbGroup === 'all' || t.group === dbGroup) && (!q || t.label.includes(q) || t.name.toLowerCase().includes(q)))
      .sort((a, b) => b.rows - a.rows);
  }, [dbData, dbSearch, dbGroup]);

  const maxTableRows = useMemo(() => {
    if (!dbData?.tables.length) return 1;
    return Math.max(1, ...dbData.tables.map((t) => t.rows));
  }, [dbData]);

  // Filtered files
  const filteredFiles = useMemo(() => {
    if (!filesData) return [];
    const q = fileSearch.trim().toLowerCase();
    if (fileSubTab === 'trash') return [];
    return filesData.items.filter(
      (f) => f.category === fileSubTab && (!q || f.name.toLowerCase().includes(q) || f.key.toLowerCase().includes(q)),
    );
  }, [filesData, fileSubTab, fileSearch]);

  const filteredTrash = useMemo(() => {
    if (!filesData || fileSubTab !== 'trash') return [];
    const q = fileSearch.trim().toLowerCase();
    return filesData.trash.filter((f) => !q || f.name.toLowerCase().includes(q) || f.key.toLowerCase().includes(q));
  }, [filesData, fileSubTab, fileSearch]);

  if (overviewErr && !overview) {
    return <StateMessage kind="error" title="تعذّر تحميل لوحة إدارة النظام" hint={overviewErr} onRetry={loadOverview} />;
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="sys">
        {/* ── Hero Command Banner ── */}
        <header className="sys-hero">
          <div className="sys-hero-bg" aria-hidden />
          <div className="sys-hero-start">
            <span className="sys-hero-emblem" aria-hidden>
              <Server size={24} />
            </span>
            <div className="sys-hero-titles">
              <h1>إدارة النظام وقاعدة البيانات</h1>
              <p>D1 للنظام والقراءة السريعة، و R2 للملفات والنسخ الاحتياطية والأرشيف، و KV للتخزين المؤقت.</p>
            </div>
          </div>

          <div className="sys-hero-end">
            <span className="sys-status-pill" role="status">
              <span className="sys-pulse-dot" aria-hidden />
              <span>النظام يعمل</span>
              {overview && <bdi className="sys-latency-tag">{overview.latency_ms} ms</bdi>}
            </span>
            {overview && (
              <span className="sys-env-pill">
                <bdi>{overview.environment}</bdi>
              </span>
            )}
            <button
              type="button"
              className="sys-refresh-btn"
              onClick={() => void handleRefresh()}
              disabled={refreshing}
              aria-label="تحديث بيانات النظام"
              title="تحديث"
            >
              <RefreshCw size={17} className={refreshing ? 'sys-spin' : undefined} aria-hidden />
            </button>
          </div>
        </header>

        {/* ── 6-Tab Command Dock ── */}
        <nav className="sys-tabs" role="tablist" aria-label="أقسام إدارة النظام">
          {TABS.map((item) => {
            const active = tab === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                id={`sys-tab-${item.id}`}
                aria-selected={active}
                aria-controls={`sys-panel-${item.id}`}
                className={`sys-tab${active ? ' is-active' : ''}`}
                onClick={() => setTab(item.id)}
              >
                {active && (
                  <motion.span
                    layoutId="sys-tab-pill"
                    className="sys-tab-pill"
                    transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                  />
                )}
                <Icon size={16} aria-hidden className="sys-tab-ico" />
                <span className="sys-tab-lbl">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* ── Tab Panels ── */}
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            id={`sys-panel-${tab}`}
            role="tabpanel"
            aria-labelledby={`sys-tab-${tab}`}
            className="sys-panel-wrap"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            {/* ════════ 1. OVERVIEW ════════ */}
            {tab === 'overview' && (
              <div className="sys-section">
                {!overview ? (
                  <div className="sys-kpi-grid" aria-busy="true">
                    {[0, 1, 2, 3].map((k) => <div key={k} className="sys-skeleton-card" />)}
                  </div>
                ) : (
                  <>
                    <div className="sys-kpi-grid">
                      <article className="sys-kpi tone-theme">
                        <div className="sys-kpi-head">
                          <span className="sys-kpi-ico" aria-hidden><Database size={20} /></span>
                          <span className="sys-kpi-badge">D1 SQLite</span>
                        </div>
                        <div className="sys-kpi-val"><bdi>{formatNumber(overview.d1.total_rows)}</bdi></div>
                        <div className="sys-kpi-lbl">إجمالي السجلات</div>
                        <div className="sys-kpi-sub">
                          <span><bdi>{overview.d1.tables}</bdi> جدول</span>
                          <span>•</span>
                          <span><bdi>{formatNumber(overview.d1.archive_rows)}</bdi> بالأرشيف</span>
                        </div>
                      </article>

                      <article className="sys-kpi tone-ok">
                        <div className="sys-kpi-head">
                          <span className="sys-kpi-ico" aria-hidden><Cloud size={20} /></span>
                          <span className="sys-kpi-badge">R2 Storage</span>
                        </div>
                        <div className="sys-kpi-val"><bdi>{formatBytes(overview.r2.total_bytes)}</bdi></div>
                        <div className="sys-kpi-lbl">التخزين السحابي</div>
                        <div className="sys-kpi-sub">
                          <span><bdi>{formatNumber(overview.r2.media_files)}</bdi> ملف</span>
                          <span>•</span>
                          <span><bdi>{formatBytes(overview.r2.media_bytes)}</bdi> مرفقات</span>
                        </div>
                      </article>

                      <article className="sys-kpi tone-amber">
                        <div className="sys-kpi-head">
                          <span className="sys-kpi-ico" aria-hidden><HardDriveDownload size={20} /></span>
                          <span className="sys-kpi-badge">AES-256</span>
                        </div>
                        <div className="sys-kpi-val"><bdi>{formatNumber(overview.r2.backup_snapshots)}</bdi></div>
                        <div className="sys-kpi-lbl">النسخ الاحتياطية</div>
                        <div className="sys-kpi-sub">
                          <span>آخر نسخة: {overview.r2.latest_backup_at ? formatRelativeDate(overview.r2.latest_backup_at) : 'لا توجد'}</span>
                        </div>
                      </article>

                      <article className="sys-kpi tone-indigo">
                        <div className="sys-kpi-head">
                          <span className="sys-kpi-ico" aria-hidden><Building2 size={20} /></span>
                          <span className="sys-kpi-badge">متعدد المؤسسات</span>
                        </div>
                        <div className="sys-kpi-val"><bdi>{formatNumber(overview.d1.foundations_active)}</bdi></div>
                        <div className="sys-kpi-lbl">مؤسسات فعّالة</div>
                        <div className="sys-kpi-sub">
                          <span>من أصل <bdi>{overview.d1.foundations_total}</bdi></span>
                          <span>•</span>
                          <span><bdi>{formatNumber(overview.d1.users_active)}</bdi> مستخدم نشط</span>
                        </div>
                      </article>
                    </div>

                    {/* Infrastructure Health Matrix */}
                    <section className="sys-card-panel">
                      <div className="sys-panel-head">
                        <div>
                          <h2>حالة البنية التحتية والخدمات</h2>
                          <p>مراقبة فورية لخدمات Cloudflare المرتبطة بالنظام</p>
                        </div>
                        <span className="sys-chip ok">كل الخدمات متصلة</span>
                      </div>
                      <div className="sys-infra-grid">
                        <div className="sys-infra-item">
                          <div className="sys-infra-top">
                            <span className="sys-infra-ico tone-theme"><Database size={18} /></span>
                            <div>
                              <strong>قاعدة البيانات D1</strong>
                              <small dir="ltr">{overview.d1.name}</small>
                            </div>
                            <span className="sys-dot-ok" aria-label="متصل" />
                          </div>
                          <div className="sys-infra-meta">
                            <span>زمن الاستجابة: <b><bdi>{overview.latency_ms} ms</bdi></b></span>
                            <span><bdi>{overview.d1.tables}</bdi> جدول نشط</span>
                          </div>
                        </div>

                        <div className="sys-infra-item">
                          <div className="sys-infra-top">
                            <span className="sys-infra-ico tone-ok"><HardDrive size={18} /></span>
                            <div>
                              <strong>تخزين الكائنات R2</strong>
                              <small dir="ltr">{overview.r2.bucket}</small>
                            </div>
                            <span className="sys-dot-ok" aria-label="متصل" />
                          </div>
                          <div className="sys-infra-meta">
                            <span>إجمالي الكائنات: <b><bdi>{formatNumber(overview.r2.total_objects)}</bdi></b></span>
                            <span>تشفير كامل</span>
                          </div>
                        </div>

                        <div className="sys-infra-item">
                          <div className="sys-infra-top">
                            <span className="sys-infra-ico tone-amber"><Zap size={18} /></span>
                            <div>
                              <strong>الذاكرة المؤقتة KV</strong>
                              <small dir="ltr">CACHE</small>
                            </div>
                            <span className="sys-dot-ok" aria-label="متصل" />
                          </div>
                          <div className="sys-infra-meta">
                            <span>المفاتيح المخزّنة: <b><bdi>{formatNumber(overview.kv.keys_count)}</bdi></b></span>
                            <span>تزامن فوري</span>
                          </div>
                        </div>

                        <div className="sys-infra-item">
                          <div className="sys-infra-top">
                            <span className="sys-infra-ico tone-indigo"><Clock size={18} /></span>
                            <div>
                              <strong>المجدول التلقائي (Cron)</strong>
                              <small dir="ltr">{overview.cron.schedule}</small>
                            </div>
                            <span className="sys-dot-ok" aria-label="مفعّل" />
                          </div>
                          <div className="sys-infra-meta">
                            <span>{overview.cron.label}</span>
                          </div>
                        </div>
                      </div>
                    </section>

                    {/* Quick Actions Deck */}
                    <section className="sys-card-panel">
                      <div className="sys-panel-head">
                        <div>
                          <h2>إجراءات سريعة</h2>
                          <p>تنفيذ مباشر لأهم عمليات النسخ الاحتياطي والفحص والصيانة</p>
                        </div>
                      </div>
                      <div className="sys-quick-grid">
                        <button type="button" className="sys-quick-btn" disabled={backupBusy} onClick={() => void runBackupNow()}>
                          <span className="sys-quick-ico tone-theme">
                            {backupBusy ? <Loader2 size={18} className="sys-spin" /> : <HardDriveDownload size={18} />}
                          </span>
                          <span className="sys-quick-text">
                            <b>نسخة احتياطية فورية</b>
                            <small>تصدير مشفّر لكل الجداول إلى R2</small>
                          </span>
                        </button>

                        <button type="button" className="sys-quick-btn" onClick={() => { setTab('database'); void runDbCheck(); }}>
                          <span className="sys-quick-ico tone-ok"><ShieldCheck size={18} /></span>
                          <span className="sys-quick-text">
                            <b>فحص سلامة قاعدة البيانات</b>
                            <small>تشغيل PRAGMA ومطابقة الإحصاءات</small>
                          </span>
                        </button>

                        <button type="button" className="sys-quick-btn" onClick={() => { setTab('files'); void runScanOrphans(); }}>
                          <span className="sys-quick-ico tone-amber"><Sparkles size={18} /></span>
                          <span className="sys-quick-text">
                            <b>فحص الملفات اليتيمة</b>
                            <small>اكتشاف ملفات R2 غير المرتبطة</small>
                          </span>
                        </button>

                        <button type="button" className="sys-quick-btn" disabled={purgingCache} onClick={() => void runPurgeCache()}>
                          <span className="sys-quick-ico tone-indigo">
                            {purgingCache ? <Loader2 size={18} className="sys-spin" /> : <Zap size={18} />}
                          </span>
                          <span className="sys-quick-text">
                            <b>تنظيف الذاكرة المؤقتة</b>
                            <small>تحديث قوائم المرجع في KV فوراً</small>
                          </span>
                        </button>
                      </div>
                    </section>
                  </>
                )}
              </div>
            )}

            {/* ════════ 2. DATABASE ════════ */}
            {tab === 'database' && (
              <div className="sys-section">
                <section className="sys-card-panel">
                  <div className="sys-panel-head">
                    <div>
                      <h2>جداول قاعدة البيانات (D1)</h2>
                      <p>
                        {dbData
                          ? `${dbData.engine} • ${formatNumber(dbData.total_tables)} جدول • ${formatNumber(dbData.total_rows)} سجل`
                          : 'جارٍ قراءة جداول قاعدة البيانات…'}
                      </p>
                    </div>
                    <button type="button" className="btn primary sys-btn-ico" disabled={dbChecking} onClick={() => void runDbCheck()}>
                      {dbChecking ? <Loader2 size={15} className="sys-spin" /> : <ShieldCheck size={15} />}
                      <span>فحص السلامة</span>
                    </button>
                  </div>

                  {dbCheck && (
                    <div className={`sys-result-banner ${dbCheck.ok ? 'is-ok' : 'is-warn'}`} role="status">
                      {dbCheck.ok ? <CheckCircle2 size={20} /> : <ShieldAlert size={20} />}
                      <div className="sys-result-body">
                        <strong>{dbCheck.ok ? 'فحص سلامة قاعدة البيانات ناجح 100%' : 'تم رصد فرق في إحصاءات المشتركين'}</strong>
                        <small>
                          PRAGMA: <bdi>{dbCheck.pragma_result}</bdi> • المشتركون الأحياء: <bdi>{formatNumber(dbCheck.live_subscribers)}</bdi> (الإحصاء: <bdi>{formatNumber(dbCheck.stats_subscribers)}</bdi>) • زمن الفحص: <bdi>{dbCheck.latency_ms} ms</bdi>
                        </small>
                      </div>
                    </div>
                  )}

                  <div className="sys-toolbar">
                    <label className="sys-search">
                      <Search size={16} aria-hidden />
                      <input
                        value={dbSearch}
                        onChange={(e) => setDbSearch(e.target.value)}
                        placeholder="ابحث باسم الجدول…"
                      />
                    </label>
                    <div className="sys-filter-pills" role="group" aria-label="تصفية الجداول">
                      {(['all', 'core', 'finance', 'health', 'stats', 'archive'] as const).map((g) => (
                        <button
                          key={g}
                          type="button"
                          className={dbGroup === g ? 'is-on' : undefined}
                          onClick={() => setDbGroup(g)}
                        >
                          {g === 'all' ? 'الكل' : GROUP_LABELS[g]}
                        </button>
                      ))}
                    </div>
                  </div>

                  {!dbData ? (
                    <div className="sys-list-skeleton" aria-busy="true">
                      {[0, 1, 2, 3, 4].map((k) => <div key={k} className="sys-skeleton-row" />)}
                    </div>
                  ) : (
                    <div className="sys-db-list">
                      {filteredTables.map((t) => {
                        const pct = Math.max(t.rows > 0 ? 4 : 0, Math.round((t.rows / maxTableRows) * 100));
                        return (
                          <div key={t.name} className="sys-db-row">
                            <div className="sys-db-info">
                              <span className="sys-db-ico" aria-hidden><Layers size={16} /></span>
                              <div className="sys-db-names">
                                <strong>{t.label}</strong>
                                <code dir="ltr">{t.name}</code>
                              </div>
                            </div>
                            <span className={`sys-group-tag g-${t.group}`}>{GROUP_LABELS[t.group]}</span>
                            <div className="sys-db-bar-wrap" aria-hidden>
                              <div className="sys-db-bar" style={{ width: `${pct}%` }} />
                            </div>
                            <div className="sys-db-count">
                              <b><bdi>{formatNumber(t.rows)}</bdi></b>
                              <small>سجل</small>
                            </div>
                          </div>
                        );
                      })}
                      {filteredTables.length === 0 && (
                        <div className="sys-empty-inline">لا توجد جداول مطابقة للبحث.</div>
                      )}
                    </div>
                  )}
                </section>
              </div>
            )}

            {/* ════════ 3. BACKUPS ════════ */}
            {tab === 'backups' && (
              <div className="sys-section">
                <section className="sys-backup-hero">
                  <div className="sys-backup-hero-info">
                    <span className="sys-backup-hero-ico" aria-hidden><Lock size={22} /></span>
                    <div>
                      <h2>النسخ الاحتياطية المشفّرة في R2</h2>
                      <p>
                        تصدير مضغوط ومشفّر (<bdi>AES-256-GCM + Gzip</bdi>) لجميع الجداول تلقائياً أول كل شهر أو عند الطلب.
                      </p>
                    </div>
                  </div>
                  <button type="button" className="btn primary sys-btn-ico" disabled={backupBusy} onClick={() => void runBackupNow()}>
                    {backupBusy ? <Loader2 size={16} className="sys-spin" /> : <HardDriveDownload size={16} />}
                    <span>{backupBusy ? 'جارٍ إنشاء النسخة…' : 'إنشاء نسخة احتياطية الآن'}</span>
                  </button>
                </section>

                <section className="sys-card-panel">
                  <div className="sys-panel-head">
                    <div>
                      <h2>سجل النسخ المحفوظة</h2>
                      <p>
                        {backups
                          ? `${formatNumber(backups.snapshots.length)} نسخة في ${backups.bucket}/${backups.prefix}`
                          : 'جارٍ تحميل النسخ الاحتياطية…'}
                      </p>
                    </div>
                  </div>

                  {!backups ? (
                    <div className="sys-list-skeleton" aria-busy="true">
                      {[0, 1, 2].map((k) => <div key={k} className="sys-skeleton-row" />)}
                    </div>
                  ) : backups.snapshots.length === 0 ? (
                    <div className="sys-empty-box">
                      <HardDriveDownload size={32} aria-hidden />
                      <strong>لا توجد نسخ احتياطية محفوظة بعد</strong>
                      <p>اضغط على «إنشاء نسخة احتياطية الآن» لحفظ أول نقطة استعادة مشفّرة في R2.</p>
                    </div>
                  ) : (
                    <div className="sys-snap-list">
                      {backups.snapshots.map((snap) => {
                        const isOpen = expandedSnap === snap.stamp;
                        return (
                          <article key={snap.stamp} className="sys-snap-card">
                            <div className="sys-snap-main">
                              <div className="sys-snap-id">
                                <span className="sys-snap-ico" aria-hidden><Archive size={18} /></span>
                                <div>
                                  <strong dir="ltr">{snap.stamp}</strong>
                                  <small>{formatRelativeDate(snap.created_at)} • {formatShortDate(snap.created_at)}</small>
                                </div>
                              </div>
                              <div className="sys-snap-metrics">
                                <span className="sys-chip here"><bdi>{snap.file_count}</bdi> جدول</span>
                                <span className="sys-mono-val"><bdi>{formatBytes(snap.total_bytes)}</bdi></span>
                              </div>
                              <div className="sys-snap-actions">
                                <button
                                  type="button"
                                  className="btn sys-btn-ico"
                                  onClick={() => setExpandedSnap(isOpen ? null : snap.stamp)}
                                  aria-expanded={isOpen}
                                >
                                  {isOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                                  <span>التفاصيل</span>
                                </button>
                                <button
                                  type="button"
                                  className="btn danger sys-btn-ico"
                                  disabled={deletingSnap === snap.stamp}
                                  onClick={() => void deleteSnapshot(snap.stamp)}
                                  aria-label={`حذف النسخة ${snap.stamp}`}
                                >
                                  {deletingSnap === snap.stamp ? <Loader2 size={15} className="sys-spin" /> : <Trash2 size={15} />}
                                </button>
                              </div>
                            </div>

                            {isOpen && (
                              <div className="sys-snap-files">
                                {snap.files.map((f) => (
                                  <div key={f.key} className="sys-snap-file-row">
                                    <code dir="ltr">{f.name}</code>
                                    <span><bdi>{formatBytes(f.size)}</bdi></span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>
              </div>
            )}

            {/* ════════ 4. FILES (Signature match to Image 2!) ════════ */}
            {tab === 'files' && (
              <div className="sys-section">
                {/* 3 Diagnostic Cards */}
                <div className="sys-diag-grid">
                  <article className="sys-diag-card tone-ok">
                    <div className="sys-diag-body">
                      <span className="sys-diag-ico" aria-hidden><ShieldCheck size={20} /></span>
                      <div>
                        <h3>سلامة الملفات (SHA-256)</h3>
                        <p>مقارنة بصمة كل ملف في R2 بالمسجّلة في D1</p>
                      </div>
                    </div>
                    <button type="button" className="sys-diag-btn" disabled={verifying} onClick={() => void runVerifyFiles()}>
                      {verifying ? <Loader2 size={15} className="sys-spin" /> : null}
                      <span>{verifying ? 'جارٍ الفحص…' : 'فحص'}</span>
                    </button>
                  </article>

                  <article className="sys-diag-card tone-theme">
                    <div className="sys-diag-body">
                      <span className="sys-diag-ico" aria-hidden><Cloud size={20} /></span>
                      <div>
                        <h3>التخزين المشفّر في R2</h3>
                        <p>
                          {filesData
                            ? `${formatNumber(filesData.total_files)} ملف نشط • ${formatBytes(filesData.total_bytes)}`
                            : 'كل المرفقات والصور مشفّرة في R2'}
                        </p>
                      </div>
                    </div>
                    <button type="button" className="sys-diag-btn is-primary" onClick={() => void loadFiles()}>
                      <span>تحديث الجرد</span>
                    </button>
                  </article>

                  <article className="sys-diag-card tone-amber">
                    <div className="sys-diag-body">
                      <span className="sys-diag-ico" aria-hidden><Sparkles size={20} /></span>
                      <div>
                        <h3>ملفات يتيمة في R2</h3>
                        <p>ملفات بلا سجل مرتبط في قاعدة البيانات</p>
                      </div>
                    </div>
                    <button type="button" className="sys-diag-btn" disabled={scanningOrphans} onClick={() => void runScanOrphans()}>
                      {scanningOrphans ? <Loader2 size={15} className="sys-spin" /> : null}
                      <span>{scanningOrphans ? 'جارٍ الفحص…' : 'فحص'}</span>
                    </button>
                  </article>
                </div>

                {/* SHA-256 Verify Result Drawer */}
                {verifyResult && (
                  <div className={`sys-result-banner ${verifyResult.ok ? 'is-ok' : 'is-warn'}`} role="status">
                    {verifyResult.ok ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
                    <div className="sys-result-body">
                      <strong>
                        {verifyResult.ok
                          ? `كل الملفات المفحوصة سليمة (${formatNumber(verifyResult.verified)} من ${formatNumber(verifyResult.checked)})`
                          : `تم رصد ${formatNumber(verifyResult.missing)} ملف مفقود من أصل ${formatNumber(verifyResult.checked)}`}
                      </strong>
                      <small>
                        إجمالي المراجع في D1: <bdi>{formatNumber(verifyResult.total_referenced)}</bdi> • المدة: <bdi>{verifyResult.duration_ms} ms</bdi>
                      </small>
                    </div>
                    <button type="button" className="sys-dismiss-btn" onClick={() => setVerifyResult(null)} aria-label="إغلاق النتيجة">إخفاء</button>
                  </div>
                )}

                {/* Orphan Scan Result Drawer */}
                {orphanResult && (
                  <div className={`sys-result-banner ${orphanResult.count === 0 ? 'is-ok' : 'is-warn'}`} role="status">
                    {orphanResult.count === 0 ? <CheckCircle2 size={20} /> : <ShieldAlert size={20} />}
                    <div className="sys-result-body">
                      <strong>
                        {orphanResult.count === 0
                          ? 'لا توجد ملفات يتيمة في R2 — التخزين نظيف بالكامل'
                          : `تم العثور على ${formatNumber(orphanResult.count)} ملف يتيم بحجم ${formatBytes(orphanResult.total_bytes)}`}
                      </strong>
                      {orphanResult.count > 0 && (
                        <small>يمكنك حذفها بأمان لتحرير المساحة دون التأثير على أي سجل في النظام.</small>
                      )}
                    </div>
                    {orphanResult.count > 0 ? (
                      <button type="button" className="btn danger sys-btn-ico" disabled={cleaningOrphans} onClick={() => void runCleanupOrphans()}>
                        {cleaningOrphans ? <Loader2 size={14} className="sys-spin" /> : <Trash2 size={14} />}
                        <span>تنظيف اليتيمة</span>
                      </button>
                    ) : (
                      <button type="button" className="sys-dismiss-btn" onClick={() => setOrphanResult(null)}>إخفاء</button>
                    )}
                  </div>
                )}

                {/* File Explorer Panel */}
                <section className="sys-explorer">
                  <div className="sys-explorer-head">
                    <div className="sys-subtabs" role="tablist" aria-label="تصنيفات الملفات">
                      <button type="button" role="tab" aria-selected={fileSubTab === 'expenses'} className={fileSubTab === 'expenses' ? 'is-on' : undefined} onClick={() => setFileSubTab('expenses')}>
                        <FileText size={15} aria-hidden />
                        <span>مرفقات المصاريف</span>
                        {filesData && <b className="sys-subtab-cnt">{filesData.counts.expenses}</b>}
                      </button>
                      <button type="button" role="tab" aria-selected={fileSubTab === 'media'} className={fileSubTab === 'media' ? 'is-on' : undefined} onClick={() => setFileSubTab('media')}>
                        <FileImage size={15} aria-hidden />
                        <span>صور الملفات</span>
                        {filesData && <b className="sys-subtab-cnt">{filesData.counts.media}</b>}
                      </button>
                      <button type="button" role="tab" aria-selected={fileSubTab === 'brand'} className={fileSubTab === 'brand' ? 'is-on' : undefined} onClick={() => setFileSubTab('brand')}>
                        <Building2 size={15} aria-hidden />
                        <span>الهوية والأختام</span>
                        {filesData && <b className="sys-subtab-cnt">{filesData.counts.brand}</b>}
                      </button>
                      <button type="button" role="tab" aria-selected={fileSubTab === 'trash'} className={fileSubTab === 'trash' ? 'is-on' : undefined} onClick={() => setFileSubTab('trash')}>
                        <Trash2 size={15} aria-hidden />
                        <span>سلة المحذوفات</span>
                        {filesData && <b className="sys-subtab-cnt">{filesData.counts.trash}</b>}
                      </button>
                    </div>

                    <div className="sys-explorer-tools">
                      <code className="sys-bucket-path" dir="ltr">
                        {filesData?.bucket ?? 'ahbab-files'}/{fileSubTab === 'expenses' ? 'exp/' : fileSubTab === 'brand' ? 'brand/' : fileSubTab === 'trash' ? 'trash/' : 'media/'}
                      </code>
                      <label className="sys-search sys-search-sm">
                        <Search size={15} aria-hidden />
                        <input value={fileSearch} onChange={(e) => setFileSearch(e.target.value)} placeholder="بحث في الملفات…" />
                      </label>
                    </div>
                  </div>

                  {!filesData ? (
                    <div className="sys-list-skeleton" aria-busy="true">
                      {[0, 1, 2, 3].map((k) => <div key={k} className="sys-skeleton-row" />)}
                    </div>
                  ) : fileSubTab === 'trash' ? (
                    filteredTrash.length === 0 ? (
                      <div className="sys-empty-box">
                        <Trash2 size={30} aria-hidden />
                        <strong>سلة المحذوفات فارغة</strong>
                        <p>لا توجد مرفقات محذوفة حالياً.</p>
                      </div>
                    ) : (
                      <ul className="sys-file-list">
                        {filteredTrash.map((f) => (
                          <li key={f.id} className="sys-file-row">
                            <div className="sys-file-main">
                              <span className="sys-file-ico is-trash" aria-hidden><FileText size={17} /></span>
                              <div className="sys-file-meta">
                                <strong>{f.name}</strong>
                                <div className="sys-file-tech">
                                  <code dir="ltr">{f.key}</code>
                                </div>
                              </div>
                            </div>
                            <div className="sys-file-end">
                              <span className="sys-file-size"><bdi>{formatBytes(f.size)}</bdi></span>
                              <span className="sys-file-date">حُذف {formatRelativeDate(f.deleted_at)}</span>
                              <div className="sys-file-actions">
                                <button
                                  type="button"
                                  className="btn sys-btn-ico"
                                  disabled={trashBusyId === f.id}
                                  onClick={() => void restoreTrashFile(f.id)}
                                >
                                  <RotateCcw size={14} />
                                  <span>استعادة</span>
                                </button>
                                <button
                                  type="button"
                                  className="btn danger sys-btn-ico"
                                  disabled={trashBusyId === f.id}
                                  onClick={() => void purgeTrashFile(f.id, f.name)}
                                  aria-label={`حذف ${f.name} نهائياً`}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )
                  ) : filteredFiles.length === 0 ? (
                    <div className="sys-empty-box">
                      <FolderLock size={30} aria-hidden />
                      <strong>لا توجد ملفات في هذا القسم</strong>
                      <p>الملفات المرفوعة والمشفّرة في R2 ستظهر هنا تلقائياً مع بصمتها وحجمها.</p>
                    </div>
                  ) : (
                    <ul className="sys-file-list">
                      {filteredFiles.map((f) => {
                        const isPdf = f.type === 'application/pdf';
                        return (
                          <li key={f.key} className="sys-file-row">
                            <div className="sys-file-main">
                              <span className={`sys-file-ico${isPdf ? ' is-pdf' : ''}`} aria-hidden>
                                {isPdf ? <FileText size={17} /> : <FileImage size={17} />}
                              </span>
                              <div className="sys-file-meta">
                                <strong>{f.name}</strong>
                                <div className="sys-file-tech">
                                  <code dir="ltr">{f.key}</code>
                                  <span className="sys-hash-pill" title="بصمة الكائن">
                                    <Hash size={11} aria-hidden />
                                    <bdi>{f.etag}</bdi>
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="sys-file-end">
                              <span className="sys-file-size"><bdi>{formatBytes(f.size)}</bdi></span>
                              <span className="sys-file-date" title={formatShortDate(f.uploaded)}>{formatRelativeDate(f.uploaded)}</span>
                              <a
                                href={f.url}
                                target="_blank"
                                rel="noreferrer"
                                className="sys-file-open"
                                aria-label={`فتح ${f.name}`}
                                title="فتح الملف"
                              >
                                <ExternalLink size={15} aria-hidden />
                              </a>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              </div>
            )}

            {/* ════════ 5. PAGES & FOUNDATIONS ════════ */}
            {tab === 'pages' && (
              <div className="sys-section">
                <section className="sys-card-panel">
                  <div className="sys-panel-head">
                    <div>
                      <h2>المؤسسات والصفحات المفعّلة</h2>
                      <p>
                        {foundations
                          ? `${formatNumber(foundations.length)} مؤسسة مسجّلة • التحكم بالصفحات والصلاحيات والدخول المباشر`
                          : 'جارٍ تحميل المؤسسات…'}
                      </p>
                    </div>
                    <button type="button" className="btn primary sys-btn-ico" onClick={() => setAddingFoundation(true)}>
                      <Plus size={16} aria-hidden />
                      <span>مؤسسة جديدة</span>
                    </button>
                  </div>

                  {!foundations ? (
                    <div className="sys-list" aria-busy="true">
                      {[0, 1, 2].map((k) => <div key={k} className="sys-card sys-skeleton" />)}
                    </div>
                  ) : (
                    <ul className="sys-list">
                      {foundations.map((foundation) => {
                        const here = foundation.id === me.foundation_id;
                        const home = foundation.id === me.home_foundation_id;
                        return (
                          <li key={foundation.id} className={`sys-card${foundation.status === 'suspended' ? ' is-off' : ''}`}>
                            <div className="sys-card-top">
                              <span className="sys-card-mark" aria-hidden>
                                {foundation.name.replace(/^(مؤسسة|جمعية)\s+/, '').charAt(0)}
                              </span>
                              <div className="sys-card-name">
                                <strong>{foundation.name}</strong>
                                <small>
                                  {foundation.status === 'active'
                                    ? <span className="sys-chip ok">فعّالة</span>
                                    : <span className="sys-chip off">موقوفة</span>}
                                  {here && <span className="sys-chip here">أنت هنا</span>}
                                </small>
                              </div>
                            </div>

                            <div className="sys-card-stats">
                              <span><Users size={13} aria-hidden /> <bdi>{formatNumber(foundation.users)}</bdi> مستخدم</span>
                              <span><bdi>{formatNumber(foundation.subscribers)}</bdi> مشترك</span>
                              <span><bdi>{foundation.features.length}</bdi> من <bdi>{ALL_FEATURES.length}</bdi> صفحات</span>
                            </div>

                            <div className="sys-feature-pills" aria-label="الصفحات المفعّلة">
                              {foundation.features.slice(0, 5).map((f) => (
                                <span key={f} className="sys-fpill">{FEATURE_LABEL.get(f) ?? f}</span>
                              ))}
                              {foundation.features.length > 5 && (
                                <span className="sys-fpill is-more">+{foundation.features.length - 5}</span>
                              )}
                            </div>

                            <div className="sys-card-actions">
                              <button type="button" className="btn" onClick={() => setEditingFoundation(foundation)}>
                                <SlidersHorizontal size={15} aria-hidden /> الصفحات
                              </button>
                              {!home && (
                                <button
                                  type="button"
                                  className="btn"
                                  disabled={foundationBusyId === foundation.id}
                                  onClick={() => void setFoundationStatus(foundation)}
                                >
                                  {foundation.status === 'active'
                                    ? <><PauseCircle size={15} aria-hidden /> إيقاف</>
                                    : <><PlayCircle size={15} aria-hidden /> تفعيل</>}
                                </button>
                              )}
                              {!here && (
                                <button
                                  type="button"
                                  className="btn primary"
                                  disabled={foundationBusyId === foundation.id}
                                  onClick={() => void enterSelectedFoundation(foundation)}
                                >
                                  <LogIn size={15} aria-hidden /> دخول
                                </button>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              </div>
            )}

            {/* ════════ 6. MAINTENANCE ════════ */}
            {tab === 'maintenance' && (
              <div className="sys-section">
                <div className="sys-maint-grid">
                  <article className="sys-card-panel">
                    <div className="sys-maint-head">
                      <span className="sys-maint-ico tone-amber" aria-hidden><Archive size={20} /></span>
                      <div>
                        <h2>أرشفة السجلات القديمة</h2>
                        <p>نقل السجلات الأقدم من سنتين ({maintData?.archive_cutoff ?? '…'}) إلى جداول الأرشيف لإبقاء الاستعلامات فائقة السرعة.</p>
                      </div>
                    </div>

                    <div className="sys-maint-stats">
                      <div>
                        <span>الحركات المغلقة</span>
                        <b><bdi>{formatNumber(maintData?.eligible.transactions ?? 0)}</bdi></b>
                      </div>
                      <div>
                        <span>الوصفات المكتملة</span>
                        <b><bdi>{formatNumber(maintData?.eligible.prescriptions ?? 0)}</bdi></b>
                      </div>
                      <div>
                        <span>سجل العمليات</span>
                        <b><bdi>{formatNumber(maintData?.eligible.audit_log ?? 0)}</bdi></b>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="btn primary sys-btn-ico"
                      disabled={archiving}
                      onClick={() => void runArchiveNow()}
                    >
                      {archiving ? <Loader2 size={15} className="sys-spin" /> : <Archive size={15} />}
                      <span>{archiving ? 'جارٍ الأرشفة…' : 'تشغيل الأرشفة الآن'}</span>
                    </button>
                  </article>

                  <article className="sys-card-panel">
                    <div className="sys-maint-head">
                      <span className="sys-maint-ico tone-theme" aria-hidden><Cpu size={20} /></span>
                      <div>
                        <h2>الذاكرة المؤقتة (KV Cache)</h2>
                        <p>تحتفظ بقوائم المندوبين والبرامج والإحصاءات المتكررة لتقليل قراءات D1 وتسريع الاستجابة.</p>
                      </div>
                    </div>

                    <div className="sys-maint-stats">
                      <div>
                        <span>المفاتيح النشطة</span>
                        <b><bdi>{formatNumber(maintData?.kv_keys ?? 0)}</bdi></b>
                      </div>
                      <div>
                        <span>حالة الربط</span>
                        <b className="sys-ok-txt">متصل</b>
                      </div>
                      <div>
                        <span>التحديث التلقائي</span>
                        <b>كل دقيقتين</b>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="btn sys-btn-ico"
                      disabled={purgingCache}
                      onClick={() => void runPurgeCache()}
                    >
                      {purgingCache ? <Loader2 size={15} className="sys-spin" /> : <Zap size={15} />}
                      <span>{purgingCache ? 'جارٍ التنظيف…' : 'تنظيف الذاكرة المؤقتة'}</span>
                    </button>
                  </article>
                </div>

                {/* Recent System Audit Log */}
                <section className="sys-card-panel">
                  <div className="sys-panel-head">
                    <div>
                      <h2>آخر عمليات إدارة النظام</h2>
                      <p>سجل إجراءات الصيانة والنسخ الاحتياطي وإدارة المؤسسات</p>
                    </div>
                    <Activity size={18} className="sys-muted-ico" aria-hidden />
                  </div>

                  {!maintData ? (
                    <div className="sys-list-skeleton" aria-busy="true">
                      {[0, 1, 2].map((k) => <div key={k} className="sys-skeleton-row" />)}
                    </div>
                  ) : maintData.recent_logs.length === 0 ? (
                    <div className="sys-empty-inline">لا توجد عمليات مسجّلة في سجل النظام بعد.</div>
                  ) : (
                    <ul className="sys-audit-list">
                      {maintData.recent_logs.map((log) => (
                        <li key={log.id} className="sys-audit-row">
                          <span className="sys-audit-dot" aria-hidden />
                          <div className="sys-audit-body">
                            <strong>{SYSTEM_ACTION_LABELS[log.action] ?? log.action}</strong>
                            <small>{log.full_name ?? 'مدير النظام'}</small>
                          </div>
                          <span className="sys-audit-time">{formatRelativeDate(log.created_at)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* ── Modals ── */}
        {addingFoundation && (
          <NewFoundationModal
            onClose={() => setAddingFoundation(false)}
            onSaved={() => {
              setAddingFoundation(false);
              notify('تم إنشاء المؤسسة بنجاح');
              void Promise.all([loadFoundations(), loadOverview()]);
            }}
          />
        )}
        {editingFoundation && (
          <EditFeaturesModal
            foundation={editingFoundation}
            onClose={() => setEditingFoundation(null)}
            onSaved={() => {
              const wasHere = editingFoundation.id === me.foundation_id;
              setEditingFoundation(null);
              notify('تم تحديث صفحات المؤسسة');
              if (wasHere) location.reload();
              else void loadFoundations();
            }}
          />
        )}

        {/* ── Floating Toast ── */}
        <AnimatePresence>
          {toast && (
            <motion.div
              className={`sys-toast tone-${toast.tone}`}
              role="status"
              initial={{ opacity: 0, y: 18, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.96 }}
              transition={{ duration: 0.2 }}
            >
              {toast.tone === 'ok' ? <CheckCircle2 size={17} /> : toast.tone === 'warn' ? <ShieldAlert size={17} /> : <XCircle size={17} />}
              <span>{toast.text}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}

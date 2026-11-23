import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Activity, ArrowLeft, Banknote, ChevronDown, Eye, LogIn, type LucideIcon, Pencil, Plus, RotateCcw, Trash2, UserRound,
} from 'lucide-react';
import { api, type Me } from '../../api';
import { StateMessage } from '../../components/StateMessage';
import { MONTH_NAMES, formatNumber } from '../../format';

interface Entry {
  id: number;
  action: string;
  entity: string;
  entity_id: number | null;
  detail: string | null;
  created_at: string;
  user_id: number | null;
  user_name: string | null;
  user_role: string | null;
}

type Group = 'all' | 'create' | 'update' | 'delete' | 'money' | 'access';
type Tone = 'create' | 'update' | 'delete' | 'money' | 'access';

const GROUPS: { id: Group; label: string }[] = [
  { id: 'all', label: 'الكل' },
  { id: 'create', label: 'إضافة' },
  { id: 'update', label: 'تعديل' },
  { id: 'delete', label: 'حذف' },
  { id: 'money', label: 'مالية' },
  { id: 'access', label: 'دخول واطّلاع' },
];

const ROLE: Record<string, string> = { admin: 'مدير', accountant: 'محاسب', delegate: 'مندوب', health: 'مسؤول صحي' };
const KIND_IMAGE: Record<string, string> = { logo: 'الشعار', stamp: 'الختم', signature: 'توقيع المحاسب', signature2: 'توقيع المدير' };
const TX_TYPE: Record<string, string> = { general_aid: 'مساعدة عامة', monthly_aid: 'مساعدة شهرية', program_aid: 'مساعدة برنامج', delegate_receipt: 'استلام من مندوب' };
const RX_STATUS: Record<string, string> = { pending: 'قيد المراجعة', approved: 'موافق عليها', dispensed: 'صُرفت', rejected: 'مرفوضة' };

const FIELD: Record<string, string> = {
  full_name: 'الاسم', name: 'الاسم', phone: 'الهاتف', status: 'الحالة', death_date: 'تاريخ الوفاة', delegate_id: 'المندوب',
  family_size: 'عدد الأفراد', monthly_fee: 'الاشتراك الشهري', address: 'العنوان', notes: 'الملاحظات', national_id: 'رقم الهوية',
  category: 'نوع الصرف', amount: 'المبلغ', spent_on: 'التاريخ', details: 'الوصف', beneficiary_name: 'المستفيد',
  role: 'الدور', active: 'الحساب', password: 'كلمة المرور', birth_date: 'تاريخ الميلاد', joined_year: 'سنة الانضمام',
  stamp_place: 'المكان تحت الختم', phones: 'الهواتف', accountant_name: 'اسم المحاسب', manager_name: 'اسم المدير', features: 'الصفحات',
};

interface Detail { label?: string; changes?: Record<string, [unknown, unknown]>; note?: string; text?: string }

// Entries since the activity log hold {label, changes, note}; older ones a plain word or list.
function readDetail(detail: string | null): Detail {
  if (!detail) return {};
  try {
    const parsed = JSON.parse(detail) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>;
      if ('label' in obj || 'changes' in obj || 'note' in obj) return obj as Detail;
      return { changes: obj as Record<string, [unknown, unknown]> };
    }
  } catch { /* plain text */ }
  return { text: detail };
}

function noteJson(note: string | undefined): Record<string, unknown> {
  try { return note ? (JSON.parse(note) as Record<string, unknown>) : {}; } catch { return {}; }
}

const monthLabel = (period: unknown) => {
  const value = String(period ?? '');
  return /^\d{4}-\d{2}$/.test(value) ? `${MONTH_NAMES[Number(value.slice(5, 7)) - 1]} ${value.slice(0, 4)}` : value;
};

function showValue(key: string, value: unknown, currency: string): string {
  if (value === '••') return 'تغيّر';
  if (value === null || value === undefined || value === '') return '—';
  if (key === 'status') return value === 'alive' ? 'حي' : value === 'deceased' ? 'متوفى' : RX_STATUS[String(value)] ?? String(value);
  if (key === 'active') return Number(value) ? 'فعّال' : 'موقوف';
  if (key === 'role') return ROLE[String(value)] ?? String(value);
  if (key === 'amount' || key === 'monthly_fee') return `${formatNumber(Number(value))} ${currency}`;
  if (Array.isArray(value)) return value.join('، ');
  return String(value);
}

// One entry as a sentence: what was done, to what, and its money or month when it has one.
function describe(entry: Entry, detail: Detail, currency: string): { tone: Tone; icon: LucideIcon; verb: string; object?: string; extra?: string } {
  const label = detail.label;
  const note = noteJson(detail.note);
  const money = note.amount !== undefined && note.amount !== null ? `${formatNumber(Number(note.amount))} ${currency}` : undefined;
  const key = `${entry.action}:${entry.entity}`;
  switch (key) {
    case 'create:subscriber': return { tone: 'create', icon: Plus, verb: 'أضاف المشترك', object: label };
    case 'update:subscriber': return { tone: 'update', icon: Pencil, verb: 'عدّل بيانات المشترك', object: label };
    case 'delete:subscriber': return { tone: 'delete', icon: Trash2, verb: 'حذف المشترك', object: label };
    case 'pay:subscriber': return { tone: 'money', icon: Banknote, verb: 'سجّل تسديد', object: label, extra: [monthLabel(note.period), money].filter(Boolean).join(' · ') };
    case 'undo_payment:subscriber': return { tone: 'delete', icon: RotateCcw, verb: 'ألغى تسديد', object: label, extra: [monthLabel(note.period ?? detail.text), money].filter(Boolean).join(' · ') };
    case 'reveal:subscriber': return { tone: 'access', icon: Eye, verb: 'اطّلع على هاتف وهوية المشترك', object: label };
    case 'reveal_phone:subscriber': return { tone: 'access', icon: Eye, verb: 'فتح واتساب المشترك', object: label };
    case 'create_delegate:user': return { tone: 'create', icon: Plus, verb: 'أضاف المندوب', object: label };
    case 'update_profile:user': return { tone: 'update', icon: Pencil, verb: 'عدّل ملف المندوب', object: label };
    case 'update_photo:user': return { tone: 'update', icon: Pencil, verb: 'غيّر صورة المندوب', object: label };
    case 'deactivate:user': return { tone: 'delete', icon: Trash2, verb: 'أوقف حساب المندوب', object: label };
    case 'reveal_phone:user': return { tone: 'access', icon: Eye, verb: 'فتح واتساب المندوب', object: label };
    case 'create:user': return { tone: 'create', icon: Plus, verb: 'أنشأ حساب', object: label, extra: ROLE[String(detail.note)] };
    case 'update:user': return { tone: 'update', icon: Pencil, verb: 'عدّل حساب', object: label };
    case 'change_password:user': return { tone: 'update', icon: Pencil, verb: 'غيّر كلمة المرور' };
    case 'login:user': return { tone: 'access', icon: LogIn, verb: 'سجّل الدخول' };
    case 'login_failed:user': return { tone: 'delete', icon: LogIn, verb: 'محاولة دخول بكلمة مرور خاطئة' };
    case 'create:transaction': return { tone: 'money', icon: Banknote, verb: 'سجّل حركة مالية', object: label, extra: [TX_TYPE[String(note.type)], money].filter(Boolean).join(' · ') };
    case 'delete:transaction': return { tone: 'delete', icon: Trash2, verb: 'حذف حركة مالية', object: label, extra: [TX_TYPE[String(note.type)], money].filter(Boolean).join(' · ') };
    case 'create:expense': return { tone: 'money', icon: Plus, verb: 'أضاف قيد صرف', object: label, extra: money };
    case 'update:expense': return { tone: 'update', icon: Pencil, verb: 'عدّل قيد صرف', object: label };
    case 'delete:expense': return { tone: 'delete', icon: Trash2, verb: 'حذف قيد صرف', object: label, extra: money };
    case 'attach:expense': return { tone: 'create', icon: Plus, verb: 'أرفق ملفاً بقيد صرف', extra: detail.note ?? detail.text };
    case 'detach:expense': return { tone: 'delete', icon: Trash2, verb: 'حذف مرفقاً من قيد صرف', extra: detail.note ?? detail.text };
    case 'create:program': return { tone: 'create', icon: Plus, verb: 'أنشأ البرنامج', object: label };
    case 'enroll:subscriber_program': return { tone: 'create', icon: Plus, verb: 'أضاف إلى برنامج', object: label, extra: detail.note };
    case 'unenroll:subscriber_program': return { tone: 'delete', icon: Trash2, verb: 'أخرج من برنامج', object: label, extra: detail.note };
    case 'create:prescription': return { tone: 'create', icon: Plus, verb: 'أضاف وصفة للمريض', object: label };
    case 'view:prescription': return { tone: 'access', icon: Eye, verb: 'فتح وصفة المريض', object: label };
    case 'update_status:prescription': return { tone: 'update', icon: Pencil, verb: 'غيّر حالة وصفة المريض', object: label };
    case 'delete:prescription': return { tone: 'delete', icon: Trash2, verb: 'حذف وصفة المريض', object: label };
    case 'close_month:closing': return { tone: 'money', icon: Banknote, verb: 'أقفل حسابات شهر', object: monthLabel(detail.text) };
    case 'reopen_month:closing': return { tone: 'update', icon: RotateCcw, verb: 'أعاد فتح شهر', object: monthLabel(detail.text) };
    case 'update_letterhead:foundation': return { tone: 'update', icon: Pencil, verb: 'عدّل بيانات الطباعة' };
    case 'update_image:foundation': return { tone: 'update', icon: Pencil, verb: 'غيّر', object: KIND_IMAGE[String(detail.note ?? detail.text)] };
    case 'remove_image:foundation': return { tone: 'delete', icon: Trash2, verb: 'أزال', object: KIND_IMAGE[String(detail.note ?? detail.text)] };
    case 'system_enter:foundation': return { tone: 'access', icon: LogIn, verb: 'دخل إلى المؤسسة بصفته مدير النظام' };
    case 'create_foundation:foundation': return { tone: 'create', icon: Plus, verb: 'أنشأ المؤسسة', object: detail.text };
    case 'update_foundation:foundation': return { tone: 'update', icon: Pencil, verb: 'عدّل إعدادات المؤسسة' };
    default: return { tone: 'update', icon: Activity, verb: entry.action, object: label ?? detail.text };
  }
}

const dayKey = (iso: string) => new Date(iso).toLocaleDateString('en-CA');
function dayTitle(key: string): string {
  const today = new Date().toLocaleDateString('en-CA');
  const yesterday = new Date(Date.now() - 86_400_000).toLocaleDateString('en-CA');
  if (key === today) return 'اليوم';
  if (key === yesterday) return 'أمس';
  return new Intl.DateTimeFormat('ar-IQ-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${key}T12:00:00`));
}
const timeOf = (iso: string) => new Intl.DateTimeFormat('ar-IQ-u-nu-latn', { hour: 'numeric', minute: '2-digit' }).format(new Date(iso));

function EntryRow({ entry, currency }: { entry: Entry; currency: string }) {
  const [open, setOpen] = useState(false);
  const detail = useMemo(() => readDetail(entry.detail), [entry.detail]);
  const said = describe(entry, detail, currency);
  const changes = Object.entries(detail.changes ?? {}).filter(([key]) => key in FIELD);
  const Icon = said.icon;
  const body: ReactNode = (
    <>
      <span className={`act-dot tone-${said.tone}`} aria-hidden><Icon size={15} /></span>
      <span className="act-text">
        <span className="act-line">
          <b className="act-who">{entry.user_name ?? 'النظام'}</b>{' '}
          <span>{said.verb}</span>
          {said.object && <> <b className="act-object">{said.object}</b></>}
        </span>
        <span className="act-meta">
          <time dateTime={entry.created_at}>{timeOf(entry.created_at)}</time>
          {entry.user_role && <span>{ROLE[entry.user_role] ?? entry.user_role}</span>}
          {said.extra && <span className="act-extra"><bdi>{said.extra}</bdi></span>}
          {changes.length > 0 && (
            <span className="act-count">
              {changes.length === 1 ? 'حقل واحد' : changes.length === 2 ? 'حقلان' : changes.length <= 10 ? `${changes.length} حقول` : `${changes.length} حقلاً`}
            </span>
          )}
        </span>
      </span>
      {changes.length > 0 && <ChevronDown size={16} className={`act-chev${open ? ' is-open' : ''}`} aria-hidden />}
    </>
  );
  return (
    <li className="act-item">
      {changes.length > 0
        ? <button type="button" className="act-row" aria-expanded={open} onClick={() => setOpen((value) => !value)}>{body}</button>
        : <div className="act-row">{body}</div>}
      {open && changes.length > 0 && (
        <dl className="act-changes">
          {changes.map(([key, [before, after]]) => (
            <div key={key}>
              <dt>{FIELD[key]}</dt>
              <dd>
                <span className="act-before"><bdi>{showValue(key, before, currency)}</bdi></span>
                <ArrowLeft size={13} aria-hidden />
                <span className="act-after"><bdi>{showValue(key, after, currency)}</bdi></span>
              </dd>
            </div>
          ))}
        </dl>
      )}
    </li>
  );
}

// سجل العمليات: every save and change in the foundation, newest first, grouped by day.
export function ActivityPage({ me }: { me: Me }) {
  const [group, setGroup] = useState<Group>('all');
  const [userId, setUserId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [items, setItems] = useState<Entry[] | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const [users, setUsers] = useState<{ id: number; full_name: string; role: string }[]>([]);
  const [error, setError] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);

  const query = useCallback((cursor?: number | null) => {
    const params = new URLSearchParams();
    if (group !== 'all') params.set('group', group);
    if (userId) params.set('user', userId);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (cursor) params.set('cursor', String(cursor));
    return `/audit?${params}`;
  }, [group, userId, from, to]);

  const load = useCallback(async () => {
    setError('');
    setItems(null);
    try {
      const data = await api<{ items: Entry[]; next: number | null }>(query());
      setItems(data.items);
      setNext(data.next);
    } catch (failure) {
      setError((failure as Error).message);
    }
  }, [query]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { api<{ items: typeof users }>('/audit/users').then((data) => setUsers(data.items)).catch(() => undefined); }, []);

  const more = async () => {
    if (!next) return;
    setLoadingMore(true);
    try {
      const data = await api<{ items: Entry[]; next: number | null }>(query(next));
      setItems((current) => [...(current ?? []), ...data.items]);
      setNext(data.next);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setLoadingMore(false);
    }
  };

  const days = useMemo(() => {
    const out: { key: string; entries: Entry[] }[] = [];
    for (const entry of items ?? []) {
      const key = dayKey(entry.created_at);
      const last = out[out.length - 1];
      if (last?.key === key) last.entries.push(entry); else out.push({ key, entries: [entry] });
    }
    return out;
  }, [items]);

  const filtered = group !== 'all' || userId || from || to;

  return (
    <div className="act">
      <header className="act-head">
        <span className="act-head-icon" aria-hidden><Activity size={22} /></span>
        <div>
          <h1>سجل العمليات</h1>
          <p>كل إضافة وتعديل وحذف في المؤسسة، بمن قام بها ومتى</p>
        </div>
      </header>

      <section className="act-filters" aria-label="تصفية السجل">
        <div className="act-chips" role="group" aria-label="نوع العملية">
          {GROUPS.map((item) => (
            <button key={item.id} type="button" className={group === item.id ? 'is-on' : undefined} aria-pressed={group === item.id} onClick={() => setGroup(item.id)}>
              {item.label}
            </button>
          ))}
        </div>
        <div className="act-fields">
          <label className="act-field act-user">
            <UserRound size={15} aria-hidden />
            <select value={userId} onChange={(event) => setUserId(event.target.value)} aria-label="المستخدم">
              <option value="">كل المستخدمين</option>
              {users.map((user) => <option key={user.id} value={user.id}>{user.full_name} · {ROLE[user.role] ?? user.role}</option>)}
            </select>
          </label>
          <label className="act-field">
            <span>من</span>
            <input type="date" dir="ltr" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label className="act-field">
            <span>إلى</span>
            <input type="date" dir="ltr" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} />
          </label>
          {filtered && (
            <button type="button" className="act-clear" onClick={() => { setGroup('all'); setUserId(''); setFrom(''); setTo(''); }}>
              مسح التصفية
            </button>
          )}
        </div>
      </section>

      {error ? <StateMessage kind="error" title="تعذّر تحميل السجل" hint={error} onRetry={load} />
        : !items ? (
          <div className="act-day" aria-busy="true">
            {[0, 1, 2, 3, 4].map((key) => <div key={key} className="act-skeleton" />)}
          </div>
        ) : items.length === 0 ? (
          <StateMessage kind="empty" title={filtered ? 'لا توجد عمليات تطابق التصفية' : 'لا توجد عمليات بعد'} />
        ) : (
          <>
            {days.map((day) => (
              <section key={day.key} className="act-day" aria-label={dayTitle(day.key)}>
                <h2 className="act-day-title"><span>{dayTitle(day.key)}</span><small><bdi>{day.entries.length}</bdi> عملية</small></h2>
                <ol className="act-list">
                  {day.entries.map((entry) => <EntryRow key={entry.id} entry={entry} currency={me.currency} />)}
                </ol>
              </section>
            ))}
            {next && (
              <button type="button" className="btn act-more" disabled={loadingMore} onClick={() => void more()}>
                {loadingMore ? 'جارٍ التحميل…' : 'عرض المزيد'}
              </button>
            )}
          </>
        )}
    </div>
  );
}

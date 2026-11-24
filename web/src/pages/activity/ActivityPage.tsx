import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, Banknote, Download, FileText, Lock, LogIn, type LucideIcon, Pencil, Plus, RefreshCw, RotateCcw, Save, Search,
  ShieldAlert, ShieldCheck, Trash2, UserCog, UsersRound, Database, Eye, LogOut,
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
  user_avatar: string | null;
  /** For entries written before details were kept: the record's name (and amount) looked up now. */
  record: { label: string; amount: number | null } | null;
}
interface Stats { logins: number; login_users: number; failed: number; failed_users: number; saves: number; save_users: number; denied: number; denied_users: number }

type Category = 'all' | 'login' | 'accounts' | 'data' | 'money' | 'files' | 'denied';
type Period = 'today' | 'week' | 'month' | 'all';
type Tone = 'create' | 'update' | 'delete' | 'money' | 'access' | 'denied';

const CATEGORIES: { id: Category; label: string; icon: LucideIcon }[] = [
  { id: 'all', label: 'الكل', icon: Activity },
  { id: 'login', label: 'الدخول', icon: LogIn },
  { id: 'accounts', label: 'الحسابات', icon: UserCog },
  { id: 'data', label: 'البيانات', icon: Database },
  { id: 'money', label: 'المالية', icon: Banknote },
  { id: 'files', label: 'الملفات', icon: FileText },
  { id: 'denied', label: 'المرفوضة', icon: ShieldAlert },
];
const PERIODS: { id: Period; label: string; stat: string }[] = [
  { id: 'today', label: 'اليوم', stat: '24 ساعة' },
  { id: 'week', label: '7 أيام', stat: '7 أيام' },
  { id: 'month', label: '30 يوماً', stat: '30 يوماً' },
  { id: 'all', label: 'الكل', stat: 'الكل' },
];
const sinceOf = (period: Period): string | null => {
  if (period === 'all') return null;
  const days = period === 'today' ? 1 : period === 'week' ? 7 : 30;
  return new Date(Date.now() - days * 86_400_000).toISOString();
};

const ROLE: Record<string, string> = { admin: 'مدير', accountant: 'محاسب', delegate: 'مندوب', health: 'مسؤول صحي' };
const KIND_IMAGE: Record<string, string> = { logo: 'الشعار', stamp: 'الختم', signature: 'توقيع المحاسب', signature2: 'توقيع المدير' };
const TX_TYPE: Record<string, string> = { general_aid: 'مساعدة عامة', monthly_aid: 'مساعدة شهرية', program_aid: 'مساعدة برنامج', delegate_receipt: 'استلام من مندوب' };
const RX_STATUS: Record<string, string> = { pending: 'قيد المراجعة', approved: 'موافق عليها', dispensed: 'صُرفت', rejected: 'مرفوضة' };
const FIELD: Record<string, string> = {
  full_name: 'الاسم', name: 'الاسم', phone: 'الهاتف', status: 'الحالة', death_date: 'تاريخ الوفاة', delegate_id: 'المندوب',
  family_size: 'عدد الأفراد', monthly_fee: 'الاشتراك', address: 'العنوان', notes: 'الملاحظات', national_id: 'رقم الهوية',
  category: 'نوع الصرف', amount: 'المبلغ', spent_on: 'التاريخ', details: 'الوصف', beneficiary_name: 'المستفيد',
  role: 'الدور', active: 'الحساب', password: 'كلمة المرور', birth_date: 'تاريخ الميلاد', joined_year: 'سنة الانضمام',
  stamp_place: 'المكان تحت الختم', phones: 'الهواتف', accountant_name: 'اسم المحاسب', manager_name: 'اسم المدير', features: 'الصفحات',
  head_name: 'رب الأسرة', social_status: 'الحالة الاجتماعية', region: 'المنطقة', housing: 'السكن', rent: 'الإيجار', income: 'الدخل',
  ent_salary: 'الراتب الشهري', ent_aid: 'المساعدات', ent_medicine: 'الدواء', ent_checkups: 'الكشفيات', relation: 'الصلة', age: 'العمر',
  gender: 'الجنس', chronic: 'مرض مزمن', condition: 'الحالة المرضية', given_on: 'التاريخ', cash: 'نقد', medicine: 'دواء',
  exams: 'كشفية', doctor: 'الطبيب', delegate: 'المندوب', note: 'التفاصيل',
  kind: 'نوع الطلب', title: 'عنوان الطلب', province: 'المحافظة', area: 'المنطقة', landmark: 'نقطة دالة', members: 'عدد الأفراد', urgent: 'الأولوية', lat: 'خط العرض', lng: 'خط الطول', open_from: 'يُفتح', open_until: 'يُغلق',
};

interface Detail { label?: string; changes?: Record<string, [unknown, unknown]>; note?: string; text?: string }
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
const noteJson = (note: string | undefined): Record<string, unknown> => {
  try { return note ? (JSON.parse(note) as Record<string, unknown>) : {}; } catch { return {}; }
};
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
  if (key === 'gender') return value === 'female' ? 'أنثى' : value === 'male' ? 'ذكر' : String(value);
  if (['amount', 'monthly_fee', 'rent', 'ent_salary', 'ent_aid', 'ent_medicine', 'ent_checkups', 'cash', 'medicine', 'exams'].includes(key)) return `${formatNumber(Number(value))} ${currency}`;
  if (key === 'category' && ['critical', 'intensive', 'stable'].includes(String(value))) return { critical: 'حرجة', intensive: 'متوسطة', stable: 'مستقرة' }[String(value)]!;
  if (Array.isArray(value)) return value.join('، ');
  return String(value);
}

interface Said { tone: Tone; icon: LucideIcon; title: string; tag: string; subject?: string; facts: string[] }

// A patient's aid as «نقد 100,000 د.ع · دواء 45,000 د.ع», leaving out the kinds it did not include.
function aidFacts(note: Record<string, unknown>, currency: string): string[] {
  return (['cash', 'medicine', 'exams'] as const)
    .filter((key) => Number(note[key]) > 0)
    .map((key) => `${FIELD[key]} ${formatNumber(Number(note[key]))} ${currency}`);
}

// One entry, as the reference shows it: a title (what was done), the record it concerns, a tag
// (which part of the system) and a line of facts — each changed field as before ← after.
function describe(entry: Entry, currency: string): Said {
  const detail = readDetail(entry.detail);
  // An entry about the user themselves (signing in, their own photo) needs no second name.
  const self = entry.entity === 'user' && entry.entity_id !== null && entry.entity_id === entry.user_id;
  const subject = self ? undefined : detail.label ?? entry.record?.label ?? undefined;
  const note = noteJson(detail.note);
  const amount = note.amount ?? entry.record?.amount;
  const money = amount !== undefined && amount !== null ? `${formatNumber(Number(amount))} ${currency}` : undefined;
  const changes = Object.entries(detail.changes ?? {})
    .filter(([key]) => key in FIELD)
    .map(([key, [before, after]]) => `${FIELD[key]}: ${showValue(key, before, currency)} ← ${showValue(key, after, currency)}`);
  const base = (tone: Tone, icon: LucideIcon, title: string, tag: string, facts: (string | undefined)[] = []): Said =>
    ({ tone, icon, title, tag, subject, facts: [...facts.filter((f): f is string => !!f), ...changes] });
  switch (`${entry.action}:${entry.entity}`) {
    case 'create:subscriber': return base('create', Plus, 'إضافة مشترك', 'البيانات');
    case 'update:subscriber': return base('update', Pencil, 'تعديل بيانات مشترك', 'البيانات', changes.length ? [] : [detail.text]);
    case 'delete:subscriber': return base('delete', Trash2, 'حذف مشترك', 'البيانات');
    case 'pay:subscriber': return base('money', Banknote, 'تسديد اشتراك', 'المالية', [monthLabel(note.period), money]);
    case 'undo_payment:subscriber': return base('delete', RotateCcw, 'إلغاء تسديد', 'المالية', [monthLabel(note.period ?? detail.text), money]);
    case 'reveal:subscriber': return base('access', Eye, 'اطّلاع على هاتف وهوية مشترك', 'البيانات');
    case 'reveal_phone:subscriber': return base('access', Eye, 'فتح واتساب مشترك', 'البيانات');
    case 'create_delegate:user': return base('create', Plus, 'إضافة مندوب', 'الحسابات');
    case 'update_profile:user': return base('update', Pencil, 'تعديل ملف مندوب', 'الحسابات', changes.length ? [] : [detail.text]);
    case 'update_photo:user': return base('update', Pencil, 'تغيير صورة مندوب', 'الملفات');
    case 'deactivate:user': return base('delete', Trash2, 'إيقاف حساب مندوب', 'الحسابات');
    case 'reveal_phone:user': return base('access', Eye, 'فتح واتساب مندوب', 'الحسابات');
    case 'create:user': return base('create', Plus, 'إنشاء حساب', 'الحسابات', [ROLE[String(detail.note)]]);
    case 'update:user': return base('update', UserCog, 'تعديل حساب', 'الحسابات', changes.length ? [] : [detail.text]);
    case 'change_password:user': return base('update', Lock, 'تغيير كلمة المرور', 'الحسابات');
    case 'login:user': return base('access', LogIn, 'دخول ناجح', 'الدخول');
    case 'login_failed:user': return base('denied', ShieldAlert, 'محاولة دخول فاشلة', 'الدخول', ['كلمة مرور خاطئة']);
    case 'create:transaction': return base('money', Banknote, 'تسجيل حركة مالية', 'المالية', [TX_TYPE[String(note.type)], money]);
    case 'delete:transaction': return base('delete', Trash2, 'حذف حركة مالية', 'المالية', [TX_TYPE[String(note.type)], money]);
    case 'create:expense': return base('money', Plus, 'إضافة قيد صرف', 'المالية', [money]);
    case 'update:expense': return base('update', Pencil, 'تعديل قيد صرف', 'المالية');
    case 'delete:expense': return base('delete', Trash2, 'حذف قيد صرف', 'المالية', [money]);
    case 'attach:expense': return base('create', FileText, 'إرفاق ملف بقيد صرف', 'الملفات', [detail.note ?? detail.text]);
    case 'detach:expense': return base('delete', FileText, 'حذف مرفق من قيد صرف', 'الملفات', [detail.note ?? detail.text]);
    case 'create:program': return base('create', Plus, 'إنشاء برنامج', 'البيانات');
    case 'enroll:subscriber_program': return base('create', Plus, 'إضافة إلى برنامج', 'البيانات', [detail.note]);
    case 'unenroll:subscriber_program': return base('delete', Trash2, 'إخراج من برنامج', 'البيانات', [detail.note]);
    case 'create:prescription': return base('create', Plus, 'إضافة وصفة', 'البيانات');
    case 'view:prescription': return base('access', Eye, 'فتح وصفة', 'البيانات');
    case 'update_status:prescription': return base('update', Pencil, 'تغيير حالة وصفة', 'البيانات');
    case 'delete:prescription': return base('delete', Trash2, 'حذف وصفة', 'البيانات');
    case 'close_month:closing': return base('money', Save, `إقفال حسابات ${monthLabel(detail.text)}`, 'المالية');
    case 'reopen_month:closing': return base('update', RotateCcw, `إعادة فتح ${monthLabel(detail.text)}`, 'المالية');
    case 'update_letterhead:foundation': return base('update', Pencil, 'تعديل بيانات الطباعة', 'البيانات');
    case 'update_image:foundation': return base('update', FileText, `تغيير ${KIND_IMAGE[String(detail.note ?? detail.text)] ?? 'صورة'}`, 'الملفات');
    case 'remove_image:foundation': return base('delete', FileText, `إزالة ${KIND_IMAGE[String(detail.note ?? detail.text)] ?? 'صورة'}`, 'الملفات');
    case 'system_enter:foundation': return base('access', LogIn, 'دخول مدير النظام إلى المؤسسة', 'الدخول');
    case 'create:family': return base('create', Plus, 'إضافة عائلة', 'البيانات', [detail.note]);
    case 'update:family': return base('update', Pencil, 'تعديل ملف عائلة', 'البيانات');
    case 'pay:family': return base('money', Banknote, 'صرف لعائلة', 'المالية', [String(note.type ?? ''), money]);
    case 'visit:family': return base('create', Eye, 'زيارة ميدانية لعائلة', 'البيانات', [detail.note]);
    case 'add_member:family': return base('create', Plus, 'إضافة فرد إلى عائلة', 'البيانات', [detail.note]);
    case 'update_member:family': return base('update', Pencil, `تعديل بيانات ${detail.note ?? 'فرد'}`, 'البيانات');
    case 'remove_member:family': return base('delete', Trash2, 'إزالة فرد من عائلة', 'البيانات', [detail.note]);
    case 'update_photo:family': return base('update', FileText, 'تغيير صورة عائلة', 'الملفات');
    case 'link:family': return base('update', Database, 'ربط العائلة بمؤسسة أخرى', 'البيانات');
    case 'unlink:family': return base('delete', Database, 'فك ربط العائلة', 'البيانات');
    case 'create:patient': return base('create', Plus, 'إضافة مريض', 'البيانات', [detail.note]);
    case 'update:patient': return base('update', Pencil, 'تعديل ملف مريض', 'البيانات');
    case 'delete:patient': return base('delete', Trash2, 'حذف ملف مريض', 'البيانات');
    case 'aid:patient': return base('money', Banknote, 'تسجيل مساعدة لمريض', 'المالية', aidFacts(note, currency));
    case 'update_aid:patient': return base('update', Pencil, 'تعديل مساعدة مريض', 'المالية');
    case 'remove_aid:patient': return base('delete', Trash2, 'حذف مساعدة مريض', 'المالية', aidFacts(note, currency));
    case 'update_photo:patient': return base('update', FileText, 'تغيير صورة مريض', 'الملفات');
    case 'link:patient': return base('update', Database, 'ربط المريض بمؤسسة أخرى', 'البيانات');
    case 'unlink:patient': return base('delete', Database, 'فك ربط المريض', 'البيانات');
    case 'create:help_request': return base('create', Plus, 'طلب مساعدة جديد', 'البيانات', [detail.label]);
    case 'update:help_request': return base('update', Pencil, 'تعديل طلب مساعدة', 'البيانات');
    case 'status:help_request': return base('update', Pencil, 'تغيير حالة طلب مساعدة', 'البيانات');
    case 'delete:help_request': return base('delete', Trash2, 'حذف طلب مساعدة', 'البيانات', [detail.label]);
    case 'create_public:help_request': return base('create', Plus, 'طلب من رابط العائلات', 'البيانات', [detail.label]);
    case 'assign:help_request': return base('update', Pencil, 'إسناد طلب لمندوب', 'البيانات');
    case 'window:help_request': return base('update', Pencil, 'فتح فترة استقبال الطلبات', 'البيانات');
    case 'window_close:help_request': return base('update', Lock, 'إغلاق استقبال الطلبات', 'البيانات');
    case 'window_link:help_request': return base('update', Pencil, 'رابط جديد لاستقبال الطلبات', 'البيانات');
    case 'create_foundation:foundation': return base('create', Plus, 'إنشاء مؤسسة', 'الحسابات', [detail.text]);
    case 'update_foundation:foundation': return base('update', Pencil, 'تعديل إعدادات المؤسسة', 'الحسابات');
    default:
      if (entry.action === 'denied') return { tone: 'denied', icon: ShieldAlert, title: 'تعديل مرفوض', tag: detail.label ?? 'بيانات عامة', facts: [detail.note ?? 'لا يملك صلاحية'] };
      if (entry.action === 'logout') return base('access', LogOut, 'تسجيل خروج', 'الدخول');
      return base('update', Activity, entry.action, 'بيانات عامة', [detail.text]);
  }
}

const dayKey = (iso: string) => new Date(iso).toLocaleDateString('en-CA');
function dayTitle(key: string): string {
  if (key === new Date().toLocaleDateString('en-CA')) return 'اليوم';
  if (key === new Date(Date.now() - 86_400_000).toLocaleDateString('en-CA')) return 'أمس';
  return new Intl.DateTimeFormat('ar-IQ-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${key}T12:00:00`));
}
const timeOf = (iso: string) => new Intl.DateTimeFormat('ar-IQ-u-nu-latn', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
const countLabel = (n: number) => (n === 1 ? 'عملية واحدة' : n === 2 ? 'عمليتان' : n <= 10 ? `${n} عمليات` : `${n} عملية`);
const usersLabel = (n: number, none: string) => (n === 0 ? none : n === 1 ? 'مستخدم واحد' : n === 2 ? 'مستخدمان' : `${n} مستخدمين`);
const initialOf = (name: string | null) => (name ?? 'ن').trim().charAt(0);

// The user's photo, or their initial when there is none or it fails to load.
function Avatar({ entry }: { entry: Entry }) {
  const [broken, setBroken] = useState(false);
  return entry.user_avatar && !broken
    ? <img className="alog-avatar" src={entry.user_avatar} alt="" loading="lazy" width={22} height={22} onError={() => setBroken(true)} />
    : <span className="alog-avatar" aria-hidden>{initialOf(entry.user_name)}</span>;
}

function EntryCard({ entry, currency }: { entry: Entry; currency: string }) {
  const said = describe(entry, currency);
  const Icon = said.icon;
  return (
    <li className={`alog-item tone-${said.tone}`}>
      <span className="alog-icon" aria-hidden><Icon size={17} /></span>
      <article className="alog-card">
        <div className="alog-card-main">
          <div className="alog-title-row">
            <h3>{said.title}</h3>
            <span className="alog-user"><Avatar entry={entry} /><span>{entry.user_name ?? 'النظام'}</span>{entry.user_role && <small>{ROLE[entry.user_role]}</small>}</span>
          </div>
          {(said.subject || said.facts.length > 0) && (
            <p className="alog-facts">
              {said.subject && <b>{said.subject}</b>}
              {said.subject && said.facts.length > 0 && <span className="alog-sep">:</span>}
              {said.facts.map((fact, index) => (
                <span key={index} className="alog-fact"><bdi>{fact}</bdi></span>
              ))}
            </p>
          )}
          <span className="alog-tag">{said.tag}</span>
        </div>
        <time className="alog-time" dateTime={entry.created_at}>{timeOf(entry.created_at)}</time>
      </article>
    </li>
  );
}

function StatCard({ icon: Icon, tone, title, value, note }: { icon: LucideIcon; tone: string; title: string; value: number; note: string }) {
  return (
    <article className={`alog-stat tone-${tone}`}>
      <span className="alog-stat-icon" aria-hidden><Icon size={20} /></span>
      <div>
        <h3>{title}</h3>
        <p><bdi>{formatNumber(value)}</bdi></p>
        <small>{note}</small>
      </div>
    </article>
  );
}

// سجل العمليات: who did what, to which record, when — with every changed field.
export function ActivityPage({ me }: { me: Me }) {
  const [category, setCategory] = useState<Category>('all');
  const [period, setPeriod] = useState<Period>('week');
  const [userId, setUserId] = useState('');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Entry[] | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<{ id: number; full_name: string; role: string }[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'more' | 'export' | null>(null);

  // Typing settles for a moment before the search is sent.
  useEffect(() => { const t = window.setTimeout(() => setQuery(q.trim()), 350); return () => window.clearTimeout(t); }, [q]);

  const params = useCallback((cursor?: number | null) => {
    const p = new URLSearchParams();
    if (category !== 'all') p.set('category', category);
    if (userId) p.set('user', userId);
    const since = sinceOf(period);
    if (since) p.set('since', since);
    if (query) p.set('q', query);
    if (cursor) p.set('cursor', String(cursor));
    return p;
  }, [category, userId, period, query]);

  const load = useCallback(async () => {
    setError('');
    setItems(null);
    try {
      const since = sinceOf(period);
      const [list, figures] = await Promise.all([
        api<{ items: Entry[]; next: number | null }>(`/audit?${params()}`),
        api<Stats>(`/audit/stats${since ? `?since=${encodeURIComponent(since)}` : ''}`),
      ]);
      setItems(list.items);
      setNext(list.next);
      setStats(figures);
    } catch (failure) {
      setError((failure as Error).message);
    }
  }, [params, period]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { api<{ items: typeof users }>('/audit/users').then((d) => setUsers(d.items)).catch(() => undefined); }, []);

  const more = async () => {
    if (!next) return;
    setBusy('more');
    try {
      const data = await api<{ items: Entry[]; next: number | null }>(`/audit?${params(next)}`);
      setItems((current) => [...(current ?? []), ...data.items]);
      setNext(data.next);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(null);
    }
  };

  // The filtered log as a spreadsheet (CSV, opens in Excel), up to 3000 entries.
  const exportCsv = async () => {
    setBusy('export');
    try {
      const rows: Entry[] = [];
      let cursor: number | null = null;
      do {
        const data: { items: Entry[]; next: number | null } = await api(`/audit?${params(cursor)}`);
        rows.push(...data.items);
        cursor = data.next;
      } while (cursor && rows.length < 3000);
      const cell = (value: string) => `"${value.replace(/"/g, '""')}"`;
      const lines = [['التاريخ', 'الوقت', 'المستخدم', 'الدور', 'العملية', 'القسم', 'السجل', 'التفاصيل'].map(cell).join(',')];
      for (const entry of rows) {
        const said = describe(entry, me.currency);
        lines.push([dayKey(entry.created_at), timeOf(entry.created_at), entry.user_name ?? '', ROLE[entry.user_role ?? ''] ?? '',
          said.title, said.tag, said.subject ?? '', said.facts.join(' · ')].map(cell).join(','));
      }
      const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `سجل-العمليات-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (failure) {
      window.alert((failure as Error).message);
    } finally {
      setBusy(null);
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

  const filtered = category !== 'all' || userId || query;

  return (
    <div className="alog">
      <section className="alog-stats" aria-label="ملخص الفترة">
        <StatCard icon={LogIn} tone="ok" title="دخول ناجح" value={stats?.logins ?? 0} note={usersLabel(stats?.login_users ?? 0, 'لا مستخدمين')} />
        <StatCard icon={ShieldCheck} tone="muted" title="محاولات فاشلة" value={stats?.failed ?? 0} note={stats?.failed ? usersLabel(stats.failed_users, '') : 'لا محاولات'} />
        <StatCard icon={Save} tone="info" title="عمليات حفظ" value={stats?.saves ?? 0} note={usersLabel(stats?.save_users ?? 0, 'لا مستخدمين')} />
        <StatCard icon={Lock} tone="bad" title="تعديلات مرفوضة" value={stats?.denied ?? 0} note="محاولات بلا صلاحية" />
      </section>

      <section className="alog-panel" aria-label="سجل العمليات">
        <div className="alog-search-row">
          <label className="alog-search">
            <Search size={17} aria-hidden />
            <input type="search" value={q} onChange={(event) => setQ(event.target.value)} placeholder="ابحث في التفاصيل أو اسم المستخدم…" aria-label="بحث في السجل" />
          </label>
          <label className="alog-users">
            <UsersRound size={16} aria-hidden />
            <select value={userId} onChange={(event) => setUserId(event.target.value)} aria-label="المستخدم">
              <option value="">كل المستخدمين</option>
              {users.map((user) => <option key={user.id} value={user.id}>{user.full_name}</option>)}
            </select>
          </label>
        </div>
        <div className="alog-tools">
          <div className="alog-cats" role="group" aria-label="القسم">
            {CATEGORIES.map((item) => (
              <button key={item.id} type="button" className={category === item.id ? 'is-on' : undefined} aria-pressed={category === item.id} onClick={() => setCategory(item.id)}>
                <item.icon size={15} aria-hidden /> {item.label}
              </button>
            ))}
          </div>
          <div className="alog-actions">
            <div className="alog-periods" role="group" aria-label="الفترة">
              {PERIODS.map((item) => (
                <button key={item.id} type="button" className={period === item.id ? 'is-on' : undefined} aria-pressed={period === item.id} onClick={() => setPeriod(item.id)}>
                  {item.label}
                </button>
              ))}
            </div>
            <button type="button" className="alog-icon-btn" onClick={() => void load()} aria-label="تحديث" title="تحديث"><RefreshCw size={17} /></button>
            <button type="button" className="alog-export" onClick={() => void exportCsv()} disabled={busy === 'export'}>
              <Download size={16} aria-hidden /> {busy === 'export' ? 'جارٍ التصدير…' : 'تصدير'}
            </button>
          </div>
        </div>

        {error ? <StateMessage kind="error" title="تعذّر تحميل السجل" hint={error} onRetry={load} />
          : !items ? (
            <div className="alog-day" aria-busy="true">{[0, 1, 2, 3].map((k) => <div key={k} className="alog-skeleton" />)}</div>
          ) : items.length === 0 ? (
            <StateMessage kind="empty" title={filtered ? 'لا توجد عمليات تطابق البحث' : 'لا توجد عمليات في هذه الفترة'} />
          ) : (
            <>
              {days.map((day) => (
                <section key={day.key} className="alog-day" aria-label={dayTitle(day.key)}>
                  <h2 className="alog-day-head"><span>{dayTitle(day.key)}</span><small>{countLabel(day.entries.length)}</small></h2>
                  <ol className="alog-list">
                    {day.entries.map((entry) => <EntryCard key={entry.id} entry={entry} currency={me.currency} />)}
                  </ol>
                </section>
              ))}
              {next && (
                <button type="button" className="btn alog-more" disabled={busy === 'more'} onClick={() => void more()}>
                  {busy === 'more' ? 'جارٍ التحميل…' : 'عرض المزيد'}
                </button>
              )}
            </>
          )}
      </section>
    </div>
  );
}

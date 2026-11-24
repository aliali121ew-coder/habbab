import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowRight, BriefcaseMedical, CheckCircle2, ChevronLeft, Clock, FileText, Filter, HandHeart,
  Lock, MapPin, Paperclip, Pencil, Phone, Pill, Plus, Search, ShoppingBasket, Sofa, Trash2, Type, User, Users, Wallet,
  Crosshair, type LucideIcon,
} from 'lucide-react';
import { api } from '../../api';
import { StateMessage } from '../../components/StateMessage';

// The map (and its library) loads only when a step or a request needs it.
const PickMap = lazy(() => import('./RequestMap').then((m) => ({ default: m.PickMap })));
const ShowMap = lazy(() => import('./RequestMap').then((m) => ({ default: m.ShowMap })));

/* طلبات المساعدة, after the reference screens: a register with search, status chips and a type
   filter; a sheet that previews a request; a details page where the manager moves the status;
   and a three-step form (type, place, details). Requests are kept on the server, per foundation. */

type Kind = 'general' | 'doctor' | 'medicine' | 'food' | 'money' | 'home';
type Status = 'pending' | 'review' | 'approved' | 'rejected';

const KINDS: { id: Kind; title: string; hint: string; icon: LucideIcon }[] = [
  { id: 'general', title: 'طلب مساعدة عامة', hint: 'تقديم طلب مساعدة عامة لأي احتياج إنساني', icon: HandHeart },
  { id: 'doctor', title: 'حجز طبيب', hint: 'حجز موعد مع طبيب متخصص', icon: BriefcaseMedical },
  { id: 'medicine', title: 'طلب علاج', hint: 'طلب علاج أو دواء أو تغطية تكاليف طبية', icon: Pill },
  { id: 'food', title: 'طلب سلة غذائية', hint: 'طلب سلة غذائية شهرية للأسرة', icon: ShoppingBasket },
  { id: 'money', title: 'طلب مبلغ مالي', hint: 'طلب دعم مالي لتغطية احتياجات عاجلة', icon: Wallet },
  { id: 'home', title: 'طلب مواد منزلية', hint: 'طلب مستلزمات وأثاث منزلي أساسي', icon: Sofa },
];
const kindOf = (id: Kind) => KINDS.find((k) => k.id === id)!;

const STATUS: Record<Status, string> = { pending: 'قيد الانتظار', review: 'قيد المراجعة', approved: 'تمت الموافقة', rejected: 'مرفوض' };
const FILTERS: (Status | 'all')[] = ['all', 'pending', 'review', 'approved', 'rejected'];

const PROVINCES = ['بغداد', 'كربلاء', 'النجف', 'بابل', 'البصرة', 'واسط', 'ذي قار', 'ميسان', 'الديوانية', 'المثنى', 'ديالى', 'صلاح الدين', 'نينوى', 'كركوك', 'الأنبار', 'أربيل', 'السليمانية', 'دهوك'];

interface Request {
  id: number; kind: Kind; title: string; details: string; name: string; phone: string;
  province: string; area: string; landmark: string; members: number; urgent: boolean;
  lat: number | null; lng: number | null; status: Status; createdAt: string;
}

const EDIT_WINDOW = 60 * 60 * 1000; // a request can be changed for one hour after it is sent (the server checks too)
const canEdit = (r: Request) => Date.now() - Date.parse(r.createdAt) < EDIT_WINDOW;

function when(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}  ${p(d.getHours())}:${p(d.getMinutes())}`;
}

type View = { at: 'list' } | { at: 'detail'; id: number } | { at: 'new'; step: 1 | 2 | 3; editing?: number };

export function RequestsPage() {
  const [requests, setRequests] = useState<Request[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [view, setView] = useState<View>({ at: 'list' });
  const [draft, setDraft] = useState<Partial<Request>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoadError('');
    api<{ items: Request[] }>('/requests')
      .then((data) => setRequests(data.items))
      .catch((e: Error) => setLoadError(e.message));
  }, []);
  useEffect(load, [load]);

  const replace = (r: Request) => setRequests((list) => (list ?? []).map((x) => (x.id === r.id ? r : x)));
  const startNew = () => { setError(''); setDraft({ members: 1, urgent: false }); setView({ at: 'new', step: 1 }); };

  async function run<T>(work: () => Promise<T>) {
    setBusy(true); setError('');
    try { return await work(); } catch (e) { setError((e as Error).message); return null; } finally { setBusy(false); }
  }

  if (loadError && !requests) return <div dir="rtl" className="rq"><StateMessage kind="error" title="تعذّر تحميل الطلبات" hint={loadError} onRetry={load} /></div>;
  if (!requests) return <div className="page-loading" aria-busy="true"><span className="boot-star" /></div>;

  if (view.at === 'detail') {
    const r = requests.find((x) => x.id === view.id);
    if (r) {
      return (
        <RequestDetail
          r={r} busy={busy} error={error}
          onBack={() => { setError(''); setView({ at: 'list' }); }}
          onEdit={() => { setError(''); setDraft({ ...r }); setView({ at: 'new', step: 1, editing: r.id }); }}
          onStatus={(status) => run(async () => replace(await api<Request>(`/requests/${r.id}/status`, { method: 'PATCH', body: { status } })))}
          onDelete={() => run(async () => {
            await api(`/requests/${r.id}`, { method: 'DELETE' });
            setRequests((list) => (list ?? []).filter((x) => x.id !== r.id));
            setView({ at: 'list' });
          })}
        />
      );
    }
  }
  if (view.at === 'new') {
    const editing = view.editing;
    return (
      <NewRequest
        step={view.step}
        draft={draft}
        setDraft={setDraft}
        busy={busy}
        error={error}
        editing={!!editing}
        go={(step) => { setError(''); setView(step === 0 ? (editing ? { at: 'detail', id: editing } : { at: 'list' }) : { at: 'new', step, editing }); }}
        onSubmit={() => run(async () => {
          const body = {
            kind: draft.kind, title: draft.title?.trim(), details: draft.details?.trim() || undefined,
            name: draft.name?.trim(), phone: draft.phone?.trim(), province: draft.province, area: draft.area?.trim() || undefined,
            landmark: draft.landmark?.trim() || undefined, members: draft.members ?? 1, urgent: !!draft.urgent,
            lat: draft.lat ?? null, lng: draft.lng ?? null,
          };
          const saved = editing
            ? await api<Request>(`/requests/${editing}`, { method: 'PATCH', body })
            : await api<Request>('/requests', { method: 'POST', body });
          setRequests((list) => (editing ? (list ?? []).map((x) => (x.id === saved.id ? saved : x)) : [saved, ...(list ?? [])]));
          setView({ at: 'detail', id: saved.id });
        })}
      />
    );
  }
  return <RequestList requests={requests} onOpen={(id) => setView({ at: 'detail', id })} onNew={startNew} />;
}

/* ───────────── the register ───────────── */

function RequestList({ requests, onOpen, onNew }: { requests: Request[]; onOpen: (id: number) => void; onNew: () => void }) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<Status | 'all'>('all');
  const [kind, setKind] = useState<Kind | 'all'>('all');
  const [peek, setPeek] = useState<Request | null>(null);

  const shown = useMemo(() => {
    const term = q.trim();
    return requests.filter((r) => (status === 'all' || r.status === status) && (kind === 'all' || r.kind === kind)
      && (!term || [r.title, r.name, r.phone, r.province, r.area].some((v) => v.includes(term))));
  }, [requests, q, status, kind]);

  return (
    <div dir="rtl" className="rq">
      <div className="rq-head">
        <h1>طلبات المساعدة</h1>
        <button type="button" className="rq-primary rq-new-wide" onClick={onNew}><Plus size={18} /> طلب جديد</button>
      </div>

      <label className="rq-search">
        <Search size={18} aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث في الطلبات..." />
      </label>

      <div className="rq-chips" role="tablist">
        {FILTERS.map((f) => (
          <button key={f} type="button" role="tab" aria-selected={status === f} className={status === f ? 'on' : ''} onClick={() => setStatus(f)}>
            {f === 'all' ? 'الكل' : STATUS[f]}
          </button>
        ))}
      </div>

      <div className="rq-bar">
        <span>{shown.length} طلب</span>
        <label className="rq-kind-filter">
          <Filter size={15} aria-hidden />
          <select value={kind} onChange={(e) => setKind(e.target.value as Kind | 'all')} aria-label="النوع">
            <option value="all">النوع</option>
            {KINDS.map((k) => <option key={k.id} value={k.id}>{k.title}</option>)}
          </select>
        </label>
      </div>

      {shown.length === 0 ? (
        <div className="rq-empty">
          <span className="rq-ic kind-general"><HandHeart size={26} /></span>
          <strong>{requests.length ? 'لا توجد طلبات بهذا البحث' : 'لا توجد طلبات بعد'}</strong>
          <small>{requests.length ? 'جرّب كلمة أخرى أو حالة أخرى.' : 'اضغط «طلب جديد» لتقديم أول طلب مساعدة.'}</small>
        </div>
      ) : (
        <ul className="rq-list">
          {shown.map((r) => {
            const k = kindOf(r.kind);
            return (
              <li key={r.id}>
                <button type="button" className={`rq-card kind-${r.kind}`} onClick={() => setPeek(r)}>
                  <span className="rq-card-top">
                    <span className="rq-card-ic"><k.icon size={24} /></span>
                    <span className="rq-card-main">
                      <small className="rq-card-kind">{k.title}</small>
                      <strong>{r.title}</strong>
                    </span>
                    <StatusBadge s={r.status} />
                  </span>
                  <span className="rq-card-body">
                    {r.details && <span className="rq-card-text">{r.details}</span>}
                    <span className="rq-card-tags">
                      <span className="rq-tag"><MapPin size={14} /> {r.province}{r.area ? ` - ${r.area}` : ''}</span>
                      <span className="rq-tag"><Clock size={14} /> {when(r.createdAt)}</span>
                      <span className="rq-tag"><Users size={14} /> {r.members} أفراد</span>
                    </span>
                    <span className="rq-card-foot">
                      <EditLock r={r} />
                      <span className="rq-card-go" aria-hidden><ChevronLeft size={18} /></span>
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <button type="button" className="rq-fab" onClick={onNew}><Plus size={22} /> طلب جديد</button>

      {peek && <PeekSheet r={peek} onClose={() => setPeek(null)} onOpen={() => { setPeek(null); onOpen(peek.id); }} />}
    </div>
  );
}

function PeekSheet({ r, onClose, onOpen }: { r: Request; onClose: () => void; onOpen: () => void }) {
  const k = kindOf(r.kind);
  return (
    <div className="rq-sheet-wrap" onClick={onClose}>
      <div className="rq-sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <span className="rq-grip" aria-hidden />
        <div className={`rq-peek kind-${r.kind}`}>
          <span className={`rq-ic kind-${r.kind}`}><k.icon size={24} /></span>
          <div className="rq-peek-main">
            <small className={`rq-kind-label kind-${r.kind}`}>{k.title}</small>
            <strong>{r.title}</strong>
          </div>
          <StatusBadge s={r.status} />
        </div>
        <ul className="rq-peek-lines">
          <li><User size={16} /> {r.name}</li>
          <li><MapPin size={16} /> {r.province}{r.area ? ` — ${r.area}` : ''}</li>
          <li><Clock size={16} /> {when(r.createdAt)}</li>
          <li className="rq-attach"><Paperclip size={16} /> 0 مرفقات</li>
        </ul>
        <EditLock r={r} />
        <div className="rq-sheet-actions">
          <button type="button" className="rq-ghost" onClick={onClose}>إغلاق</button>
          <button type="button" className={`rq-primary tone-${r.kind}`} onClick={onOpen}>عرض التفاصيل <ChevronLeft size={18} /></button>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ s }: { s: Status }) {
  return <span className={`rq-status st-${s}`}>{s === 'approved' && <CheckCircle2 size={15} />}{STATUS[s]}</span>;
}

function EditLock({ r }: { r: Request }) {
  const open = canEdit(r);
  return (
    <span className={`rq-lock${open ? ' open' : ''}`}>
      {open ? <><Pencil size={14} /> يمكن التعديل خلال ساعة من التقديم</> : <><Lock size={14} /> انتهت مهلة التعديل</>}
    </span>
  );
}

/* ───────────── details ───────────── */

function RequestDetail({ r, busy, error, onBack, onEdit, onStatus, onDelete }: {
  r: Request; busy: boolean; error: string; onBack: () => void; onEdit: () => void;
  onStatus: (s: Status) => void; onDelete: () => void;
}) {
  const k = kindOf(r.kind);
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <div dir="rtl" className="rq rq-detail">
      <div className={`rq-hero kind-${r.kind}`}>
        <button type="button" className="rq-back" onClick={onBack} aria-label="رجوع"><ArrowRight size={22} /></button>
        <div className="rq-hero-row">
          <span className={`rq-ic big kind-${r.kind}`}><k.icon size={28} /></span>
          <div className="rq-hero-main">
            <small className={`rq-kind-label kind-${r.kind}`}>{k.title}</small>
            <h1>{r.title}</h1>
          </div>
          <StatusBadge s={r.status} />
        </div>
      </div>

      <div className="rq-tags">
        <EditLock r={r} />
        <span className="rq-tag"><Clock size={14} /> {when(r.createdAt)}</span>
        <span className="rq-tag"><AlertTriangle size={14} /> {r.urgent ? 'عالية' : 'عادية'}</span>
        <span className="rq-tag"><Users size={14} /> {r.members} أفراد</span>
      </div>

      <section className="rq-box">
        <h2>وصف الطلب</h2>
        <p>{r.details || '—'}</p>
      </section>

      <section className="rq-box">
        <h2>بيانات مقدم الطلب</h2>
        <dl className="rq-dl">
          <dt>الاسم</dt><dd>{r.name}</dd>
          <dt>الهاتف</dt><dd dir="ltr">{r.phone}</dd>
        </dl>
      </section>

      <section className="rq-box">
        <h2>الموقع</h2>
        {r.lat != null && r.lng != null && (
          <Suspense fallback={<div className="rq-map-still" />}><ShowMap lat={r.lat} lng={r.lng} /></Suspense>
        )}
        <PlaceCard r={r} />
        {r.lat != null && r.lng != null && (
          <a className="rq-open-map" href={`https://www.google.com/maps?q=${r.lat},${r.lng}`} target="_blank" rel="noopener noreferrer">
            <MapPin size={16} /> فتح في الخرائط <small dir="ltr">{r.lat.toFixed(5)}, {r.lng.toFixed(5)}</small>
          </a>
        )}
      </section>

      <section className="rq-box">
        <h2>حالة الطلب</h2>
        <div className="rq-status-pick" role="radiogroup" aria-label="حالة الطلب">
          {(Object.keys(STATUS) as Status[]).map((s) => (
            <button key={s} type="button" role="radio" aria-checked={r.status === s} disabled={busy}
              className={`st-${s}${r.status === s ? ' on' : ''}`} onClick={() => r.status !== s && onStatus(s)}>
              {STATUS[s]}
            </button>
          ))}
        </div>
      </section>

      {error && <p className="rq-error" role="alert">{error}</p>}

      <div className="rq-detail-actions">
        {canEdit(r) && <button type="button" className="rq-ghost" onClick={onEdit} disabled={busy}><Pencil size={16} /> تعديل الطلب</button>}
        {confirmDelete ? (
          <span className="rq-confirm">
            حذف هذا الطلب؟
            <button type="button" className="rq-danger" onClick={onDelete} disabled={busy}>نعم، احذف</button>
            <button type="button" className="rq-ghost" onClick={() => setConfirmDelete(false)}>إلغاء</button>
          </span>
        ) : (
          <button type="button" className="rq-ghost rq-del" onClick={() => setConfirmDelete(true)} disabled={busy}><Trash2 size={16} /> حذف</button>
        )}
      </div>
    </div>
  );
}

function PlaceCard({ r }: { r: Partial<Request> }) {
  return (
    <div className="rq-place">
      <span className="rq-place-ic"><Crosshair size={20} /></span>
      <div>
        <strong>{r.province || 'غير محدد'} — {r.area || 'غير محدد'}</strong>
        {r.landmark && <small>{r.landmark}</small>}
      </div>
    </div>
  );
}

/* ───────────── new request: three steps ───────────── */

function NewRequest({ step, draft, setDraft, go, onSubmit, busy, error, editing }: {
  step: 1 | 2 | 3; draft: Partial<Request>; setDraft: (d: Partial<Request>) => void;
  go: (s: 0 | 1 | 2 | 3) => void; onSubmit: () => void; busy: boolean; error: string; editing: boolean;
}) {
  const set = (patch: Partial<Request>) => setDraft({ ...draft, ...patch });
  const [provinceByHand, setProvinceByHand] = useState(editing);
  const title = step === 1 ? 'نوع الطلب' : step === 2 ? 'حدد موقعك' : kindOf(draft.kind ?? 'general').title.replace(/^طلب /, '');
  const ready = (draft.name?.trim().length ?? 0) >= 3 && /^07\d{9}$/.test(draft.phone ?? '') && (draft.title?.trim().length ?? 0) >= 3;

  return (
    <div dir="rtl" className={`rq rq-wizard step-${step}`}>
      <div className="rq-topbar">
        <button type="button" className="rq-back" onClick={() => go((step - 1) as 0 | 1 | 2)} aria-label="رجوع"><ArrowRight size={22} /></button>
        <h1>{title}</h1>
      </div>

      <div className="rq-progress">
        <span>الخطوة {step} من 3</span>
        <span className="rq-track"><i style={{ width: `${(step / 3) * 100}%` }} /></span>
      </div>

      {step === 1 && (
        <>
          <div className="rq-ask">
            <h2>ما نوع المساعدة التي تحتاجها؟</h2>
            <p>اختر النوع الأنسب لحالتك</p>
          </div>
          <div className="rq-kinds">
            {KINDS.map((k) => (
              <button key={k.id} type="button" className={`rq-kind${draft.kind === k.id ? ' on' : ''}`}
                onClick={() => { setDraft({ ...draft, kind: k.id }); go(2); }}>
                <span className={`rq-ic kind-${k.id}`}><k.icon size={24} /></span>
                <strong>{k.title}</strong>
                <small>{k.hint}</small>
              </button>
            ))}
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <Suspense fallback={<div className="rq-map-live" />}>
            <PickMap
              lat={draft.lat}
              lng={draft.lng}
              onMove={(lat, lng, province) => setDraft({
                ...draft, lat, lng,
                // Suggest the province from the point until the person picks one by hand.
                ...(provinceByHand ? {} : { province }),
              })}
            />
          </Suspense>
          <div className="rq-place-sheet">
            <span className="rq-grip" aria-hidden />
            <PlaceCard r={draft} />
            <div className="rq-fields">
              <label className="rq-field">
                <span>المحافظة</span>
                <span className="rq-input"><MapPin size={18} />
                  <select value={draft.province ?? ''} onChange={(e) => { setProvinceByHand(true); set({ province: e.target.value }); }}>
                    <option value="" disabled>اختر المحافظة</option>
                    {PROVINCES.map((p) => <option key={p}>{p}</option>)}
                  </select>
                </span>
              </label>
              <label className="rq-field">
                <span>المنطقة / الحي</span>
                <span className="rq-input"><Crosshair size={18} /><input value={draft.area ?? ''} onChange={(e) => set({ area: e.target.value })} placeholder="مثال: الكرخ" /></span>
              </label>
              <label className="rq-field">
                <span>أقرب نقطة دالة</span>
                <span className="rq-input"><FileText size={18} /><input value={draft.landmark ?? ''} onChange={(e) => set({ landmark: e.target.value })} placeholder="شارع، محلة، قرب..." /></span>
              </label>
            </div>
            <button type="button" className="rq-primary rq-wide" disabled={!draft.province} onClick={() => go(3)}>
              تأكيد الموقع <ChevronLeft size={18} />
            </button>
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <PlaceCard r={draft} />
          <h3 className="rq-section">المعلومات الشخصية</h3>
          <label className="rq-field">
            <span>الاسم الكامل</span>
            <span className="rq-input"><User size={18} /><input value={draft.name ?? ''} onChange={(e) => set({ name: e.target.value })} placeholder="أدخل اسمك الكامل" /></span>
          </label>
          <label className="rq-field">
            <span>رقم الهاتف</span>
            <span className="rq-input"><Phone size={18} /><input dir="ltr" inputMode="numeric" maxLength={11} value={draft.phone ?? ''}
              onChange={(e) => set({ phone: e.target.value.replace(/\D/g, '') })} placeholder="07xxxxxxxxx" /></span>
          </label>

          <h3 className="rq-section">تفاصيل الطلب</h3>
          <label className="rq-field">
            <span>عنوان الطلب</span>
            <span className="rq-input"><Type size={18} /><input value={draft.title ?? ''} onChange={(e) => set({ title: e.target.value })} placeholder="وصف موجز للطلب" /></span>
          </label>
          <label className="rq-field">
            <span>وصف تفصيلي</span>
            <span className="rq-input rq-area"><FileText size={18} /><textarea rows={4} value={draft.details ?? ''} onChange={(e) => set({ details: e.target.value })} placeholder="اشرح حالتك بالتفصيل..." /></span>
          </label>
          <div className="rq-two">
            <label className="rq-field">
              <span>عدد أفراد الأسرة</span>
              <span className="rq-input"><Users size={18} /><input type="number" min={1} max={30} value={draft.members ?? 1} onChange={(e) => set({ members: Math.max(1, Number(e.target.value) || 1) })} /></span>
            </label>
            <label className="rq-field">
              <span>الأولوية</span>
              <span className="rq-input"><AlertTriangle size={18} />
                <select value={draft.urgent ? '1' : '0'} onChange={(e) => set({ urgent: e.target.value === '1' })}>
                  <option value="0">عادية</option>
                  <option value="1">عالية</option>
                </select>
              </span>
            </label>
          </div>

          <div className="rq-submit">
            {error && <p className="rq-error" role="alert">{error}</p>}
            <button type="button" className="rq-primary rq-wide" disabled={!ready || busy} onClick={onSubmit}>
              {busy ? 'جارٍ الحفظ…' : editing ? 'حفظ التعديل' : 'تقديم الطلب'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

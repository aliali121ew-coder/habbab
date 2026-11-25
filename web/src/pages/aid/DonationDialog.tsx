import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  Banknote, Building2, CalendarDays, Check, Gift, Globe2, Hash, Minus, Package, Phone, Plus, StickyNote, Trash2, UserRound, UsersRound, X,
} from 'lucide-react';
import { api } from '../../api';
import { formatNumber, today } from '../../format';
import { attachDialogDismiss, closeTopLayer } from '../expenses/dialogUtils';

export interface Donation {
  id: number;
  donor_name: string;
  donor_type: 'internal' | 'external';
  donor_phone: string | null;
  kind: 'cash' | 'in_kind';
  amount: number | null;
  item: string | null;
  quantity: number | null;
  unit: string | null;
  purpose: string | null;
  received_on: string;
  receipt_no: string | null;
  note: string | null;
  created_by_name?: string | null;
}

export const PURPOSES = ['عامة', 'العوائل المتعففة', 'المرضى', 'الأيتام', 'المناسبات الدينية', 'بناء وترميم'];
const UNITS = ['قطعة', 'سلة', 'كغم', 'كيس', 'كرتونة', 'لتر'];
const QUICK = [25_000, 50_000, 100_000, 250_000, 500_000];
const toDigits = (raw: string) => raw.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[^\d]/g, '');

// Record or correct one donation. Laid out as a proper form: what was given first (money or goods,
// with the amount large and quick amounts to tap), then who gave it, then the details; the actions
// stay in a fixed footer. A full-height sheet on the phone, a centred panel on a computer.
export function DonationDialog({ donation, donors, currency, onClose, onSaved }: {
  donation: Donation | null;
  // Names already in the register, offered as the donor is typed.
  donors: string[];
  currency: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(donation?.donor_name ?? '');
  const [type, setType] = useState<Donation['donor_type']>(donation?.donor_type ?? 'external');
  const [phone, setPhone] = useState(donation?.donor_phone ?? '');
  const [kind, setKind] = useState<Donation['kind']>(donation?.kind ?? 'cash');
  const [amount, setAmount] = useState(donation?.amount ? String(donation.amount) : '');
  const [item, setItem] = useState(donation?.item ?? '');
  const [quantity, setQuantity] = useState(donation?.quantity ? String(donation.quantity) : '');
  const [unit, setUnit] = useState(donation?.unit ?? 'قطعة');
  const [purpose, setPurpose] = useState(donation?.purpose ?? 'عامة');
  const [date, setDate] = useState(donation?.received_on ?? today());
  const [receipt, setReceipt] = useState(donation?.receipt_no ?? '');
  const [note, setNote] = useState(donation?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  // The foundation's delegates, loaded the first time «من داخل المؤسسة» is chosen.
  const [delegates, setDelegates] = useState<{ id: number; full_name: string; phone: string | null }[] | null>(null);
  useEffect(() => {
    if (type !== 'internal' || delegates !== null) return;
    api<{ delegates: { id: number; full_name: string; phone: string | null }[] }>('/donations/delegates')
      .then((result) => setDelegates(result.delegates))
      .catch(() => setDelegates([]));
  }, [type, delegates]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return undefined;
    if (!dialog.open) dialog.showModal();
    const detach = attachDialogDismiss(dialog);
    const closed = () => onClose();
    dialog.addEventListener('close', closed);
    return () => { detach(); dialog.removeEventListener('close', closed); };
  }, [onClose]);

  const close = () => { void closeTopLayer(ref.current); };
  const value = Number(toDigits(amount));
  const qty = Number(quantity) || 0;

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (kind === 'cash' && !value) { setError('اكتب مبلغ التبرع'); return; }
    if (kind === 'in_kind' && item.trim().length < 2) { setError('اكتب ما تم التبرع به'); return; }
    if (name.trim().length < 2) { setError('اكتب اسم المتبرع'); return; }
    setBusy(true);
    const body = {
      donor_name: name.trim(),
      donor_type: type,
      donor_phone: phone.trim() || null,
      kind,
      amount: value || null,
      item: kind === 'in_kind' ? item.trim() : null,
      quantity: kind === 'in_kind' && qty > 0 ? qty : null,
      unit: kind === 'in_kind' ? unit : null,
      purpose: purpose || null,
      received_on: date,
      receipt_no: receipt.trim() || null,
      note: note.trim() || null,
    };
    try {
      if (donation) await api(`/donations/${donation.id}`, { method: 'PATCH', body });
      else await api('/donations', { method: 'POST', body });
      onSaved();
    } catch (failure) {
      setError((failure as Error).message);
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!donation) return;
    setBusy(true);
    try {
      await api(`/donations/${donation.id}`, { method: 'DELETE' });
      onSaved();
    } catch (failure) {
      setError((failure as Error).message);
      setBusy(false);
    }
  };

  const title = donation ? 'تعديل التبرع' : 'تسجيل تبرع';
  const summary = kind === 'cash'
    ? (value ? `${formatNumber(value)} ${currency}` : 'مبلغ مالي')
    : (item ? `${item}${qty ? ` · ${formatNumber(qty)} ${unit}` : ''}` : 'مساعدة عينية');

  return (
    <dialog ref={ref} className="dg" aria-labelledby="dg-title">
      <form className="dg-form" onSubmit={save} noValidate>
        <header className="dg-head">
          <span className="dg-icon" aria-hidden><Gift size={22} /></span>
          <div className="dg-titles">
            <h2 id="dg-title">{title}</h2>
            <p>{donation ? `${donation.donor_name} · ${summary}` : 'سجّل ما وصل للمؤسسة من مال أو مواد'}</p>
          </div>
          <button type="button" className="dg-close" onClick={close} aria-label="إغلاق"><X size={20} aria-hidden /></button>
        </header>

        <div className="dg-body">
          {/* ── What was given ─────────────────────────── */}
          <section className="dg-section" aria-labelledby="dg-what">
            <h3 id="dg-what"><span>1</span> ما الذي وصل؟</h3>
            <div className="dg-kinds" role="radiogroup" aria-label="نوع التبرع">
              <button type="button" role="radio" aria-checked={kind === 'cash'} className="dg-kind" onClick={() => setKind('cash')}>
                <span className="dg-kind-icon cash" aria-hidden><Banknote size={22} /></span>
                <span><b>مبلغ مالي</b><small>نقداً أو تحويل</small></span>
                <Check size={18} className="dg-kind-check" aria-hidden />
              </button>
              <button type="button" role="radio" aria-checked={kind === 'in_kind'} className="dg-kind" onClick={() => setKind('in_kind')}>
                <span className="dg-kind-icon goods" aria-hidden><Package size={22} /></span>
                <span><b>مساعدة عينية</b><small>مواد وأغراض</small></span>
                <Check size={18} className="dg-kind-check" aria-hidden />
              </button>
            </div>

            {kind === 'cash' ? (
              <>
                <label className="dg-amount">
                  <span className="dg-label">المبلغ</span>
                  <span className="dg-amount-box">
                    <input value={value ? formatNumber(value) : ''} onChange={(event) => setAmount(toDigits(event.target.value))} inputMode="numeric" dir="ltr" placeholder="0" aria-label="المبلغ" autoFocus={!donation} />
                    <em>{currency}</em>
                  </span>
                </label>
                <div className="dg-quick" aria-label="مبالغ سريعة">
                  {QUICK.map((step) => (
                    <button key={step} type="button" aria-pressed={value === step} onClick={() => setAmount(String(step))}><bdi>{formatNumber(step)}</bdi></button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <label className="dg-field">
                  <span className="dg-label">المادة</span>
                  <span className="dg-input"><Package size={17} aria-hidden /><input value={item} onChange={(event) => setItem(event.target.value)} maxLength={120} placeholder="سلة غذائية، طحين، ملابس…" /></span>
                </label>
                <div className="dg-grid">
                  <div className="dg-field">
                    <span className="dg-label">الكمية</span>
                    <span className="dg-stepper">
                      <button type="button" aria-label="إنقاص" onClick={() => setQuantity(String(Math.max(qty - 1, 0) || ''))}><Minus size={16} aria-hidden /></button>
                      <input value={quantity} onChange={(event) => setQuantity(event.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" dir="ltr" aria-label="الكمية" placeholder="0" />
                      <button type="button" aria-label="زيادة" onClick={() => setQuantity(String(qty + 1))}><Plus size={16} aria-hidden /></button>
                    </span>
                  </div>
                  <div className="dg-field">
                    <span className="dg-label">الوحدة</span>
                    <div className="dg-chips" role="radiogroup" aria-label="الوحدة">
                      {UNITS.map((option) => <button key={option} type="button" role="radio" aria-checked={unit === option} onClick={() => setUnit(option)}>{option}</button>)}
                    </div>
                  </div>
                </div>
                <label className="dg-field">
                  <span className="dg-label">القيمة التقديرية <small>اختياري</small></span>
                  <span className="dg-input"><Banknote size={17} aria-hidden /><input value={value ? formatNumber(value) : ''} onChange={(event) => setAmount(toDigits(event.target.value))} inputMode="numeric" dir="ltr" placeholder="0" /><em>{currency}</em></span>
                </label>
              </>
            )}
          </section>

          {/* ── Who gave it ─────────────────────────── */}
          <section className="dg-section" aria-labelledby="dg-who">
            <h3 id="dg-who"><span>2</span> من المتبرع؟</h3>
            <div className="dg-switch" role="radiogroup" aria-label="صفة المتبرع">
              <button type="button" role="radio" aria-checked={type === 'external'} onClick={() => setType('external')}><Globe2 size={16} aria-hidden /> من خارج المؤسسة</button>
              <button type="button" role="radio" aria-checked={type === 'internal'} onClick={() => setType('internal')}><Building2 size={16} aria-hidden /> من داخل المؤسسة</button>
            </div>
            {type === 'internal' && (
              <label className="dg-field">
                <span className="dg-label">اختر من المندوبين <small>أو اكتب اسم عضو آخر أدناه</small></span>
                <span className="dg-input dg-select">
                  <UsersRound size={17} aria-hidden />
                  <select
                    value={delegates?.find((person) => person.full_name === name)?.id ?? ''}
                    onChange={(event) => {
                      const person = delegates?.find((row) => row.id === Number(event.target.value));
                      if (!person) return;
                      setName(person.full_name);
                      if (person.phone && !phone) setPhone(person.phone);
                    }}
                    disabled={!delegates}
                  >
                    <option value="">{delegates === null ? 'جارٍ تحميل المندوبين…' : delegates.length ? `المندوبون (${delegates.length})` : 'لا مندوبين مسجّلين'}</option>
                    {(delegates ?? []).map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}
                  </select>
                </span>
              </label>
            )}
            <div className="dg-grid">
              <label className="dg-field">
                <span className="dg-label">اسم المتبرع</span>
                <span className="dg-input"><UserRound size={17} aria-hidden /><input value={name} onChange={(event) => setName(event.target.value)} list="dg-donors" maxLength={120} placeholder="الاسم الكامل أو اسم المحل" /></span>
                <datalist id="dg-donors">{donors.map((donor) => <option key={donor} value={donor} />)}</datalist>
              </label>
              <label className="dg-field">
                <span className="dg-label">الهاتف <small>اختياري</small></span>
                <span className="dg-input"><Phone size={17} aria-hidden /><input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" maxLength={30} dir="ltr" placeholder="07xx xxx xxxx" /></span>
              </label>
            </div>
          </section>

          {/* ── Details ─────────────────────────── */}
          <section className="dg-section" aria-labelledby="dg-details">
            <h3 id="dg-details"><span>3</span> التفاصيل</h3>
            <div className="dg-field">
              <span className="dg-label">الغرض</span>
              <div className="dg-chips" role="radiogroup" aria-label="الغرض">
                {PURPOSES.map((option) => <button key={option} type="button" role="radio" aria-checked={purpose === option} onClick={() => setPurpose(option)}>{option}</button>)}
              </div>
            </div>
            <div className="dg-grid dg-grid-3">
              <label className="dg-field">
                <span className="dg-label">تاريخ الاستلام</span>
                <span className="dg-input"><CalendarDays size={17} aria-hidden /><input type="date" value={date} max={today()} onChange={(event) => setDate(event.target.value)} dir="ltr" /></span>
              </label>
              <label className="dg-field">
                <span className="dg-label">رقم الوصل <small>اختياري</small></span>
                <span className="dg-input"><Hash size={17} aria-hidden /><input value={receipt} onChange={(event) => setReceipt(event.target.value)} maxLength={40} dir="ltr" placeholder="R-0000" /></span>
              </label>
              <label className="dg-field">
                <span className="dg-label">ملاحظة <small>اختياري</small></span>
                <span className="dg-input"><StickyNote size={17} aria-hidden /><input value={note} onChange={(event) => setNote(event.target.value)} maxLength={300} placeholder="أي تفصيل يفيد لاحقاً" /></span>
              </label>
            </div>
          </section>

          {error && <p className="dg-error" role="alert">{error}</p>}
        </div>

        <footer className="dg-foot">
          {donation && (confirmDelete ? (
            <div className="dg-confirm" role="alert">
              <span>حذف هذا التبرع نهائياً؟</span>
              <button type="button" className="dg-danger" onClick={() => { void remove(); }} disabled={busy}>نعم، احذف</button>
              <button type="button" className="dg-ghost" onClick={() => setConfirmDelete(false)}>تراجع</button>
            </div>
          ) : (
            <button type="button" className="dg-delete" onClick={() => setConfirmDelete(true)} aria-label="حذف التبرع" title="حذف التبرع"><Trash2 size={18} aria-hidden /></button>
          ))}
          {!confirmDelete && (
            <div className="dg-actions">
              <button type="button" className="dg-ghost" onClick={close}>إلغاء</button>
              <button type="submit" className="dg-save" disabled={busy}>
                {busy ? 'جارٍ الحفظ…' : <><Check size={18} aria-hidden /> {donation ? 'حفظ التعديل' : 'تسجيل التبرع'}</>}
              </button>
            </div>
          )}
        </footer>
      </form>
    </dialog>
  );
}

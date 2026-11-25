import { useState, type FormEvent } from 'react';
import { Trash2 } from 'lucide-react';
import { api } from '../../api';
import { Modal } from '../../components/Modal';
import { formatNumber, today } from '../../format';

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
const toDigits = (raw: string) => raw.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[^\d]/g, '');

// Record or correct one donation: who gave it (from inside the foundation or outside), and either
// an amount of money or goods with their quantity (and, if known, their value).
export function DonationDialog({ donation, donors, currency, onClose, onSaved }: {
  donation: Donation | null;
  // Names already in the register, offered as the donor is typed.
  donors: string[];
  currency: string;
  onClose: () => void;
  onSaved: () => void;
}) {
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

  const value = Number(toDigits(amount));
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (name.trim().length < 2) { setError('اكتب اسم المتبرع'); return; }
    if (kind === 'cash' && !value) { setError('اكتب مبلغ التبرع'); return; }
    if (kind === 'in_kind' && item.trim().length < 2) { setError('اكتب ما تم التبرع به'); return; }
    setBusy(true);
    const body = {
      donor_name: name.trim(),
      donor_type: type,
      donor_phone: phone.trim() || null,
      kind,
      amount: value || null,
      item: kind === 'in_kind' ? item.trim() : null,
      quantity: kind === 'in_kind' && Number(quantity) > 0 ? Number(quantity) : null,
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

  return (
    <Modal title={donation ? 'تعديل التبرع' : 'تسجيل تبرع'} onClose={onClose}>
      <form className="form bx-form" onSubmit={save}>
        <label className="field">
          <span>المتبرع</span>
          <input value={name} onChange={(event) => setName(event.target.value)} list="aid-donors" maxLength={120} required />
          <datalist id="aid-donors">{donors.map((donor) => <option key={donor} value={donor} />)}</datalist>
        </label>
        <div className="bx-form-row">
          <div className="field">
            <span>صفة المتبرع</span>
            <div className="seg" role="group" aria-label="صفة المتبرع">
              <button type="button" aria-pressed={type === 'external'} onClick={() => setType('external')}>من خارج المؤسسة</button>
              <button type="button" aria-pressed={type === 'internal'} onClick={() => setType('internal')}>من داخلها</button>
            </div>
          </div>
          <label className="field">
            <span>الهاتف</span>
            <input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" maxLength={30} dir="ltr" />
          </label>
        </div>
        <div className="field">
          <span>نوع التبرع</span>
          <div className="seg" role="group" aria-label="نوع التبرع">
            <button type="button" aria-pressed={kind === 'cash'} onClick={() => setKind('cash')}>مبلغ مالي</button>
            <button type="button" aria-pressed={kind === 'in_kind'} onClick={() => setKind('in_kind')}>مساعدة عينية</button>
          </div>
        </div>
        {kind === 'in_kind' && (
          <>
            <label className="field">
              <span>المادة</span>
              <input value={item} onChange={(event) => setItem(event.target.value)} maxLength={120} placeholder="سلة غذائية، طحين، ملابس…" required />
            </label>
            <div className="bx-form-row">
              <label className="field">
                <span>الكمية</span>
                <input value={quantity} onChange={(event) => setQuantity(event.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" dir="ltr" />
              </label>
              <label className="field">
                <span>الوحدة</span>
                <select value={unit} onChange={(event) => setUnit(event.target.value)}>
                  {UNITS.map((option) => <option key={option}>{option}</option>)}
                </select>
              </label>
            </div>
          </>
        )}
        <div className="bx-form-row">
          <label className="field">
            <span>{kind === 'cash' ? `المبلغ (${currency})` : `القيمة التقديرية (${currency}) — اختياري`}</span>
            <input value={value ? formatNumber(value) : ''} onChange={(event) => setAmount(toDigits(event.target.value))} inputMode="numeric" dir="ltr" required={kind === 'cash'} />
          </label>
          <label className="field">
            <span>الغرض</span>
            <select value={purpose} onChange={(event) => setPurpose(event.target.value)}>
              {PURPOSES.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
        </div>
        <div className="bx-form-row">
          <label className="field">
            <span>تاريخ الاستلام</span>
            <input type="date" value={date} max={today()} onChange={(event) => setDate(event.target.value)} dir="ltr" required />
          </label>
          <label className="field">
            <span>رقم الوصل</span>
            <input value={receipt} onChange={(event) => setReceipt(event.target.value)} maxLength={40} dir="ltr" />
          </label>
        </div>
        <label className="field">
          <span>ملاحظة</span>
          <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={300} />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" className="btn primary block" disabled={busy}>
          {busy ? 'جارٍ الحفظ…' : donation ? 'حفظ التعديل' : 'تسجيل التبرع'}
        </button>
        {donation && (confirmDelete ? (
          <div className="bx-confirm">
            <span>حذف هذا التبرع؟</span>
            <button type="button" className="btn bx-danger" onClick={() => { void remove(); }} disabled={busy}>نعم، احذف</button>
            <button type="button" className="btn" onClick={() => setConfirmDelete(false)}>إلغاء</button>
          </div>
        ) : (
          <button type="button" className="btn block bx-danger-ghost" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={16} aria-hidden /> حذف التبرع
          </button>
        ))}
      </form>
    </Modal>
  );
}

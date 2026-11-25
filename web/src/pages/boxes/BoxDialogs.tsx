import { useState, type FormEvent } from 'react';
import { Trash2 } from 'lucide-react';
import { api } from '../../api';
import { Modal } from '../../components/Modal';
import { formatNumber, today } from '../../format';

export interface Delegate { id: number; full_name: string }

export interface Box {
  id: number;
  code: string | null;
  holder_name: string;
  delegate_id: number | null;
  delegate_name?: string | null;
  phone: string | null;
  work: string | null;
  address: string | null;
  delivered_on: string;
  status: 'active' | 'returned';
  notes: string | null;
}

export interface Collection {
  id: number;
  amount: number;
  month: string;
  collected_on: string;
  note: string | null;
  created_by_name?: string | null;
}

const toDigits = (raw: string) => raw.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[^\d]/g, '');

// Add or edit a box: who holds it (a delegate picked from the list, or anyone else by name),
// where it sits and the day it was handed over.
export function BoxDialog({ box, delegates, onClose, onSaved }: {
  box: Box | null;
  delegates: Delegate[];
  onClose: () => void;
  onSaved: (id: number) => void;
}) {
  const [kind, setKind] = useState<'delegate' | 'other'>(box?.delegate_id ? 'delegate' : 'other');
  const [delegateId, setDelegateId] = useState(box?.delegate_id ? String(box.delegate_id) : '');
  const [name, setName] = useState(box?.delegate_id ? '' : box?.holder_name ?? '');
  const [code, setCode] = useState(box?.code ?? '');
  const [phone, setPhone] = useState(box?.phone ?? '');
  const [work, setWork] = useState(box?.work ?? '');
  const [address, setAddress] = useState(box?.address ?? '');
  const [delivered, setDelivered] = useState(box?.delivered_on ?? today());
  const [status, setStatus] = useState<Box['status']>(box?.status ?? 'active');
  const [notes, setNotes] = useState(box?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (kind === 'delegate' && !delegateId) { setError('اختر المندوب'); return; }
    if (kind === 'other' && name.trim().length < 2) { setError('اكتب اسم صاحب الصندوق'); return; }
    setBusy(true);
    const body = {
      holder_name: kind === 'delegate' ? '' : name.trim(),
      delegate_id: kind === 'delegate' ? Number(delegateId) : null,
      code: code.trim() || null,
      phone: phone.trim() || null,
      work: work.trim() || null,
      address: address.trim() || null,
      delivered_on: delivered,
      status,
      notes: notes.trim() || null,
    };
    try {
      if (box) {
        await api(`/boxes/${box.id}`, { method: 'PATCH', body });
        onSaved(box.id);
      } else {
        const result = await api<{ id: number }>('/boxes', { method: 'POST', body });
        onSaved(result.id);
      }
    } catch (failure) {
      setError((failure as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal title={box ? 'تعديل الصندوق' : 'إضافة صندوق'} onClose={onClose}>
      <form className="form bx-form" onSubmit={save}>
        <div className="field">
          <span>صاحب الصندوق</span>
          <div className="seg" role="group" aria-label="صاحب الصندوق">
            <button type="button" aria-pressed={kind === 'other'} onClick={() => setKind('other')}>شخص أو محل</button>
            <button type="button" aria-pressed={kind === 'delegate'} onClick={() => setKind('delegate')} disabled={delegates.length === 0}>مندوب</button>
          </div>
        </div>
        {kind === 'delegate' ? (
          <label className="field">
            <span>المندوب</span>
            <select value={delegateId} onChange={(event) => setDelegateId(event.target.value)} required>
              <option value="">اختر المندوب</option>
              {delegates.map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}
            </select>
          </label>
        ) : (
          <label className="field">
            <span>الاسم</span>
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required />
          </label>
        )}
        <div className="bx-form-row">
          <label className="field">
            <span>العمل / مكان الصندوق</span>
            <input value={work} onChange={(event) => setWork(event.target.value)} maxLength={80} placeholder="محل، صيدلية، جامع…" />
          </label>
          <label className="field">
            <span>رقم الصندوق</span>
            <input value={code} onChange={(event) => setCode(event.target.value)} maxLength={20} dir="ltr" />
          </label>
        </div>
        <div className="bx-form-row">
          <label className="field">
            <span>تاريخ التسليم</span>
            <input type="date" value={delivered} onChange={(event) => setDelivered(event.target.value)} max={today()} dir="ltr" required />
          </label>
          <label className="field">
            <span>الهاتف</span>
            <input value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" maxLength={30} dir="ltr" />
          </label>
        </div>
        <label className="field">
          <span>العنوان</span>
          <input value={address} onChange={(event) => setAddress(event.target.value)} maxLength={160} />
        </label>
        {box && (
          <div className="field">
            <span>الحالة</span>
            <div className="seg" role="group" aria-label="الحالة">
              <button type="button" aria-pressed={status === 'active'} onClick={() => setStatus('active')}>عند صاحبه</button>
              <button type="button" aria-pressed={status === 'returned'} onClick={() => setStatus('returned')}>أُعيد للمؤسسة</button>
            </div>
          </div>
        )}
        <label className="field">
          <span>ملاحظات</span>
          <input value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={300} />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" className="btn primary block" disabled={busy}>
          {busy ? 'جارٍ الحفظ…' : box ? 'حفظ التعديل' : 'إضافة الصندوق'}
        </button>
      </form>
    </Modal>
  );
}

// Record (or correct) one opening of a box: the amount found and the day it was collected.
export function CollectionDialog({ boxId, holder, collection, defaultDate, currency, onClose, onSaved }: {
  boxId: number;
  holder: string;
  collection: Collection | null;
  defaultDate?: string;
  currency: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState(collection ? String(collection.amount) : '');
  const [date, setDate] = useState(collection?.collected_on ?? defaultDate ?? today());
  const [note, setNote] = useState(collection?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const value = Number(toDigits(amount));
    if (!value) { setError('اكتب المبلغ'); return; }
    setBusy(true);
    setError('');
    const body = { amount: value, collected_on: date, note: note.trim() || null };
    try {
      if (collection) await api(`/boxes/collections/${collection.id}`, { method: 'PATCH', body });
      else await api(`/boxes/${boxId}/collections`, { method: 'POST', body });
      onSaved();
    } catch (failure) {
      setError((failure as Error).message);
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!collection) return;
    setBusy(true);
    try {
      await api(`/boxes/collections/${collection.id}`, { method: 'DELETE' });
      onSaved();
    } catch (failure) {
      setError((failure as Error).message);
      setBusy(false);
    }
  };

  const shown = Number(toDigits(amount));
  return (
    <Modal title={collection ? 'تعديل الاستلام' : 'تسجيل استلام'} onClose={onClose}>
      <form className="form bx-form" onSubmit={save}>
        <dl className="facts"><div><dt>الصندوق</dt><dd>{holder}</dd></div></dl>
        <label className="field">
          <span>المبلغ ({currency})</span>
          <input value={amount ? formatNumber(shown) : ''} onChange={(event) => setAmount(toDigits(event.target.value))} inputMode="numeric" dir="ltr" required />
        </label>
        <label className="field">
          <span>تاريخ الاستلام</span>
          <input type="date" value={date} max={today()} onChange={(event) => setDate(event.target.value)} dir="ltr" required />
        </label>
        <label className="field">
          <span>ملاحظة</span>
          <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={200} />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" className="btn primary block" disabled={busy}>
          {busy ? 'جارٍ الحفظ…' : collection ? 'حفظ التعديل' : `تسجيل ${shown ? formatNumber(shown) : ''} ${currency}`}
        </button>
        {collection && (confirmDelete ? (
          <div className="bx-confirm">
            <span>حذف هذا الاستلام؟</span>
            <button type="button" className="btn bx-danger" onClick={() => { void remove(); }} disabled={busy}>نعم، احذف</button>
            <button type="button" className="btn" onClick={() => setConfirmDelete(false)}>إلغاء</button>
          </div>
        ) : (
          <button type="button" className="btn block bx-danger-ghost" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={16} aria-hidden /> حذف الاستلام
          </button>
        ))}
      </form>
    </Modal>
  );
}

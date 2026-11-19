import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { AlertTriangle, ArrowLeftRight, Banknote, MapPin, Phone, UserCheck, UserPlus, UserRound, X } from 'lucide-react';
import { api, ApiError, type DelegateSummary, type Me } from '../../api';
import { formatNumber } from '../../format';

// The usual monthly amounts, one tap each; any other amount goes in the field beside them.
const TIERS = [5000, 10000, 15000, 25000];

interface Conflict {
  id: number;
  full_name: string;
  status: string;
  delegate_id: number | null;
  delegate_name: string | null;
}

interface Props {
  me: Me;
  delegates: DelegateSummary[];
  defaultDelegate: number | null;
  onClose: () => void;
  onSaved: () => void;
}

function Field({ icon, label, hint, children }: { icon: ReactNode; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="add-field">
      <span className="add-field-label"><span aria-hidden>{icon}</span>{label}{hint && <small>{hint}</small>}</span>
      {children}
    </div>
  );
}

// A centred card on every screen: name, monthly category, address, the delegate and an optional
// phone, each in its own card like the subscriber details. (Family size is not asked: it stays 1.)
export function AddSubscriberDialog({ me, delegates, defaultDelegate, onClose, onSaved }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState('');
  const [fee, setFee] = useState(String(TIERS[0]));
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [delegate, setDelegate] = useState(defaultDelegate ? String(defaultDelegate) : '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // The same name already under another delegate: shown before anything is added.
  const [conflicts, setConflicts] = useState<Conflict[] | null>(null);

  const conflictRef = useRef<HTMLDivElement>(null);
  // A changed name or delegate is a new question; the old warning no longer applies.
  useEffect(() => { setConflicts(null); }, [name, delegate]);
  // The warning sits under the form: bring it into view, or a phone shows only the new button.
  useEffect(() => { if (conflicts?.length) conflictRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, [conflicts]);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const delegateName = defaultDelegate !== null ? delegates.find((person) => person.id === defaultDelegate)?.full_name : null;
  const chooseDelegate = me.role === 'admin' && defaultDelegate === null;

  // Where the subscriber is being added: the fixed delegate, the one picked, or none.
  const targetId = defaultDelegate ?? (me.role === 'admin' ? (delegate ? Number(delegate) : null) : me.id);
  const targetName = targetId === null ? null : delegates.find((person) => person.id === targetId)?.full_name ?? (me.role === 'delegate' ? me.full_name : null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await api('/subscribers', {
        method: 'POST',
        body: {
          full_name: name,
          monthly_fee: Number(fee) || 0,
          address: address.trim() || null,
          phone: phone.trim() || null,
          ...(me.role === 'admin' ? { delegate_id: delegate ? Number(delegate) : null } : {}),
          // Sent only after the admin has seen the warning and chosen to add anyway.
          ...(conflicts && me.role === 'admin' ? { confirm_other_delegate: true } : {}),
        },
      });
      onSaved();
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 409 && Array.isArray(failure.data?.conflicts)) {
        setConflicts(failure.data.conflicts as Conflict[]);
      }
      setError((failure as Error).message);
      setBusy(false);
    }
  };

  // Instead of a second copy: the existing subscriber moves to the delegate chosen here.
  const moveHere = async (conflict: Conflict) => {
    if (busy || targetId === null) return;
    setBusy(true);
    setError('');
    try {
      await api(`/subscribers/${conflict.id}`, { method: 'PATCH', body: { delegate_id: targetId } });
      onSaved();
    } catch (failure) {
      setError((failure as Error).message);
      setBusy(false);
    }
  };

  return (
    <dialog ref={ref} className="add-dialog" aria-labelledby="add-dialog-title" onClose={onClose}>
      <form onSubmit={submit}>
        <header className="add-head">
          <span className="add-badge" aria-hidden><UserPlus size={20} /></span>
          <div>
            <h2 id="add-dialog-title">إضافة مشترك</h2>
            <p>{delegateName ? `يُضاف إلى ${delegateName}` : me.role === 'delegate' ? 'يُضاف إلى مشتركيك' : 'مشترك جديد في السجل'}</p>
          </div>
          <button type="button" className="add-close" aria-label="إغلاق" onClick={() => ref.current?.close()}><X size={18} aria-hidden /></button>
        </header>

        <div className="add-body">
          <Field icon={<UserRound size={15} />} label="اسم المشترك">
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="الاسم الثلاثي أو الرباعي" autoComplete="off" required minLength={3} maxLength={120} autoFocus />
          </Field>

          <Field icon={<Banknote size={15} />} label="فئة الاشتراك" hint={`شهرياً، ${me.currency}`}>
            <div className="add-tiers" role="radiogroup" aria-label="فئة الاشتراك">
              {TIERS.map((tier) => (
                <button key={tier} type="button" role="radio" aria-checked={Number(fee) === tier} onClick={() => setFee(String(tier))}>
                  <bdi>{formatNumber(tier)}</bdi>
                </button>
              ))}
              <input
                type="number"
                inputMode="numeric"
                dir="ltr"
                min={0}
                step={250}
                value={fee}
                onChange={(event) => setFee(event.target.value)}
                aria-label="مبلغ آخر"
                required
              />
            </div>
          </Field>

          {/* The same four cards the subscriber details show, two by two. */}
          <div className="add-grid">
            <Field icon={<UserCheck size={15} />} label="المندوب المسؤول">
              {chooseDelegate ? (
                <select value={delegate} onChange={(event) => setDelegate(event.target.value)}>
                  <option value="">بدون مندوب</option>
                  {delegates.map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}
                </select>
              ) : (
                <strong className="add-fixed">{delegateName ?? (me.role === 'delegate' ? me.full_name : 'غير محدد')}</strong>
              )}
            </Field>


            <Field icon={<Phone size={15} />} label="رقم الهاتف" hint="إن وُجد">
              <input type="tel" inputMode="tel" dir="ltr" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="07XXXXXXXXX" autoComplete="off" maxLength={20} />
            </Field>

            <Field icon={<MapPin size={15} />} label="العنوان">
              <input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="المحافظة - القضاء - الحي" autoComplete="off" maxLength={200} />
            </Field>
          </div>

          {conflicts && conflicts.length > 0 ? (
            <div ref={conflictRef} className="add-conflict" role="alert">
              <p className="add-conflict-head">
                <AlertTriangle size={17} aria-hidden />
                <span>هذا الاسم مسجّل عند مندوب آخر. راجِعه قبل الإضافة:</span>
              </p>
              <ul>
                {conflicts.map((conflict) => (
                  <li key={conflict.id}>
                    <div>
                      <strong>{conflict.full_name}</strong>
                      <small>{conflict.status === 'deceased' ? 'متوفى' : 'حي'} · عند <b>{conflict.delegate_name ?? 'بدون مندوب'}</b></small>
                    </div>
                    {targetId !== null && (
                      <button type="button" className="btn" disabled={busy} onClick={() => moveHere(conflict)}>
                        <ArrowLeftRight size={15} aria-hidden /> نقله إلى {targetName ?? 'هذا المندوب'}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              <small>النقل يُبقي سجلّه وتسديداته كما هي، ولا يُضيف نسخة ثانية.</small>
            </div>
          ) : (
            error && <p className="form-error" role="alert">{error}</p>
          )}
        </div>

        <footer className="add-actions">
          <button type="button" className="btn" onClick={() => ref.current?.close()}>إلغاء</button>
          <button type="submit" className={conflicts?.length ? 'btn danger' : 'btn primary'} disabled={busy}>
            <UserPlus size={17} aria-hidden /> {busy ? 'جارٍ الحفظ…' : conflicts?.length ? 'إضافة رغم ذلك' : 'إضافة المشترك'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}

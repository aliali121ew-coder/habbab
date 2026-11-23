import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { HandCoins, Pill, Stethoscope, UserPlus, X } from 'lucide-react';
import { formatNumber } from '../../format';
import type { AidInput, PatientInput } from '../../data/patients';

const today = () => new Date().toISOString().slice(0, 10);
const digits = (text: string) => Number(text.replace(/[^\d]/g, '').replace(/^0+(?=\d)/, '')) || 0;

// A centred sheet with a header, a scrolling body and the buttons at the foot.
function Sheet({ title, sub, icon, onClose, onSubmit, busy, error, submit, children }: {
  title: string; sub: string; icon: ReactNode; onClose: () => void; onSubmit: () => void;
  busy: boolean; error: string; submit: string; children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (ref.current && !ref.current.open) ref.current.showModal(); }, []);
  const send = (event: FormEvent) => { event.preventDefault(); if (!busy) onSubmit(); };
  return (
    <dialog ref={ref} className="pdl" onClose={onClose} aria-labelledby="pdl-title" dir="rtl">
      <form onSubmit={send} className="pdl-form">
        <header className="pdl-head">
          <span className="pdl-head-icon" aria-hidden>{icon}</span>
          <div className="pdl-head-text">
            <h2 id="pdl-title">{title}</h2>
            <p>{sub}</p>
          </div>
          <button type="button" className="pdl-x" onClick={() => ref.current?.close()} aria-label="إغلاق"><X size={18} aria-hidden /></button>
        </header>
        <div className="pdl-body">{children}</div>
        {error && <p className="pdl-error" role="alert">{error}</p>}
        <footer className="pdl-foot">
          <button type="button" className="pdl-cancel" onClick={() => ref.current?.close()}>إلغاء</button>
          <button type="submit" className="pdl-save" disabled={busy}>{busy ? 'جارٍ الحفظ…' : submit}</button>
        </footer>
      </form>
    </dialog>
  );
}

function Field({ label, wide, children, hint }: { label: string; wide?: boolean; children: ReactNode; hint?: string }) {
  return (
    <label className={`pdl-field${wide ? ' wide' : ''}`}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

/** A new patient. The four-part name is what other foundations' files are matched on. */
export function AddPatientDialog({ onClose, onSave }: { onClose: () => void; onSave: (patient: PatientInput) => Promise<void> }) {
  const [form, setForm] = useState({ name: '', gender: '' as '' | 'male' | 'female', age: '', condition: '', phone: '', address: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: event.target.value }));
  const submit = async () => {
    if (form.name.trim().split(/\s+/).length < 3) { setError('اكتب اسم المريض الرباعي (ثلاثة أسماء على الأقل).'); return; }
    setBusy(true);
    setError('');
    try {
      await onSave({
        name: form.name.trim(),
        gender: form.gender || undefined,
        age: form.age ? digits(form.age) : undefined,
        condition: form.condition.trim() || undefined,
        phone: form.phone.trim() || undefined,
        address: form.address.trim() || undefined,
        notes: form.notes.trim() || undefined,
      });
    } catch (failure) {
      setError((failure as Error).message);
      setBusy(false);
    }
  };
  return (
    <Sheet title="إضافة مريض" sub="ملف جديد في سجل المرضى" icon={<UserPlus size={20} />} onClose={onClose} onSubmit={submit} busy={busy} error={error} submit="حفظ المريض">
      <Field label="اسم المريض الرباعي *" wide hint="يُستخدم لمعرفة إن كان المريض مسجّلاً عند مؤسسة أخرى.">
        <input value={form.name} onChange={set('name')} required minLength={3} maxLength={120} placeholder="مثال: علي حسين كاظم الموسوي" autoComplete="off" />
      </Field>
      <Field label="الجنس">
        <div className="pdl-seg" role="group" aria-label="الجنس">
          {([['male', 'ذكر'], ['female', 'أنثى']] as const).map(([value, label]) => (
            <button key={value} type="button" className={form.gender === value ? 'is-on' : undefined} aria-pressed={form.gender === value}
              onClick={() => setForm((f) => ({ ...f, gender: f.gender === value ? '' : value }))}>{label}</button>
          ))}
        </div>
      </Field>
      <Field label="العمر">
        <input value={form.age} onChange={set('age')} inputMode="numeric" maxLength={3} placeholder="سنة" />
      </Field>
      <Field label="الحالة المرضية" wide>
        <input value={form.condition} onChange={set('condition')} maxLength={120} placeholder="مثال: فشل كلوي — غسيل أسبوعي" />
      </Field>
      <Field label="رقم الهاتف">
        <input value={form.phone} onChange={set('phone')} inputMode="tel" dir="ltr" maxLength={20} placeholder="07xx xxx xxxx" />
      </Field>
      <Field label="العنوان">
        <input value={form.address} onChange={set('address')} maxLength={200} placeholder="المنطقة / الحي" />
      </Field>
      <Field label="ملاحظات" wide>
        <textarea value={form.notes} onChange={set('notes')} maxLength={1000} rows={2} placeholder="ما يحتاج المندوب معرفته عن الحالة" />
      </Field>
    </Sheet>
  );
}

/** One visit's aid: any of cash, medicine bought and the exam fee, with who saw the patient. */
export function AidDialog({ patientName, currency, initial, onClose, onSave }: {
  patientName: string; currency: string; initial?: AidInput; onClose: () => void; onSave: (aid: AidInput) => Promise<void>;
}) {
  const [date, setDate] = useState(initial?.date ?? today());
  const [amounts, setAmounts] = useState({
    cash: initial?.cash ? String(initial.cash) : '',
    medicine: initial?.medicine ? String(initial.medicine) : '',
    exams: initial?.exams ? String(initial.exams) : '',
  });
  const [doctor, setDoctor] = useState(initial?.doctor ?? '');
  const [delegate, setDelegate] = useState(initial?.delegate ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const total = digits(amounts.cash) + digits(amounts.medicine) + digits(amounts.exams);
  const amount = (key: keyof typeof amounts) => (event: { target: { value: string } }) => {
    const value = digits(event.target.value);
    setAmounts((a) => ({ ...a, [key]: value ? formatNumber(value) : '' }));
  };
  const submit = async () => {
    if (total <= 0) { setError('أدخل مبلغاً واحداً على الأقل: نقد أو دواء أو كشفية.'); return; }
    setBusy(true);
    setError('');
    try {
      await onSave({ date, cash: digits(amounts.cash), medicine: digits(amounts.medicine), exams: digits(amounts.exams), doctor: doctor.trim(), delegate: delegate.trim(), note: note.trim() });
    } catch (failure) {
      setError((failure as Error).message);
      setBusy(false);
    }
  };
  const kinds = [
    ['cash', 'مبلغ نقدي', HandCoins, 'tone-amber'],
    ['medicine', 'شراء دواء', Pill, 'tone-teal'],
    ['exams', 'كشفية طبية', Stethoscope, 'tone-rose'],
  ] as const;
  return (
    <Sheet title={initial ? 'تعديل مساعدة' : 'تسجيل مساعدة'} sub={patientName} icon={<HandCoins size={20} />} onClose={onClose} onSubmit={submit} busy={busy} error={error} submit={initial ? 'حفظ التعديل' : 'حفظ المساعدة'}>
      <Field label="تاريخ المساعدة" wide>
        <input type="date" value={date} max={today()} required onChange={(e) => setDate(e.target.value)} dir="ltr" className="pdl-date" />
      </Field>
      <div className="pdl-amounts wide">
        {kinds.map(([key, label, Icon, tone]) => (
          <label key={key} className="pdl-amount">
            <span><span className={`pdl-amount-icon ${tone}`} aria-hidden><Icon size={15} /></span>{label}</span>
            <input value={amounts[key]} onChange={amount(key)} inputMode="numeric" dir="ltr" placeholder="0" aria-label={`${label} (${currency})`} />
          </label>
        ))}
      </div>
      <p className="pdl-total wide">المجموع: <b><bdi>{formatNumber(total)}</bdi> {currency}</b></p>
      <Field label="الطبيب">
        <input value={doctor} onChange={(e) => setDoctor(e.target.value)} maxLength={120} placeholder="اسم الطبيب أو المستشفى" />
      </Field>
      <Field label="المندوب">
        <input value={delegate} onChange={(e) => setDelegate(e.target.value)} maxLength={120} placeholder="من سلّم المساعدة" />
      </Field>
      <Field label="التفاصيل" wide>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2} placeholder="مثال: علاج شهر تشرين الثاني" />
      </Field>
    </Sheet>
  );
}

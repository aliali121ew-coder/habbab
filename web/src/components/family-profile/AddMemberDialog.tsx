import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, HeartPulse, Phone, StickyNote, UserPlus, X } from 'lucide-react';

/** What is stored for a new member (the family store keeps plain records). */
export interface NewMember {
  name: string;
  gender: 'ذكر' | 'أنثى';
  relation: string;
  age: number;
  status: string;
  chronic?: string;
  phone?: string;
  notes?: string;
}

const RELATIONS = {
  ذكر: ['ابن', 'الأب', 'الزوج', 'أخ', 'الجد', 'حفيد'],
  أنثى: ['ابنة', 'الأم', 'الزوجة', 'أخت', 'الجدة', 'حفيدة'],
} as const;
const WORK = ['طالب', 'يعمل', 'عاطل عن العمل', 'ربة منزل', 'متقاعد', 'دون سن الدراسة'] as const;
const STAGES = ['ابتدائي', 'متوسط', 'إعدادي', 'جامعي'] as const;
const HEALTH = ['سليم', 'مرض مزمن', 'إعاقة'] as const;

/** A row of choice chips; one is picked at a time. */
function Chips<T extends string>({ value, options, onChange, label }: { value: T; options: readonly T[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const on = opt === value;
        return (
          <button
            key={opt}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(opt)}
            className="min-h-[36px] rounded-full border px-3.5 text-xs font-bold transition"
            style={on
              ? { backgroundColor: 'var(--fp-primary)', borderColor: 'var(--fp-primary)', color: '#fff' }
              : { backgroundColor: 'var(--fp-card)', borderColor: 'var(--fp-border)', color: 'var(--fp-ink-2)' }}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-xs font-bold" style={{ color: 'var(--fp-ink-2)' }}>{label}</span>
        {hint && <span className="text-[11px]" style={{ color: 'var(--fp-ink-3)' }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

const inputStyle = { backgroundColor: 'var(--fp-muted)', borderColor: 'var(--fp-border)', color: 'var(--fp-ink)' };
const inputClass = 'h-11 w-full rounded-xl border px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--fp-primary)]/30';

/**
 * Add a member to a family: name, gender, relation (with an orphan mark), age, study or work
 * (with the school stage for students), health, an optional phone and a note. On a phone it rises
 * from the bottom as a sheet; on a computer it is a centred dialog.
 */
export function AddMemberDialog({ familyName, onClose, onSave }: { familyName: string; onClose: () => void; onSave: (member: NewMember) => void }) {
  const [name, setName] = useState('');
  const [gender, setGender] = useState<'ذكر' | 'أنثى'>('ذكر');
  const [relation, setRelation] = useState<string>('ابن');
  const [orphan, setOrphan] = useState(false);
  const [age, setAge] = useState('10');
  const [work, setWork] = useState<(typeof WORK)[number]>('طالب');
  const [stage, setStage] = useState<(typeof STAGES)[number]>('ابتدائي');
  const [health, setHealth] = useState<(typeof HEALTH)[number]>('سليم');
  const [healthNote, setHealthNote] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // A new gender changes the relation list; keep the matching relation (ابن ↔ ابنة …).
  const pickGender = (g: 'ذكر' | 'أنثى') => {
    const index = (RELATIONS[gender] as readonly string[]).indexOf(relation);
    setGender(g);
    setRelation(RELATIONS[g][Math.max(0, index)]);
    if (work === 'ربة منزل' && g === 'ذكر') setWork('يعمل');
  };
  const workOptions = WORK.filter((w) => !(w === 'ربة منزل' && gender === 'ذكر'));
  const child = ['ابن', 'ابنة', 'حفيد', 'حفيدة'].includes(relation);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const orphanWord = gender === 'ذكر' ? 'يتيم' : 'يتيمة';
    const studentWord = gender === 'ذكر' ? 'طالب' : 'طالبة';
    onSave({
      name: name.trim(),
      gender,
      relation: orphan && child ? `${relation} ${orphanWord}` : relation,
      age: Math.min(120, Math.max(0, Number(age) || 0)),
      status: work === 'طالب' ? `${studentWord} ${stage}` : work,
      chronic: health === 'سليم' ? undefined : (healthNote.trim() ? `${health}: ${healthNote.trim()}` : health),
      phone: phone.trim() || undefined,
      notes: notes.trim() || undefined,
    });
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 backdrop-blur-xs sm:items-center sm:p-4" role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-member-title"
        onClick={(e) => e.stopPropagation()}
        className="fp-card flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-b-none sm:max-w-lg sm:rounded-b-[inherit]"
      >
        <header className="flex items-center gap-3 border-b px-5 py-4" style={{ borderColor: 'var(--fp-border)' }}>
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl" style={{ backgroundColor: 'var(--fp-primary-soft)', color: 'var(--fp-primary)' }}>
            <UserPlus className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="add-member-title" className="text-[15px] font-extrabold" style={{ color: 'var(--fp-ink)' }}>إضافة فرد للعائلة</h2>
            <p className="truncate text-xs" style={{ color: 'var(--fp-ink-3)' }}>{familyName}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="inline-flex h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: 'var(--fp-muted)', color: 'var(--fp-ink-3)' }}>
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>

        <form id="add-member-form" onSubmit={submit} className="grid flex-1 gap-5 overflow-y-auto px-5 py-5">
          <Field label="الاسم الكامل *">
            <input type="text" required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="الاسم الرباعي" className={inputClass} style={inputStyle} />
          </Field>

          <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-3">
            <Field label="الجنس">
              <Chips label="الجنس" value={gender} options={['ذكر', 'أنثى'] as const} onChange={pickGender} />
            </Field>
            <Field label="العمر" hint="سنة">
              <input type="number" min={0} max={120} inputMode="numeric" dir="ltr" value={age} onChange={(e) => setAge(e.target.value)} className={`${inputClass} text-center font-bold tabular-nums`} style={inputStyle} />
            </Field>
          </div>

          <Field label="صلة القرابة">
            <Chips label="صلة القرابة" value={relation} options={RELATIONS[gender] as readonly string[]} onChange={setRelation} />
            {child && (
              <label className="mt-2.5 inline-flex cursor-pointer items-center gap-2 text-xs font-semibold" style={{ color: 'var(--fp-ink-2)' }}>
                <input type="checkbox" checked={orphan} onChange={(e) => setOrphan(e.target.checked)} className="h-4 w-4 accent-[var(--fp-primary)]" />
                {gender === 'ذكر' ? 'يتيم' : 'يتيمة'} (فقد الأب)
              </label>
            )}
          </Field>

          <Field label="الدراسة / العمل">
            <Chips label="الدراسة أو العمل" value={work} options={workOptions} onChange={setWork} />
            {work === 'طالب' && (
              <div className="mt-2.5 rounded-xl p-2.5" style={{ backgroundColor: 'var(--fp-muted)' }}>
                <span className="mb-1.5 block text-[11px] font-semibold" style={{ color: 'var(--fp-ink-3)' }}>المرحلة الدراسية</span>
                <Chips label="المرحلة الدراسية" value={stage} options={STAGES} onChange={setStage} />
              </div>
            )}
          </Field>

          <Field label="الحالة الصحية">
            <Chips label="الحالة الصحية" value={health} options={HEALTH} onChange={setHealth} />
            {health !== 'سليم' && (
              <div className="relative mt-2.5">
                <HeartPulse className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--fp-rose)' }} aria-hidden />
                <input type="text" value={healthNote} onChange={(e) => setHealthNote(e.target.value)} placeholder={health === 'إعاقة' ? 'نوع الإعاقة' : 'اسم المرض (مثلاً: سكري)'} className={`${inputClass} ps-9`} style={inputStyle} />
              </div>
            )}
          </Field>

          <Field label="رقم الهاتف" hint="اختياري">
            <div className="relative">
              <Phone className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: 'var(--fp-ink-3)' }} aria-hidden />
              <input type="tel" inputMode="tel" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="07xx xxx xxxx" className={`${inputClass} ps-9 text-end tabular-nums`} style={inputStyle} />
            </div>
          </Field>

          <Field label="ملاحظات" hint="اختياري">
            <div className="relative">
              <StickyNote className="pointer-events-none absolute start-3 top-3 h-4 w-4" style={{ color: 'var(--fp-ink-3)' }} aria-hidden />
              <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="أي تفاصيل تهم الملف" className="w-full resize-none rounded-xl border px-3 py-2.5 ps-9 text-sm outline-none focus:ring-2 focus:ring-[var(--fp-primary)]/30" style={inputStyle} />
            </div>
          </Field>
        </form>

        <footer className="flex gap-2 border-t px-5 py-3.5" style={{ borderColor: 'var(--fp-border)', paddingBottom: 'calc(14px + env(safe-area-inset-bottom))' }}>
          <button type="submit" form="add-member-form" className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl text-sm font-bold text-white" style={{ backgroundColor: 'var(--fp-primary)' }}>
            <Check className="h-4 w-4" aria-hidden /> حفظ الفرد
          </button>
          <button type="button" onClick={onClose} className="h-11 rounded-xl border px-5 text-sm font-semibold" style={{ borderColor: 'var(--fp-border)', color: 'var(--fp-ink-2)' }}>
            إلغاء
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

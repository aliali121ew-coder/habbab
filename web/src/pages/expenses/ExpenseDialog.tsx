import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { CalendarDays, FileText, HeartPulse, History, Paperclip, Receipt, Trash2, UserRound, Wallet, X } from 'lucide-react';
import { api } from '../../api';
import { formatNumber, today } from '../../format';
import { compressReceipt } from '../../image';
import { CATEGORIES, CATEGORY_BY_ID, type ExpenseCategory } from './categories';
import {
  BENEFICIARY_STATUSES, defaultStatusForCategory, getExpenseStatus, setExpenseStatus,
  type BeneficiaryStatus,
} from './beneficiaryStatus';
import { attachAccessibleValidation, attachDialogDismiss, closeTopLayer } from './dialogUtils';
import type { ExpenseItem } from './ExpensesPage';

interface Props {
  // The entry being edited, or null for a new one.
  entry: ExpenseItem | null;
  // A day inside the month on screen, for a new entry's date.
  defaultDate: string;
  currency: string;
  onClose: () => void;
  onSaved: () => void;
}

interface Attachment { id: number; name: string; type: string; size: number; url: string }
interface Change { action: string; detail: string | null; created_at: string; user_name: string | null }
interface Detail { files: Attachment[]; history: Change[]; created_at: string; created_by_name: string | null }

const toDigits = (raw: string) => raw
  .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
  .replace(/[^\d]/g, '');

const formatWithCommas = (raw: string) => {
  const digits = toDigits(raw);
  return digits ? Number(digits).toLocaleString('en-US') : '';
};

const FIELD_LABELS: Record<string, string> = {
  category: 'نوع الصرف', amount: 'المبلغ', spent_on: 'التاريخ', details: 'الوصف', beneficiary_name: 'المستفيد',
};

// 2026-11-05T09:12:… → 2026/11/05 09:12, in the viewer's own clock.
const stamp = (iso: string) => {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const showValue = (key: string, value: unknown) => {
  if (value === null || value === undefined || value === '') return '—';
  if (key === 'amount') return formatNumber(Number(value));
  if (key === 'category') return CATEGORY_BY_ID.get(value as ExpenseCategory)?.label ?? String(value);
  return String(value);
};

function describe(change: Change): string[] {
  if (change.action === 'create') return ['أنشأ القيد'];
  if (change.action === 'delete') return ['حذف القيد'];
  if (change.action === 'attach') return [`أرفق «${change.detail ?? ''}»`];
  if (change.action === 'detach') return [`حذف المرفق «${change.detail ?? ''}»`];
  try {
    const fields = JSON.parse(change.detail ?? '{}') as Record<string, [unknown, unknown]>;
    const lines = Object.entries(fields)
      .filter(([key]) => key in FIELD_LABELS)
      .map(([key, [before, after]]) => `${FIELD_LABELS[key]}: ${showValue(key, before)} ← ${showValue(key, after)}`);
    return lines.length ? lines : ['عدّل القيد'];
  } catch {
    return ['عدّل القيد'];
  }
}

// Adds, corrects or removes one spending entry: who received it (a subscriber from the register
// or any named person), what it was for, its receipts, and every change made to it.
export function ExpenseDialog({ entry, defaultDate, currency, onClose, onSaved }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [category, setCategory] = useState<ExpenseCategory>(entry?.category ?? 'cash_gift');
  const [amount, setAmount] = useState(entry ? String(entry.amount) : '');
  const [date, setDate] = useState(entry?.spent_on ?? defaultDate);
  const [details, setDetails] = useState(entry?.details ?? '');
  const [name, setName] = useState(entry?.beneficiary_name ?? '');
  const [personId, setPersonId] = useState<number | null>(entry?.beneficiary_id ?? null);
  const [status, setStatus] = useState<BeneficiaryStatus>(() => (
    entry ? getExpenseStatus(entry.id, entry.category) : defaultStatusForCategory('cash_gift')
  ));
  const [statusTouched, setStatusTouched] = useState(Boolean(entry));
  const [matches, setMatches] = useState<{ id: number; full_name: string }[]>([]);
  const [queued, setQueued] = useState<File[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return undefined;
    if (!dialog.open) dialog.showModal();
    return attachDialogDismiss(dialog);
  }, []);

  useEffect(() => {
    const form = formRef.current;
    if (!form) return undefined;
    return attachAccessibleValidation(form);
  }, []);

  const loadDetail = async () => {
    if (!entry) return;
    try {
      setDetail(await api<Detail>(`/expenses/${entry.id}`));
    } catch (failure) {
      setError((failure as Error).message);
    }
  };
  useEffect(() => { void loadDetail(); }, [entry?.id]);

  // Subscribers whose name starts with what was typed, once three letters are in.
  useEffect(() => {
    if (personId !== null || name.trim().length < 3) { setMatches([]); return undefined; }
    const timer = window.setTimeout(() => {
      api<{ items: { id: number; full_name: string }[] }>('/subscribers/lookup', { method: 'POST', body: { q: name.trim() } })
        .then((page) => setMatches(page.items.slice(0, 6)))
        .catch(() => setMatches([]));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [name, personId]);

  const upload = async (expenseId: number, files: File[]) => {
    for (const file of files) {
      const form = new FormData();
      const blob = await compressReceipt(file);
      form.append('file', blob, file.name);
      await api(`/expenses/${expenseId}/files`, { method: 'POST', form });
    }
  };

  const run = async (request: () => Promise<unknown>, close = true) => {
    setBusy(true);
    setError('');
    try {
      await request();
      if (close) onSaved();
      else { setBusy(false); await loadDetail(); }
    } catch (failure) {
      setError((failure as Error).message);
      setBusy(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const numericAmount = Number(toDigits(amount)) || 0;
    if (numericAmount < 1) {
      setError('يرجى إدخال مبلغ صحيح أكبر من صفر.');
      return;
    }
    const body = {
      category,
      amount: numericAmount,
      spent_on: date,
      details: details.trim(),
      beneficiary_name: name.trim(),
      beneficiary_id: personId,
    };
    void run(async () => {
      if (entry) {
        await api(`/expenses/${entry.id}`, { method: 'PATCH', body });
        setExpenseStatus(entry.id, status);
      } else {
        const created = await api<{ id: number }>('/expenses', { method: 'POST', body });
        setExpenseStatus(created.id, status);
        if (queued.length) await upload(created.id, queued);
      }
    });
  };

  const addFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    event.target.value = '';
    if (!files.length) return;
    if (entry) void run(() => upload(entry.id, files), false);
    else setQueued((current) => [...current, ...files].slice(0, 10));
  };

  const value = Number(toDigits(amount)) || 0;

  return (
    <dialog
      ref={ref}
      className="add-dialog exp-dialog"
      aria-labelledby="exp-dialog-title"
      onClose={onClose}
      {...({ closedby: 'any' } as Record<string, string>)}
    >
      <form ref={formRef} onSubmit={submit}>
        <header className="add-head">
          <span className="add-badge" aria-hidden><Receipt size={20} /></span>
          <div>
            <h2 id="exp-dialog-title">{entry ? 'تعديل قيد صرف' : 'إضافة صرف'}</h2>
            <p>
              {entry && detail
                ? `قيد رقم ${entry.id} · أدخله ${detail.created_by_name ?? '—'} في ${stamp(detail.created_at)}`
                : entry ? `قيد رقم ${entry.id}` : 'يُسجَّل في جدول صرفيات شهره'}
            </p>
          </div>
          <button type="button" className="add-close" aria-label="إغلاق" onClick={() => void closeTopLayer(ref.current)}><X size={18} aria-hidden /></button>
        </header>

        <div className="add-body exp-dlg-body">
          <div className="exp-grid-2">
            <label className="add-field">
              <span className="add-field-label"><span aria-hidden><Receipt size={14} /></span>نوع الصرف</span>
              <select
                className="exp-select"
                value={category}
                onChange={(event) => {
                  const next = event.target.value as ExpenseCategory;
                  setCategory(next);
                  if (!statusTouched) setStatus(defaultStatusForCategory(next));
                }}
                required
              >
                {CATEGORIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
            <label className="add-field">
              <span className="add-field-label"><span aria-hidden><CalendarDays size={14} /></span>تاريخ الصرف</span>
              <input type="date" dir="ltr" value={date} max={today()} onChange={(event) => setDate(event.target.value)} data-error="exp-date-error" required />
              <span id="exp-date-error" className="exp-field-error">يرجى اختيار تاريخ صحيح لا يتجاوز اليوم.</span>
            </label>
          </div>

          <div className="exp-grid-person">
            <div className="add-field exp-person">
              <span className="add-field-label">
                <span aria-hidden><UserRound size={14} /></span>المستفيد
                <small>{personId !== null ? 'من سجل المشتركين' : 'من السجل أو اسم جديد'}</small>
              </span>
              <input
                value={name}
                onChange={(event) => { setName(event.target.value); setPersonId(null); }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape' && matches.length > 0) {
                    event.preventDefault();
                    event.stopPropagation();
                    setMatches([]);
                  }
                }}
                placeholder="اسم المستفيد أو الجهة"
                required
                minLength={2}
                maxLength={120}
                autoComplete="off"
                aria-label="المستفيد"
                data-error="exp-person-error"
              />
              <span id="exp-person-error" className="exp-field-error">يرجى إدخال اسم المستفيد (حرفان على الأقل).</span>
              {matches.length > 0 && (
                <ul className="exp-matches" role="listbox" aria-label="مشتركون مطابقون">
                  {matches.map((person) => (
                    <li key={person.id}>
                      <button type="button" role="option" aria-selected={false} onClick={() => { setName(person.full_name); setPersonId(person.id); setMatches([]); }}>
                        {person.full_name}<small>#{person.id}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <label className="add-field">
              <span className="add-field-label">
                <span aria-hidden><Wallet size={14} /></span>المبلغ
                <small>{value > 0 ? `${formatNumber(value)} ${currency}` : currency}</small>
              </span>
              <input
                type="text"
                inputMode="numeric"
                dir="ltr"
                value={formatWithCommas(amount)}
                onChange={(event) => setAmount(toDigits(event.target.value))}
                placeholder="0"
                required
                aria-label="المبلغ"
                data-error="exp-amount-error"
              />
              <span id="exp-amount-error" className="exp-field-error">يرجى إدخال مبلغ صحيح أكبر من صفر.</span>
            </label>
          </div>

          <div className="exp-grid-2">
            <div className="add-field">
              <span className="add-field-label"><span aria-hidden><HeartPulse size={14} /></span>حالة المستفيد</span>
              <div className="exp-status-picker" role="radiogroup" aria-label="حالة المستفيد">
                {BENEFICIARY_STATUSES.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={status === opt.id}
                    className={`exp-status-opt ${opt.id}${status === opt.id ? ' on' : ''}`}
                    onClick={() => { setStatus(opt.id); setStatusTouched(true); }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="add-field">
              <span className="add-field-label"><span aria-hidden><FileText size={14} /></span>الوصف</span>
              <input value={details} onChange={(event) => setDetails(event.target.value)} placeholder="مثال: علاج شهري، مساعدة غذائية…" required minLength={2} maxLength={300} autoComplete="off" aria-label="الوصف" data-error="exp-details-error" />
              <span id="exp-details-error" className="exp-field-error">يرجى إدخال وصف للصرف (حرفان على الأقل).</span>
            </label>
          </div>

          <div className="add-field exp-attach-field">
            <div className="exp-attach-bar">
              <span className="add-field-label"><span aria-hidden><Paperclip size={14} /></span>المرفقات<small>صورة أو PDF حتى 2 ميغابايت</small></span>
              <label className="exp-file-pick">
                <Paperclip size={14} aria-hidden /> إرفاق ملف
                <input type="file" accept="image/*,application/pdf" multiple onChange={addFiles} disabled={busy} hidden />
              </label>
            </div>
            {((detail?.files.length ?? 0) > 0 || queued.length > 0) && (
              <ul className="exp-files">
                {detail?.files.map((file) => (
                  <li key={file.id}>
                    <a href={file.url} target="_blank" rel="noopener">{file.name}</a>
                    <small>{Math.max(1, Math.round(file.size / 1024))} ك.ب</small>
                    <button type="button" aria-label={`حذف ${file.name}`} disabled={busy} onClick={() => void run(() => api(`/expenses/${entry!.id}/files/${file.id}`, { method: 'DELETE' }), false)}>
                      <Trash2 size={14} aria-hidden />
                    </button>
                  </li>
                ))}
                {queued.map((file, index) => (
                  <li key={`${file.name}-${index}`} className="queued">
                    <span>{file.name}</span>
                    <small>يُرفع عند الحفظ</small>
                    <button type="button" aria-label={`إزالة ${file.name}`} onClick={() => setQueued((current) => current.filter((_, at) => at !== index))}>
                      <X size={14} aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {entry && detail && detail.history.length > 0 && (
            <details className="exp-history">
              <summary><History size={15} aria-hidden /> سجل التعديلات ({formatNumber(detail.history.length)})</summary>
              <ol>
                {detail.history.map((change, index) => (
                  <li key={index}>
                    <header><b>{change.user_name ?? '—'}</b><time>{stamp(change.created_at)}</time></header>
                    {describe(change).map((line) => <p key={line}>{line}</p>)}
                  </li>
                ))}
              </ol>
            </details>
          )}

          {error && <p className="form-error" role="alert">{error}</p>}
        </div>

        <footer className={`add-actions${entry ? ' with-delete' : ''}`}>
          <button type="button" className="btn" onClick={() => void closeTopLayer(ref.current)}>إلغاء</button>
          {entry && (
            confirmDelete ? (
              <button type="button" className="btn danger" disabled={busy} onClick={() => void run(() => api(`/expenses/${entry.id}`, { method: 'DELETE' }))}>
                <Trash2 size={16} aria-hidden /> تأكيد الحذف
              </button>
            ) : (
              <button type="button" className="btn exp-delete" disabled={busy} onClick={() => setConfirmDelete(true)}>
                <Trash2 size={16} aria-hidden /> حذف
              </button>
            )
          )}
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? 'جارٍ الحفظ…' : entry ? 'حفظ التعديل' : 'إضافة الصرف'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}

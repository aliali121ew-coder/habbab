import { useState, type FormEvent } from 'react';
import { api, type GridRow, type Me } from '../../api';
import { Modal } from '../../components/Modal';
import { MONTH_NAMES, formatNumber, today } from '../../format';

export interface PaymentTarget {
  row: GridRow;
  month: number;
  paid: boolean;
}

interface Props {
  me: Me;
  year: number;
  target: PaymentTarget;
  onClose: () => void;
  onDone: (paid: boolean) => void;
}

export function PaymentDialog({ me, year, target, onClose, onDone }: Props) {
  const { row, month, paid } = target;
  const [amount, setAmount] = useState(String(row.monthly_fee || ''));
  const [date, setDate] = useState(today());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const period = `${year}-${String(month + 1).padStart(2, '0')}`;
  const monthLabel = `${MONTH_NAMES[month]} ${year}`;

  const run = async (action: () => Promise<unknown>, result: boolean) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await action();
      onDone(result);
    } catch (failure) {
      setError((failure as Error).message);
      setBusy(false);
    }
  };

  const pay = (event: FormEvent) => {
    event.preventDefault();
    void run(() => api('/collections/pay', {
      method: 'POST',
      body: { subscriber_id: row.id, period, amount: Number(amount), tx_date: date },
    }), true);
  };

  const undo = () => run(() => api('/collections/undo', {
    method: 'POST',
    body: { subscriber_id: row.id, period },
  }), false);

  if (paid) {
    return (
      <Modal title="تسديد مسجل" onClose={onClose}>
        <dl className="facts">
          <div><dt>المشترك</dt><dd>{row.full_name}</dd></div>
          <div><dt>الشهر</dt><dd>{monthLabel}</dd></div>
          <div><dt>الحالة</dt><dd>مسدد</dd></div>
        </dl>
        {error && <p className="form-error" role="alert">{error}</p>}
        {me.role === 'admin'
          ? <button type="button" className="btn danger block" disabled={busy} onClick={undo}>إلغاء هذا التسديد</button>
          : <p className="hint">لإلغاء تسديد سُجل بالخطأ تواصل مع المدير العام.</p>}
      </Modal>
    );
  }

  return (
    <Modal title="تسجيل تسديد" onClose={onClose}>
      <form className="form" onSubmit={pay}>
        <dl className="facts">
          <div><dt>المشترك</dt><dd>{row.full_name}</dd></div>
          <div><dt>الشهر</dt><dd>{monthLabel}</dd></div>
        </dl>
        <label className="field">
          <span>المبلغ ({me.currency})</span>
          <input type="number" inputMode="numeric" min={1} value={amount} onChange={(event) => setAmount(event.target.value)} dir="ltr" required />
        </label>
        <label className="field">
          <span>تاريخ الاستلام</span>
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} dir="ltr" required />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button type="submit" className="btn primary block" disabled={busy}>
          {busy ? 'جارٍ الحفظ…' : `تأكيد تسديد ${amount ? formatNumber(Number(amount)) : ''} ${me.currency}`}
        </button>
      </form>
    </Modal>
  );
}

import { api } from '../api.js';
import {
  confirmSheet, el, field, form, ltr, money, openSheet, pageHead, recordList, selectOf, session,
  subscriberPicker, thisMonth, toast, today,
} from '../ui.js';

const TITLES = {
  general_aid: 'سجل الصرف العام للعوائل المتعففة',
  monthly_aid: 'سجل الصرفيات الشهرية',
  delegate_receipt: 'سجل استلام المبالغ من المندوبين',
};

function entryForm(type, onSaved) {
  const amount = el('input', { type: 'number', inputMode: 'numeric', min: 1, required: true });
  const date = el('input', { type: 'date', value: today(), required: true });
  const receipt = el('input', { autocomplete: 'off' });
  const note = el('textarea');
  let subscriber = null;
  const isReceipt = type === 'delegate_receipt';
  const delegate = selectOf([['', 'اختر المندوب'], ...session.meta.delegates.map((d) => [d.id, d.full_name])], '');

  return form(async () => {
    const parsed = Number(amount.value);
    if (!isReceipt && !subscriber) throw new Error('اختر المشترك من نتائج البحث');
    await api('/transactions', {
      method: 'POST',
      body: {
        type,
        amount: parsed,
        tx_date: date.value,
        subscriber_id: subscriber?.id ?? null,
        delegate_id: isReceipt && delegate.value ? Number(delegate.value) : null,
        receipt_no: receipt.value || null,
        note: note.value || null,
      },
    });
    toast('تم تسجيل الحركة');
    onSaved();
  }, 'حفظ',
  isReceipt ? field('المندوب', delegate) : field('المشترك', subscriberPicker((item) => { subscriber = item; })),
  field('المبلغ', amount), field('التاريخ', date), field('رقم الوصل', receipt), field('ملاحظة', note));
}

export const transactionsPage = (type) => (root) => {
  const canWrite = session.user.role !== 'delegate';
  const month = el('input', { type: 'month', class: 'fixed', value: thisMonth(), 'aria-label': 'الشهر' });
  const delegateFilter = canWrite
    ? selectOf([['', 'كل المندوبين'], ...session.meta.delegates.map((d) => [d.id, d.full_name])], '', { class: 'grow', 'aria-label': 'المندوب' })
    : null;

  const query = (cursor) => {
    const params = new URLSearchParams({ type });
    if (month.value) params.set('month', month.value);
    if (delegateFilter?.value) params.set('delegate', delegateFilter.value);
    if (cursor) params.set('cursor', cursor);
    return params;
  };

  const list = recordList({
    columns: [
      { label: type === 'delegate_receipt' ? 'المندوب' : 'المستفيد', primary: true, render: (row) => row.party_name },
      { label: 'المبلغ', render: (row) => money(row.amount) },
      { label: 'التاريخ', render: (row) => ltr(row.tx_date) },
      { label: 'رقم الوصل', render: (row) => ltr(row.receipt_no) },
      { label: 'ملاحظة', render: (row) => row.note ?? '—' },
    ],
    fetchPage: (cursor) => api(`/transactions?${query(cursor)}`),
    actions: canWrite ? (row) => el('button', { class: 'btn small danger', type: 'button', onclick: () => {
      confirmSheet('حذف الحركة', 'تُحذف الحركة حذفاً ناعماً ويُعاد احتساب الإجماليات. لإجراء تصحيح أضف الحركة الصحيحة بعد الحذف.', 'تأكيد الحذف', async () => {
        await api(`/transactions/${row.id}`, { method: 'DELETE' });
        toast('تم الحذف');
        list.reload();
      });
    } }, 'حذف') : null,
    emptyTitle: 'لا توجد حركات في هذا الشهر',
    emptyHint: canWrite ? 'أضف حركة جديدة أو اختر شهراً آخر' : 'اختر شهراً آخر',
  });

  month.addEventListener('change', list.reload);
  delegateFilter?.addEventListener('change', list.reload);

  root.append(
    pageHead(TITLES[type], canWrite ? el('button', { class: 'btn primary', type: 'button', onclick: () => {
      openSheet('حركة جديدة', (close) => entryForm(type, () => { close(); list.reload(); }));
    } }, 'إضافة حركة') : null),
    el('div', { class: 'toolbar' }, month, delegateFilter),
    list.root,
  );
  return list.dispose;
};

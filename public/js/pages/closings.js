import { api } from '../api.js';
import { confirmSheet, el, field, form, loadInto, ltr, money, num, openSheet, pageHead, pairs, recordList, session, thisMonth, toast } from '../ui.js';

function previousMonth() {
  const date = new Date(`${thisMonth()}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() - 1);
  return date.toISOString().slice(0, 7);
}

function closeMonth(list) {
  openSheet('إقفال شهر', (close) => {
    const month = el('input', { type: 'month', value: previousMonth(), max: previousMonth() });
    const preview = el('div');
    const show = () => loadInto(preview, () => api(`/closings/preview?month=${month.value}`), (data) => pairs([
      ['الرصيد الافتتاحي', money(data.opening_balance)],
      ['المقبوضات', money(data.total_in)],
      ['الصرف العام', money(data.general_aid)],
      ['الصرفيات الشهرية', money(data.monthly_aid)],
      ['صرف البرامج', money(data.program_aid)],
      ['إجمالي المصروفات', money(data.total_out)],
      ['عدد الحركات', num(data.tx_count)],
      ['الرصيد الختامي', money(data.closing_balance), 'total'],
    ]));
    month.addEventListener('change', show);
    show();
    return form(async () => {
      await api('/closings', { method: 'POST', body: { month: month.value } });
      toast('تم إقفال الشهر');
      close();
      list.reload();
    }, 'تأكيد الإقفال', field('الشهر', month), preview,
    el('p', { class: 'hint' }, 'بعد الإقفال لا يُقبل أي تعديل على حركات هذا الشهر.'));
  });
}

export function closingsPage(root) {
  const isAdmin = session.user.role === 'admin';
  const list = recordList({
    columns: [
      { label: 'الشهر', primary: true, render: (row) => ltr(row.month) },
      { label: 'الافتتاحي', render: (row) => money(row.opening_balance) },
      { label: 'المقبوضات', render: (row) => money(row.total_in) },
      { label: 'المصروفات', render: (row) => money(row.total_out) },
      { label: 'الختامي', render: (row) => money(row.closing_balance) },
      { label: 'الحالة', render: (row) => (row.status === 'closed'
        ? el('span', { class: 'badge good' }, 'مقفل')
        : el('span', { class: 'badge warn' }, 'أعيد فتحه')) },
    ],
    fetchPage: (cursor) => api(`/closings${cursor ? `?cursor=${cursor}` : ''}`),
    actions: isAdmin ? (row) => (row.status === 'closed'
      ? el('button', { class: 'btn small', type: 'button', onclick: () => {
          confirmSheet('إعادة فتح الشهر', `سيُسمح بالتعديل على ${row.month} ويلزم إقفاله من جديد.`, 'إعادة الفتح', async () => {
            await api(`/closings/${row.month}/reopen`, { method: 'POST' });
            toast('أعيد فتح الشهر');
            list.reload();
          });
        } }, 'إعادة فتح')
      : el('span', { class: 'hint' }, '—')) : null,
    emptyTitle: 'لا توجد أشهر مقفلة',
    emptyHint: 'ابدأ بإقفال أول شهر منتهٍ',
  });

  root.append(
    pageHead('سجل الحسابات الشهرية', el('button', { class: 'btn primary', type: 'button', onclick: () => closeMonth(list) }, 'إقفال شهر')),
    list.root,
  );
  return list.dispose;
}

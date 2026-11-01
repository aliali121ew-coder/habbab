import { api } from '../api.js';
import {
  confirmSheet, el, emptyState, field, form, ltr, money, openSheet, pageHead, recordList, session, subscriberPicker, tabs, toast,
} from '../ui.js';

function addMember(programId, list) {
  openSheet('إضافة إلى البرنامج', (close) => {
    let picked = null;
    const amount = el('input', { type: 'number', inputMode: 'numeric', min: 0, value: 0 });
    return form(async () => {
      if (!picked) throw new Error('اختر المشترك من نتائج البحث');
      await api(`/programs/${programId}/members`, {
        method: 'POST',
        body: { subscriber_id: picked.id, monthly_amount: Number(amount.value) },
      });
      toast('تمت الإضافة');
      close();
      list().reload();
    }, 'حفظ', field('المشترك', subscriberPicker((item) => { picked = item; })), field('المبلغ الشهري', amount));
  });
}

function addProgram() {
  openSheet('برنامج جديد', (close) => {
    const name = el('input', { required: true, placeholder: 'مثال: ذوو الإعاقة', autocomplete: 'off' });
    return form(async () => {
      await api('/programs', { method: 'POST', body: { name: name.value } });
      session.meta = await api('/meta');
      toast('تمت الإضافة');
      close();
      location.reload();
    }, 'حفظ', field('اسم البرنامج', name));
  });
}

export function programsPage(root) {
  const programs = session.meta.programs.filter((program) => program.active);
  const isAdmin = session.user.role === 'admin';
  const head = pageHead('سجل الأيتام والكفالة', isAdmin ? el('button', { class: 'btn', type: 'button', onclick: addProgram }, 'برنامج جديد') : null);
  root.append(head);
  if (!programs.length) {
    root.append(emptyState('لا توجد برامج', 'يضيف المدير العام البرامج من هنا'));
    return null;
  }

  let programId = programs[0].id;
  const body = el('div');
  let list;

  const render = () => {
    list?.dispose();
    list = recordList({
      columns: [
        { label: 'الاسم', primary: true, render: (row) => row.subscriber_name },
        { label: 'المبلغ الشهري', render: (row) => money(row.monthly_amount) },
        { label: 'تاريخ البدء', render: (row) => ltr(row.started_at) },
      ],
      fetchPage: (cursor) => api(`/programs/${programId}/members${cursor ? `?cursor=${cursor}` : ''}`),
      actions: (row) => el('button', { class: 'btn small danger', type: 'button', onclick: () => {
        confirmSheet('إنهاء التسجيل', `إزالة «${row.subscriber_name}» من هذا البرنامج؟`, 'تأكيد', async () => {
          await api(`/programs/${programId}/members/${row.id}`, { method: 'DELETE' });
          toast('تم إنهاء التسجيل');
          list.reload();
        });
      } }, 'إنهاء'),
      emptyTitle: 'لا يوجد مشتركون في هذا البرنامج',
      emptyHint: 'أضف أول مشترك من الزر أعلاه',
    });
    body.replaceChildren(list.root);
  };

  head.append(el('button', { class: 'btn primary', type: 'button', onclick: () => addMember(programId, () => list) }, 'إضافة مشترك'));
  root.append(tabs(programs.map((program) => [program.id, program.name]), programId, (value) => {
    programId = value;
    render();
  }), body);
  render();
  return () => list.dispose();
}

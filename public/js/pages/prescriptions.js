import { api } from '../api.js';
import { compressImage } from '../image.js';
import {
  confirmSheet, el, field, form, loadInto, ltr, openSheet, pageHead, pairs, recordList, selectOf, session,
  subscriberPicker, tabs, toast, today,
} from '../ui.js';

const STATUS = {
  pending: ['بانتظار المراجعة', 'warn'],
  approved: ['موافق عليها', 'good'],
  dispensed: ['تم الصرف', 'good'],
  rejected: ['مرفوضة', 'bad'],
};

const statusBadge = (status) => el('span', { class: `badge ${STATUS[status][1]}` }, STATUS[status][0]);

function newPrescription(onSaved) {
  let patient = null;
  let compressed = null;
  const date = el('input', { type: 'date', value: today() });
  const diagnosis = el('input', { autocomplete: 'off' });
  const medicines = el('textarea');
  const notes = el('textarea');
  const preview = el('img', { class: 'preview', alt: 'معاينة صورة الوصفة', hidden: true });
  const hint = el('p', { class: 'hint' }, 'تُضغط الصورة على جهازك، ولا تُرفع إلا عند الضغط على حفظ.');
  const file = el('input', { type: 'file', accept: 'image/*' });

  file.addEventListener('change', async () => {
    compressed = null;
    preview.hidden = true;
    if (!file.files[0]) return;
    hint.textContent = 'جارٍ ضغط الصورة…';
    try {
      compressed = await compressImage(file.files[0]);
      preview.src = URL.createObjectURL(compressed.image);
      preview.hidden = false;
      hint.textContent = `الحجم بعد الضغط: ${Math.ceil(compressed.image.size / 1024)} كيلوبايت`;
    } catch (error) {
      hint.textContent = error.message;
      file.value = '';
    }
  });

  return form(async () => {
    if (!patient) throw new Error('اختر المريض من نتائج البحث');
    const data = new FormData();
    data.set('data', JSON.stringify({
      subscriber_id: patient.id,
      rx_date: date.value,
      diagnosis: diagnosis.value,
      medicines: medicines.value,
      notes: notes.value,
    }));
    if (compressed) {
      data.set('image', compressed.image, 'image');
      data.set('thumb', compressed.thumb, 'thumb');
    }
    await api('/prescriptions', { method: 'POST', form: data });
    toast('تم حفظ الوصفة');
    onSaved();
  }, 'حفظ',
  field('المريض', subscriberPicker((item) => { patient = item; })), field('تاريخ الوصفة', date),
  field('التشخيص', diagnosis), field('الأدوية', medicines), field('ملاحظات', notes),
  field('صورة الوصفة', file), hint, preview);
}

function openDetails(id, list) {
  openSheet('تفاصيل الوصفة', (close, body) => {
    loadInto(body, () => api(`/prescriptions/${id}`), (row) => {
      const status = selectOf(Object.entries(STATUS).map(([value, [label]]) => [value, label]), row.status, { 'aria-label': 'الحالة' });
      status.addEventListener('change', async () => {
        try {
          await api(`/prescriptions/${id}/status`, { method: 'PATCH', body: { status: status.value } });
          toast('تم تحديث الحالة');
          list.reload();
        } catch (error) {
          toast(error.message, 'error');
        }
      });
      return [
        pairs([
          ['المريض', row.patient_name],
          ['التاريخ', ltr(row.rx_date)],
          ['التشخيص', row.diagnosis],
          ['الأدوية', row.medicines],
          ['ملاحظات', row.notes || '—'],
        ]),
        field('الحالة', status),
        row.image_url ? el('img', { class: 'rx-image', src: row.image_url, alt: 'صورة الوصفة' }) : null,
        session.user.role === 'admin' ? el('div', { class: 'row-actions' }, el('button', { class: 'btn small danger', type: 'button', onclick: () => {
          close();
          confirmSheet('حذف الوصفة', 'ستختفي الوصفة من السجل مع بقائها في سجل التدقيق.', 'تأكيد الحذف', async () => {
            await api(`/prescriptions/${id}`, { method: 'DELETE' });
            toast('تم الحذف');
            list.reload();
          });
        } }, 'حذف')) : null,
      ];
    });
  });
}

export function prescriptionsPage(root) {
  let status = '';
  const list = recordList({
    columns: [
      { label: 'المريض', primary: true, render: (row) => row.patient_name },
      { label: 'التاريخ', render: (row) => ltr(row.rx_date) },
      { label: 'الحالة', render: (row) => statusBadge(row.status) },
      { label: 'الصورة', render: (row) => (row.thumb_url
        ? el('img', { class: 'thumb', src: row.thumb_url, alt: 'مصغّرة الوصفة', loading: 'lazy' })
        : '—') },
    ],
    fetchPage: (cursor) => {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (cursor) params.set('cursor', cursor);
      return api(`/prescriptions?${params}`);
    },
    actions: (row) => el('button', { class: 'btn small', type: 'button', onclick: () => openDetails(row.id, list) }, 'فتح'),
    emptyTitle: 'لا توجد وصفات',
    emptyHint: 'أضف وصفة جديدة من الزر أعلاه',
  });

  root.append(
    pageHead('سجل وصفات المرضى', el('button', { class: 'btn primary', type: 'button', onclick: () => {
      openSheet('وصفة جديدة', (close) => newPrescription(() => { close(); list.reload(); }));
    } }, 'إضافة وصفة')),
    tabs([['', 'الكل'], ...Object.entries(STATUS).map(([value, [label]]) => [value, label])], status, (value) => {
      status = value;
      list.reload();
    }),
    list.root,
  );
  return list.dispose;
}

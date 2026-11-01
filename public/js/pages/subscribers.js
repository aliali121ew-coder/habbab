import { api } from '../api.js';
import {
  confirmSheet, debounce, el, field, form, loadInto, ltr, money, num, openSheet, pageHead, pairs,
  recordList, selectOf, session, tabs, toast,
} from '../ui.js';

const statusBadge = (status) => (status === 'alive'
  ? el('span', { class: 'badge good' }, 'حي')
  : el('span', { class: 'badge' }, 'متوفى'));

const delegateName = (id) => session.meta.delegates.find((d) => d.id === id)?.full_name ?? '—';

export const subscriberColumns = () => [
  { label: 'الاسم', primary: true, render: (row) => row.full_name },
  { label: 'الهاتف', render: (row) => ltr(row.phone) },
  { label: 'الهوية', render: (row) => ltr(row.national_id) },
  { label: 'أفراد العائلة', render: (row) => num(row.family_size) },
  ...(session.user.role === 'admin' ? [{ label: 'المندوب', render: (row) => delegateName(row.delegate_id) }] : []),
  { label: 'الحالة', render: (row) => statusBadge(row.status) },
];

function subscriberForm(existing, onSaved) {
  const name = el('input', { value: existing?.full_name ?? '', required: true, autocomplete: 'off' });
  const phone = el('input', { type: 'tel', inputMode: 'tel', dir: 'ltr', autocomplete: 'off',
    placeholder: existing?.phone ? 'اتركه فارغاً لعدم التغيير' : '' });
  const nationalId = el('input', { inputMode: 'numeric', dir: 'ltr', autocomplete: 'off',
    placeholder: existing?.national_id ? 'اتركه فارغاً لعدم التغيير' : '' });
  const family = el('input', { type: 'number', inputMode: 'numeric', min: 1, max: 50, value: existing?.family_size ?? 1 });
  const address = el('input', { value: existing?.address ?? '', autocomplete: 'off' });
  const notes = el('textarea', { value: existing?.notes ?? '' });
  const status = selectOf([['alive', 'حي'], ['deceased', 'متوفى']], existing?.status ?? 'alive');
  const deathDate = el('input', { type: 'date', value: existing?.death_date ?? '' });
  const deathField = field('تاريخ الوفاة', deathDate);
  const syncDeath = () => { deathField.hidden = status.value !== 'deceased'; };
  status.addEventListener('change', syncDeath);
  syncDeath();

  const isAdmin = session.user.role === 'admin';
  const delegate = isAdmin
    ? selectOf([['', 'بدون مندوب'], ...session.meta.delegates.map((d) => [d.id, d.full_name])], existing?.delegate_id)
    : null;

  return form(async () => {
    const body = {
      full_name: name.value,
      family_size: Number(family.value),
      address: address.value || null,
      notes: notes.value || null,
      status: status.value,
      death_date: status.value === 'deceased' ? deathDate.value || null : null,
    };
    if (phone.value) body.phone = phone.value;
    if (nationalId.value) body.national_id = nationalId.value;
    if (delegate) body.delegate_id = delegate.value ? Number(delegate.value) : null;
    if (existing) await api(`/subscribers/${existing.id}`, { method: 'PATCH', body });
    else await api('/subscribers', { method: 'POST', body });
    toast('تم الحفظ');
    onSaved();
  }, 'حفظ',
  field('الاسم الكامل', name), field('الهاتف', phone), field('رقم الهوية', nationalId), field('عدد أفراد العائلة', family),
  field('العنوان', address), field('الحالة', status), deathField, delegate ? field('المندوب', delegate) : null,
  field('ملاحظات', notes));
}

function openDetails(id, list) {
  openSheet('بيانات المشترك', (close, body) => {
    loadInto(body, () => api(`/subscribers/${id}`), (row) => {
      const phone = el('span', {}, ltr(row.phone));
      const national = el('span', {}, ltr(row.national_id));
      const reveal = el('button', { class: 'btn small', type: 'button' }, 'كشف الهاتف والهوية');
      reveal.addEventListener('click', async () => {
        reveal.disabled = true;
        try {
          const secret = await api(`/subscribers/${id}/reveal`, { method: 'POST' });
          phone.replaceChildren(ltr(secret.phone));
          national.replaceChildren(ltr(secret.national_id));
          reveal.remove();
        } catch (error) {
          toast(error.message, 'error');
          reveal.disabled = false;
        }
      });

      const aid = el('div');
      loadInto(aid, () => api(`/transactions?subscriber=${id}`), ({ items }) => (items.length
        ? pairs(items.slice(0, 5).map((tx) => [el('bdi', { class: 'num' }, tx.tx_date), money(tx.amount)]))
        : el('p', { class: 'hint' }, 'لا توجد مساعدات مسجلة')));

      return [
        pairs([
          ['الاسم', row.full_name],
          ['الهاتف', phone],
          ['الهوية', national],
          ['الحالة', statusBadge(row.status)],
          ['أفراد العائلة', num(row.family_size)],
          ['العنوان', row.address ?? '—'],
          ...(row.death_date ? [['تاريخ الوفاة', ltr(row.death_date)]] : []),
          ['ملاحظات', row.notes ?? '—'],
        ]),
        el('div', { class: 'row-actions' },
          reveal,
          el('button', { class: 'btn small', type: 'button', onclick: () => {
            close();
            openSheet('تعديل المشترك', (closeEdit) => subscriberForm(row, () => { closeEdit(); list.reload(); }));
          } }, 'تعديل'),
          session.user.role === 'admin' ? el('button', { class: 'btn small danger', type: 'button', onclick: () => {
            close();
            confirmSheet('حذف المشترك', `سيُنقل «${row.full_name}» إلى المحذوفات ويختفي من السجلات.`, 'تأكيد الحذف', async () => {
              await api(`/subscribers/${id}`, { method: 'DELETE' });
              toast('تم الحذف');
              list.reload();
            });
          } }, 'حذف') : null),
        el('h2', { class: 'section-gap' }, 'آخر المساعدات'),
        aid,
      ];
    });
  });
}

export function subscribersPage(root) {
  let status = 'alive';
  let query = '';

  const list = recordList({
    columns: subscriberColumns(),
    fetchPage: (cursor) => (query.length >= 3
      ? api('/subscribers/search', { method: 'POST', body: { q: query, status } })
      : api(`/subscribers?status=${status}${cursor ? `&cursor=${cursor}` : ''}`)),
    actions: (row) => el('button', { class: 'btn small', type: 'button', onclick: () => openDetails(row.id, list) }, 'التفاصيل'),
    emptyTitle: 'لا توجد سجلات',
    emptyHint: 'جرّب تغيير البحث أو أضف مشتركاً جديداً',
  });

  const search = el('input', { type: 'search', class: 'grow', placeholder: 'بحث ببداية الاسم أو الهاتف (3 أحرف)', autocomplete: 'off', 'aria-label': 'بحث' });
  const onSearch = debounce(() => {
    const value = search.value.trim();
    if (value.length >= 3 || query.length >= 3) {
      query = value.length >= 3 ? value : '';
      list.reload();
    }
  });
  search.addEventListener('input', onSearch);

  root.append(
    pageHead('سجل المشتركين', el('button', { class: 'btn primary', type: 'button', onclick: () => {
      openSheet('إضافة مشترك', (close) => subscriberForm(null, () => { close(); list.reload(); }));
    } }, 'إضافة مشترك')),
    tabs([['alive', 'الأحياء'], ['deceased', 'المتوفون']], status, (value) => {
      status = value;
      list.reload();
    }),
    el('div', { class: 'toolbar' }, search),
    list.root,
  );
  return list.dispose;
}

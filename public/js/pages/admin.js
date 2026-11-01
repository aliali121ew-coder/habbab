import { api } from '../api.js';
import { el, field, form, ltr, openSheet, pageHead, recordList, selectOf, session, toast, when } from '../ui.js';

const ROLES = [['delegate', 'مندوب'], ['accountant', 'محاسب'], ['health', 'مسؤول صحي'], ['admin', 'مدير عام']];
const roleLabel = (role) => ROLES.find(([value]) => value === role)?.[1] ?? role;

const refreshMeta = async () => { session.meta = await api('/meta'); };

function userForm(existing, onSaved) {
  const username = el('input', { dir: 'ltr', autocapitalize: 'none', autocomplete: 'off', spellcheck: false });
  const fullName = el('input', { value: existing?.full_name ?? '', autocomplete: 'off' });
  const role = selectOf(ROLES, existing?.role ?? 'delegate');
  const active = selectOf([['1', 'مفعّل'], ['0', 'معطّل']], existing?.active ?? 1);
  const password = el('input', { type: 'password', autocomplete: 'new-password',
    placeholder: existing ? 'اتركها فارغة لعدم التغيير' : '10 أحرف على الأقل' });

  return form(async () => {
    if (existing) {
      const body = { full_name: fullName.value, role: role.value, active: active.value === '1' };
      if (password.value) body.password = password.value;
      await api(`/users/${existing.id}`, { method: 'PATCH', body });
    } else {
      await api('/users', {
        method: 'POST',
        body: { username: username.value, full_name: fullName.value, role: role.value, password: password.value },
      });
    }
    await refreshMeta();
    toast('تم الحفظ');
    onSaved();
  }, 'حفظ',
  existing ? null : field('اسم المستخدم', username), field('الاسم الكامل', fullName), field('الدور', role),
  existing ? field('الحالة', active) : null, field(existing ? 'كلمة مرور جديدة' : 'كلمة المرور المؤقتة', password),
  el('p', { class: 'hint' }, 'يُطلب من المستخدم تغيير كلمة المرور المؤقتة عند أول دخول.'));
}

export function usersPage(root) {
  const list = recordList({
    columns: [
      { label: 'الاسم', primary: true, render: (row) => row.full_name },
      { label: 'اسم المستخدم', render: (row) => ltr(row.username) },
      { label: 'الدور', render: (row) => roleLabel(row.role) },
      { label: 'الحالة', render: (row) => (row.active
        ? el('span', { class: 'badge good' }, 'مفعّل')
        : el('span', { class: 'badge bad' }, 'معطّل')) },
    ],
    fetchPage: (cursor) => api(`/users${cursor ? `?cursor=${cursor}` : ''}`),
    actions: (row) => el('button', { class: 'btn small', type: 'button', onclick: () => {
      openSheet('تعديل المستخدم', (close) => userForm(row, () => { close(); list.reload(); }));
    } }, 'تعديل'),
    emptyTitle: 'لا يوجد مستخدمون',
  });
  root.append(
    pageHead('المستخدمون', el('button', { class: 'btn primary', type: 'button', onclick: () => {
      openSheet('مستخدم جديد', (close) => userForm(null, () => { close(); list.reload(); }));
    } }, 'إضافة مستخدم')),
    list.root,
  );
  return list.dispose;
}

const ACTIONS = {
  login: 'تسجيل دخول', login_failed: 'محاولة دخول فاشلة', change_password: 'تغيير كلمة المرور', create: 'إنشاء',
  update: 'تعديل', delete: 'حذف', reveal: 'كشف بيانات', view: 'مشاهدة', enroll: 'تسجيل في برنامج',
  unenroll: 'إنهاء تسجيل', update_status: 'تغيير حالة', close_month: 'إقفال شهر', reopen_month: 'إعادة فتح شهر',
};

const ENTITIES = {
  user: 'مستخدم', subscriber: 'مشترك', program: 'برنامج', subscriber_program: 'تسجيل برنامج',
  transaction: 'حركة مالية', prescription: 'وصفة', closing: 'إقفال',
};

export function auditPage(root) {
  const list = recordList({
    columns: [
      { label: 'الإجراء', primary: true, render: (row) => ACTIONS[row.action] ?? row.action },
      { label: 'المستخدم', render: (row) => row.user_name ?? '—' },
      { label: 'الكيان', render: (row) => ENTITIES[row.entity] ?? row.entity },
      { label: 'المعرّف', render: (row) => ltr(row.entity_id ? String(row.entity_id) : row.detail) },
      { label: 'الوقت', render: (row) => when(row.created_at) },
    ],
    fetchPage: (cursor) => api(`/audit${cursor ? `?cursor=${cursor}` : ''}`),
    emptyTitle: 'لا توجد أحداث',
  });
  root.append(pageHead('سجل التدقيق'), list.root);
  return list.dispose;
}

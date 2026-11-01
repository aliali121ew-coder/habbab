import { api, ApiError, setUnauthorizedHandler } from './api.js';
import { el, errorState, field, form, loadingState, session, toast } from './ui.js';
import { dashboardPage } from './pages/dashboard.js';
import { subscribersPage } from './pages/subscribers.js';
import { programsPage } from './pages/programs.js';
import { transactionsPage } from './pages/transactions.js';
import { prescriptionsPage } from './pages/prescriptions.js';
import { closingsPage } from './pages/closings.js';
import { delegatePage, delegatesPage } from './pages/delegates.js';
import { auditPage, usersPage } from './pages/admin.js';

const ROLE_LABELS = { admin: 'مدير عام', accountant: 'محاسب', delegate: 'مندوب', health: 'مسؤول صحي' };

// The server enforces these same roles. This table only decides what the menu shows.
const ROUTES = [
  { path: 'dashboard', label: 'الرئيسية', roles: ['admin', 'accountant', 'delegate', 'health'], page: dashboardPage },
  { group: 'السجلات', roles: ['admin', 'delegate'] },
  { path: 'subscribers', label: 'سجل المشتركين', roles: ['admin', 'delegate'], page: subscribersPage },
  { path: 'programs', label: 'سجل الأيتام والكفالة', roles: ['admin', 'delegate'], page: programsPage },
  { group: 'المالية', roles: ['admin', 'accountant', 'delegate'] },
  { path: 'general-aid', label: 'الصرف العام للعوائل المتعففة', roles: ['admin', 'accountant'], page: transactionsPage('general_aid') },
  { path: 'receipts', label: 'استلام المبالغ من المندوبين', roles: ['admin', 'accountant', 'delegate'], page: transactionsPage('delegate_receipt') },
  { path: 'monthly-aid', label: 'الصرفيات الشهرية', roles: ['admin', 'accountant'], page: transactionsPage('monthly_aid') },
  { path: 'closings', label: 'الحسابات الشهرية', roles: ['admin', 'accountant'], page: closingsPage },
  { group: 'الصحة', roles: ['admin', 'health'] },
  { path: 'prescriptions', label: 'وصفات المرضى', roles: ['admin', 'health'], page: prescriptionsPage },
  { group: 'المندوبون', roles: ['admin', 'accountant', 'delegate'] },
  { path: 'delegates', label: 'المندوبون', roles: ['admin', 'accountant'], page: delegatesPage },
  { path: 'me', label: 'صفحتي وإحصائياتي', roles: ['delegate'], page: delegatePage },
  { group: 'الإدارة', roles: ['admin'] },
  { path: 'users', label: 'المستخدمون', roles: ['admin'], page: usersPage },
  { path: 'audit', label: 'سجل التدقيق', roles: ['admin'], page: auditPage },
];

const app = document.getElementById('app');
let disposePage = null;
let drawer = null;

function allowedRoutes() {
  return ROUTES.filter((route) => route.roles.includes(session.user.role));
}

function renderLogin() {
  const username = el('input', { autocomplete: 'username', autocapitalize: 'none', spellcheck: false, required: true });
  const password = el('input', { type: 'password', autocomplete: 'current-password', required: true });
  app.replaceChildren(el('main', { class: 'auth' }, el('div', { class: 'auth-card' },
    el('h1', {}, 'سجلات المشتركين والمساعدات'),
    el('p', {}, 'سجّل الدخول للمتابعة'),
    form(async () => {
      await api('/auth/login', { method: 'POST', body: { username: username.value, password: password.value } });
      await boot();
    }, 'دخول', field('اسم المستخدم', username), field('كلمة المرور', password)))));
}

function renderForcePassword() {
  const current = el('input', { type: 'password', autocomplete: 'current-password' });
  const next = el('input', { type: 'password', autocomplete: 'new-password' });
  app.replaceChildren(el('main', { class: 'auth' }, el('div', { class: 'auth-card' },
    el('h1', {}, 'تغيير كلمة المرور'),
    el('p', {}, 'يجب تعيين كلمة مرور جديدة قبل المتابعة (10 أحرف على الأقل).'),
    form(async () => {
      await api('/auth/change-password', { method: 'POST', body: { current: current.value, next: next.value } });
      toast('تم تغيير كلمة المرور');
      await boot();
    }, 'حفظ', field('كلمة المرور الحالية', current), field('كلمة المرور الجديدة', next)))));
}

function setDrawer(open) {
  drawer.panel.classList.toggle('open', open);
  drawer.scrim.hidden = !open;
  document.body.style.overflow = open ? 'hidden' : '';
}

function renderShell() {
  const title = el('strong');
  const main = el('main', { class: 'main', id: 'page' });
  const nav = el('nav', { class: 'nav', 'aria-label': 'القائمة الرئيسية' });

  const signOut = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    session.user = null;
    location.hash = '';
    renderLogin();
  };

  allowedRoutes().forEach((route) => {
    nav.append(route.group
      ? el('div', { class: 'group' }, route.group)
      : el('a', { href: `#/${route.path}`, 'data-path': route.path, onclick: () => setDrawer(false) }, route.label));
  });

  const panel = el('aside', { class: 'drawer' },
    el('div', { class: 'brand' }, el('b', {}, session.user.full_name), el('small', {}, ROLE_LABELS[session.user.role])),
    nav,
    el('button', { class: 'btn block', type: 'button', onclick: signOut }, 'تسجيل الخروج'));
  const scrim = el('div', { class: 'scrim', hidden: true, onclick: () => setDrawer(false) });
  drawer = { panel, scrim };

  app.replaceChildren(el('div', { class: 'shell' },
    el('header', { class: 'topbar' },
      el('button', { class: 'icon-btn menu-btn', type: 'button', 'aria-label': 'فتح القائمة', onclick: () => setDrawer(true) }, '☰'),
      title),
    scrim, panel, main));
  return { main, title, nav };
}

let shell = null;

function route() {
  if (!session.user || !shell) return;
  disposePage?.();
  disposePage = null;
  setDrawer(false);

  const [path, ...params] = location.hash.replace(/^#\/?/, '').split('/');
  const target = allowedRoutes().find((item) => item.path === path)
    ?? allowedRoutes().find((item) => item.path === 'dashboard');

  shell.title.textContent = target.label;
  shell.nav.querySelectorAll('a').forEach((link) => {
    link.classList.toggle('active', link.dataset.path === target.path);
  });
  shell.main.replaceChildren();
  window.scrollTo(0, 0);
  try {
    disposePage = target.page(shell.main, params) ?? null;
  } catch (error) {
    shell.main.replaceChildren(errorState(error.message));
  }
}

async function boot() {
  app.replaceChildren(el('main', { class: 'main' }, loadingState()));
  try {
    const me = await api('/auth/me');
    session.user = me;
    session.currency = me.currency;
  } catch (error) {
    if (error instanceof ApiError && error.status !== 401) {
      app.replaceChildren(el('main', { class: 'main' }, errorState(error.message, boot)));
      return;
    }
    session.user = null;
    renderLogin();
    return;
  }

  if (session.user.must_change_password) {
    renderForcePassword();
    return;
  }

  try {
    session.meta = await api('/meta');
  } catch (error) {
    app.replaceChildren(el('main', { class: 'main' }, errorState(error.message, boot)));
    return;
  }
  shell = renderShell();
  route();
}

setUnauthorizedHandler(() => {
  session.user = null;
  shell = null;
  disposePage?.();
  document.querySelectorAll('dialog').forEach((dialog) => dialog.close());
  renderLogin();
});

addEventListener('hashchange', route);
addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && drawer?.panel.classList.contains('open')) setDrawer(false);
});
boot();

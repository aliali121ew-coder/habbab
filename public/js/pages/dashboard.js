import { api } from '../api.js';
import { el, loadInto, money, num, recordList, session, stat } from '../ui.js';

const monthlyOut = (row) => row.general_aid + row.monthly_aid + row.program_aid;

function monthsPanel(months) {
  const list = recordList({
    columns: [
      { label: 'الشهر', primary: true, render: (row) => el('bdi', { class: 'num' }, row.month) },
      { label: 'المقبوضات', render: (row) => money(row.delegate_receipt) },
      { label: 'المصروفات', render: (row) => money(monthlyOut(row)) },
      { label: 'عدد الحركات', render: (row) => num(row.tx_count) },
    ],
    fetchPage: async () => ({ items: months, next: null }),
    emptyTitle: 'لا توجد حركات مالية بعد',
  });
  return el('section', {}, el('h2', {}, 'آخر ستة أشهر'), el('div', { class: 'hint' }, 'إجماليات جاهزة من جداول الملخصات'), list.root);
}

const financeTiles = (current) => [
  stat('مقبوضات الشهر', money(current?.delegate_receipt)),
  stat('مصروفات الشهر', money(current ? monthlyOut(current) : 0)),
  stat('حركات الشهر', num(current?.tx_count)),
];

function view(data) {
  if (data.kind === 'delegate') {
    return el('div', { class: 'stats' },
      stat('مشتركوك الأحياء', num(data.totals.subs_alive)),
      stat('المتوفون', num(data.totals.subs_deceased)),
      stat('المبالغ المستلمة', money(data.totals.received_total)),
      stat('المصروف لمشتركيك', money(data.totals.disbursed_total)));
  }
  if (data.kind === 'health') {
    return el('div', { class: 'stats' },
      stat('إجمالي الوصفات', num(data.rx_total)),
      stat('بانتظار المراجعة', num(data.rx_pending)));
  }
  const current = data.months.find((row) => row.month === data.month);
  if (data.kind === 'accountant') {
    return [el('div', { class: 'stats' }, financeTiles(current)), monthsPanel(data.months)];
  }
  const programTiles = session.meta.programs.map((program) =>
    stat(`برنامج ${program.name}`, num(data.totals[`program_${program.id}`])));
  return [
    el('div', { class: 'stats' },
      stat('المشتركون الأحياء', num(data.totals.subs_alive)),
      stat('المشتركون المتوفون', num(data.totals.subs_deceased)),
      programTiles,
      stat('وصفات بانتظار المراجعة', num(data.totals.rx_pending)),
      financeTiles(current)),
    monthsPanel(data.months),
  ];
}

export function dashboardPage(root) {
  const body = el('div');
  root.append(el('div', { class: 'page-head' }, el('h1', {}, `مرحباً، ${session.user.full_name}`)), body);
  loadInto(body, () => api('/dashboard'), view);
}

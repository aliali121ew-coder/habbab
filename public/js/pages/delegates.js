import { api } from '../api.js';
import { el, loadInto, ltr, money, num, pageHead, recordList, session, stat, tabs } from '../ui.js';
import { subscriberColumns } from './subscribers.js';

function delegateView(root, id) {
  const head = el('div');
  const body = el('div');
  root.append(head, body);
  let disposers = [];
  const disposeAll = () => { disposers.forEach((dispose) => dispose()); disposers = []; };

  loadInto(head, () => api(`/delegates/${id}`), (data) => [
    pageHead(data.full_name),
    el('div', { class: 'stats' },
      stat('المشتركون الأحياء', num(data.totals.subs_alive)),
      stat('المتوفون', num(data.totals.subs_deceased)),
      stat('المبالغ المستلمة', money(data.totals.received_total)),
      stat('المصروف للمشتركين', money(data.totals.disbursed_total))),
  ]);

  const showSubscribers = () => {
    disposeAll();
    const list = recordList({
      columns: subscriberColumns(),
      fetchPage: (cursor) => api(`/subscribers?delegate=${id}${cursor ? `&cursor=${cursor}` : ''}`),
      emptyTitle: 'لا يوجد مشتركون',
    });
    disposers.push(list.dispose);
    body.replaceChildren(list.root);
  };
  const showReceipts = () => {
    disposeAll();
    const list = recordList({
      columns: [
        { label: 'التاريخ', primary: true, render: (row) => ltr(row.tx_date) },
        { label: 'المبلغ', render: (row) => money(row.amount) },
        { label: 'رقم الوصل', render: (row) => ltr(row.receipt_no) },
      ],
      fetchPage: (cursor) => api(`/transactions?type=delegate_receipt&delegate=${id}${cursor ? `&cursor=${cursor}` : ''}`),
      emptyTitle: 'لا توجد مبالغ مستلمة',
    });
    disposers.push(list.dispose);
    body.replaceChildren(list.root);
  };

  // Accountants have no access to the subscriber register, so they only get receipts.
  const canSeeSubscribers = session.user.role !== 'accountant';
  if (canSeeSubscribers) {
    root.insertBefore(tabs([['subs', 'المشتركون'], ['receipts', 'المبالغ المستلمة']], 'subs', (value) => {
      if (value === 'subs') showSubscribers();
      else showReceipts();
    }), body);
    showSubscribers();
  } else {
    showReceipts();
  }
  return disposeAll;
}

export function delegatePage(root) {
  return delegateView(root, session.user.id);
}

export function delegatesPage(root, [id]) {
  if (id) return delegateView(root, Number(id));
  const list = recordList({
    columns: [
      { label: 'المندوب', primary: true, render: (row) => row.full_name },
      { label: 'الأحياء', render: (row) => num(row.subs_alive) },
      { label: 'المتوفون', render: (row) => num(row.subs_deceased) },
      { label: 'المستلم', render: (row) => money(row.received_total) },
      { label: 'المصروف', render: (row) => money(row.disbursed_total) },
    ],
    fetchPage: () => api('/delegates'),
    actions: (row) => el('a', { class: 'btn small', href: `#/delegates/${row.id}` }, 'الصفحة'),
    emptyTitle: 'لا يوجد مندوبون',
    emptyHint: 'أضف مستخدماً بدور مندوب من صفحة المستخدمين',
  });
  root.append(pageHead('المندوبون'), list.root);
  return list.dispose;
}

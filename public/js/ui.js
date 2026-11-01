import { api } from './api.js';

export const session = { user: null, currency: '', meta: { programs: [], delegates: [] } };

// DOM nodes only, never innerHTML: stored names cannot become markup.
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (key === 'class') node.className = value;
    else if (key in node && key !== 'list') node[key] = value;
    else node.setAttribute(key, value === true ? '' : value);
  }
  node.append(...children.flat().filter((child) => child !== null && child !== undefined && child !== false));
  return node;
}

const numberFormat = new Intl.NumberFormat('ar-IQ-u-nu-latn');

export const num = (value) => el('bdi', { class: 'num' }, numberFormat.format(value ?? 0));
export const money = (value) => el('span', {}, num(value), ` ${session.currency}`);
export const ltr = (value) => (value ? el('bdi', { class: 'num' }, value) : '—');

export const today = () => new Date().toISOString().slice(0, 10);
export const thisMonth = () => today().slice(0, 7);
export const when = (iso) => ltr(iso ? iso.slice(0, 16).replace('T', ' ') : null);

export function toast(message, kind = '') {
  const node = el('div', { class: `toast ${kind}`, role: kind === 'error' ? 'alert' : 'status' }, message);
  document.getElementById('toasts').append(node);
  setTimeout(() => node.remove(), 3500);
}

export function debounce(fn, delay = 350) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export const loadingState = () => el('div', { class: 'skeleton', 'aria-busy': 'true', 'aria-label': 'جارٍ التحميل' },
  el('i'), el('i'), el('i'), el('i'));

export const emptyState = (title, hint) => el('div', { class: 'state' }, el('b', {}, title), hint ? el('span', {}, hint) : null);

export const errorState = (message, retry) => el('div', { class: 'state error', role: 'alert' },
  el('b', {}, 'تعذّر تحميل البيانات'),
  el('span', {}, message),
  retry ? el('button', { class: 'btn', type: 'button', onclick: retry }, 'إعادة المحاولة') : null);

// Renders one region through loading -> content/error, with retry.
export async function loadInto(container, load, render) {
  const run = async () => {
    container.replaceChildren(loadingState());
    try {
      const data = await load();
      container.replaceChildren(...[render(data)].flat());
    } catch (error) {
      if (error.status === 401) return;
      container.replaceChildren(errorState(error.message, run));
    }
  };
  await run();
}

export function openSheet(title, build) {
  const close = () => dialog.close();
  const body = el('div', { class: 'sheet-body' });
  const dialog = el('dialog', { class: 'sheet', 'aria-label': title },
    el('div', { class: 'sheet-frame' },
      el('div', { class: 'sheet-head' },
        el('h2', {}, title),
        el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'إغلاق', onclick: close }, '✕')),
      body));
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  const content = build(close, body);
  if (content) body.append(content);
  dialog.showModal();
  return close;
}

export function confirmSheet(title, message, confirmLabel, action) {
  openSheet(title, (close) => {
    const submit = el('button', { class: 'btn danger block', type: 'button' }, confirmLabel);
    submit.addEventListener('click', async () => {
      submit.disabled = true;
      try {
        await action();
        close();
      } catch (error) {
        toast(error.message, 'error');
        submit.disabled = false;
      }
    });
    return el('div', { class: 'form' }, el('p', {}, message), submit,
      el('button', { class: 'btn block', type: 'button', onclick: close }, 'إلغاء'));
  });
}

export const field = (label, input) => el('label', { class: 'field' }, el('span', {}, label), input);

export function selectOf(options, value, attrs = {}) {
  return el('select', attrs, options.map(([optionValue, label]) =>
    el('option', { value: optionValue, selected: String(optionValue) === String(value ?? '') }, label)));
}

// Submit guard: a double tap on a slow connection must not record money twice.
export function form(onSubmit, submitLabel, ...fields) {
  const error = el('div', { class: 'form-error', role: 'alert', hidden: true });
  const submit = el('button', { class: 'btn primary block', type: 'submit' }, submitLabel);
  return el('form', {
    class: 'form',
    novalidate: true,
    onsubmit: async (event) => {
      event.preventDefault();
      if (submit.disabled) return;
      submit.disabled = true;
      error.hidden = true;
      try {
        await onSubmit();
      } catch (failure) {
        error.textContent = failure.message;
        error.hidden = false;
      } finally {
        submit.disabled = false;
      }
    },
  }, ...fields, error, submit);
}

// Debounced, 3-character minimum, and sent by POST so the query never enters a URL.
export function subscriberPicker(onPick, initial) {
  const input = el('input', { type: 'search', placeholder: 'اكتب 3 أحرف من بداية الاسم أو الهاتف', autocomplete: 'off', value: initial?.full_name ?? '' });
  const results = el('div');
  let latest = 0;
  const search = debounce(async () => {
    const q = input.value.trim();
    const ticket = ++latest;
    if (q.length < 3) return results.replaceChildren();
    try {
      const { items } = await api('/subscribers/lookup', { method: 'POST', body: { q } });
      if (ticket !== latest) return;
      results.replaceChildren(items.length
        ? el('ul', {}, items.map((item) => el('li', {}, el('button', {
            type: 'button',
            onclick: () => {
              input.value = item.full_name;
              results.replaceChildren();
              onPick(item);
            },
          }, item.full_name))))
        : el('p', { class: 'hint' }, 'لا توجد نتائج'));
    } catch (error) {
      results.replaceChildren(el('p', { class: 'hint' }, error.message));
    }
  });
  input.addEventListener('input', () => {
    onPick(null);
    search();
  });
  return el('div', { class: 'picker' }, input, results);
}

// One component for every record list: table markup that CSS turns into cards on a phone.
export function recordList({ columns, fetchPage, actions, emptyTitle, emptyHint }) {
  const tbody = el('tbody');
  const headers = [...columns.map((column) => column.label), actions ? 'إجراءات' : null].filter(Boolean);
  const table = el('table', { class: 'records' },
    el('thead', {}, el('tr', {}, headers.map((label) => el('th', { scope: 'col' }, label)))), tbody);
  const status = el('div');
  const more = el('button', { class: 'btn', type: 'button', hidden: true }, 'تحميل المزيد');
  const end = el('div', { class: 'list-end' }, more);
  const root = el('div', {}, table, status, end);

  let cursor = null;
  let done = false;
  let busy = false;
  let generation = 0;

  const rowOf = (item) => el('tr', {},
    columns.map((column) => el('td', { class: column.primary ? 'primary' : '', 'data-label': column.label },
      el('span', {}, column.render(item)))),
    actions ? el('td', { class: 'actions' }, actions(item)) : null);

  async function loadMore() {
    if (busy || done) return;
    busy = true;
    const mine = generation;
    const first = cursor === null;
    if (first) {
      table.hidden = true;
      status.replaceChildren(loadingState());
    }
    more.hidden = true;
    try {
      const page = await fetchPage(cursor);
      if (mine !== generation) return;
      tbody.append(...page.items.map(rowOf));
      cursor = page.next;
      done = page.next === null;
      status.replaceChildren();
      table.hidden = tbody.children.length === 0;
      if (first && page.items.length === 0) status.replaceChildren(emptyState(emptyTitle, emptyHint));
      more.hidden = done;
    } catch (error) {
      if (mine !== generation || error.status === 401) return;
      if (first) status.replaceChildren(errorState(error.message, reload));
      else toast(error.message, 'error');
      more.hidden = first;
    } finally {
      if (mine === generation) busy = false;
    }
  }

  function reload() {
    generation += 1;
    cursor = null;
    done = false;
    busy = false;
    tbody.replaceChildren();
    return loadMore();
  }

  more.addEventListener('click', loadMore);
  const observer = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) loadMore();
  }, { rootMargin: '300px' });
  observer.observe(end);

  reload();
  return { root, reload, dispose: () => observer.disconnect() };
}

export function tabs(options, value, onChange) {
  const nodes = options.map(([optionValue, label]) => el('button', {
    class: 'tab',
    type: 'button',
    role: 'tab',
    'aria-selected': String(optionValue === value),
    onclick: () => {
      nodes.forEach((node) => node.setAttribute('aria-selected', 'false'));
      nodes[options.findIndex(([v]) => v === optionValue)].setAttribute('aria-selected', 'true');
      onChange(optionValue);
    },
  }, label));
  return el('div', { class: 'tabs', role: 'tablist' }, nodes);
}

export const pageHead = (title, ...actions) => el('div', { class: 'page-head' }, el('h1', {}, title), ...actions);
export const stat = (label, value) => el('div', { class: 'stat' }, el('small', {}, label), el('b', {}, value));
export const pairs = (rows) => el('dl', { class: 'pairs' }, rows.map(([label, value, className]) =>
  el('div', { class: className }, el('dt', {}, label), el('dd', {}, value))));

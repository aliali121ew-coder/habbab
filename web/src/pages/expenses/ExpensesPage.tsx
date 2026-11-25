import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowDown, ArrowUp, ArrowUpDown, CalendarRange, ChevronDown, ChevronLeft, ChevronRight, Download, HeartPulse, Layers, Minus, Paperclip, Pencil,
  Plus, Printer, Receipt, Search, Sheet, Trash2, TrendingDown, TrendingUp, Trophy, CalendarDays, User, FileText, BarChart3, X, Archive, Gift,
} from 'lucide-react';
import { BackToClose } from '../../components/useBackToClose';
import { useIsPhone } from '../../useIsPhone';
import { SAMPLE_DONATIONS } from '../../data/donations';
import { api, type Me, type Overview } from '../../api';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import { StateMessage } from '../../components/StateMessage';
import { DatePicker, monthRange, periodLabel, wholeMonth, type DateRange } from '../../components/DatePicker';
import { MONTH_NAMES, formatNumber, formatPercent, monthIndex, today } from '../../format';
import { CATEGORIES, CATEGORY_BY_ID, type ExpenseCategory } from './categories';
import {
  STATUS_LABEL, STATUS_ORDER, getExpenseStatus, loadStatusMap, nextStatus, setExpenseStatus,
  type BeneficiaryStatus,
} from './beneficiaryStatus';
import { ExpenseDialog } from './ExpenseDialog';
import { ExpensesPrintModal } from './ExpensesPrintModal';

export interface ExpenseItem {
  id: number;
  category: ExpenseCategory;
  amount: number;
  spent_on: string;
  details: string | null;
  beneficiary_id: number | null;
  beneficiary_name: string | null;
  created_at: string;
  created_by_name: string | null;
  files: number;
}

interface MonthSheet {
  month: string;
  from: string;
  to: string;
  items: ExpenseItem[];
  year: { total: number; count: number }[];
}

type SortKey = 'spent_on' | 'category' | 'beneficiary' | 'status' | 'amount';

const PAGE_SIZE = 25;

// A day inside the chosen period for a new entry: today when it falls inside, else the last day.
const dayIn = ({ from, to }: DateRange) => {
  const now = today();
  return now >= from && now <= to ? now : to;
};

// 2026-11-05 → 2026/11/05: one width for every date in the table.
const shortDate = (iso: string) => iso.slice(0, 10).replaceAll('-', '/');
const categoryLabel = (id: ExpenseCategory) => CATEGORY_BY_ID.get(id)?.label ?? id;
const beneficiaryCountLabel = (n: number) => (n === 1 ? 'مستفيد' : n <= 10 ? 'مستفيدين' : 'مستفيداً');
const categoryOrder = new Map(CATEGORIES.map((item, index) => [item.id, index]));

// The same period one month earlier: the whole previous month for a month, else the same days a
// month back (a day past the shorter month's end settles on its last day).
function monthBefore(range: DateRange): DateRange {
  const month = wholeMonth(range);
  if (month) return monthRange(month.year, month.month - 1);
  const back = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    const last = new Date(Date.UTC(y, m - 1, 0)).getUTCDate();
    return new Date(Date.UTC(y, m - 2, Math.min(d, last))).toISOString().slice(0, 10);
  };
  return { from: back(range.from), to: back(range.to) };
}

// A heading's spending against the month before: a red bar + arrow up when more was spent,
// a green bar + arrow down when less, a dash when steady.
function Delta({ change, bar = false }: { change: number | null | undefined; bar?: boolean }) {
  if (change === undefined) return <span className="exp-delta muted">—</span>;
  if (change === null) {
    return (
      <span className="exp-delta up" title="زيادة عن الشهر السابق">
        {bar && <span className="exp-delta-bar" aria-hidden><span style={{ width: '100%' }} /></span>}
        <bdi>100%</bdi>
        <ArrowUp size={14} strokeWidth={2.5} aria-label="زيادة" />
      </span>
    );
  }
  if (Math.abs(change) < 0.05) return <span className="exp-delta flat"><Minus size={14} aria-hidden /><bdi>0%</bdi></span>;
  const up = change > 0;
  const abs = Math.abs(change);
  const fill = `${Math.min(100, Math.max(14, Math.round(abs)))}%`;
  return (
    <span className={`exp-delta ${up ? 'up' : 'down'}`} title={up ? 'زيادة عن الشهر السابق' : 'انخفاض عن الشهر السابق'}>
      {bar && <span className="exp-delta-bar" aria-hidden><span style={{ width: fill }} /></span>}
      <bdi>{formatPercent(abs)}</bdi>
      {up ? <ArrowUp size={14} strokeWidth={2.5} aria-label="زيادة" /> : <ArrowDown size={14} strokeWidth={2.5} aria-label="انخفاض" />}
    </span>
  );
}

/**
 * One entry's details in a centred window (phones): the heading with its icon and the amount in
 * large type, then beneficiary, beneficiary status, date, details, the heading's percentage change
 * on last month and the attachments; «تعديل القيد» opens the entry for editing.
 */
function ExpenseView({ item, status, change, currency, onEdit, onClose }: {
  item: ExpenseItem;
  status: BeneficiaryStatus;
  change: number | null | undefined;
  currency: string;
  onEdit: () => void;
  onClose: () => void;
}) {
  const Icon = CATEGORY_BY_ID.get(item.category)?.icon;
  const rows: [typeof User, string, React.ReactNode][] = [
    [User, 'المستفيد', item.beneficiary_name ?? <span className="exp-missing">غير محدد</span>],
    [HeartPulse, 'حالة المستفيد', <span key="s" className={`exp-status-badge ${status}`}>{STATUS_LABEL[status]}</span>],
    [CalendarDays, 'التاريخ', <bdi key="d" dir="ltr">{shortDate(item.spent_on)}</bdi>],
    [FileText, 'التفاصيل', item.details || <span className="exp-missing">غير محدد</span>],
    [BarChart3, 'نسبة الصرف', <Delta key="c" change={change} bar />],
  ];
  if (item.files > 0) rows.push([Paperclip, 'المرفقات', <bdi key="f">{formatNumber(item.files)}</bdi>]);
  return createPortal(
    <div className="exp-view-layer" role="presentation" onClick={onClose}>
      <BackToClose onClose={onClose} />
      <section className="exp-view" data-tone={TONE[item.category]} role="dialog" aria-modal="true" aria-label={`تفاصيل القيد: ${categoryLabel(item.category)}`} onClick={(event) => event.stopPropagation()}>
        <button type="button" className="exp-view-close" aria-label="إغلاق" onClick={onClose}><X size={18} aria-hidden /></button>
        <header className="exp-view-head">
          <span className="exp-view-icon" aria-hidden>{Icon && <Icon size={26} />}</span>
          <p className="exp-view-cat">{categoryLabel(item.category)}</p>
          <p className="exp-view-amount"><bdi>{formatNumber(item.amount)}</bdi> <small>{currency}</small></p>
        </header>
        <dl className="exp-view-rows">
          {rows.map(([RowIcon, label, value]) => (
            <div key={label}>
              <dt><RowIcon size={15} aria-hidden />{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <footer className="exp-view-foot">
          <button type="button" className="btn primary" onClick={onEdit}><Pencil size={16} aria-hidden /> تعديل القيد</button>
          <button type="button" className="btn" onClick={onClose}>إغلاق</button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}

interface Flow {
  // The balance carried in at the start of the month, the month's money in and out, and the
  // same two for the month before (for the change).
  opening: number;
  income: number;
  spent: number;
  prevIncome: number;
  prevSpent: number;
}

const change = (before: number, now: number) => (before > 0 ? ((now - before) / before) * 100 : null);

// A balance without its sign; a deficit shows in red (the previous balance) instead of a minus.
function Signed({ value }: { value: number }) {
  return <bdi dir="ltr">{formatNumber(Math.abs(value))}</bdi>;
}

// The month's money in five cards across both phone and desktop: spending, income (each with its
// change on last month), charity boxes, cash donations, and the current balance.
function BalanceCards({ flow, currency }: { flow: Flow | null; year?: number; month?: number; currency: string }) {
  const closing = flow ? flow.opening + flow.income - flow.spent : 0;
  // Change pill under the figure (green when it moved the good way).
  const pill = (value: number | null, goodUp: boolean) => {
    if (value === null) return <span className="bal-pill flat" title="مقارنة بالشهر السابق">— عن السابق</span>;
    const up = value >= 0;
    const tone = Math.abs(value) < 0.05 ? 'flat' : up === goodUp ? 'good' : 'bad';
    return (
      <span className={`bal-pill ${tone}`} title="مقارنة بالشهر السابق">
        {up ? <ArrowUp size={13} strokeWidth={2.5} aria-label="ارتفاع" /> : <ArrowDown size={13} strokeWidth={2.5} aria-label="انخفاض" />}
        <bdi>{formatPercent(Math.abs(value))}</bdi> <span>عن السابق</span>
      </span>
    );
  };
  const amount = (value: number | undefined, signed = false) => (flow && value !== undefined
    ? <>{signed ? <Signed value={value} /> : <bdi>{formatNumber(value)}</bdi>} <small>{currency}</small></>
    : '—');
  return (
    <section className="bal" aria-label="الرصيد والوارد والمصروف">
      <article className="bal-card bal-phone">
        <h2><TrendingDown size={14} aria-hidden /> المصروف</h2>
        <p className="bal-value">{amount(flow?.spent)}</p>
        {flow && pill(change(flow.prevSpent, flow.spent), false)}
      </article>
      <article className="bal-card bal-phone">
        <h2><TrendingUp size={14} aria-hidden /> الوارد</h2>
        <p className="bal-value">{amount(flow?.income)}</p>
        {flow && pill(change(flow.prevIncome, flow.income), true)}
      </article>
      <article className="bal-card bal-phone">
        <h2><Archive size={14} aria-hidden /> صناديق الصدقات</h2>
        {/* No charity-box records exist yet; nothing is made up here. */}
        <p className="bal-value bal-none">—</p>
        <span className="bal-pill flat">لم تُسجَّل بعد</span>
      </article>
      <article className="bal-card bal-phone">
        <h2><Gift size={14} aria-hidden /> تبرعات مالية</h2>
        {/* Sample figures (data/donations.ts) until the donations section exists, as on the home page. */}
        <p className="bal-value"><bdi>{formatNumber(SAMPLE_DONATIONS.cash)}</bdi> <small>{currency}</small></p>
        {pill(change(SAMPLE_DONATIONS.cashBefore, SAMPLE_DONATIONS.cash), true)}
      </article>
      <article className={`bal-card bal-now${flow && closing < 0 ? ' neg' : ''}`}>
        <h2>الرصيد الحالي</h2>
        <p className="bal-value">{amount(flow ? closing : undefined, true)}</p>
      </article>
    </section>
  );
}

// Related headings share one colour, so the type column reads at a glance.
const TONE: Record<ExpenseCategory, string> = {
  medicine: 'care', patient_aid: 'care', operation_aid: 'care',
  cash_gift: 'money', general_aid: 'money', marriage_aid: 'money', salaries: 'money',
  building_aid: 'home', appliances: 'home', appliance_repair: 'home',
  food: 'food', cattle: 'food',
  foundation_balance: 'org', foundation_costs: 'org',
  prayer_fasting: 'faith', religious_events: 'faith',
  other_aid: 'other',
};

function compare(a: ExpenseItem, b: ExpenseItem, key: SortKey, statusMap: Record<number, BeneficiaryStatus>): number {
  if (key === 'amount') return a.amount - b.amount;
  if (key === 'category') return (categoryOrder.get(a.category) ?? 0) - (categoryOrder.get(b.category) ?? 0);
  if (key === 'beneficiary') return (a.beneficiary_name ?? '').localeCompare(b.beneficiary_name ?? '', 'ar');
  if (key === 'status') {
    const sa = STATUS_ORDER[getExpenseStatus(a.id, a.category, statusMap)];
    const sb = STATUS_ORDER[getExpenseStatus(b.id, b.category, statusMap)];
    return sa - sb;
  }
  return a.spent_on.localeCompare(b.spent_on) || a.id - b.id;
}

// The rows on screen as a spreadsheet: UTF-8 with a byte-order mark, so Excel reads Arabic as is.
function exportCsv(rows: ExpenseItem[], period: string, statusMap: Record<number, BeneficiaryStatus>) {
  const cell = (value: string | number | null) => {
    const text = value === null ? '' : String(value);
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const head = ['التاريخ', 'نوع الصرف', 'المستفيد', 'حالة المستفيد', 'رقم المشترك', 'الوصف', 'المبلغ', 'أُدخل بواسطة', 'وقت الإدخال', 'المرفقات'];
  const lines = rows.map((row) => [
    row.spent_on, categoryLabel(row.category), row.beneficiary_name, STATUS_LABEL[getExpenseStatus(row.id, row.category, statusMap)],
    row.beneficiary_id, row.details, row.amount,
    row.created_by_name, row.created_at.slice(0, 16).replace('T', ' '), row.files,
  ].map(cell).join(','));
  const blob = new Blob(['﻿', [head.join(','), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `صرفيات-${period}.csv`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// The foundation's spending over a chosen period (a month by default): three figures that each say
// one thing, then every entry of the period in one flat table that sorts, searches, filters, pages, groups by heading
// on request and exports to Excel.
export function ExpensesPage({ me }: { me: Me }) {
  const now = new Date();
  const thisYear = now.getUTCFullYear();
  const thisMonth = now.getUTCMonth();
  const [range, setRange] = useState<DateRange>(() => monthRange(thisYear, thisMonth));
  const [sheet, setSheet] = useState<MonthSheet | null>(null);
  // Each heading's monthly average across prior months of the year, for the percentage column.
  const [beforeAvg, setBeforeAvg] = useState<Map<ExpenseCategory, number> | null>(null);
  // Expanded category rows (showing their sliding capsule details).
  const [expandedCats, setExpandedCats] = useState<Set<ExpenseCategory>>(() => new Set());
  // The month the period ends in and the month before it: spent and received.
  const [flow, setFlow] = useState<Flow | null>(null);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState<{ entry: ExpenseItem | null } | null>(null);
  // Phones: a tapped entry opens its details first (the window has «تعديل القيد»).
  const [viewing, setViewing] = useState<ExpenseItem | null>(null);
  const isPhone = useIsPhone();
  const [printing, setPrinting] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<ExpenseCategory | ''>('');
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'spent_on', desc: true });
  const [sortStatus, setSortStatus] = useState('');
  const [grouped, setGrouped] = useState(false);
  const [page, setPage] = useState(0);
  const [statusMap, setStatusMap] = useState<Record<number, BeneficiaryStatus>>(() => loadStatusMap());

  const cycleStatus = (item: ExpenseItem) => {
    const current = getExpenseStatus(item.id, item.category, statusMap);
    setStatusMap(setExpenseStatus(item.id, nextStatus(current)));
  };

  const removeEntry = async (item: ExpenseItem) => {
    const target = item.beneficiary_name || categoryLabel(item.category);
    if (!window.confirm(`هل تريد حذف قيد «${target}» بمبلغ ${formatNumber(item.amount)} ${me.currency}؟`)) return;
    try {
      await api(`/expenses/${item.id}`, { method: 'DELETE' });
      void load();
    } catch (failure) {
      setError((failure as Error).message);
    }
  };

  const toggleCategory = (id: ExpenseCategory) => {
    setExpandedCats((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // The year card and the month comparison follow the month the period ends in.
  const year = Number(range.to.slice(0, 4));
  const month = Number(range.to.slice(5, 7)) - 1;
  const isMonth = wholeMonth(range) !== null;
  const label = periodLabel(range);
  const period = isMonth ? range.to.slice(0, 7) : `${range.from}_${range.to}`;

  const load = useCallback(async () => {
    setError('');
    try {
      const back = monthBefore(range);
      const priorFrom = `${Number(back.to.slice(0, 4))}-01-01`;
      const [current, prior] = await Promise.all([
        api<MonthSheet>(`/expenses?from=${range.from}&to=${range.to}`),
        api<MonthSheet>(`/expenses?from=${priorFrom}&to=${back.to}`).catch(() => null),
      ]);
      const avgMap = new Map<ExpenseCategory, number>();
      if (prior) {
        const totals = new Map<ExpenseCategory, number>();
        const months = new Map<ExpenseCategory, Set<string>>();
        prior.items.forEach((item) => {
          totals.set(item.category, (totals.get(item.category) ?? 0) + item.amount);
          const set = months.get(item.category) ?? new Set<string>();
          set.add(item.spent_on.slice(0, 7));
          months.set(item.category, set);
        });
        totals.forEach((sum, cat) => {
          const count = months.get(cat)?.size || 1;
          avgMap.set(cat, sum / count);
        });
      }
      setBeforeAvg(prior ? avgMap : null);
      setSheet(current);
    } catch (failure) {
      setError((failure as Error).message);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to]);

  useEffect(() => { setSheet(null); void load(); }, [load]);

  // The balance runs from the start of last year: its months and this year's months before the
  // chosen one carry in; the chosen month's payments come in and its spending goes out.
  useEffect(() => {
    if (!sheet) return undefined;
    let live = true;
    void (async () => {
      const [thisYear, lastYear, lastSheet] = await Promise.all([
        api<Overview>(`/collections/overview?year=${year}&delegates=0`).catch(() => null),
        api<Overview>(`/collections/overview?year=${year - 1}&delegates=0`).catch(() => null),
        api<MonthSheet>(`/expenses?from=${year - 1}-12-01&to=${year - 1}-12-31`).catch(() => null),
      ]);
      if (!live) return;
      const incomeOf = (overview: Overview | null) => Array.from({ length: 12 }, (_, at) => overview?.months.find((item) => monthIndex(item.period) === at)?.paid_amount ?? 0);
      const income = incomeOf(thisYear);
      const lastIncome = incomeOf(lastYear);
      const spent = sheet.year.map((item) => item.total);
      const lastSpent = lastSheet?.year.map((item) => item.total) ?? Array(12).fill(0);
      const net = (inc: number[], out: number[], upTo: number) => inc.slice(0, upTo).reduce((sum, value, at) => sum + value - (out[at] ?? 0), 0);
      setFlow({
        opening: net(lastIncome, lastSpent, 12) + net(income, spent, month),
        income: income[month],
        spent: spent[month] ?? 0,
        prevIncome: month > 0 ? income[month - 1] : lastIncome[11],
        prevSpent: month > 0 ? spent[month - 1] ?? 0 : lastSpent[11] ?? 0,
      });
    })();
    return () => { live = false; };
  }, [sheet, year, month]);
  useEffect(() => { setPage(0); }, [query, category, sort, grouped, period]);

  const figures = useMemo(() => {
    if (!sheet) return null;
    const total = sheet.items.reduce((sum, item) => sum + item.amount, 0);
    const byCategory = new Map<ExpenseCategory, number>();
    sheet.items.forEach((item) => byCategory.set(item.category, (byCategory.get(item.category) ?? 0) + item.amount));
    const [topId, topTotal] = [...byCategory].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
    // Only a whole month has a fair neighbour to compare with.
    const previous = isMonth && month > 0 ? sheet.year[month - 1].total : 0;
    const upToMonth = sheet.year.slice(0, month + 1);
    const yearTotal = upToMonth.reduce((sum, item) => sum + item.total, 0);
    // The average counts only the months that had spending, so an empty year does not dilute it.
    const activeMonths = upToMonth.filter((item) => item.total > 0).length;
    return {
      total,
      people: new Set(sheet.items.map((item) => item.beneficiary_id ?? item.beneficiary_name ?? `#${item.id}`)).size,
      top: topId ? { label: categoryLabel(topId), total: topTotal } : null,
      change: previous > 0 ? ((total - previous) / previous) * 100 : null,
      yearTotal,
      activeMonths,
      average: activeMonths ? Math.round(yearTotal / activeMonths) : 0,
      byCategory,
    };
  }, [sheet, month, isMonth]);

  // Per heading: percentage change against that category's monthly average (or against the
  // average across active categories in this period when no prior months exist yet).
  const changeOf = (id: ExpenseCategory): number | null | undefined => {
    if (!figures) return undefined;
    const current = figures.byCategory.get(id) ?? 0;
    const historicalAvg = beforeAvg?.get(id) ?? 0;
    if (historicalAvg > 0) return ((current - historicalAvg) / historicalAvg) * 100;
    const activeCats = figures.byCategory.size;
    if (activeCats <= 1) return 0;
    const periodAvg = figures.total / activeCats;
    return periodAvg > 0 ? ((current - periodAvg) / periodAvg) * 100 : 0;
  };

  const rows = useMemo(() => {
    if (!sheet) return [];
    const needle = query.trim().toLowerCase();
    const shown = sheet.items.filter((item) => (
      (!category || item.category === category)
      && (!needle || `${item.beneficiary_name ?? ''} ${item.details ?? ''}`.toLowerCase().includes(needle))
    ));
    shown.sort((a, b) => (sort.desc ? -1 : 1) * compare(a, b, sort.key, statusMap));
    return shown;
  }, [sheet, query, category, sort, statusMap]);

  const categoryGroups = useMemo(() => {
    const map = new Map<ExpenseCategory, ExpenseItem[]>();
    rows.forEach((item) => {
      const list = map.get(item.category) ?? [];
      list.push(item);
      map.set(item.category, list);
    });
    const list = [...map.entries()].map(([cat, items]) => {
      const total = items.reduce((sum, it) => sum + it.amount, 0);
      const latestDate = items.reduce((max, it) => (it.spent_on > max ? it.spent_on : max), items[0].spent_on);
      const status = items.reduce<BeneficiaryStatus>((worst, it) => {
        const s = getExpenseStatus(it.id, it.category, statusMap);
        return STATUS_ORDER[s] < STATUS_ORDER[worst] ? s : worst;
      }, getExpenseStatus(items[0].id, items[0].category, statusMap));
      const beneficiaryCount = new Set(
        items.map((it) => it.beneficiary_id ?? it.beneficiary_name ?? `#${it.id}`),
      ).size;
      return {
        category: cat,
        items,
        total,
        count: items.length,
        beneficiaryCount,
        latestDate,
        status,
        primaryName: items[0].beneficiary_name,
        primaryId: items[0].beneficiary_id,
      };
    });
    list.sort((a, b) => {
      const dir = sort.desc ? -1 : 1;
      if (sort.key === 'amount') return dir * (a.total - b.total);
      if (sort.key === 'category') return dir * ((categoryOrder.get(a.category) ?? 0) - (categoryOrder.get(b.category) ?? 0));
      if (sort.key === 'beneficiary') return dir * (a.beneficiaryCount - b.beneficiaryCount);
      if (sort.key === 'status') return dir * (STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
      return dir * a.latestDate.localeCompare(b.latestDate);
    });
    return list;
  }, [rows, sort, statusMap]);

  const markedDays = useMemo(() => new Set(sheet?.items.map((item) => item.spent_on.slice(0, 10)) ?? []), [sheet]);
  const filtered = rows.length !== (sheet?.items.length ?? 0);
  const pages = Math.max(1, Math.ceil(categoryGroups.length / PAGE_SIZE));
  const pageGroups = categoryGroups.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const sortBy = (key: SortKey, label: string) => {
    const nextDesc = sort.key === key ? !sort.desc : key !== 'beneficiary' && key !== 'category';
    setSort({ key, desc: nextDesc });
    setSortStatus(`تم الترتيب حسب ${label}، ${nextDesc ? 'تنازلياً' : 'تصاعدياً'}، ${formatNumber(rows.length)} قيداً`);
  };
  const clearFilters = () => { setQuery(''); setCategory(''); };

  const header = (key: SortKey, label: string, className: string, dataType: 'text' | 'number' | 'date' = 'text', showIdleArrows = false) => {
    const active = sort.key === key;
    return (
      <th scope="col" className={className} data-type={dataType} aria-sort={active ? (sort.desc ? 'descending' : 'ascending') : undefined}>
        <button type="button" className={`exp-sort${active ? ' active' : ''}`} onClick={() => sortBy(key, label)}>
          {label}
          {active ? (sort.desc ? <ArrowDown size={13} aria-hidden /> : <ArrowUp size={13} aria-hidden />) : (showIdleArrows && <ArrowUpDown size={13} className="exp-sort-idle" aria-hidden />)}
        </button>
      </th>
    );
  };

  return (
    <>
      <div className="page-head exp-head">
        <span className="page-icon" aria-hidden><Receipt size={24} /></span>
        <div>
          <Breadcrumbs items={[{ label: 'الرئيسية', href: '#/' }]} />
          <h1>الحركات المالية</h1>
        </div>
        <div className="page-actions">
          <DatePicker mode="range" presets label="مدة الحركات المالية" value={range} onChange={setRange} marked={markedDays} />
          <a className="btn" href="#/expenses/ledger" aria-label="السجل السنوي">
            <Sheet size={18} aria-hidden />
            <span className="btn-label">السجل</span>
          </a>
          <button type="button" className="btn" aria-label="طباعة السجل" disabled={!sheet} onClick={() => setPrinting(true)}>
            <Printer size={18} aria-hidden />
            <span className="btn-label">طباعة السجل</span>
          </button>
          <button type="button" className="btn primary" aria-label="إضافة صرف" onClick={() => setDialog({ entry: null })}>
            <Plus size={18} aria-hidden />
            <span className="btn-label">إضافة صرف</span>
          </button>
        </div>
      </div>

      {error && !sheet && <StateMessage kind="error" title="تعذّر تحميل الحركات المالية" hint={error} onRetry={load} />}

      {!figures && !error && (
        <div className="stats exp-stats" aria-busy="true">{[0, 1, 2].map((key) => <div key={key} className="stat skeleton" />)}</div>
      )}

      {figures && sheet && (
        <>
          <BalanceCards flow={flow} year={year} month={month} currency={me.currency} />

          <section className="register exp-board" aria-labelledby="exp-board-title">
            <header className="exp-board-head">
              <div>
                <h2 id="exp-board-title">سجل صرفيات <bdi>{label}</bdi></h2>
                <p>{filtered ? `يعرض ${formatNumber(rows.length)} من ${formatNumber(sheet.items.length)} قيداً` : `${formatNumber(sheet.items.length)} قيداً`}</p>
              </div>
            </header>

            <div className="exp-filters" role="search">
              <label className="exp-search">
                <Search size={16} aria-hidden />
                <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="بحث بالاسم" aria-label="بحث" />
              </label>
              <select className="exp-select" value={category} onChange={(event) => setCategory(event.target.value as ExpenseCategory | '')} aria-label="نوع الصرف">
                <option value="">كل أنواع الصرف</option>
                {CATEGORIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
              {(query || category) && (
                <button type="button" className="exp-clear" onClick={clearFilters}>مسح الفلاتر</button>
              )}
            </div>

            {sheet.items.length === 0 ? (
              <p className="exp-empty">لا صرفيات مسجلة في <bdi>{label}</bdi>. اضغط «إضافة صرف» لتسجيل أول قيد.</p>
            ) : rows.length === 0 ? (
              <p className="exp-empty">لا قيود تطابق البحث أو الفلاتر.</p>
            ) : (
              <div className="exp-table-wrap" tabIndex={0} role="region" aria-labelledby="exp-board-title">
                <span role="status" className="visually-hidden">{sortStatus}</span>
                <table className="exp-flat">
                  <caption className="visually-hidden">سجل صرفيات <bdi>{label}</bdi></caption>
                  <thead>
                    <tr>
                      {header('category', 'نوع الصرف', 'col-cat', 'text')}
                      {header('amount', 'المبلغ', 'col-amount', 'number', true)}
                      {header('beneficiary', 'المستفيدون', 'col-person', 'number')}
                      {header('status', 'حالة المستفيد', 'col-status', 'text')}
                      <th scope="col" className="col-details">التفاصيل</th>
                      {header('spent_on', 'التاريخ', 'col-date', 'date')}
                      <th scope="col" className="col-change" title="نسبة الصرف مقارنة بالشهر السابق">نسبة الصرف</th>
                      <th scope="col" className="col-act">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageGroups.map((group) => {
                      const Icon = CATEGORY_BY_ID.get(group.category)?.icon;
                      const expanded = expandedCats.has(group.category);
                      const single = group.count === 1 ? group.items[0] : null;
                      return [
                        <tr
                          key={group.category}
                          className={`exp-row exp-cat-row${expanded ? ' expanded' : ''}`}
                          aria-expanded={expanded}
                          onClick={() => toggleCategory(group.category)}
                        >
                          <td className="col-cat">
                            <span className="exp-type" data-tone={TONE[group.category]}>
                              <span className="exp-type-icon" aria-hidden>{Icon && <Icon size={17} />}</span>
                              <span className="exp-type-meta">
                                <span>{categoryLabel(group.category)}</span>
                                <small className="exp-cat-count"><bdi>{formatNumber(group.count)}</bdi> {group.count === 1 ? 'قيد' : 'قيود'}</small>
                              </span>
                            </span>
                          </td>
                          <td className="col-amount"><bdi>{formatNumber(group.total)}</bdi> <small className="exp-cur">{me.currency}</small></td>
                          <td className="col-person">
                            <button
                              type="button"
                              className={`exp-person-count${expanded ? ' open' : ''}`}
                              aria-expanded={expanded}
                              title="اضغط لعرض تفاصيل المستفيدين"
                              onClick={(event) => { event.stopPropagation(); toggleCategory(group.category); }}
                            >
                              <User size={14} aria-hidden />
                              <span><bdi>{formatNumber(group.beneficiaryCount)}</bdi> {beneficiaryCountLabel(group.beneficiaryCount)}</span>
                            </button>
                          </td>
                          <td className="col-status">
                            {single ? (
                              <button
                                type="button"
                                className={`exp-status-badge ${group.status}`}
                                title="اضغط لتغيير حالة المستفيد"
                                aria-label={`حالة المستفيد: ${STATUS_LABEL[group.status]} — اضغط للتغيير`}
                                onClick={(event) => { event.stopPropagation(); cycleStatus(single); }}
                              >
                                {STATUS_LABEL[group.status]}
                              </button>
                            ) : (
                              <span className={`exp-status-badge ${group.status}`}>{STATUS_LABEL[group.status]}</span>
                            )}
                          </td>
                          <td className="col-details">
                            {single ? (single.details || <span className="exp-missing">غير محدد</span>) : `${formatNumber(group.count)} قيود مجمّعة`}
                          </td>
                          <td className="col-date">
                            <span className="exp-date-pill">
                              <CalendarDays size={13} aria-hidden />
                              <bdi dir="ltr">{shortDate(group.latestDate)}</bdi>
                            </span>
                          </td>
                          <td className="col-change"><Delta change={changeOf(group.category)} bar /></td>
                          <td className="col-act">
                            <button
                              type="button"
                              className={`exp-capsule-toggle${expanded ? ' open' : ''}`}
                              aria-label={expanded ? `إخفاء تفاصيل ${categoryLabel(group.category)}` : `عرض تفاصيل ${categoryLabel(group.category)}`}
                              onClick={(event) => { event.stopPropagation(); toggleCategory(group.category); }}
                            >
                              <ChevronDown size={16} aria-hidden />
                            </button>
                          </td>
                        </tr>,
                        expanded && (
                          <tr key={`${group.category}-capsule`} className="exp-capsule-row">
                            <td colSpan={8}>
                              <div className="exp-capsule-drawer" data-tone={TONE[group.category]}>
                                <div className="exp-capsule-list">
                                  {group.items.map((item) => {
                                    const st = getExpenseStatus(item.id, item.category, statusMap);
                                    return (
                                      <div
                                        key={item.id}
                                        className="exp-capsule-item"
                                        onClick={() => (isPhone ? setViewing(item) : setDialog({ entry: item }))}
                                      >
                                        <div className="exp-cap-main">
                                          <span className="exp-cap-person">
                                            <strong>{item.beneficiary_name ?? 'غير محدد'}</strong>
                                            {item.beneficiary_id !== null && (
                                              <span className="exp-file-no">رقم الملف: <bdi>#{item.beneficiary_id}</bdi></span>
                                            )}
                                          </span>
                                          {item.details && <span className="exp-cap-details">{item.details}</span>}
                                        </div>

                                        <div className="exp-cap-meta">
                                          <button
                                            type="button"
                                            className={`exp-status-badge ${st}`}
                                            title="اضغط لتغيير حالة المستفيد"
                                            onClick={(event) => { event.stopPropagation(); cycleStatus(item); }}
                                          >
                                            {STATUS_LABEL[st]}
                                          </button>
                                          <span className="exp-date-pill">
                                            <CalendarDays size={13} aria-hidden />
                                            <bdi dir="ltr">{shortDate(item.spent_on)}</bdi>
                                          </span>
                                          <span className="exp-cap-amount">
                                            <bdi>{formatNumber(item.amount)}</bdi> <small className="exp-cur">{me.currency}</small>
                                          </span>
                                          <span className="exp-cap-actions">
                                            {item.files > 0 && <span className="exp-clip" title={`${formatNumber(item.files)} مرفق`}><Paperclip size={13} aria-hidden /><bdi>{item.files}</bdi></span>}
                                            <button type="button" className="exp-row-edit" aria-label={`تعديل قيد ${item.beneficiary_name ?? item.id}`} onClick={(event) => { event.stopPropagation(); setDialog({ entry: item }); }}>
                                              <Pencil size={14} aria-hidden />
                                            </button>
                                            <button type="button" className="exp-row-del" aria-label={`حذف قيد ${item.beneficiary_name ?? item.id}`} onClick={(event) => { event.stopPropagation(); void removeEntry(item); }}>
                                              <Trash2 size={14} aria-hidden />
                                            </button>
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </td>
                          </tr>
                        ),
                      ];
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {pages > 1 && (
              <nav className="exp-pager" aria-label="صفحات السجل">
                <button type="button" className="pager-btn" disabled={page === 0} onClick={() => setPage(page - 1)}>
                  <ChevronRight size={16} aria-hidden /> السابق
                </button>
                <span>صفحة <bdi>{page + 1}</bdi> من <bdi>{pages}</bdi></span>
                <button type="button" className="pager-btn" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>
                  التالي <ChevronLeft size={16} aria-hidden />
                </button>
              </nav>
            )}
          </section>
        </>
      )}

      {printing && sheet && (
        <ExpensesPrintModal
          title={label}
          isMonth={isMonth}
          items={rows}
          filterNote={[category && `نوع الصرف: ${categoryLabel(category)}`, query.trim() && `بحث: ${query.trim()}`].filter(Boolean).join(' · ')}
          currency={me.currency}
          onClose={() => setPrinting(false)}
        />
      )}

      {viewing && (
        <ExpenseView
          item={viewing}
          status={getExpenseStatus(viewing.id, viewing.category, statusMap)}
          change={changeOf(viewing.category)}
          currency={me.currency}
          onEdit={() => { const entry = viewing; setViewing(null); setDialog({ entry }); }}
          onClose={() => setViewing(null)}
        />
      )}

      {dialog && (
        <ExpenseDialog
          entry={dialog.entry}
          defaultDate={dayIn(range)}
          currency={me.currency}
          onClose={() => setDialog(null)}
          onSaved={() => { setDialog(null); setStatusMap(loadStatusMap()); void load(); }}
        />
      )}
    </>
  );
}

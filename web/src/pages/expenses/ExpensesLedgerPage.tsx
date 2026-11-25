import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import {
  Archive, ArrowDown, ArrowRight, ArrowUp, CalendarDays, ChevronLeft, ChevronRight, Download,
  Gift, HandHeart, Layers, Sheet, TrendingDown, TrendingUp, Trophy, Users, Wallet,
} from 'lucide-react';
import { api, type Me } from '../../api';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import { StateMessage } from '../../components/StateMessage';
import { SAMPLE_DONATIONS } from '../../data/donations';
import { MONTH_NAMES, formatNumber, formatPercent, monthIndex } from '../../format';
import { ledgerFromHash, ledgerHref } from '../../route';
import { CATEGORIES, CATEGORY_BY_ID, type ExpenseCategory } from './categories';

interface Ledger {
  year: number;
  cells: { month: number; category: ExpenseCategory; total: number; count: number }[];
}
interface Overview { months: { period: string; paid_amount: number }[] }
interface MonthSheet {
  items: { id: number; category: ExpenseCategory; amount: number; spent_on: string; beneficiary_name: string | null }[];
}

const subscribe = (listener: () => void) => {
  window.addEventListener('hashchange', listener);
  return () => window.removeEventListener('hashchange', listener);
};

const now = new Date();
const THIS_YEAR = now.getUTCFullYear();
const THIS_MONTH = now.getUTCMonth();
const isFuture = (year: number, month: number) => year > THIS_YEAR || (year === THIS_YEAR && month > THIS_MONTH);
const change = (before: number, after: number) => (before > 0 ? ((after - before) / before) * 100 : null);
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

// The year's ledger per heading: twelve monthly totals and counts each, plus the month totals.
function shape(ledger: Ledger) {
  const rows = new Map<ExpenseCategory, { values: number[]; counts: number[] }>();
  ledger.cells.forEach((cell) => {
    const row = rows.get(cell.category) ?? { values: Array<number>(12).fill(0), counts: Array<number>(12).fill(0) };
    row.values[cell.month] += cell.total;
    row.counts[cell.month] += cell.count;
    rows.set(cell.category, row);
  });
  const categories = CATEGORIES
    .filter((item) => rows.has(item.id))
    .map((item) => {
      const row = rows.get(item.id)!;
      return { ...item, ...row, total: sum(row.values), count: sum(row.counts) };
    });
  const monthTotals = Array.from({ length: 12 }, (_, month) => sum(categories.map((item) => item.values[month])));
  const monthCounts = Array.from({ length: 12 }, (_, month) => sum(categories.map((item) => item.counts[month])));
  return { categories, monthTotals, monthCounts, total: sum(monthTotals), count: sum(monthCounts) };
}

async function incomeOf(year: number): Promise<number[] | null> {
  const overview = await api<Overview>(`/collections/overview?year=${year}&delegates=0`).catch(() => null);
  if (!overview) return null;
  return Array.from({ length: 12 }, (_, at) => overview.months.find((item) => monthIndex(item.period) === at)?.paid_amount ?? 0);
}

// One page with two faces: the year (#/expenses/ledger/2026) and one month of it (/2026-11).
export function ExpensesLedgerPage({ me }: { me: Me }) {
  const hash = useSyncExternalStore(subscribe, () => location.hash);
  const { year: hashYear, month } = ledgerFromHash(hash);
  const year = Math.min(hashYear ?? THIS_YEAR, THIS_YEAR);
  return month === null
    ? <YearView me={me} year={year} />
    : <MonthView me={me} year={year} month={month} />;
}

/* ───────────────────────────── shared pieces ───────────────────────────── */

function Pill({ value, goodUp, label = 'عن السابق' }: { value: number | null; goodUp: boolean; label?: string }) {
  if (value === null) return <span className="yl-pill flat">— {label}</span>;
  const up = value >= 0;
  const tone = Math.abs(value) < 0.5 ? 'flat' : up === goodUp ? 'good' : 'bad';
  return (
    <span className={`yl-pill ${tone}`} title="مقارنة بالشهر السابق">
      {up ? <ArrowUp size={12} strokeWidth={2.6} aria-label="ارتفاع" /> : <ArrowDown size={12} strokeWidth={2.6} aria-label="انخفاض" />}
      <bdi>{formatPercent(Math.abs(value))}</bdi> <span>{label}</span>
    </span>
  );
}

interface KpiProps {
  label: string;
  icon: typeof Wallet;
  tone?: 'theme' | 'in' | 'gift' | 'box';
  value: ReactNode;
  unit?: string;
  foot?: ReactNode;
  spark?: number[];
  note?: string;
}

function Kpi({ label, icon: Icon, tone = 'theme', value, unit, foot, spark, note }: KpiProps) {
  return (
    <article className={`yl-kpi tone-${tone}`}>
      <header>
        <span className="yl-kpi-icon" aria-hidden><Icon size={17} /></span>
        <h2>{label}</h2>
        {note && <span className="yl-tag">{note}</span>}
      </header>
      <p className="yl-kpi-value">{value}{unit && <small>{unit}</small>}</p>
      <footer>
        <div className="yl-foot">{foot}</div>
        {spark && <Sparkline values={spark} className="yl-kpi-spark" />}
      </footer>
    </article>
  );
}

// Twelve months as one thin line, January on the right as the page reads; a dot marks the
// latest month with a figure. Each month carries its figure on hover.
function Sparkline({ values, className, upTo = 11, label }: { values: number[]; className?: string; upTo?: number; label?: string }) {
  const W = 120;
  const H = 34;
  const shown = values.slice(0, upTo + 1);
  const max = Math.max(...shown, 1);
  const x = (month: number) => W - 4 - (month / 11) * (W - 8);
  const y = (value: number) => H - 4 - (value / max) * (H - 9);
  const points = shown.map((value, month) => `${x(month).toFixed(1)},${y(value).toFixed(1)}`).join(' ');
  const last = shown.length - 1;
  return (
    <svg className={`yl-spark ${className ?? ''}`} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label ?? 'الحركة خلال السنة'}>
      <line x1="2" x2={W - 2} y1={H - 4} y2={H - 4} className="yl-spark-base" />
      {shown.length > 1 && (
        <polygon className="yl-spark-area" points={`${x(0)},${H - 4} ${points} ${x(last)},${H - 4}`} />
      )}
      <polyline className="yl-spark-line" points={points} />
      {last >= 0 && <circle className="yl-spark-dot" cx={x(last)} cy={y(shown[last])} r="2.6" />}
      {shown.map((value, month) => (
        <rect key={month} x={x(month) - 5} y="0" width="10" height={H} className="yl-spark-hit">
          <title>{`${MONTH_NAMES[month]}: ${formatNumber(value)}`}</title>
        </rect>
      ))}
    </svg>
  );
}

function YearSwitch({ year }: { year: number }) {
  return (
    <div className="yl-switch" role="group" aria-label="السنة">
      <a className="icon-btn" aria-label="السنة السابقة" href={ledgerHref(year - 1)}><ChevronRight size={17} aria-hidden /></a>
      <strong><bdi>{year}</bdi></strong>
      {year < THIS_YEAR
        ? <a className="icon-btn" aria-label="السنة التالية" href={ledgerHref(year + 1)}><ChevronLeft size={17} aria-hidden /></a>
        : <span className="icon-btn" aria-hidden><ChevronLeft size={17} /></span>}
    </div>
  );
}

// The bar is scaled to the largest heading so small shares still read; the figure is the true share.
function Share({ value, max }: { value: number; max: number }) {
  const width = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="yl-share">
      <span className="yl-share-bar"><i style={{ inlineSize: `${Math.max(width, value > 0 ? 3 : 0)}%` }} /></span>
      <bdi>{formatPercent(value)}</bdi>
    </div>
  );
}

function Skeleton() {
  return (
    <>
      <div className="yl-kpis" aria-busy="true">{[0, 1, 2, 3, 4].map((key) => <div key={key} className="yl-kpi skeleton" />)}</div>
      <div className="yl-panel skeleton yl-skel-panel" />
    </>
  );
}

/* ─────────────────────────────── the year ─────────────────────────────── */

function YearView({ me, year }: { me: Me; year: number }) {
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [income, setIncome] = useState<number[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [sheet, money] = await Promise.all([api<Ledger>(`/expenses/ledger?year=${year}`), incomeOf(year)]);
      setLedger(sheet);
      setIncome(money);
    } catch (failure) {
      setError((failure as Error).message);
    }
  }, [year]);

  useEffect(() => { setLedger(null); setIncome(null); void load(); }, [load]);

  const data = useMemo(() => (ledger ? shape(ledger) : null), [ledger]);
  // The month the cards speak of: this month in this year, December in a past one.
  const focus = year === THIS_YEAR ? THIS_MONTH : 11;
  const activeMonths = data ? data.monthTotals.filter((value) => value > 0).length : 0;
  const categories = useMemo(() => (data ? [...data.categories].sort((a, b) => b.total - a.total) : []), [data]);
  const monthMax = data ? Math.max(...data.monthTotals, 1) : 1;

  const exportCsv = () => {
    if (!data) return;
    const head = ['الصنف', ...MONTH_NAMES, 'المجموع', 'عدد المساعدات'];
    const lines = categories.map((item) => [item.label, ...item.values, item.total, item.count].join(','));
    lines.push(['المجموع', ...data.monthTotals, data.total, data.count].join(','));
    const blob = new Blob(['﻿', [head.join(','), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `سجل-الصرفيات-${year}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  return (
    <div className="yl">
      <div className="page-head exp-head yl-head">
        <span className="page-icon" aria-hidden><Sheet size={24} /></span>
        <div>
          <Breadcrumbs items={[{ label: 'الرئيسية', href: '#/' }, { label: 'الحركات المالية', href: '#/expenses' }]} />
          <h1>السجل المالي السنوي</h1>
        </div>
        <div className="page-actions">
          <YearSwitch year={year} />
          <button type="button" className="btn" aria-label="تصدير Excel" disabled={!data?.categories.length} onClick={exportCsv}>
            <Download size={18} aria-hidden />
            <span className="btn-label">تصدير Excel</span>
          </button>
          <a className="btn" href="#/expenses" aria-label="رجوع إلى الحركات المالية">
            <ArrowRight size={18} aria-hidden />
            <span className="btn-label">الحركات المالية</span>
          </a>
        </div>
      </div>

      {error && !ledger && <StateMessage kind="error" title="تعذّر تحميل السجل" hint={error} onRetry={load} />}
      {!data && !error && <Skeleton />}

      {data && (
        <>
          <section className="yl-kpis" aria-label="خلاصة السنة">
            <Kpi
              label="الاستهلاك الشهري" icon={TrendingDown}
              value={<bdi>{formatNumber(data.monthTotals[focus])}</bdi>} unit={me.currency}
              foot={<><span className="yl-foot-label">{MONTH_NAMES[focus]}</span><Pill value={focus > 0 ? change(data.monthTotals[focus - 1], data.monthTotals[focus]) : null} goodUp={false} /></>}
              spark={data.monthTotals.slice(0, focus + 1)}
            />
            <Kpi
              label="الوارد الشهري" icon={TrendingUp} tone="in"
              value={income ? <bdi>{formatNumber(income[focus])}</bdi> : '—'} unit={income ? me.currency : undefined}
              foot={income
                ? <><span className="yl-foot-label">{MONTH_NAMES[focus]}</span><Pill value={focus > 0 ? change(income[focus - 1], income[focus]) : null} goodUp /></>
                : <span className="yl-foot-label">غير متاح لحسابك</span>}
              spark={income?.slice(0, focus + 1)}
            />
            <Kpi
              label="وارد الصناديق" icon={Archive} tone="box"
              value={<span className="yl-none">—</span>}
              // No charity-box records exist yet; nothing is made up here.
              foot={<span className="yl-foot-label">لم تُسجَّل صناديق بعد</span>}
            />
            <Kpi
              label="التبرعات المالية" icon={Gift} tone="gift"
              // Sample figures (data/donations.ts) until the donations section exists.
              value={<bdi>{formatNumber(SAMPLE_DONATIONS.cash)}</bdi>} unit={me.currency}
              foot={<><span className="yl-foot-label"><bdi>{formatNumber(SAMPLE_DONATIONS.donors)}</bdi> متبرع · <span className="yl-tag">تجريبي</span></span><Pill value={change(SAMPLE_DONATIONS.cashBefore, SAMPLE_DONATIONS.cash)} goodUp /></>}
            />
            <Kpi
              label="الاستهلاك السنوي" icon={Layers}
              value={<bdi>{formatNumber(data.total)}</bdi>} unit={me.currency}
              foot={<span className="yl-foot-label">متوسط الشهر <b><bdi>{activeMonths ? formatNumber(Math.round(data.total / activeMonths)) : '—'}</bdi></b></span>}
            />
          </section>

          <section className="yl-panel" aria-labelledby="yl-months">
            <header className="yl-panel-head">
              <div>
                <h2 id="yl-months"><CalendarDays size={18} aria-hidden /> أشهر <bdi>{year}</bdi></h2>
                <p>اضغط على الشهر لعرض تفاصيله</p>
              </div>
            </header>
            <ol className="yl-months">
              {MONTH_NAMES.map((name, month) => {
                const future = isFuture(year, month);
                const total = data.monthTotals[month];
                const body = (
                  <>
                    <span className="yl-month-top">
                      <span className="yl-month-num"><bdi>{month + 1}</bdi></span>
                      <span className="yl-month-name">{name}</span>
                      {!future && <ChevronLeft size={15} className="yl-month-go" aria-hidden />}
                    </span>
                    <span className="yl-month-sum">{future ? '—' : <bdi>{formatNumber(total)}</bdi>}</span>
                    <span className="yl-month-meta">{future ? 'لم يبدأ' : <><bdi>{formatNumber(data.monthCounts[month])}</bdi> مساعدة</>}</span>
                    <span className="yl-month-bar"><i style={{ inlineSize: `${future ? 0 : (total / monthMax) * 100}%` }} /></span>
                  </>
                );
                return (
                  <li key={name}>
                    {future
                      ? <span className="yl-month is-future" aria-disabled="true">{body}</span>
                      : <a className={`yl-month${month === focus ? ' is-now' : ''}`} href={ledgerHref(year, month)}>{body}</a>}
                  </li>
                );
              })}
            </ol>
          </section>

          <section className="yl-panel" aria-labelledby="yl-cats">
            <header className="yl-panel-head">
              <div>
                <h2 id="yl-cats"><HandHeart size={18} aria-hidden /> الأصناف خلال <bdi>{year}</bdi></h2>
                <p>{categories.length
                  ? <><bdi>{formatNumber(categories.length)}</bdi> من <bdi>{formatNumber(CATEGORIES.length)}</bdi> صنف فيها صرف · المبالغ بالـ{me.currency}</>
                  : 'لا صرفيات هذه السنة'}</p>
              </div>
            </header>
            {categories.length === 0 ? (
              <p className="exp-empty">لا صرفيات مسجلة في سنة <bdi>{year}</bdi>.</p>
            ) : (
              <CategoryTable
                rows={categories.map((item) => ({
                  id: item.id, label: item.label, icon: item.icon, count: item.count, total: item.total,
                  share: (item.total / data.total) * 100,
                  trail: <Sparkline values={item.values} upTo={year === THIS_YEAR ? THIS_MONTH : 11} label={`${item.label} خلال السنة`} />,
                }))}
                total={data.total} count={data.count} trailHead="خلال السنة"
              />
            )}
          </section>
        </>
      )}
    </div>
  );
}

interface CatRow {
  id: string;
  label: string;
  icon: typeof Wallet;
  count: number;
  total: number;
  share: number;
  trail: ReactNode;
}

function CategoryTable({ rows, total, count, trailHead }: { rows: CatRow[]; total: number; count: number; trailHead: string }) {
  const maxShare = Math.max(...rows.map((row) => row.share), 0);
  return (
    <div className="yl-table-wrap">
      <table className="yl-table">
        <thead>
          <tr>
            <th scope="col" className="yl-c-name">الصنف</th>
            <th scope="col" className="yl-c-num">عدد المساعدات</th>
            <th scope="col" className="yl-c-num">المبلغ</th>
            <th scope="col" className="yl-c-share">النسبة</th>
            <th scope="col" className="yl-c-trail">{trailHead}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const Icon = row.icon;
            return (
              <tr key={row.id}>
                <th scope="row" className="yl-c-name">
                  <span className="yl-cat"><span className="yl-cat-icon" aria-hidden><Icon size={16} /></span>{row.label}</span>
                </th>
                <td className="yl-c-num" data-label="عدد المساعدات"><bdi>{formatNumber(row.count)}</bdi></td>
                <td className="yl-c-num yl-c-amount" data-label="المبلغ"><bdi>{formatNumber(row.total)}</bdi></td>
                <td className="yl-c-share" data-label="النسبة"><Share value={row.share} max={maxShare} /></td>
                <td className="yl-c-trail" data-label={trailHead}>{row.trail}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" className="yl-c-name">المجموع</th>
            <td className="yl-c-num" data-label="عدد المساعدات"><bdi>{formatNumber(count)}</bdi></td>
            <td className="yl-c-num yl-c-amount" data-label="المبلغ"><bdi>{formatNumber(total)}</bdi></td>
            <td className="yl-c-share" data-label="النسبة"><bdi>100%</bdi></td>
            <td className="yl-c-trail" />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/* ─────────────────────────────── one month ─────────────────────────────── */

function MonthView({ me, year, month }: { me: Me; year: number; month: number }) {
  const [sheet, setSheet] = useState<MonthSheet | null>(null);
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [income, setIncome] = useState<number[] | null>(null);
  const [error, setError] = useState('');
  const period = `${year}-${String(month + 1).padStart(2, '0')}`;

  const load = useCallback(async () => {
    setError('');
    try {
      const [items, yearSheet, money] = await Promise.all([
        api<MonthSheet>(`/expenses?month=${period}`),
        api<Ledger>(`/expenses/ledger?year=${year}`),
        incomeOf(year),
      ]);
      setSheet(items);
      setLedger(yearSheet);
      setIncome(money);
    } catch (failure) {
      setError((failure as Error).message);
    }
  }, [period, year]);

  useEffect(() => { setSheet(null); void load(); }, [load]);

  const data = useMemo(() => {
    if (!sheet || !ledger) return null;
    const year12 = shape(ledger);
    const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const daily = Array<number>(days).fill(0);
    const dailyCount = Array<number>(days).fill(0);
    const byCat = new Map<ExpenseCategory, { total: number; count: number; days: number[] }>();
    const people = new Set<string>();
    sheet.items.forEach((item) => {
      const day = Number(item.spent_on.slice(8, 10)) - 1;
      if (day >= 0 && day < days) { daily[day] += item.amount; dailyCount[day] += 1; }
      const row = byCat.get(item.category) ?? { total: 0, count: 0, days: Array<number>(days).fill(0) };
      row.total += item.amount;
      row.count += 1;
      if (day >= 0 && day < days) row.days[day] += item.amount;
      byCat.set(item.category, row);
      if (item.beneficiary_name) people.add(item.beneficiary_name.trim());
    });
    const total = sum(daily);
    const previous = month > 0 ? year12.monthTotals[month - 1] : null;
    const prevOf = (id: ExpenseCategory) => (month > 0 ? year12.categories.find((item) => item.id === id)?.values[month - 1] ?? 0 : null);
    const categories = [...byCat]
      .map(([id, row]) => ({ ...CATEGORY_BY_ID.get(id)!, ...row, before: prevOf(id) }))
      .sort((a, b) => b.total - a.total);
    return { daily, dailyCount, days, total, count: sheet.items.length, people: people.size, previous, categories };
  }, [sheet, ledger, year, month]);

  const prevHref = month > 0 ? ledgerHref(year, month - 1) : ledgerHref(year - 1, 11);
  const nextFuture = isFuture(month === 11 ? year + 1 : year, month === 11 ? 0 : month + 1);
  const nextHref = month < 11 ? ledgerHref(year, month + 1) : ledgerHref(year + 1, 0);
  const top = data?.categories[0];

  return (
    <div className="yl">
      <div className="page-head exp-head yl-head">
        <span className="page-icon" aria-hidden><CalendarDays size={24} /></span>
        <div>
          <Breadcrumbs items={[
            { label: 'الرئيسية', href: '#/' },
            { label: 'الحركات المالية', href: '#/expenses' },
            { label: `السجل السنوي ${year}`, href: ledgerHref(year) },
          ]} />
          <h1>{MONTH_NAMES[month]} <bdi>{year}</bdi></h1>
        </div>
        <div className="page-actions">
          <div className="yl-switch" role="group" aria-label="الشهر">
            <a className="icon-btn" aria-label="الشهر السابق" href={prevHref}><ChevronRight size={17} aria-hidden /></a>
            <strong>{MONTH_NAMES[month]}</strong>
            {nextFuture
              ? <span className="icon-btn" aria-hidden><ChevronLeft size={17} /></span>
              : <a className="icon-btn" aria-label="الشهر التالي" href={nextHref}><ChevronLeft size={17} aria-hidden /></a>}
          </div>
          <a className="btn" href={ledgerHref(year)} aria-label={`رجوع إلى سنة ${year}`}>
            <ArrowRight size={18} aria-hidden />
            <span className="btn-label">السنة <bdi>{year}</bdi></span>
          </a>
        </div>
      </div>

      {error && !sheet && <StateMessage kind="error" title="تعذّر تحميل الشهر" hint={error} onRetry={load} />}
      {!data && !error && <Skeleton />}

      {data && (
        <>
          <section className="yl-kpis yl-kpis-4" aria-label={`خلاصة ${MONTH_NAMES[month]}`}>
            <Kpi
              label="الاستهلاك" icon={TrendingDown}
              value={<bdi>{formatNumber(data.total)}</bdi>} unit={me.currency}
              foot={<Pill value={data.previous === null ? null : change(data.previous, data.total)} goodUp={false} />}
            />
            <Kpi
              label="عدد المساعدات" icon={Users}
              value={<bdi>{formatNumber(data.count)}</bdi>}
              foot={<span className="yl-foot-label"><bdi>{formatNumber(data.people)}</bdi> مستفيد</span>}
            />
            <Kpi
              label="الوارد" icon={TrendingUp} tone="in"
              value={income ? <bdi>{formatNumber(income[month])}</bdi> : '—'} unit={income ? me.currency : undefined}
              foot={income
                ? <Pill value={month > 0 ? change(income[month - 1], income[month]) : null} goodUp />
                : <span className="yl-foot-label">غير متاح لحسابك</span>}
            />
            <Kpi
              label="الأعلى استهلاكاً" icon={Trophy}
              value={<span className="yl-kpi-name">{top?.label ?? '—'}</span>}
              foot={top
                ? <span className="yl-foot-label"><b><bdi>{formatNumber(top.total)}</bdi></b> · <bdi>{formatPercent((top.total / data.total) * 100)}</bdi> من الشهر</span>
                : <span className="yl-foot-label">لا صرف</span>}
            />
          </section>

          <section className="yl-panel" aria-labelledby="yl-days">
            <header className="yl-panel-head">
              <div>
                <h2 id="yl-days"><TrendingDown size={18} aria-hidden /> الصرف اليومي</h2>
                <p>مجموع ما صُرف في كل يوم من {MONTH_NAMES[month]} · بالـ{me.currency}</p>
              </div>
              {data.total > 0 && (
                <dl className="yl-mini-facts">
                  <div><dt>أيام فيها صرف</dt><dd><bdi>{formatNumber(data.daily.filter((value) => value > 0).length)}</bdi></dd></div>
                  <div><dt>أعلى يوم</dt><dd><bdi>{formatNumber(data.daily.indexOf(Math.max(...data.daily)) + 1)}</bdi></dd></div>
                </dl>
              )}
            </header>
            {data.total === 0
              ? <p className="exp-empty">لا صرفيات مسجلة في {MONTH_NAMES[month]} <bdi>{year}</bdi>.</p>
              : <DailyChart values={data.daily} counts={data.dailyCount} currency={me.currency} />}
          </section>

          <section className="yl-panel" aria-labelledby="yl-mcats">
            <header className="yl-panel-head">
              <div>
                <h2 id="yl-mcats"><HandHeart size={18} aria-hidden /> الأصناف في {MONTH_NAMES[month]}</h2>
                <p>{data.categories.length
                  ? <><bdi>{formatNumber(data.categories.length)}</bdi> صنف · المبالغ بالـ{me.currency}</>
                  : 'لا صرف هذا الشهر'}</p>
              </div>
              <a className="btn yl-link" href="#/expenses">كل القيود <ChevronLeft size={16} aria-hidden /></a>
            </header>
            {data.categories.length > 0 && (
              <CategoryTable
                rows={data.categories.map((item) => ({
                  id: item.id, label: item.label, icon: item.icon, count: item.count, total: item.total,
                  share: (item.total / data.total) * 100,
                  trail: <Pill value={item.before === null ? null : item.before === 0 ? null : change(item.before, item.total)} goodUp={false} label="عن السابق" />,
                }))}
                total={data.total} count={data.count} trailHead="عن الشهر السابق"
              />
            )}
          </section>
        </>
      )}
    </div>
  );
}

// One column per day, day 1 on the right as the page reads; the tallest day sets the scale.
function DailyChart({ values, counts, currency }: { values: number[]; counts: number[]; currency: string }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(...values, 1);
  // Three gridlines at round-ish steps of the top.
  const ticks = [1, 0.5].map((part) => Math.round(max * part));
  return (
    <div className="yl-chart" onPointerLeave={() => setActive(null)}>
      <div className="yl-chart-grid" aria-hidden>
        {ticks.map((tick) => <span key={tick} style={{ insetBlockEnd: `${(tick / max) * 100}%` }}><bdi>{formatNumber(tick)}</bdi></span>)}
      </div>
      <ol className="yl-bars" style={{ gridTemplateColumns: `repeat(${values.length}, minmax(0, 1fr))` }}>
        {values.map((value, day) => (
          <li key={day}>
            <button
              type="button"
              className={`yl-bar${active === day ? ' on' : ''}`}
              aria-label={`يوم ${day + 1}: ${formatNumber(value)} ${currency}، ${counts[day]} مساعدة`}
              onPointerEnter={() => setActive(day)}
              onFocus={() => setActive(day)}
              onBlur={() => setActive(null)}
            >
              <i style={{ blockSize: `${value > 0 ? Math.max((value / max) * 100, 2) : 0}%` }} />
              {active === day && (
                <span className="yl-tip" role="tooltip">
                  <b>يوم <bdi>{day + 1}</bdi></b>
                  <span><bdi>{formatNumber(value)}</bdi> {currency}</span>
                  <span><bdi>{formatNumber(counts[day])}</bdi> مساعدة</span>
                </span>
              )}
            </button>
            <span className="yl-day">{(day + 1) % 5 === 0 || day === 0 ? <bdi>{day + 1}</bdi> : ''}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

import { createPortal } from 'react-dom';
import { useCallback, useEffect, useId, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import {
  Archive, ArrowDown, ArrowRight, ArrowUp, CalendarDays, ChevronLeft, ChevronRight,
  Gift, HandHeart, Layers, Pencil, Plus, Scale, Sheet, TrendingDown, TrendingUp, Trophy, Users, Wallet,
} from 'lucide-react';
import { api, type Me } from '../../api';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import { StateMessage } from '../../components/StateMessage';
import { MONTH_NAMES, formatNumber, formatPercent, monthIndex } from '../../format';
import { ledgerFromHash, ledgerHref } from '../../route';
import { CATEGORIES, CATEGORY_BY_ID, type ExpenseCategory } from './categories';
import { ExpenseDialog } from './ExpenseDialog';
import { LedgerMonthChart } from './LedgerMonthChart';
import type { ExpenseItem } from './ExpensesPage';

interface Ledger {
  year: number;
  cells: { month: number; category: ExpenseCategory; total: number; count: number }[];
}
interface Overview { months: { period: string; paid_amount: number }[] }
interface MonthSheet { items: ExpenseItem[] }

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

// The charity boxes' income per month (صناديق الصدقات); null when it cannot be read.
async function boxesOf(year: number): Promise<number[] | null> {
  const result = await api<{ months: number[] }>(`/boxes/monthly?year=${year}`).catch(() => null);
  return result?.months ?? null;
}

// Cash donations per month (the «المساعدات» register), with how many donors gave each month.
async function donationsOf(year: number): Promise<{ months: number[]; donors: number[] } | null> {
  return api<{ months: number[]; donors: number[] }>(`/donations/monthly?year=${year}`).catch(() => null);
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
  sparkCounts?: number[];
  currency?: string;
  note?: string;
}

function Kpi({ label, icon: Icon, tone = 'theme', value, unit, foot, spark, sparkCounts, currency, note }: KpiProps) {
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
        {spark && <Sparkline values={spark} counts={sparkCounts} currency={currency ?? unit} goodUp={tone === 'in'} className="yl-kpi-spark" />}
      </footer>
    </article>
  );
}

// Twelve months as one thin line, January on the right as the page reads; a dot marks the
// latest month with a figure. Pointing at (or touching) the line picks the nearest month: a guide,
// a ringed dot and a small card with the month, the amount and the number of aids.
interface SparkProps {
  values: number[];
  counts?: number[];
  currency?: string;
  className?: string;
  upTo?: number;
  label?: string;
  // Income going up is good; spending going up is not.
  goodUp?: boolean;
  // A month to ring (the month page marks its own month).
  mark?: number;
  // Taller line with the peak marked, for the table.
  rich?: boolean;
}

// A smooth line through the points that never swings past a neighbour (monotone cubic), so a
// month with nothing stays on the baseline instead of dipping under it.
function smoothPath(points: [number, number][]) {
  if (points.length === 0) return '';
  if (points.length === 1) return `M${points[0][0]},${points[0][1]}`;
  const slopes = points.slice(0, -1).map(([x0, y0], i) => (points[i + 1][1] - y0) / (points[i + 1][0] - x0));
  const tangents = points.map((_, i) => {
    if (i === 0) return slopes[0];
    if (i === points.length - 1) return slopes[i - 1];
    return slopes[i - 1] * slopes[i] <= 0 ? 0 : (slopes[i - 1] + slopes[i]) / 2;
  });
  let d = `M${points[0][0].toFixed(1)},${points[0][1].toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const h = (x1 - x0) / 3;
    d += ` C${(x0 + h).toFixed(1)},${(y0 + tangents[i] * h).toFixed(1)} ${(x1 - h).toFixed(1)},${(y1 - tangents[i + 1] * h).toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
  }
  return d;
}

function Sparkline({ values, counts, currency, className, upTo = 11, label, goodUp = false, mark, rich = false }: SparkProps) {
  const W = rich ? 150 : 120;
  const H = rich ? 44 : 34;
  const TOP = rich ? 8 : 5;
  const BASE = H - 4;
  const gradient = useId();
  const [hover, setHover] = useState<{ month: number; left: number; top: number; color: string } | null>(null);
  const shown = values.slice(0, upTo + 1);
  const max = Math.max(...shown, 1);
  const x = (month: number) => W - 5 - (month / 11) * (W - 10);
  const y = (value: number) => BASE - (value / max) * (BASE - TOP);
  const points = shown.map((value, month) => [x(month), y(value)] as [number, number]);
  const line = smoothPath(points);
  const last = shown.length - 1;
  const peak = shown.indexOf(Math.max(...shown));
  const hasData = shown.some((value) => value > 0);

  const pick = (event: React.PointerEvent<SVGSVGElement>) => {
    if (last < 0) return;
    const box = event.currentTarget.getBoundingClientRect();
    const at = ((event.clientX - box.left) / box.width) * W;
    let month = 0;
    shown.forEach((_, index) => { if (Math.abs(x(index) - at) < Math.abs(x(month) - at)) month = index; });
    setHover({
      month,
      // Kept clear of the screen edges so the card never runs off a phone.
      left: Math.min(Math.max(box.left + (x(month) / W) * box.width, 72), window.innerWidth - 72),
      top: box.top + (y(shown[month]) / H) * box.height,
      color: getComputedStyle(event.currentTarget).color,
    });
  };
  const previous = hover && hover.month > 0 ? shown[hover.month - 1] : null;
  const delta = hover && previous ? ((shown[hover.month] - previous) / previous) * 100 : null;

  return (
    <>
      <svg
        className={`yl-spark${rich ? ' is-rich' : ''} ${className ?? ''}${hover ? ' is-on' : ''}`}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={label ?? 'الحركة خلال السنة'}
        onPointerMove={pick}
        onPointerDown={pick}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        {rich && [TOP, (TOP + BASE) / 2].map((at) => <line key={at} x1="2" x2={W - 2} y1={at} y2={at} className="yl-spark-grid" />)}
        <line x1="2" x2={W - 2} y1={BASE} y2={BASE} className="yl-spark-base" />
        {shown.length > 1 && (
          <path className="yl-spark-fill" d={`${line} L${x(last).toFixed(1)},${BASE} L${x(0).toFixed(1)},${BASE} Z`} fill={`url(#${gradient})`} />
        )}
        {hover && <line className="yl-spark-guide" x1={x(hover.month)} x2={x(hover.month)} y1="1" y2={BASE} />}
        <path className="yl-spark-line" d={line} />
        {rich && hasData && !hover && peak !== last && (
          <circle className="yl-spark-peak" cx={x(peak)} cy={y(shown[peak])} r="2.4" />
        )}
        {mark !== undefined && mark <= last && !hover && (
          <circle className="yl-spark-mark" cx={x(mark)} cy={y(shown[mark])} r="4.2" />
        )}
        {last >= 0 && !hover && mark === undefined && <circle className="yl-spark-dot" cx={x(last)} cy={y(shown[last])} r={rich ? 3.2 : 2.6} />}
        {hover && <circle className="yl-spark-focus" cx={x(hover.month)} cy={y(shown[hover.month])} r="3.6" />}
        <rect x="0" y="0" width={W} height={H} className="yl-spark-hit" />
      </svg>
      {hover && createPortal(
        <div
          className="yl-spark-tip"
          role="tooltip"
          style={{ left: hover.left, top: hover.top, '--tip': hover.color } as React.CSSProperties}
        >
          <span className="yl-spark-tip-month"><i aria-hidden />{MONTH_NAMES[hover.month]}</span>
          <strong><bdi>{formatNumber(shown[hover.month])}</bdi>{currency && <small>{currency}</small>}</strong>
          <span className="yl-spark-tip-meta">
            {counts && <span><bdi>{formatNumber(counts[hover.month] ?? 0)}</bdi> مساعدة</span>}
            {delta !== null && Math.abs(delta) >= 0.5 && (
              <span className={(delta > 0) === goodUp ? 'good' : 'bad'}>
                {delta > 0 ? '▲' : '▼'} <bdi>{formatPercent(Math.abs(delta))}</bdi>
              </span>
            )}
          </span>
        </div>,
        document.body,
      )}
    </>
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
  const [lastLedger, setLastLedger] = useState<Ledger | null>(null);
  const [income, setIncome] = useState<number[] | null>(null);
  const [boxIncome, setBoxIncome] = useState<number[] | null>(null);
  const [gifts, setGifts] = useState<{ months: number[]; donors: number[] } | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [sheet, money, last, boxMoney, giftMoney] = await Promise.all([
        api<Ledger>(`/expenses/ledger?year=${year}`),
        incomeOf(year),
        api<Ledger>(`/expenses/ledger?year=${year - 1}`).catch(() => null),
        boxesOf(year),
        donationsOf(year),
      ]);
      setGifts(giftMoney);
      setLedger(sheet);
      setLastLedger(last);
      setIncome(money);
      setBoxIncome(boxMoney);
    } catch (failure) {
      setError((failure as Error).message);
    }
  }, [year]);

  useEffect(() => { setLedger(null); setIncome(null); void load(); }, [load]);

  const data = useMemo(() => (ledger ? shape(ledger) : null), [ledger]);
  const lastTotals = useMemo(() => (lastLedger ? new Map(shape(lastLedger).categories.map((item) => [item.id, item.total])) : null), [lastLedger]);
  // The month the cards speak of: this month in this year, December in a past one.
  const focus = year === THIS_YEAR ? THIS_MONTH : 11;
  const activeMonths = data ? data.monthTotals.filter((value) => value > 0).length : 0;
  const categories = useMemo(() => (data ? [...data.categories].sort((a, b) => b.total - a.total) : []), [data]);
  const monthMax = data ? Math.max(...data.monthTotals, 1) : 1;

  return (
    <div className="yl">
      <div className="page-head exp-head yl-head">
        <span className="page-icon" aria-hidden><Sheet size={24} /></span>
        <div>
          <Breadcrumbs items={[{ label: 'الحركات المالية', href: '#/expenses' }, { label: `السجل السنوي ${year}` }]} />
          <h1>السجل المالي السنوي</h1>
        </div>
        <div className="page-actions">
          <YearSwitch year={year} />
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
              spark={data.monthTotals.slice(0, focus + 1)} sparkCounts={data.monthCounts}
            />
            <Kpi
              label="الوارد الشهري" icon={TrendingUp} tone="in"
              value={income ? <bdi>{formatNumber(income[focus])}</bdi> : '—'} unit={income ? me.currency : undefined}
              foot={income
                ? <><span className="yl-foot-label">{MONTH_NAMES[focus]}</span><Pill value={focus > 0 ? change(income[focus - 1], income[focus]) : null} goodUp /></>
                : <span className="yl-foot-label">غير متاح لحسابك</span>}
              spark={income?.slice(0, focus + 1)} currency={me.currency}
            />
            <Kpi
              label="وارد الصناديق" icon={Archive} tone="box"
              value={boxIncome && boxIncome.some((value) => value > 0) ? <bdi>{formatNumber(boxIncome[focus])}</bdi> : <span className="yl-none">—</span>}
              unit={boxIncome && boxIncome.some((value) => value > 0) ? me.currency : undefined}
              foot={boxIncome && boxIncome.some((value) => value > 0)
                ? <><a className="yl-foot-label yl-foot-link" href="#/boxes">{MONTH_NAMES[focus]} · كل الصناديق</a><Pill value={focus > 0 ? change(boxIncome[focus - 1], boxIncome[focus]) : null} goodUp /></>
                : <a className="yl-foot-label yl-foot-link" href="#/boxes">لم تُسجَّل صناديق بعد</a>}
              spark={boxIncome && boxIncome.some((value) => value > 0) ? boxIncome.slice(0, focus + 1) : undefined}
              currency={me.currency}
            />
            <Kpi
              label="التبرعات المالية" icon={Gift} tone="gift"
              // Cash donations from the «المساعدات» register.
              value={gifts ? <bdi>{formatNumber(gifts.months[focus])}</bdi> : '—'} unit={gifts ? me.currency : undefined}
              foot={gifts
                ? <><a className="yl-foot-label yl-foot-link" href="#/soon/aid"><bdi>{formatNumber(gifts.donors[focus])}</bdi> متبرع · {MONTH_NAMES[focus]}</a><Pill value={focus > 0 ? change(gifts.months[focus - 1], gifts.months[focus]) : null} goodUp /></>
                : <span className="yl-foot-label">غير متاح لمؤسستك</span>}
              spark={gifts && gifts.months.some((value) => value > 0) ? gifts.months.slice(0, focus + 1) : undefined}
              currency={me.currency}
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
                <p>اضغط على الشهر لفتح صفحته · المبالغ بالـ{me.currency}</p>
              </div>
            </header>
            <ol className="yl-months yl-strip">
              {MONTH_NAMES.map((name, month) => {
                const future = isFuture(year, month);
                const total = data.monthTotals[month];
                // One cell of a connected strip: the month and its amount, a thin fill for its size.
                const body = (
                  <>
                    <span className="yl-month-name">{name}</span>
                    <span className="yl-month-sum">{future ? '—' : <bdi>{formatNumber(total)}</bdi>}</span>
                    <span className="yl-month-fill" aria-hidden><i style={{ inlineSize: `${future ? 0 : (total / monthMax) * 100}%` }} /></span>
                  </>
                );
                return (
                  <li key={name}>
                    {future
                      ? <span className="yl-month is-future" aria-disabled="true">{body}</span>
                      : <a className={`yl-month${month === focus ? ' is-now' : ''}`} href={ledgerHref(year, month)} title={`${name}: ${formatNumber(total)} ${me.currency} · ${formatNumber(data.monthCounts[month])} مساعدة`}>{body}</a>}
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
                  previous: lastTotals ? lastTotals.get(item.id) ?? 0 : null,
                  trail: <Sparkline rich values={item.values} counts={item.counts} currency={me.currency} upTo={year === THIS_YEAR ? THIS_MONTH : 11} label={`${item.label} خلال السنة`} />,
                }))}
                total={data.total} count={data.count}
                previousHead={`سنة ${year - 1}`}
                previousTotal={lastTotals ? [...lastTotals.values()].reduce((a, b) => a + b, 0) : null}
                trailHead="الحركة خلال السنة"
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
  // The same heading's amount in the period before (last year / last month); null when unknown.
  previous: number | null;
  trail: ReactNode;
}

// The amount before and how far this period moved from it: red when spending rose, green when it fell.
function Previous({ before, now }: { before: number | null; now: number }) {
  if (before === null) return <span className="yl-prev-none">—</span>;
  const delta = before > 0 ? ((now - before) / before) * 100 : null;
  return (
    <span className="yl-prev">
      <bdi className="yl-prev-amount">{before > 0 ? formatNumber(before) : '—'}</bdi>
      {delta === null
        ? now > 0 && <span className="yl-delta new">جديد</span>
        : Math.abs(delta) < 0.5
          ? <span className="yl-delta flat">بلا تغيير</span>
          : (
            <span className={`yl-delta ${delta > 0 ? 'bad' : 'good'}`}>
              {delta > 0 ? <ArrowUp size={11} strokeWidth={2.8} aria-label="ارتفاع" /> : <ArrowDown size={11} strokeWidth={2.8} aria-label="انخفاض" />}
              <bdi>{formatPercent(Math.abs(delta))}</bdi>
            </span>
          )}
    </span>
  );
}

function CategoryTable({ rows, total, count, previousHead, previousTotal, trailHead }: {
  rows: CatRow[];
  total: number;
  count: number;
  previousHead: string;
  previousTotal: number | null;
  trailHead: string;
}) {
  const maxShare = Math.max(...rows.map((row) => row.share), 0);
  return (
    <div className="yl-table-wrap">
      <table className="yl-table">
        <colgroup>
          <col className="yl-col-name" />
          <col className="yl-col-count" />
          <col className="yl-col-amount" />
          <col className="yl-col-share" />
          <col className="yl-col-prev" />
          <col className="yl-col-trail" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className="yl-c-name">الصنف</th>
            <th scope="col" className="yl-c-num yl-c-count">عدد المساعدات</th>
            <th scope="col" className="yl-c-num">المبلغ</th>
            <th scope="col" className="yl-c-share">النسبة</th>
            <th scope="col" className="yl-c-prev">{previousHead}</th>
            <th scope="col" className="yl-c-trail">{trailHead}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const Icon = row.icon;
            return (
              <tr key={row.id} className={index === 0 ? 'is-top' : undefined}>
                <th scope="row" className="yl-c-name">
                  <span className="yl-cat">
                    <span className="yl-rank" aria-hidden><bdi>{index + 1}</bdi></span>
                    <span className="yl-cat-icon" aria-hidden><Icon size={16} /></span>
                    <span className="yl-cat-label">{row.label}</span>
                  </span>
                </th>
                <td className="yl-c-num yl-c-count" data-label="عدد المساعدات"><span className="yl-count"><bdi>{formatNumber(row.count)}</bdi></span></td>
                <td className="yl-c-num yl-c-amount" data-label="المبلغ"><bdi>{formatNumber(row.total)}</bdi></td>
                <td className="yl-c-share" data-label="النسبة"><Share value={row.share} max={maxShare} /></td>
                <td className="yl-c-prev" data-label={previousHead}><Previous before={row.previous} now={row.total} /></td>
                <td className="yl-c-trail" data-label={trailHead}>{row.trail}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" className="yl-c-name">المجموع</th>
            <td className="yl-c-num yl-c-count" data-label="عدد المساعدات"><bdi>{formatNumber(count)}</bdi></td>
            <td className="yl-c-num yl-c-amount" data-label="المبلغ"><bdi>{formatNumber(total)}</bdi></td>
            <td className="yl-c-share" data-label="النسبة"><bdi>100%</bdi></td>
            <td className="yl-c-prev" data-label={previousHead}><Previous before={previousTotal} now={total} /></td>
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
  const [lastYear, setLastYear] = useState<{ spent: number[]; income: number[]; boxes: number[] } | null>(null);
  const [boxIncome, setBoxIncome] = useState<number[] | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [dialog, setDialog] = useState<{ entry: ExpenseItem | null } | null>(null);
  // The month-end balance before the last save, to show how far the change carried.
  const [savedFrom, setSavedFrom] = useState<number | null>(null);
  const period = `${year}-${String(month + 1).padStart(2, '0')}`;

  const load = useCallback(async () => {
    setError('');
    try {
      const [items, yearSheet, money, lastSheet, lastMoney, boxMoney, lastBoxMoney] = await Promise.all([
        api<MonthSheet>(`/expenses?month=${period}`),
        api<Ledger>(`/expenses/ledger?year=${year}`),
        incomeOf(year),
        api<Ledger>(`/expenses/ledger?year=${year - 1}`).catch(() => null),
        incomeOf(year - 1),
        boxesOf(year),
        boxesOf(year - 1),
      ]);
      setBoxIncome(boxMoney);
      setSheet(items);
      setLedger(yearSheet);
      setIncome(money);
      setLastYear({
        spent: lastSheet ? shape(lastSheet).monthTotals : Array<number>(12).fill(0),
        income: lastMoney ?? Array<number>(12).fill(0),
        boxes: lastBoxMoney ?? Array<number>(12).fill(0),
      });
    } catch (failure) {
      setError((failure as Error).message);
    }
  }, [period, year]);

  useEffect(() => { setEditing(false); setSavedFrom(null); }, [period]);

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
    // The balance runs from the start of last year, the same way the expenses page counts it, so
    // any change to an earlier month carries through every month after it.
    // Money in = subscribers' payments + charity boxes.
    const thisIncome = income ?? Array<number>(12).fill(0);
    const thisBoxes = boxIncome ?? Array<number>(12).fill(0);
    const moneyIn = (pay: number[], box: number[]) => pay.map((value, at) => value + (box[at] ?? 0));
    const net = (inc: number[], out: number[], upTo: number) => inc.slice(0, upTo).reduce((acc, value, at) => acc + value - (out[at] ?? 0), 0);
    const opening = lastYear
      ? net(moneyIn(lastYear.income, lastYear.boxes), lastYear.spent, 12) + net(moneyIn(thisIncome, thisBoxes), year12.monthTotals, month)
      : null;
    const balance = opening === null ? null : {
      opening,
      income: thisIncome[month],
      boxes: thisBoxes[month],
      spent: total,
      closing: opening + thisIncome[month] + thisBoxes[month] - total,
    };
    const entries = [...sheet.items].sort((a, b) => a.spent_on.localeCompare(b.spent_on) || a.id - b.id);
    return { daily, dailyCount, days, total, count: sheet.items.length, people: people.size, previous, categories, balance, entries, year12 };
  }, [sheet, ledger, income, boxIncome, lastYear, year, month]);

  const prevHref = month > 0 ? ledgerHref(year, month - 1) : ledgerHref(year - 1, 11);
  const nextFuture = isFuture(month === 11 ? year + 1 : year, month === 11 ? 0 : month + 1);
  const nextHref = month < 11 ? ledgerHref(year, month + 1) : ledgerHref(year + 1, 0);
  const top = data?.categories[0];
  const canEdit = !isFuture(year, month);
  const openEditor = () => {
    setEditing(true);
    window.setTimeout(() => document.getElementById('yl-entries')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };
  const onSaved = async () => {
    setDialog(null);
    setSavedFrom(data?.balance?.closing ?? null);
    await load();
  };

  return (
    <div className="yl">
      <div className="page-head exp-head yl-head">
        <span className="page-icon" aria-hidden><CalendarDays size={24} /></span>
        <div>
          <Breadcrumbs items={[
            { label: 'الحركات المالية', href: '#/expenses' },
            { label: `السجل السنوي ${year}`, href: ledgerHref(year) },
            { label: MONTH_NAMES[month] },
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
          {canEdit && (
            <button type="button" className={`btn yl-edit-btn${editing ? ' on' : ''}`} aria-label="تعديل قيود الشهر" aria-pressed={editing} onClick={() => (editing ? setEditing(false) : openEditor())}>
              <Pencil size={17} aria-hidden />
              <span className="btn-label">{editing ? 'إنهاء التعديل' : 'تعديل القيود'}</span>
            </button>
          )}
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

          {data.balance && (
            <section className="yl-balance" aria-label="رصيد الشهر">
              <div className="yl-bal-step">
                <span>رصيد أول الشهر</span>
                <b className={data.balance.opening < 0 ? 'neg' : undefined}><bdi dir="ltr">{formatNumber(data.balance.opening)}</bdi></b>
              </div>
              <span className="yl-bal-op" aria-hidden>+</span>
              <div className="yl-bal-step in">
                <span>الوارد</span>
                <b><bdi>{formatNumber(data.balance.income)}</bdi></b>
              </div>
              <span className="yl-bal-op" aria-hidden>+</span>
              <div className="yl-bal-step boxes">
                <span>الصناديق</span>
                <b><bdi>{formatNumber(data.balance.boxes)}</bdi></b>
              </div>
              <span className="yl-bal-op" aria-hidden>−</span>
              <div className="yl-bal-step out">
                <span>الصرف</span>
                <b><bdi>{formatNumber(data.balance.spent)}</bdi></b>
              </div>
              <span className="yl-bal-op" aria-hidden>=</span>
              <div className={`yl-bal-step end${data.balance.closing < 0 ? ' neg' : ''}`}>
                <span><Scale size={14} aria-hidden /> رصيد آخر الشهر</span>
                <b><bdi dir="ltr">{formatNumber(data.balance.closing)}</bdi> <small>{me.currency}</small></b>
              </div>
              {savedFrom !== null && savedFrom !== data.balance.closing && (
                <p className="yl-bal-note" role="status">
                  تم الحفظ · رصيد آخر الشهر تغيّر من <bdi dir="ltr">{formatNumber(savedFrom)}</bdi> إلى <bdi dir="ltr">{formatNumber(data.balance.closing)}</bdi>، ورصيد كل الأشهر التالية تحدّث معه.
                </p>
              )}
            </section>
          )}

          {editing && (
            <section className="yl-panel yl-entries" id="yl-entries" aria-labelledby="yl-entries-title">
              <header className="yl-panel-head">
                <div>
                  <h2 id="yl-entries-title"><Pencil size={18} aria-hidden /> قيود {MONTH_NAMES[month]}</h2>
                  <p>اضغط على أي قيد لتعديله · أي تعديل يغيّر رصيد هذا الشهر وكل الأشهر بعده</p>
                </div>
                <button type="button" className="btn primary yl-link" onClick={() => setDialog({ entry: null })}>
                  <Plus size={16} aria-hidden /> إضافة قيد
                </button>
              </header>
              {data.entries.length === 0 ? (
                <p className="exp-empty">لا قيود في هذا الشهر.</p>
              ) : (
                <ul className="yl-entry-list">
                  {data.entries.map((entry) => {
                    const category = CATEGORY_BY_ID.get(entry.category);
                    const Icon = category?.icon ?? Wallet;
                    return (
                      <li key={entry.id}>
                        <button type="button" className="yl-entry" onClick={() => setDialog({ entry })} aria-label={`تعديل قيد ${entry.beneficiary_name ?? ''} ${formatNumber(entry.amount)}`}>
                          <span className="yl-entry-day"><bdi>{Number(entry.spent_on.slice(8, 10))}</bdi><small>{MONTH_NAMES[month]}</small></span>
                          <span className="yl-cat-icon" aria-hidden><Icon size={16} /></span>
                          <span className="yl-entry-text">
                            <b>{entry.beneficiary_name ?? '—'}</b>
                            <small>{category?.label}{entry.details ? ` · ${entry.details}` : ''}</small>
                          </span>
                          <span className="yl-entry-amount"><bdi>{formatNumber(entry.amount)}</bdi></span>
                          <Pencil size={15} className="yl-entry-edit" aria-hidden />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}

          <LedgerMonthChart
            year={year}
            month={month}
            categories={data.year12.categories}
            monthTotals={data.year12.monthTotals}
            income={income}
            boxes={boxIncome}
            currency={me.currency}
            isFuture={isFuture}
          />

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
                  previous: item.before,
                  trail: (
                    <Sparkline
                      rich
                      values={data.year12.categories.find((row) => row.id === item.id)?.values ?? []}
                      counts={data.year12.categories.find((row) => row.id === item.id)?.counts}
                      currency={me.currency}
                      upTo={year === THIS_YEAR ? THIS_MONTH : 11}
                      mark={month}
                      label={`${item.label} خلال ${year}`}
                    />
                  ),
                }))}
                total={data.total} count={data.count}
                previousHead={month > 0 ? MONTH_NAMES[month - 1] : 'الشهر السابق'}
                previousTotal={data.previous}
                trailHead={`الحركة خلال ${year}`}
              />
            )}
          </section>
        </>
      )}

      {dialog && (
        <ExpenseDialog
          entry={dialog.entry}
          defaultDate={year === THIS_YEAR && month === THIS_MONTH ? new Date().toISOString().slice(0, 10) : `${period}-01`}
          currency={me.currency}
          onClose={() => setDialog(null)}
          onSaved={() => { void onSaved(); }}
        />
      )}
    </div>
  );
}

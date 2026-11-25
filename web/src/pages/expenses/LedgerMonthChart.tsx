import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Archive, BarChart3, Layers, TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react';
import { MONTH_NAMES, formatNumber, formatPercent } from '../../format';
import { ledgerHref } from '../../route';

export interface ChartCategory {
  id: string;
  label: string;
  icon: LucideIcon;
  values: number[];
}

type Series = 'all' | 'spent' | 'income' | 'boxes';

const SERIES: { id: Series; label: string; icon: LucideIcon }[] = [
  { id: 'all', label: 'الكل', icon: BarChart3 },
  { id: 'spent', label: 'الاستهلاك', icon: TrendingDown },
  { id: 'income', label: 'الوارد', icon: TrendingUp },
  { id: 'boxes', label: 'الصناديق', icon: Archive },
];

const phoneQuery = '(max-width: 767.98px)';
const subscribeMedia = (listener: () => void) => {
  const media = window.matchMedia(phoneQuery);
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
};
const usePhone = () => useSyncExternalStore(subscribeMedia, () => window.matchMedia(phoneQuery).matches);

// A row of choices with one thumb that slides under the chosen one. Wide rows scroll sideways and
// keep the chosen choice in view.
export function SlideTabs<T extends string>({ items, value, onChange, label, className = '' }: {
  items: { id: T; label: string; icon?: LucideIcon; note?: string }[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  className?: string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const place = () => {
      const active = track.current?.querySelector<HTMLButtonElement>(`[data-id="${CSS.escape(value)}"]`);
      if (!active) return;
      setThumb({ left: active.offsetLeft, width: active.offsetWidth });
      active.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [value, items.length]);
  return (
    <div className={`yl-slide ${className}`} role="tablist" aria-label={label} ref={track}>
      {thumb && <span className="yl-slide-thumb" style={{ left: thumb.left, width: thumb.width }} aria-hidden />}
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            data-id={item.id}
            aria-selected={item.id === value}
            className="yl-slide-btn"
            onClick={() => onChange(item.id)}
          >
            {Icon && <Icon size={15} aria-hidden />}
            <span>{item.label}</span>
            {item.note && <small>{item.note}</small>}
          </button>
        );
      })}
    </div>
  );
}

// The month page's chart: a sliding switch between spending, income and charity boxes, and for
// spending a sliding row of headings. The computer shows the year month by month with this month
// lit; the phone shows this month as an animated ring of headings.
export function LedgerMonthChart({ year, month, categories, monthTotals, income, boxes, currency, isFuture }: {
  year: number;
  month: number;
  categories: ChartCategory[];
  monthTotals: number[];
  income: number[] | null;
  // The charity boxes' income per month; null while it loads or when it is not available.
  boxes: number[] | null;
  currency: string;
  isFuture: (year: number, month: number) => boolean;
}) {
  const phone = usePhone();
  const [series, setSeries] = useState<Series>('all');
  const [category, setCategory] = useState('all');
  // Headings with spending this month first (largest first), then the rest of the year's.
  const ordered = [...categories].sort((a, b) => b.values[month] - a.values[month] || b.values.reduce((s, v) => s + v, 0) - a.values.reduce((s, v) => s + v, 0));
  const monthTotal = monthTotals[month];
  useEffect(() => { if (category !== 'all' && !categories.some((item) => item.id === category)) setCategory('all'); }, [categories, category]);

  const chosen = categories.find((item) => item.id === category) ?? null;
  const values = series === 'income' ? income ?? Array<number>(12).fill(0)
    : series === 'boxes' ? boxes ?? Array<number>(12).fill(0)
      : chosen ? chosen.values : monthTotals;

  const categoryTabs = [
    { id: 'all', label: 'كل الأصناف', icon: Layers },
    ...ordered.map((item) => ({ id: item.id, label: item.label, icon: item.icon })),
  ];

  return (
    <section className="yl-panel yl-chartcard" aria-labelledby="yl-chart-title">
      <header className="yl-panel-head">
        <div>
          <h2 id="yl-chart-title">
            {series === 'all' ? <BarChart3 size={18} aria-hidden /> : series === 'spent' ? <TrendingDown size={18} aria-hidden /> : series === 'income' ? <TrendingUp size={18} aria-hidden /> : <Archive size={18} aria-hidden />}
            {series === 'all'
              ? (phone ? `مقارنة ${MONTH_NAMES[month]}` : `الاستهلاك والوارد والصناديق خلال ${year}`)
              : phone ? `${SERIES.find((item) => item.id === series)!.label} ${MONTH_NAMES[month]}` : `${SERIES.find((item) => item.id === series)!.label} خلال ${year}`}
          </h2>
          <p>{phone
            ? (series === 'all' ? 'الاستهلاك والوارد والصناديق في هذا الشهر' : series === 'spent' ? 'اسحب بين الأصناف أو اضغط على الدائرة' : series === 'income' ? 'كم يغطي الوارد من صرف الشهر' : 'وارد صناديق الصدقات')
            : `شهر ${MONTH_NAMES[month]} مميَّز · اضغط على أي شهر لفتحه · بالـ${currency}`}</p>
        </div>
        <SlideTabs items={SERIES} value={series} onChange={setSeries} label="نوع الحركة" className={`yl-series tone-${series}`} />
      </header>

      {series === 'spent' && (
        <div className="yl-cat-slider">
          <SlideTabs items={categoryTabs} value={category} onChange={setCategory} label="الصنف" className="yl-cats-tabs" />
        </div>
      )}

      {series === 'all' ? (
        phone
          ? <CompareRings month={month} spent={monthTotals} income={income} boxes={boxes} currency={currency} />
          : <CompareBars year={year} month={month} spent={monthTotals} income={income} boxes={boxes} currency={currency} isFuture={isFuture} />
      ) : series === 'boxes' && !(boxes ?? []).some((value) => value > 0) ? (
        <div className="yl-chart-empty">
          <span aria-hidden><Archive size={26} /></span>
          <b>لم تُسجَّل صناديق بعد</b>
          <p>عند تسجيل وارد الصناديق يظهر هنا شهراً بشهر.</p>
        </div>
      ) : series === 'income' && !income ? (
        <div className="yl-chart-empty">
          <span aria-hidden><TrendingUp size={26} /></span>
          <b>الوارد غير متاح لحسابك</b>
        </div>
      ) : phone ? (
        series === 'spent'
          ? <Donut items={ordered} month={month} total={monthTotal} selected={category} onSelect={setCategory} currency={currency} />
          : series === 'income'
            ? <IncomeRing income={income![month]} spent={monthTotal} before={month > 0 ? income![month - 1] : null} currency={currency} />
            : <IncomeRing income={values[month]} spent={monthTotal} before={month > 0 ? values[month - 1] : null} currency={currency} label="الصناديق" tone="boxes" />
      ) : (
        <MonthBars
          key={`${series}-${category}`}
          values={values}
          year={year}
          month={month}
          tone={series}
          currency={currency}
          isFuture={isFuture}
        />
      )}
    </section>
  );
}

/* ── Computer: twelve monthly columns ─────────────────────────────── */

export function MonthBars({ values, year, month, tone, currency, isFuture, hrefOf = (at) => ledgerHref(year, at) }: {
  values: number[];
  year: number;
  month: number;
  tone: Series;
  currency: string;
  isFuture: (year: number, month: number) => boolean;
  hrefOf?: (month: number) => string | undefined;
}) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(...values, 1);
  const shown = values.filter((value, at) => !isFuture(year, at) && value > 0);
  const average = shown.length ? shown.reduce((s, v) => s + v, 0) / shown.length : 0;
  const ticks = [1, 0.5].map((part) => Math.round(max * part));
  return (
    <div className={`yl-mbars tone-${tone}`} onPointerLeave={() => setActive(null)}>
      <div className="yl-chart-grid" aria-hidden>
        {ticks.map((tick) => <span key={tick} style={{ insetBlockEnd: `${(tick / max) * 100}%` }}><bdi>{formatNumber(tick)}</bdi></span>)}
        {average > 0 && (
          <span className="yl-avg" style={{ insetBlockEnd: `${(average / max) * 100}%` }}>
            <em>المتوسط <bdi>{formatNumber(Math.round(average))}</bdi></em>
          </span>
        )}
      </div>
      <ol className="yl-mbar-row">
        {values.map((value, at) => {
          const future = isFuture(year, at);
          const share = future ? 0 : (value / max) * 100;
          const before = at > 0 ? values[at - 1] : 0;
          const delta = !future && before > 0 ? ((value - before) / before) * 100 : null;
          return (
            <li key={at} className={`${at === month ? 'is-current' : ''}${future ? ' is-future' : ''}`}>
              <a
                className={`yl-mbar${active === at ? ' on' : ''}`}
                href={future ? undefined : hrefOf(at)}
                aria-label={`${MONTH_NAMES[at]}: ${formatNumber(value)} ${currency}`}
                onPointerEnter={() => setActive(at)}
                onFocus={() => setActive(at)}
                onBlur={() => setActive(null)}
              >
                {at === month && value > 0 && <span className="yl-mbar-value"><bdi>{formatNumber(value)}</bdi></span>}
                <i style={{ blockSize: `${Math.max(share, value > 0 ? 1.5 : 0)}%`, animationDelay: `${at * 30}ms` }} />
                {active === at && !future && (
                  <span className="yl-tip" role="tooltip">
                    <b>{MONTH_NAMES[at]}</b>
                    <span className="yl-tip-amount"><bdi>{formatNumber(value)}</bdi> {currency}</span>
                    {delta !== null && Math.abs(delta) >= 0.5 && (
                      <span className={(delta > 0) === (tone === 'income') ? 'good' : 'bad'}>
                        {delta > 0 ? '▲' : '▼'} <bdi>{formatPercent(Math.abs(delta))}</bdi> عن السابق
                      </span>
                    )}
                  </span>
                )}
              </a>
              <span className="yl-mlabel"><span className="yl-mlabel-full">{MONTH_NAMES[at]}</span><bdi className="yl-mlabel-num">{at + 1}</bdi></span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* ── Phone: the month as an animated ring of headings ─────────────────────────── */

const R = 70;
const C = 2 * Math.PI * R;

function Donut({ items, month, total, selected, onSelect, currency }: {
  items: ChartCategory[];
  month: number;
  total: number;
  selected: string;
  onSelect: (id: string) => void;
  currency: string;
}) {
  const parts = items.filter((item) => item.values[month] > 0);
  const gap = parts.length > 1 ? 3 : 0;
  let offset = 0;
  const arcs = parts.map((item, index) => {
    const length = (item.values[month] / Math.max(total, 1)) * C;
    const arc = { item, index, start: offset, length: Math.max(length - gap, 0.5) };
    offset += length;
    return arc;
  });
  const chosen = parts.find((item) => item.id === selected) ?? null;
  const centreValue = chosen ? chosen.values[month] : total;
  const step = (dir: 1 | -1) => {
    const ids = ['all', ...parts.map((item) => item.id)];
    const at = Math.max(ids.indexOf(selected), 0);
    onSelect(ids[(at + dir + ids.length) % ids.length]);
  };
  // A sideways swipe on the ring moves to the next or previous heading.
  const touch = useRef<number | null>(null);

  if (parts.length === 0) {
    return <div className="yl-chart-empty"><span aria-hidden><Layers size={26} /></span><b>لا صرف هذا الشهر</b></div>;
  }

  return (
    <div
      className="yl-donut-wrap"
      onTouchStart={(event) => { touch.current = event.touches[0].clientX; }}
      onTouchEnd={(event) => {
        if (touch.current === null) return;
        const moved = event.changedTouches[0].clientX - touch.current;
        touch.current = null;
        // Right-to-left reading: a swipe to the left moves forward.
        if (Math.abs(moved) > 40) step(moved < 0 ? 1 : -1);
      }}
    >
      <svg className="yl-donut" viewBox="0 0 180 180" role="img" aria-label="الصرف حسب الصنف">
        <circle className="yl-donut-track" cx="90" cy="90" r={R} />
        {arcs.map(({ item, index, start, length }) => {
          const on = selected === item.id;
          const dim = selected !== 'all' && !on;
          return (
            <circle
              key={item.id}
              className={`yl-donut-arc${on ? ' on' : ''}${dim ? ' dim' : ''}`}
              cx="90"
              cy="90"
              r={R}
              style={{
                strokeDasharray: `${length} ${C}`,
                strokeDashoffset: -start,
                // Each heading a step lighter, from the theme colour down.
                stroke: `color-mix(in srgb, var(--bar-active) ${Math.max(100 - index * (58 / Math.max(parts.length - 1, 1)), 42)}%, var(--donut-mix))`,
                animationDelay: `${index * 70}ms`,
              }}
              onClick={() => onSelect(on ? 'all' : item.id)}
            >
              <title>{`${item.label}: ${formatNumber(item.values[month])}`}</title>
            </circle>
          );
        })}
      </svg>
      <div className="yl-donut-centre" key={selected} aria-live="polite">
        <small>{chosen ? chosen.label : 'كل الأصناف'}</small>
        <b><bdi>{formatNumber(centreValue)}</bdi></b>
        <span>{chosen ? <><bdi>{formatPercent((centreValue / Math.max(total, 1)) * 100)}</bdi> من الشهر</> : <>{currency} · <bdi>{formatNumber(parts.length)}</bdi> صنف</>}</span>
      </div>
      <div className="yl-donut-nav">
        <button type="button" className="icon-btn" aria-label="الصنف السابق" onClick={() => step(-1)}>›</button>
        <span className="yl-donut-dots" aria-hidden>
          {['all', ...parts.map((item) => item.id)].map((id) => <i key={id} className={id === selected ? 'on' : undefined} />)}
        </span>
        <button type="button" className="icon-btn" aria-label="الصنف التالي" onClick={() => step(1)}>‹</button>
      </div>
    </div>
  );
}

// Income on the phone: one ring for how much of the month's spending the income covered.
function IncomeRing({ income, spent, before, currency, label = 'الوارد', tone = 'income' }: { income: number; spent: number; before: number | null; currency: string; label?: string; tone?: 'income' | 'boxes' }) {
  const cover = spent > 0 ? Math.min((income / spent) * 100, 100) : income > 0 ? 100 : 0;
  const delta = before && before > 0 ? ((income - before) / before) * 100 : null;
  return (
    <div className="yl-donut-wrap">
      <svg className={`yl-donut tone-${tone}`} viewBox="0 0 180 180" role="img" aria-label={`${label} مقابل الصرف`}>
        <circle className="yl-donut-track" cx="90" cy="90" r={R} />
        <circle className={`yl-donut-arc on ${tone}`} cx="90" cy="90" r={R} style={{ strokeDasharray: `${(cover / 100) * C} ${C}` }} />
      </svg>
      <div className="yl-donut-centre">
        <small>{label}</small>
        <b><bdi>{formatNumber(income)}</bdi></b>
        <span>{currency}</span>
      </div>
      <dl className="yl-ring-facts">
        <div><dt>يغطي من الصرف</dt><dd><bdi>{formatPercent(cover)}</bdi></dd></div>
        <div><dt>الصرف</dt><dd><bdi>{formatNumber(spent)}</bdi></dd></div>
        <div><dt>عن الشهر السابق</dt><dd className={delta === null ? undefined : delta >= 0 ? 'good' : 'bad'}>{delta === null ? '—' : <>{delta >= 0 ? '▲' : '▼'} <bdi>{formatPercent(Math.abs(delta))}</bdi></>}</dd></div>
      </dl>
    </div>
  );
}

/* ── «الكل»: spending, income and boxes side by side ─────────────────────────── */

const COMPARE = [
  { key: 'spent', label: 'الاستهلاك', cls: 'spent' },
  { key: 'income', label: 'الوارد', cls: 'income' },
  { key: 'boxes', label: 'الصناديق', cls: 'boxes' },
] as const;

// Computer: each month a group of three thin columns on one scale, this month lit.
function CompareBars({ year, month, spent, income, boxes, currency, isFuture }: {
  year: number;
  month: number;
  spent: number[];
  income: number[] | null;
  boxes: number[] | null;
  currency: string;
  isFuture: (year: number, month: number) => boolean;
}) {
  const [active, setActive] = useState<number | null>(null);
  const zero = Array<number>(12).fill(0);
  const sets = { spent, income: income ?? zero, boxes: boxes ?? zero };
  const max = Math.max(...spent, ...sets.income, ...sets.boxes, 1);
  const ticks = [1, 0.5].map((part) => Math.round(max * part));
  return (
    <>
      <ul className="yl-legend" aria-label="مفتاح الألوان">
        {COMPARE.map((item) => (
          <li key={item.key} className={item.cls}>
            <i aria-hidden />
            <span>{item.label}</span>
            <b><bdi>{formatNumber(sets[item.key][month])}</bdi></b>
          </li>
        ))}
      </ul>
      <div className="yl-mbars yl-cbars" onPointerLeave={() => setActive(null)}>
        <div className="yl-chart-grid" aria-hidden>
          {ticks.map((tick) => <span key={tick} style={{ insetBlockEnd: `${(tick / max) * 100}%` }}><bdi>{formatNumber(tick)}</bdi></span>)}
        </div>
        <ol className="yl-mbar-row">
          {MONTH_NAMES.map((name, at) => {
            const future = isFuture(year, at);
            return (
              <li key={name} className={`${at === month ? 'is-current' : ''}${future ? ' is-future' : ''}`}>
                <a
                  className={`yl-mbar yl-cgroup${active === at ? ' on' : ''}`}
                  href={future ? undefined : ledgerHref(year, at)}
                  aria-label={`${name}: الاستهلاك ${formatNumber(spent[at])}، الوارد ${formatNumber(sets.income[at])}، الصناديق ${formatNumber(sets.boxes[at])}`}
                  onPointerEnter={() => setActive(at)}
                  onFocus={() => setActive(at)}
                  onBlur={() => setActive(null)}
                >
                  <span className="yl-cgroup-cols">
                    {COMPARE.map((item, index) => {
                      const value = future ? 0 : sets[item.key][at];
                      return (
                        <i
                          key={item.key}
                          className={item.cls}
                          style={{ blockSize: `${value > 0 ? Math.max((value / max) * 100, 1.5) : 0}%`, animationDelay: `${at * 30 + index * 60}ms` }}
                        />
                      );
                    })}
                  </span>
                  {active === at && !future && (
                    <span className="yl-tip" role="tooltip">
                      <b>{name}</b>
                      {COMPARE.map((item) => (
                        <span key={item.key} className={`yl-tip-row ${item.cls}`}>
                          <i aria-hidden />{item.label}
                          <bdi>{formatNumber(sets[item.key][at])}</bdi>
                        </span>
                      ))}
                      <span className={`yl-tip-net ${sets.income[at] + sets.boxes[at] - spent[at] >= 0 ? 'good' : 'bad'}`}>
                        الفرق <bdi dir="ltr">{formatNumber(sets.income[at] + sets.boxes[at] - spent[at])}</bdi> {currency}
                      </span>
                    </span>
                  )}
                </a>
                <span className="yl-mlabel">{name}</span>
              </li>
            );
          })}
        </ol>
      </div>
    </>
  );
}

// Phone: three rings one inside the other, each the month's figure against the largest of the three.
function CompareRings({ month, spent, income, boxes, currency }: {
  month: number;
  spent: number[];
  income: number[] | null;
  boxes: number[] | null;
  currency: string;
}) {
  const values = { spent: spent[month], income: income?.[month] ?? 0, boxes: boxes?.[month] ?? 0 };
  const max = Math.max(values.spent, values.income, values.boxes, 1);
  const net = values.income + values.boxes - values.spent;
  const radii = [74, 56, 38];
  return (
    <div className="yl-donut-wrap">
      <svg className="yl-donut yl-rings" viewBox="0 0 180 180" role="img" aria-label="مقارنة الاستهلاك والوارد والصناديق">
        {COMPARE.map((item, index) => {
          const r = radii[index];
          const length = 2 * Math.PI * r;
          return (
            <g key={item.key} className={item.cls}>
              <circle className="yl-ring-track" cx="90" cy="90" r={r} />
              <circle
                className="yl-ring-arc"
                cx="90"
                cy="90"
                r={r}
                style={{ strokeDasharray: `${(values[item.key] / max) * length} ${length}`, animationDelay: `${index * 120}ms`, ['--len' as string]: length }}
              />
            </g>
          );
        })}
      </svg>
      <div className="yl-donut-centre yl-rings-centre">
        <small>الفرق</small>
        <b className={net >= 0 ? 'good' : 'bad'}><bdi dir="ltr">{formatNumber(net)}</bdi></b>
        <span>{currency}</span>
      </div>
      <ul className="yl-legend is-stacked">
        {COMPARE.map((item) => (
          <li key={item.key} className={item.cls}>
            <i aria-hidden />
            <span>{item.label}</span>
            <b><bdi>{formatNumber(values[item.key])}</bdi></b>
          </li>
        ))}
      </ul>
    </div>
  );
}

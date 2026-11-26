import { useEffect, useState } from 'react';
import { api } from '../../api';
import { ArrowDownRight, ArrowUpRight, ChevronLeft, Gift, Receipt, Wallet, type LucideIcon } from 'lucide-react';
import { formatNumber, MONTH_NAMES } from '../../format';

// Short month names so six fit under the bars on a phone.
const MONTHS_SHORT = ['ك2', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'ت1', 'ت2', 'ك1'];
const INCOME = 'var(--fp-emerald)';
const SPEND = 'var(--fp-amber)';

interface Props {
  currency: string;
  month: number;
  collected: number[];
  spent: number[] | null;
  // This month's donations from the donors' register; null when the foundation cannot read them.
  donations: { cash: number; food: { label: string; qty: number; unit: string }[] } | null;
}

type Range = 'week' | 'month' | 'year';
const RANGES: { id: Range; label: string }[] = [
  { id: 'week', label: 'أسبوع' },
  { id: 'month', label: 'شهر' },
  { id: 'year', label: 'سنة' },
];
const DAYS_SHORT = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
// «الأربعاء 18 تشرين الثاني 2026» — the full date shown in the bar tooltip.
const dayLabel = (d: Date) => `${new Intl.DateTimeFormat('ar-IQ', { weekday: 'long' }).format(d)} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
const year = new Date().getFullYear();
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const change = (now: number, before: number) => (before > 0 ? Math.round(((now - before) / before) * 100) : null);
const compact = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}K` : String(n));

function Delta({ value, goodWhenUp }: { value: number | null; goodWhenUp: boolean }) {
  if (value === null) return <span className="text-xs" style={{ color: 'var(--fp-ink-3)' }}>لا مقارنة</span>;
  const up = value >= 0;
  const good = up === goodWhenUp;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      dir="ltr"
      className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums"
      style={{ backgroundColor: good ? 'var(--fp-emerald-soft)' : 'var(--fp-rose-soft)', color: good ? 'var(--fp-emerald)' : 'var(--fp-rose)' }}
    >
      <Icon size={12} aria-hidden />{up ? '+' : ''}{value}%
    </span>
  );
}

/** Bar tooltip: the period, income and spending with their colours, and what is left over. */
// A round top for the y-axis: 4 equal steps of 1, 2, 2.5 or 5 × a power of ten.
function niceTop(max: number) {
  const raw = Math.max(max, 1) / 4;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * power).find((k) => k >= raw) ?? raw;
  return step * 4;
}

// The income and spending bars, drawn with plain elements instead of a chart library (recharts was
// 370 KB of code on the phone's home page). Same look: dashed lines, amounts on the right, the
// first period on the right, a tip on hover or tap.
function MiniBars({ rows, spent, currency }: { rows: { name: string; full?: string; in: number; out: number }[]; spent: boolean; currency: string }) {
  const [tip, setTip] = useState<number | null>(null);
  const top = niceTop(Math.max(0, ...rows.flatMap((row) => [row.in, spent ? row.out : 0])));
  const pct = (value: number) => `${Math.min(100, (value / top) * 100)}%`;
  const shown = tip === null ? null : rows[tip];
  return (
    <div className="pmo-chart" dir="ltr" onMouseLeave={() => setTip(null)}>
      <div className="pmo-plot">
        {[1, 0.75, 0.5, 0.25, 0].map((f) => (
          <span key={f} className="pmo-line" style={{ bottom: `${f * 100}%` }}><em>{compact(top * f)}</em></span>
        ))}
        <div className="pmo-cols">
          {rows.map((row, at) => (
            <button
              key={row.name + at}
              type="button"
              className={`pmo-col${tip === at ? ' is-on' : ''}`}
              onMouseEnter={() => setTip(at)}
              onFocus={() => setTip(at)}
              onClick={() => setTip(tip === at ? null : at)}
              aria-label={`${row.full ?? row.name}: الوارد ${formatNumber(row.in)}${spent ? `، المصروف ${formatNumber(row.out)}` : ''}`}
            >
              <span className="pmo-pair">
                <i style={{ height: pct(row.in), background: INCOME }} />
                {spent && <i style={{ height: pct(row.out), background: SPEND }} />}
              </span>
            </button>
          ))}
        </div>
        {shown && tip !== null && (
          <div className="pmo-tip" style={{ right: `clamp(-40px, calc(${((tip + 0.5) / rows.length) * 100}% - 110px), calc(100% - 210px))` }}>
            <ChartTip label={shown.full ?? shown.name} income={shown.in} spend={spent ? shown.out : null} currency={currency} />
          </div>
        )}
      </div>
      <div className="pmo-names">
        {rows.map((row, at) => <span key={row.name + at}>{rows.length > 7 && at % 2 === 1 ? '' : row.name}</span>)}
      </div>
    </div>
  );
}

function ChartTip({ label, income, spend, currency }: { label: string; income: number; spend: number | null; currency: string }) {
  const net = spend === null ? null : income - spend;
  const line = (name: string, colour: string, value: number) => (
    <div className="flex items-center justify-between gap-4">
      <span className="inline-flex items-center gap-1.5" style={{ color: 'var(--fp-ink-2)' }}>
        <i className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colour }} aria-hidden />{name}
      </span>
      <b className="tabular-nums" style={{ color: 'var(--fp-ink)' }}><bdi dir="ltr">{formatNumber(value)}</bdi></b>
    </div>
  );
  return (
    <div
      dir="rtl"
      className="min-w-[200px] max-w-[240px] rounded-2xl border p-3 text-xs shadow-xl"
      style={{ backgroundColor: 'var(--fp-card)', borderColor: 'var(--fp-border)', backdropFilter: 'blur(12px)' }}
    >
      <p className="mb-2 font-bold leading-snug" style={{ color: 'var(--fp-ink)' }}>{label}</p>
      <div className="grid gap-1.5">
        {line('الوارد', INCOME, income)}
        {spend !== null && line('المصروف', SPEND, spend)}
      </div>
      {net !== null && (
        <p
          className="mt-2 flex items-center justify-between rounded-lg px-2 py-1.5 font-bold"
          style={{ backgroundColor: net < 0 ? 'var(--fp-rose-soft)' : 'var(--fp-emerald-soft)', color: net < 0 ? 'var(--fp-rose)' : 'var(--fp-emerald)' }}
        >
          <span>المتبقي</span>
          <span className="whitespace-nowrap">
            <bdi dir="ltr" className="tabular-nums">{net < 0 ? '−' : ''}{formatNumber(Math.abs(net))}</bdi>
            <small className="ms-1 font-medium">{currency}</small>
          </span>
        </p>
      )}
    </div>
  );
}

// Short labels ("الوارد" / "المصروف"): the longer ones wrapped beside the icon on every phone;
// the line under the figure already says which period it is.
function MoneyCard({ label, icon: Icon, tone, value, unit, delta, since }: { label: string; icon: LucideIcon; tone: string; value: string; unit: string; delta: React.ReactNode; since: string }) {
  return (
    <article className="fp-card min-w-0 p-3.5" style={{ borderTop: `3px solid ${tone}`, borderTopLeftRadius: 20, borderTopRightRadius: 20 }}>
      <div className="flex items-center gap-2">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: `color-mix(in srgb, ${tone} 14%, transparent)`, color: tone }}>
          <Icon size={17} aria-hidden />
        </span>
        <h3 className="min-w-0 whitespace-nowrap text-sm font-extrabold leading-tight" style={{ color: 'var(--fp-ink)' }}>{label}</h3>
      </div>
      <p className="mt-3 whitespace-nowrap text-[clamp(15px,4.8vw,18px)] font-extrabold leading-none tabular-nums" style={{ color: 'var(--fp-ink)' }}>
        <bdi dir="ltr">{value}</bdi><small className="ms-1 text-[11px] font-medium" style={{ color: 'var(--fp-ink-3)' }}>{unit}</small>
      </p>
      {delta && (
        <div className="mt-3 flex items-center gap-1.5 border-t pt-2.5" style={{ borderColor: 'var(--fp-border)' }}>
          {delta}
          <span className="whitespace-nowrap text-[11px]" style={{ color: 'var(--fp-ink-3)' }}>{since}</span>
        </div>
      )}
    </article>
  );
}

/** Phone: this month's money in and out, how they moved over six months, and donations. */
export function PhoneMoneyOverview({ currency, month, collected, spent, donations }: Props) {
  const [range, setRange] = useState<Range>('year');
  // Daily income and spending from the server for the week and month views. The window rolls:
  // each day it ends on today, so a new day comes in and the oldest one drops off.
  const [daily, setDaily] = useState<{ day: string; in: number; out: number }[] | null>(null);
  useEffect(() => {
    if (range === 'year') return undefined;
    let live = true;
    const today = new Date();
    const start = new Date(today);
    if (range === 'week') start.setDate(today.getDate() - 6); else start.setDate(1);
    setDaily(null);
    api<{ days: { day: string; in: number; out: number }[] }>(`/dashboard/daily?from=${iso(start)}&to=${iso(today)}`)
      .then((r) => { if (live) setDaily(r.days); })
      .catch(() => { if (live) setDaily([]); });
    return () => { live = false; };
  }, [range]);
  const sinceLabel = month > 0 ? `عن ${MONTHS_SHORT[month - 1]}` : '';
  const inNow = collected[month] ?? 0;
  const inBefore = month > 0 ? collected[month - 1] ?? 0 : 0;
  const outNow = spent?.[month] ?? 0;
  const outBefore = spent && month > 0 ? spent[month - 1] ?? 0 : 0;

  // Year: both series per month. Month: this month by week. Week: the last seven days, day by day.
  const fromDaily = (pick: (d: { day: string; in: number; out: number }) => boolean) => {
    const rows = (daily ?? []).filter(pick);
    return { in: rows.reduce((n, r) => n + r.in, 0), out: rows.reduce((n, r) => n + r.out, 0) };
  };
  const chart = range === 'year'
    ? Array.from({ length: month + 1 }, (_, m) => ({
      name: MONTHS_SHORT[m],
      full: m === month ? `حتى ${dayLabel(new Date())}` : `${MONTH_NAMES[m]} ${year}`,
      in: collected[m] ?? 0,
      out: spent?.[m] ?? 0,
    }))
    : range === 'month'
      ? Array.from({ length: Math.ceil(new Date().getDate() / 7) }, (_, w) => ({
        name: `أ${w + 1}`,
        full: `${w * 7 + 1} – ${Math.min((w + 1) * 7, new Date().getDate())} ${MONTH_NAMES[month]} ${year}`,
        ...fromDaily((d) => { const n = Number(d.day.slice(8, 10)); return n > w * 7 && n <= (w + 1) * 7; }),
      }))
      : (daily ?? []).map((d) => {
        const date = new Date(`${d.day}T12:00:00`);
        return { name: DAYS_SHORT[date.getDay()], full: dayLabel(date), in: d.in, out: d.out };
      });
  const loadingDaily = range !== 'year' && daily === null;

  const caption = range === 'year' ? `${MONTHS_SHORT[0]} – ${MONTHS_SHORT[month]}` : range === 'month' ? 'هذا الشهر حسب الأسبوع' : 'آخر 7 أيام حتى اليوم';

  return (
    // grid-cols-1 (minmax(0, 1fr)): a plain grid column grows to its widest content, which made
    // the page 15px wider than a 320px phone. Under 360px the two money cards stack.
    <div className="grid grid-cols-1 gap-3">
      <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2">
        <MoneyCard since={sinceLabel} label="الوارد" icon={Wallet} tone={INCOME} value={formatNumber(inNow)} unit={currency} delta={<Delta value={change(inNow, inBefore)} goodWhenUp />} />
        <MoneyCard
          since={sinceLabel}
          label="المصروف" icon={Receipt} tone={SPEND}
          value={spent ? formatNumber(outNow) : '—'} unit={spent ? currency : ''}
          delta={spent ? <Delta value={change(outNow, outBefore)} goodWhenUp={false} /> : null}
        />
      </div>

      <section className="fp-card p-4" aria-label="الوارد والمصروف">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="whitespace-nowrap text-sm font-extrabold" style={{ color: 'var(--fp-ink)' }}>الوارد والمصروف</h3>
            <span className="text-xs" style={{ color: 'var(--fp-ink-3)' }}>{caption}</span>
          </div>
          <div className="inline-flex shrink-0 rounded-full p-1" style={{ backgroundColor: 'var(--fp-muted)' }} role="tablist" aria-label="مدة الرسم">
            {RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                role="tab"
                aria-selected={range === r.id}
                onClick={() => setRange(r.id)}
                className="min-h-[34px] rounded-full px-2.5 text-xs font-bold transition min-[360px]:px-3"
                style={range === r.id
                  ? { backgroundColor: 'var(--fp-primary)', color: 'var(--fp-card)' }
                  : { color: 'var(--fp-ink-2)' }}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
        {loadingDaily ? (
          <p className="mt-3 h-44 animate-pulse rounded-2xl" style={{ backgroundColor: 'var(--fp-muted)' }} aria-busy="true" />
        ) : range !== 'year' && chart.every((row) => row.out === 0 && row.in === 0) ? (
          <p className="mt-3 grid h-44 place-items-center rounded-2xl text-center text-sm" style={{ backgroundColor: 'var(--fp-muted)', color: 'var(--fp-ink-3)' }}>
            {range === 'week' ? 'لا وارد ولا صرف في آخر 7 أيام' : 'لا وارد ولا صرف هذا الشهر'}
          </p>
        ) : (
        <MiniBars rows={chart} spent={Boolean(spent)} currency={currency} />
        )}
        <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold" style={{ color: 'var(--fp-ink-2)' }}>
          <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: INCOME }} aria-hidden />الوارد</span>
          <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: SPEND }} aria-hidden />المصروف</span>
        </p>
      </section>

      <a href="#/soon/donations" className="fp-card fp-aid-card flex items-center gap-3 p-3.5 no-underline">
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: 'var(--fp-primary-soft)', color: 'var(--fp-primary)' }}>
          <Gift size={20} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-extrabold" style={{ color: 'var(--fp-ink)' }}>التبرعات</span>
            <span className="whitespace-nowrap text-base font-extrabold tabular-nums" style={{ color: 'var(--fp-emerald)' }}>
              {donations ? <><bdi dir="ltr">{formatNumber(donations.cash)}</bdi> <small className="text-[11px] font-medium">{currency}</small></> : '—'}
            </span>
          </span>
          <span className="mt-1.5 flex flex-wrap gap-1">
            {(donations?.food ?? []).slice(0, 2).map((f) => (
              <span key={f.label} className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums" style={{ backgroundColor: 'var(--fp-muted-2)', color: 'var(--fp-ink-2)' }}>
                {f.qty > 0 ? <>{formatNumber(f.qty)} {f.label.startsWith(f.unit) ? '' : `${f.unit} `}</> : null}{f.label}
              </span>
            ))}
            {donations && donations.food.length === 0 && (
              <span className="text-[11px] font-semibold" style={{ color: 'var(--fp-ink-3)' }}>لا مواد عينية هذا الشهر</span>
            )}
          </span>
        </span>
        <ChevronLeft size={18} className="shrink-0" style={{ color: 'var(--fp-ink-3)' }} aria-hidden />
      </a>
    </div>
  );
}

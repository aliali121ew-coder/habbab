import { CalendarDays, CalendarRange, Coins, TrendingDown, TrendingUp, UsersRound } from 'lucide-react';
import type { Overview } from '../../api';
import { MONTH_NAMES, formatNumber, formatPercent } from '../../format';

export function Donut({ percent }: { percent: number }) {
  const radius = 32;
  const length = 2 * Math.PI * radius;
  const filled = (Math.min(percent, 100) / 100) * length;
  return (
    <svg className="donut" viewBox="0 0 80 80" role="img" aria-label={`نسبة التسديد ${formatPercent(percent)}`}>
      <circle cx="40" cy="40" r={radius} className="donut-track" />
      <circle cx="40" cy="40" r={radius} className="donut-value" strokeDasharray={`${filled} ${length}`} transform="rotate(-90 40 40)" />
      <text x="40" y="45" textAnchor="middle">{formatPercent(percent)}</text>
    </svg>
  );
}

// A smooth shaded trend across the year's twelve slots, drawn up to the chosen month. The
// scale hugs the months' own range so small changes read; the fade keeps the fill from
// implying a zero baseline.
function MonthTrend({ values, selected, currency }: { values: number[]; selected: number; currency: string }) {
  const shown = values.slice(0, Math.max(selected, 0) + 1);
  if (shown.length < 2) return <div className="stat-trend empty" aria-hidden />;
  const width = 300;
  const height = 64;
  const low = Math.min(...shown);
  const high = Math.max(...shown);
  const span = high - low || high || 1;
  const floor = Math.max(0, low - span * 0.6);
  const ceil = high + span * 0.15;
  const points = shown.map((value, month) => [
    // Right to left, as the register reads its months.
    (1 - month / 11) * width,
    height - 4 - ((value - floor) / (ceil - floor)) * (height - 10),
  ]);
  // Catmull-Rom through the points, as cubic Béziers.
  let line = `M${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const [x0, y0] = points[Math.max(i - 1, 0)];
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    const [x3, y3] = points[Math.min(i + 2, points.length - 1)];
    line += ` C${x1 + (x2 - x0) / 6},${y1 + (y2 - y0) / 6} ${x2 - (x3 - x1) / 6},${y2 - (y3 - y1) / 6} ${x2},${y2}`;
  }
  const [lastX, lastY] = points[points.length - 1];
  const area = `${line} L${lastX},${height} L${points[0][0]},${height} Z`;
  return (
    <div className="stat-trend">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id="stat-trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" className="trend-stop-top" />
            <stop offset="1" className="trend-stop-bottom" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#stat-trend-fill)" />
        <path d={line} className="trend-line" />
      </svg>
      <span className="trend-dot" style={{ insetInlineStart: `${(lastX / width) * 100}%`, top: `${(lastY / height) * 100}%` }} />
      <ol className="trend-hits" dir="rtl" aria-label="التحصيل حسب الشهر">
        {values.map((value, month) => (
          <li key={month} title={month <= selected ? `${MONTH_NAMES[month]}: ${formatNumber(value)} ${currency}` : MONTH_NAMES[month]} />
        ))}
      </ol>
    </div>
  );
}

interface Props {
  overview: Overview | null;
  currency: string;
  selectedMonth: number;
  onSelectMonth?: (month: number) => void;
}

export function StatCards({ overview, currency, selectedMonth }: Props) {
  if (!overview) {
    return <div className="stats" aria-busy="true">{[0, 1, 2, 3].map((key) => <div key={key} className="stat skeleton" />)}</div>;
  }

  const index = selectedMonth;
  const month = overview.months[index] ?? overview.months[0];
  const previous = index > 0 ? overview.months[index - 1] : null;
  const rate = overview.alive ? (month.paid_count / overview.alive) * 100 : 0;
  const unpaid = Math.max(overview.alive - month.paid_count, 0);
  const elapsed = overview.months.slice(0, index + 1);
  const yearTotal = overview.months.reduce((sum, row) => sum + row.paid_amount, 0);
  const average = elapsed.length ? Math.round(elapsed.reduce((sum, row) => sum + row.paid_amount, 0) / elapsed.length) : 0;
  const change = previous && previous.paid_amount
    ? ((month.paid_amount - previous.paid_amount) / previous.paid_amount) * 100
    : null;
  const monthTitle = `${index + 1} - ${MONTH_NAMES[index]}`;
  const best = overview.months.reduce((top, row, at) => (row.paid_amount > overview.months[top].paid_amount ? at : top), 0);

  return (
    <section className="stats" aria-label="إحصائيات المشتركين">
      <article className="stat stat-hero">
        <header><h2>المشتركون</h2><span className="stat-icon"><UsersRound size={18} aria-hidden /></span></header>
        <p className="stat-value"><bdi>{formatNumber(overview.alive + overview.deceased)}</bdi></p>
        <dl className="stat-split">
          <div><dt>أحياء</dt><dd><bdi>{formatNumber(overview.alive)}</bdi></dd></div>
          <div><dt>متوفون</dt><dd><bdi>{formatNumber(overview.deceased)}</bdi></dd></div>
        </dl>
      </article>

      <article className="stat">
        <header><h2>تسديد شهر {monthTitle}</h2><span className="stat-icon"><CalendarDays size={18} aria-hidden /></span></header>
        <div className="stat-donut">
          <Donut percent={rate} />
          <dl className="stat-lines">
            <div><dt>مسددون</dt><dd><bdi>{formatNumber(month.paid_count)}</bdi></dd></div>
            <div><dt>لم يسددوا</dt><dd><bdi>{formatNumber(unpaid)}</bdi></dd></div>
          </dl>
        </div>
      </article>

      <article className="stat stat-money">
        <header><h2>تحصيل {MONTH_NAMES[index]}</h2><span className="stat-icon"><Coins size={18} aria-hidden /></span></header>
        <p className="stat-value"><bdi>{formatNumber(month.paid_amount)}</bdi> <small>{currency}</small></p>
        {change !== null ? (
          <p className={change >= 0 ? 'stat-change up' : 'stat-change down'}>
            {change >= 0 ? <TrendingUp size={14} aria-hidden /> : <TrendingDown size={14} aria-hidden />}
            <bdi dir="ltr">{change > 0 ? '+' : ''}{change.toFixed(1)}%</bdi>
            <span>عن {MONTH_NAMES[index - 1]}</span>
          </p>
        ) : <p className="stat-change">لا مقارنة بشهر سابق</p>}
        <dl className="stat-facts">
          <div><dt>الشهر السابق</dt><dd><bdi>{previous ? formatNumber(previous.paid_amount) : '—'}</bdi></dd></div>
          <div><dt>عدد التسديدات</dt><dd><bdi>{formatNumber(month.paid_count)}</bdi></dd></div>
        </dl>
      </article>

      <article className="stat stat-money">
        <header><h2>تحصيل سنة <bdi>{overview.year}</bdi></h2><span className="stat-icon"><CalendarRange size={18} aria-hidden /></span></header>
        <p className="stat-value"><bdi>{formatNumber(yearTotal)}</bdi> <small>{currency}</small></p>
        <MonthTrend values={overview.months.map((row) => row.paid_amount)} selected={index} currency={currency} />
        <dl className="stat-facts">
          <div><dt>متوسط شهري</dt><dd><bdi>{formatNumber(average)}</bdi></dd></div>
          <div><dt>أعلى شهر</dt><dd>{overview.months[best].paid_amount ? MONTH_NAMES[best] : '—'}</dd></div>
        </dl>
      </article>
    </section>
  );
}

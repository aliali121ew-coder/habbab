import { useId, useState } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import type { MonthTotal } from '../../api';
import { MONTH_NAMES, formatCompact, formatNumber, formatPercent, monthIndex } from '../../format';

const W = 300;
const H = 150;
const PAD = { top: 14, right: 10, bottom: 24, left: 40 };

// A smooth line through the points (monotone, so it never overshoots between two months).
function smooth(points: { x: number; y: number }[]): string {
  if (points.length < 2) return points.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ');
  const slopes = points.slice(1).map((p, i) => (p.y - points[i].y) / (p.x - points[i].x));
  const tangents = points.map((_, i) => {
    if (i === 0) return slopes[0];
    if (i === points.length - 1) return slopes[i - 1];
    const a = slopes[i - 1];
    const b = slopes[i];
    return a * b <= 0 ? 0 : (a + b) / 2;
  });
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p = points[i];
    const q = points[i + 1];
    const dx = (q.x - p.x) / 3;
    d += ` C${p.x + dx},${p.y + tangents[i] * dx} ${q.x - dx},${q.y - tangents[i + 1] * dx} ${q.x},${q.y}`;
  }
  return d;
}

interface Props {
  year: number;
  months: MonthTotal[];
  selected: number;
  currency: string;
  onSelect?: (month: number) => void;
}

// The year's collection month by month: a smooth line over a soft area, the chosen month
// marked with a guide and its figure, and the change from the month before in the heading.
export function CollectionLine({ year, months, selected, currency, onSelect }: Props) {
  const uid = useId().replace(/:/g, '');
  const [hover, setHover] = useState<number | null>(null);
  const now = new Date();
  const lastMonth = year < now.getUTCFullYear() ? 11 : year > now.getUTCFullYear() ? -1 : now.getUTCMonth();
  const amounts = Array.from({ length: 12 }, (_, month) => months.find((item) => monthIndex(item.period) === month)?.paid_amount ?? 0);
  const shown = amounts.slice(0, lastMonth + 1);

  const top = Math.max(...shown, 1);
  const step = 10 ** Math.floor(Math.log10(top));
  // A round ceiling just above the best month: the next half-step (150K over 130K, not 200K).
  const ceiling = Math.ceil(top / (step / 2)) * (step / 2) || 1;
  const x = (month: number) => PAD.right + ((W - PAD.left - PAD.right) * (11 - month)) / 11;
  const y = (value: number) => PAD.top + (H - PAD.top - PAD.bottom) * (1 - value / ceiling);
  const points = shown.map((value, month) => ({ x: x(month), y: y(value) }));
  const line = smooth(points);
  const area = points.length ? `${line} L${points[points.length - 1].x},${y(0)} L${points[0].x},${y(0)} Z` : '';
  const ticks = [0, 0.5, 1].map((share) => share * ceiling);

  const focus = hover ?? Math.min(selected, lastMonth);
  const value = amounts[focus] ?? 0;
  const previous = focus > 0 ? amounts[focus - 1] : 0;
  const change = previous > 0 ? ((value - previous) / previous) * 100 : null;
  const total = shown.reduce((sum, amount) => sum + amount, 0);
  const active = shown.filter((amount) => amount > 0).length;

  return (
    <figure className="dpn-line">
      <figcaption>
        <span>التحصيل الشهري</span>
        <em><bdi>{year}</bdi></em>
      </figcaption>

      <div className="dpn-line-now">
        <div>
          <small>{MONTH_NAMES[focus]}</small>
          <b><bdi>{formatNumber(value)}</bdi> <span>{currency}</span></b>
        </div>
        {change !== null && (
          <span className={`dpn-line-change ${change >= 0 ? 'up' : 'down'}`}>
            {change >= 0 ? <TrendingUp size={14} aria-hidden /> : <TrendingDown size={14} aria-hidden />}
            <bdi>{formatPercent(Math.abs(change))}</bdi>
          </span>
        )}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`التحصيل الشهري لسنة ${year}: ${shown.map((amount, month) => `${MONTH_NAMES[month]} ${formatNumber(amount)}`).join('، ')}`}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={`${uid}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" className="dpn-area-top" />
            <stop offset="1" className="dpn-area-bottom" />
          </linearGradient>
        </defs>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={PAD.right} x2={W - PAD.left} y1={y(tick)} y2={y(tick)} className={tick === 0 ? 'dpn-axis' : 'dpn-grid'} />
            <text x={W - PAD.left + 6} y={y(tick) + 3.5} className="dpn-tick" textAnchor="start">{formatCompact(tick)}</text>
          </g>
        ))}
        {Array.from({ length: 12 }, (_, month) => (
          <text key={month} x={x(month)} y={H - 6} textAnchor="middle" className={`dpn-month${month === focus ? ' on' : ''}`}>{month + 1}</text>
        ))}
        {points.length > 0 && (
          <>
            <path d={area} fill={`url(#${uid}-fill)`} className="dpn-area" />
            <path d={line} className="dpn-path" pathLength={1} />
            <line x1={x(focus)} x2={x(focus)} y1={PAD.top} y2={y(0)} className="dpn-guide" />
            {points.map((point, month) => (
              <circle key={month} cx={point.x} cy={point.y} r={month === focus ? 5 : 3} className={`dpn-dot${month === focus ? ' on' : ''}`} />
            ))}
          </>
        )}
        {/* Wide invisible columns: hovering or tapping anywhere above a month picks it. */}
        {shown.map((amount, month) => (
          <rect
            key={month}
            x={x(month) - (W - PAD.left - PAD.right) / 22}
            y={0}
            width={(W - PAD.left - PAD.right) / 11}
            height={H}
            className="dpn-hit"
            onMouseEnter={() => setHover(month)}
            onClick={() => onSelect?.(month)}
          >
            <title>{`${MONTH_NAMES[month]}: ${formatNumber(amount)} ${currency}`}</title>
          </rect>
        ))}
      </svg>

      <dl className="dpn-line-foot">
        <div><dt>مجموع السنة</dt><dd><bdi>{formatNumber(total)}</bdi></dd></div>
        <div><dt>متوسط الشهر</dt><dd><bdi>{active ? formatNumber(Math.round(total / active)) : '—'}</bdi></dd></div>
      </dl>
    </figure>
  );
}

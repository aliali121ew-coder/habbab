import { useState } from 'react';
import type { MonthTotal } from '../../api';
import { MONTH_NAMES, formatCompact, formatNumber } from '../../format';

const WIDTH = 340;
const HEIGHT = 190;
const LEFT = 34;
const BOTTOM = 24;
const TOP = 12;

function niceMax(value: number) {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((candidate) => candidate * magnitude >= value) ?? 10;
  return step * magnitude;
}

interface Props {
  months: MonthTotal[];
  selectedMonth: number;
  onSelectMonth: (month: number) => void;
  currency: string;
}

export function MonthlyChart({ months, selectedMonth, onSelectMonth, currency }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? selectedMonth;
  const active = months[shown] ?? months[0];
  const max = niceMax(Math.max(...months.map((month) => month.paid_amount)));
  const plotHeight = HEIGHT - TOP - BOTTOM;
  const slot = (WIDTH - LEFT) / 12;
  const barWidth = Math.min(slot - 6, 16);
  const ticks = [0, 0.5, 1];

  return (
    <figure className="chart">
      <figcaption>
        <h3>التحصيل الشهري (اضغط لاختيار الشهر)</h3>
        <p><span>{shown + 1} - {MONTH_NAMES[shown]}</span> <strong><bdi>{formatNumber(active.paid_amount)}</bdi></strong> {currency} · <bdi>{formatNumber(active.paid_count)}</bdi> تسديد</p>
      </figcaption>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="التحصيل الشهري خلال السنة" onMouseLeave={() => setHover(null)}>
        {ticks.map((tick) => {
          const y = TOP + plotHeight * (1 - tick);
          return (
            <g key={tick}>
              <line x1={LEFT} x2={WIDTH} y1={y} y2={y} className={tick === 0 ? 'chart-base' : 'chart-grid'} />
              <text x={LEFT - 6} y={y + 4} textAnchor="end" className="chart-tick">{formatCompact(max * tick)}</text>
            </g>
          );
        })}
        {months.map((month, index) => {
          const x = WIDTH - slot * (index + 1) + (slot - barWidth) / 2;
          const height = (month.paid_amount / max) * plotHeight;
          return (
            <g
              key={month.period}
              tabIndex={0}
              role="button"
              aria-label={`${MONTH_NAMES[index]}: ${formatNumber(month.paid_amount)}`}
              onMouseEnter={() => setHover(index)}
              onFocus={() => setHover(index)}
              onBlur={() => setHover(null)}
              onClick={() => onSelectMonth(index)}
            >
              <rect x={WIDTH - slot * (index + 1)} y={TOP} width={slot} height={plotHeight + BOTTOM} className="chart-hit" />
              {height > 0 && (
                <path
                  d={`M${x},${TOP + plotHeight} v${-Math.max(height - 4, 0)} q0,-4 4,-4 h${barWidth - 8} q4,0 4,4 v${Math.max(height - 4, 0)} z`}
                  className={index === shown ? 'chart-bar active' : 'chart-bar'}
                />
              )}
              <text x={x + barWidth / 2} y={HEIGHT - 8} textAnchor="middle" className={index === shown ? 'chart-tick active' : 'chart-tick'}>{index + 1}</text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

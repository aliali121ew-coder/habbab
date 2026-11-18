import { ArrowDownRight, ArrowUpRight, ChevronLeft, ClipboardCheck, HandCoins, Receipt, Wallet, type LucideIcon } from 'lucide-react';
import { formatNumber } from '../../format';

export interface WorkRow {
  key: string;
  label: string;
  icon: LucideIcon;
  tone: string;
  soft: string;
  count: number;
  countUnit: string;
  amount?: number;
  note: string;
  href: string;
}

/** Phone: the month's work in one card — a total, then one row per type of work. */
export function WorkSummaryCard({ rows, currency, monthName, previousTotal, previousMonthName }: {
  rows: WorkRow[];
  currency: string;
  monthName: string;
  previousTotal: number | null;
  previousMonthName: string | null;
}) {
  // «عملية مسجّلة» counts only money going out: expense entries and aid payments.
  const total = rows.filter((r) => r.key === 'expenses' || r.key === 'aid').reduce((sum, r) => sum + r.count, 0);
  const change = previousTotal ? Math.round(((total - previousTotal) / previousTotal) * 100) : null;
  // More operations means more money going out, so a rise shows in red and a fall in green.
  const up = (change ?? 0) >= 0;
  const Arrow = up ? ArrowUpRight : ArrowDownRight;

  return (
    <section className="fp-card overflow-hidden" aria-label="ملخص أعمال الشهر">
      <div className="px-4 pt-4">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
          <h2 className="text-base font-extrabold" style={{ color: 'var(--fp-ink)' }}>ملخص أعمال {monthName}</h2>
        <p className="mt-2 tabular-nums" style={{ color: 'var(--fp-ink)' }}>
          <span className="text-[28px] font-extrabold leading-none">{formatNumber(total)}</span>
          <span className="ms-1.5 text-sm font-semibold" style={{ color: 'var(--fp-ink-3)' }}>عملية مسجّلة</span>
        </p>
          </div>
          {/* Fills the corner with something useful: how this month compares with the last one. */}
          {change !== null && (
            <div className="shrink-0 rounded-2xl px-3 py-2 text-end" style={{ backgroundColor: 'var(--fp-muted)' }}>
              <span
                dir="ltr"
                className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums"
                style={{ backgroundColor: up ? 'var(--fp-rose-soft)' : 'var(--fp-emerald-soft)', color: up ? 'var(--fp-rose)' : 'var(--fp-emerald)' }}
              >
                <Arrow size={12} aria-hidden />{up ? '+' : ''}{change}%
              </span>
              <span className="mt-1 block text-[11px] tabular-nums" style={{ color: 'var(--fp-ink-3)' }}>
                {previousMonthName}: {formatNumber(previousTotal ?? 0)}
              </span>
            </div>
          )}
        </div>
      </div>

      <ul className="mt-4 border-t" style={{ borderColor: 'var(--fp-border)' }}>
        {rows.map((r) => (
          <li key={r.key} className="border-b last:border-b-0" style={{ borderColor: 'var(--fp-border)' }}>
            <a href={r.href} className="fp-member-row flex min-h-[64px] items-center gap-3 px-4 py-3 no-underline">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: r.soft, color: r.tone }}>
                <r.icon size={19} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold" style={{ color: 'var(--fp-ink)' }}>{r.label}</span>
                <span className="block truncate text-xs" style={{ color: 'var(--fp-ink-3)' }}>{r.note}</span>
              </span>
              <span className="shrink-0 text-end tabular-nums">
                <b className="block text-[15px] font-extrabold" style={{ color: 'var(--fp-ink)' }}>
                  {formatNumber(r.count)} <small className="text-[11px] font-semibold" style={{ color: 'var(--fp-ink-3)' }}>{r.countUnit}</small>
                </b>
                {r.amount !== undefined && (
                  <small className="block text-[11px] font-semibold" style={{ color: r.tone }}>
                    <bdi dir="ltr">{formatNumber(r.amount)}</bdi> {currency}
                  </small>
                )}
              </span>
              <ChevronLeft size={18} className="shrink-0" style={{ color: 'var(--fp-ink-3)' }} aria-hidden />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

export const WORK_ICONS = { visits: ClipboardCheck, expenses: Receipt, income: Wallet, aid: HandCoins };

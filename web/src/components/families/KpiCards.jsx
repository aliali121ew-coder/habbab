import { AlertCircle, ArrowDownRight, ArrowUpLeft, ArrowUpRight, ClipboardCheck, HandCoins, Users } from 'lucide-react';
import { formatIQD, formatNum } from '../../utils/format';

// This month as YYYY-MM, matched against payment and visit dates.
const thisMonth = () => new Date().toISOString().slice(0, 7);
const lastMonth = () => {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
};

/** Change against last month: green when it went up, red when it went down. */
function Delta({ now, before }) {
  if (!before) return null;
  const pct = Math.round(((now - before) / before) * 100);
  const up = pct >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      dir="ltr"
      title={`الشهر الماضي: ${before}`}
      className={`fam-kpi-delta inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${up ? 'up' : 'down'}`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {up ? '+' : ''}{pct}%
    </span>
  );
}

const TONES = {
  blue: { card: 'fam-kpi-blue', icon: 'bg-blue-600 text-white', ink: 'text-blue-700' },
  green: { card: 'fam-kpi-green', icon: 'bg-emerald-600 text-white', ink: 'text-emerald-700' },
  violet: { card: 'fam-kpi-violet', icon: 'bg-violet-600 text-white', ink: 'text-violet-700' },
  rose: { card: 'fam-kpi-rose', icon: 'bg-rose-600 text-white', ink: 'text-rose-700' },
};

/** One shape for all four cards: icon, big count, label, one short line underneath. */
function Kpi({ tone, icon: Icon, value, label, children, onClick, action, badge }) {
  const t = TONES[tone];
  const Tag = onClick ? 'button' : 'article';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`fam-kpi ${t.card} relative flex min-w-0 flex-col overflow-hidden rounded-2xl p-3.5 text-start sm:p-4`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-sm ${t.icon}`}>
          <Icon className="h-[18px] w-[18px]" aria-hidden />
        </span>
        {badge}
        {action && <span className={`fam-kpi-chip inline-flex h-7 w-7 items-center justify-center rounded-full ${t.ink}`} aria-hidden>{action}</span>}
      </div>
      <p className="mt-3 text-[26px] font-extrabold leading-none text-slate-900 tabular-nums">{value}</p>
      <p className="mt-1 text-[13px] font-semibold text-slate-600">{label}</p>
      <div className="mt-2.5 text-xs text-slate-500 tabular-nums">{children}</div>
    </Tag>
  );
}

export function KpiCards({ families, onShowOverdue, loading = false }) {
  if (loading) {
    return (
      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-busy="true">
        {[0, 1, 2, 3].map((idx) => <div key={idx} className="fam-kpi h-[150px] animate-pulse rounded-2xl" />)}
      </section>
    );
  }

  const month = thisMonth();
  const count = families.length;
  const critical = families.filter((f) => f.category === 'critical').length;
  const intensive = families.filter((f) => f.category === 'intensive').length;
  const stable = families.filter((f) => f.category === 'stable').length;

  const monthPayments = families.flatMap((f) => (f.payments ?? []).filter((p) => p.date.startsWith(month)));
  const aidAmount = monthPayments.reduce((sum, p) => sum + p.amount, 0);

  const visitsCount = families.reduce((n, f) => n + (f.visits ?? []).filter((v) => v.date.startsWith(month)).length, 0);
  const visited = families.filter((f) => (f.visits ?? []).some((v) => v.date.startsWith(month))).length;
  const visitedPct = count ? Math.round((visited / count) * 100) : 0;
  const prev = lastMonth();
  const visitsBefore = families.reduce((n, f) => n + (f.visits ?? []).filter((v) => v.date.startsWith(prev)).length, 0);

  const arrears = families.reduce((sum, f) => sum + f.arrears, 0);
  const overdue = families.filter((f) => f.arrears > 0).length;

  return (
    <section aria-label="مؤشرات العوائل لهذا الشهر" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Kpi tone="blue" icon={Users} value={formatNum(count)} label="عائلة مكفولة">
        <span className="flex items-center gap-2.5 font-semibold text-slate-600">
          {[[critical, 'bg-rose-500', 'قصوى'], [intensive, 'bg-amber-500', 'مكثفة'], [stable, 'bg-emerald-500', 'مستقرة']].map(([n, dot, name]) => (
            <span key={name} className="inline-flex items-center gap-1" title={`${name}: ${n}`} aria-label={`${name} ${n}`}>
              <i className={`h-2 w-2 rounded-full ${dot}`} aria-hidden />{n}
            </span>
          ))}
        </span>
      </Kpi>

      <Kpi tone="green" icon={HandCoins} value={formatNum(monthPayments.length)} label="مساعدة هذا الشهر">
        <span className="font-bold text-emerald-700">{formatIQD(aidAmount)}</span>
      </Kpi>

      <Kpi tone="violet" icon={ClipboardCheck} value={formatNum(visitsCount)} label="زيارة هذا الشهر" badge={<Delta now={visitsCount} before={visitsBefore} />}>
        <span className="flex items-center gap-2">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-violet-200/70" aria-hidden>
            <span className="block h-full rounded-full bg-violet-600" style={{ width: `${visitedPct}%` }} />
          </span>
          <span className="shrink-0 font-semibold text-slate-600">{visited}/{count}</span>
        </span>
      </Kpi>

      <Kpi
        tone="rose"
        icon={AlertCircle}
        value={formatNum(overdue)}
        label="عائلة متأخرة"
        onClick={overdue > 0 ? onShowOverdue : undefined}
        action={overdue > 0 ? <ArrowUpLeft className="h-3.5 w-3.5" /> : null}
      >
        <span className="font-bold text-rose-700">{formatIQD(arrears)}</span>
      </Kpi>
    </section>
  );
}

import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import {
  ArrowDownRight, ArrowUpRight, ChevronLeft,
  HandCoins, HeartHandshake, HeartPulse, Receipt,
  Gift, UsersRound, Wallet, type LucideIcon,
} from 'lucide-react';
import { api, type Me, type Overview } from '../../api';
import { StateMessage } from '../../components/StateMessage';
import { AidHeroBanner } from '../../components/shared/AidHeroBanner';
import { SAMPLE_DONATIONS } from '../../data/donations';
import { loadFamiliesStore } from '../../data/families';
import { formatNumber, MONTH_NAMES, monthIndex } from '../../format';
import { AidDisbursementsTable } from './AidDisbursementsTable';
// The phone's money overview draws a chart (recharts, the heaviest library): its own file, so the
// banner and figures show first; a box of the same height holds its place meanwhile.
const PhoneMoneyOverview = lazy(() => import('./PhoneMoneyOverview').then((m) => ({ default: m.PhoneMoneyOverview })));
import { WORK_ICONS, WorkSummaryCard, type WorkRow } from './WorkSummaryCard';
import type { ExpenseItem } from '../expenses/ExpensesPage';
import { PATIENTS } from '../patients/sample';

interface MonthSheet {
  items: ExpenseItem[];
  year: { total: number; count: number }[];
}

const pad = (n: number) => String(n).padStart(2, '0');

function monthRange(date: Date) {
  const y = date.getFullYear();
  const m = date.getMonth();
  const last = new Date(y, m + 1, 0).getDate();
  return { from: `${y}-${pad(m + 1)}-01`, to: `${y}-${pad(m + 1)}-${pad(last)}` };
}

const change = (now: number, before: number) => (before > 0 ? Math.round(((now - before) / before) * 100) : null);

function HomeRing({ percent }: { percent: number }) {
  const safe = Math.max(0, Math.min(100, Math.round(percent)));
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (circumference * safe) / 100;
  return (
    <div className="relative h-20 w-20 shrink-0" aria-label={`نسبة التحصيل ${safe}%`}>
      <svg className="h-20 w-20 -rotate-90" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r={radius} fill="none" strokeWidth="7" style={{ stroke: 'var(--fp-emerald-soft)' }} />
        <circle
          cx="40"
          cy="40"
          r={radius}
          fill="none"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ stroke: 'var(--fp-emerald)', transition: 'stroke-dashoffset 700ms ease' }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-base font-bold tabular-nums" style={{ color: 'var(--fp-emerald)' }}>
        {safe}%
      </span>
    </div>
  );
}

function DeltaPill({ value, goodWhenUp = true }: { value: number | null; goodWhenUp?: boolean }) {
  if (value === null) return null;
  const up = value >= 0;
  const good = up === goodWhenUp;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      dir="ltr"
      className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums"
      style={{
        backgroundColor: good ? 'var(--fp-emerald-soft)' : 'var(--fp-rose-soft)',
        color: good ? 'var(--fp-emerald)' : 'var(--fp-rose)',
      }}
    >
      <Icon size={11} aria-hidden />
      <span>{up ? `+${value}%` : `${value}%`}</span>
    </span>
  );
}

export function HomePage({ me }: { me: Me }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [sheet, setSheet] = useState<MonthSheet | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    const now = new Date();
    const range = monthRange(now);
    try {
      const [nextOverview, nextSheet] = await Promise.all([
        api<Overview>(`/collections/overview?year=${now.getFullYear()}&delegates=0`),
        api<MonthSheet>(`/expenses?from=${range.from}&to=${range.to}`).catch(() => null),
      ]);
      setOverview(nextOverview);
      setSheet(nextSheet);
    } catch (failure) {
      setError((failure as Error).message);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const families = useMemo(() => loadFamiliesStore() as {
    arrears: number;
    visits?: { date: string }[];
    payments?: { date: string; amount: number }[];
  }[], []);

  if (error && !overview) return <StateMessage kind="error" title="تعذّر تحميل الصفحة الرئيسية" hint={error} onRetry={load} />;
  if (!overview) {
    return (
      <div dir="rtl" className="fp-root -mx-[14px] -my-3 min-h-[calc(100dvh-56px)] px-4 py-6 md:-mx-[18px] md:px-7" aria-busy="true">
        <div className="mx-auto grid max-w-[2400px] grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="fp-card h-96 animate-pulse lg:col-span-3" />
          <div className="space-y-6 lg:col-span-9">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
              {[0, 1, 2, 3, 4].map((k) => <div key={k} className="fp-card h-28 animate-pulse" />)}
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {[0, 1, 2].map((k) => <div key={k} className="fp-card h-40 animate-pulse" />)}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const unit = me.currency;
  const month = monthIndex(overview.focus);
  const collected = overview.months.map((m) => m.paid_amount);
  const collectedNow = collected[month] ?? 0;
  const collectedBefore = month > 0 ? collected[month - 1] ?? 0 : 0;
  const spentYear = sheet?.year.map((m) => m.total) ?? [];
  const spentNow = spentYear[month] ?? 0;
  const spentBefore = month > 0 ? spentYear[month - 1] ?? 0 : 0;
  const aidCountNow = sheet?.year[month]?.count ?? sheet?.items.length ?? 0;
  const aidCountBefore = month > 0 ? (sheet?.year[month - 1]?.count ?? 0) : 0;
  const incomeDelta = change(collectedNow, collectedBefore);
  const spentDelta = sheet ? change(spentNow, spentBefore) : null;
  const aidCountDelta = sheet ? change(aidCountNow, aidCountBefore) : null;

  const paidCount = overview.months[month]?.paid_count ?? 0;
  const rate = overview.alive > 0 ? Math.round((paidCount / overview.alive) * 100) : 0;

  const sections: { href: string; icon: LucideIcon; label: string; value: string; note: string; alert?: boolean }[] = [
    { href: '#/delegates', icon: UsersRound, label: 'المندوبون', value: formatNumber(overview.delegate_count), note: `${formatNumber(overview.alive)} مشترك` },
    {
      href: '#/families', icon: HeartHandshake, label: 'العوائل', value: formatNumber(families.length),
      note: `${formatNumber(families.filter((f) => f.arrears > 0).length)} متأخرات`, alert: families.some((f) => f.arrears > 0),
    },
    { href: '#/patients', icon: HeartPulse, label: 'المرضى', value: formatNumber(PATIENTS.length), note: 'ملف مريض' },
    { href: '#/expenses', icon: Receipt, label: 'الحركات المالية', value: sheet ? formatNumber(sheet.items.length) : '—', note: 'هذا الشهر' },
  ];

  const kpis: { label: string; icon: LucideIcon; tone: string; soft: string; value: string; unit?: string; valueColor?: string; foot: ReactNode; href?: string }[] = [
    { label: 'الوارد الشهري', icon: Wallet, tone: 'var(--fp-primary)', soft: 'var(--fp-primary-soft)', value: formatNumber(collectedNow), unit, foot: <DeltaPill value={incomeDelta} goodWhenUp /> },
    { label: 'المصروف الشهري', icon: Receipt, tone: 'var(--fp-amber)', soft: 'var(--fp-amber-soft)', value: sheet ? formatNumber(spentNow) : '—', unit: sheet ? unit : undefined, foot: <DeltaPill value={spentDelta} goodWhenUp={false} /> },
    {
      // Sample figures (data/donations.ts) until the donations section exists.
      label: 'التبرعات', icon: Gift, tone: 'var(--fp-primary)', soft: 'var(--fp-primary-soft)', href: '#/soon/donations',
      value: formatNumber(SAMPLE_DONATIONS.cash), unit,
      foot: (
        <span className="flex flex-wrap gap-1">
          {SAMPLE_DONATIONS.food.slice(0, 2).map((f) => (
            <span key={f.label} className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums" style={{ backgroundColor: 'var(--fp-muted-2)', color: 'var(--fp-ink-2)' }}>
              {formatNumber(f.qty)} {f.unit} {f.label === 'سلة غذائية' ? 'غذائية' : f.label}
            </span>
          ))}
        </span>
      ),
    },
    { label: 'عدد المساعدات', icon: HandCoins, tone: 'var(--fp-emerald)', soft: 'var(--fp-emerald-soft)', value: sheet ? formatNumber(aidCountNow) : '—', unit: sheet ? 'مساعدة' : undefined, foot: <DeltaPill value={aidCountDelta} goodWhenUp /> },
  ];

  // This month's work across the foundation, for the phone summary card.
  const monthKey = overview.focus.slice(0, 7);
  const familyVisits = families.flatMap((f) => (f.visits ?? []).filter((v) => v.date.startsWith(monthKey)));
  const visitedFamilies = families.filter((f) => (f.visits ?? []).some((v) => v.date.startsWith(monthKey))).length;
  const familyAid = families.flatMap((f) => (f.payments ?? []).filter((p) => p.date.startsWith(monthKey)));
  // Last month's expense entries and aid payments, for the comparison in the summary card.
  const prevKey = month > 0 ? `${monthKey.slice(0, 4)}-${pad(month)}` : null;
  const previousTotal = prevKey === null ? null
    : (sheet?.year[month - 1]?.count ?? 0)
      + families.reduce((n, f) => n + (f.payments ?? []).filter((p) => p.date.startsWith(prevKey)).length, 0);
  const workRows: WorkRow[] = [
    {
      key: 'income', label: 'تسديد المشتركين', icon: WORK_ICONS.income, tone: 'var(--fp-primary)', soft: 'var(--fp-primary-soft)',
      count: paidCount, countUnit: 'تسديد', amount: collectedNow, note: `من ${formatNumber(overview.alive)} مشترك`, href: '#/delegates',
    },
    {
      key: 'aid', label: 'المساعدات', icon: WORK_ICONS.aid, tone: 'var(--fp-emerald)', soft: 'var(--fp-emerald-soft)',
      count: familyAid.length, countUnit: 'دفعة', amount: familyAid.reduce((sum, p) => sum + p.amount, 0),
      note: 'للعوائل المتعففة', href: '#/families',
    },
    {
      key: 'expenses', label: 'الحركات المالية', icon: WORK_ICONS.expenses, tone: 'var(--fp-amber)', soft: 'var(--fp-amber-soft)',
      count: sheet?.items.length ?? 0, countUnit: 'قيد', amount: sheet ? spentNow : undefined,
      note: sheet ? 'مسجّلة في الحركات المالية' : 'تعذّر تحميل الحركات المالية', href: '#/expenses',
    },
    {
      key: 'visits', label: 'الزيارات', icon: WORK_ICONS.visits, tone: 'var(--fp-rose)', soft: 'var(--fp-rose-soft)',
      count: familyVisits.length, countUnit: 'زيارة', note: `شملت ${formatNumber(visitedFamilies)} من ${formatNumber(families.length)} عائلة`, href: '#/families',
    },
  ];

  return (
    <div dir="rtl" className="fp-root -mx-[14px] -my-3 min-h-[calc(100dvh-56px)] px-4 py-6 md:-mx-[18px] md:px-7">
      <div className="mx-auto max-w-[2400px] space-y-6">
        {/* Top Animated Hero Carousel (3 rotating aid distribution slides) */}
        <AidHeroBanner isAdmin={me.role === 'admin'} />

        {/* Four headline figures: each one appears once on the page */}
        <div className="md:hidden">
          <Suspense fallback={<div className="home-chart-slot" aria-busy="true" />}>
          <PhoneMoneyOverview
            currency={unit}
            month={month}
            collected={collected}
            spent={sheet ? spentYear : null}
            donations={SAMPLE_DONATIONS}
          />
          </Suspense>
        </div>
        <div className="fp-kpi-parent hidden md:block">
        <h2 className="fp-kpi-parent-title mb-2.5 items-center justify-between px-1 text-sm font-bold" style={{ color: 'var(--fp-ink)' }}>
          <span>ملخص {MONTH_NAMES[month]}</span>
        </h2>
        <section aria-label="المؤشرات المالية السريعة" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {kpis.map((k) => {
            const Tag = k.href ? 'a' : 'article';
            return (
              <Tag
                key={k.label}
                href={k.href}
                className="fp-card fp-kpi flex min-w-0 flex-col gap-2 p-3 no-underline sm:p-4"
                style={{ '--kpi-tone': k.tone } as CSSProperties}
              >
                <span className="fp-kpi-head flex items-center gap-2">
                  <span className="fp-kpi-icon inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl sm:h-9 sm:w-9" style={{ backgroundColor: k.soft, color: k.tone }}>
                    <k.icon size={18} aria-hidden />
                  </span>
                  <span className="fp-kpi-title min-w-0 text-xs font-semibold leading-tight" style={{ color: 'var(--fp-ink-3)' }}>{k.label}</span>
                  {k.href && <ChevronLeft size={16} className="fp-kpi-go shrink-0" style={{ color: k.tone }} aria-hidden />}
                </span>
                <b className="whitespace-nowrap text-lg font-extrabold leading-none tabular-nums sm:text-xl" style={{ color: k.valueColor ?? 'var(--fp-ink)' }}>
                  <bdi dir="ltr">{k.value}</bdi>
                  {k.unit && <small className="ms-0.5 text-[11px] font-medium sm:ms-1 sm:text-xs" style={{ color: 'var(--fp-ink-3)' }}>{k.unit}</small>}
                </b>
                <span className="min-h-[22px]">{k.foot}</span>
              </Tag>
            );
          })}
        </section>
        </div>

        <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-12">
          {/* Collection progress and the shortcuts to each section */}
          <aside className="fp-card hidden h-full flex-col gap-5 p-5 md:flex lg:col-span-3" aria-label="ملخص التحصيل والأقسام">
            <div className="flex items-center gap-4">
              <HomeRing percent={rate} />
              <div className="min-w-0">
                <h2 className="text-base font-bold" style={{ color: 'var(--fp-ink)' }}>
                  تحصيل {MONTH_NAMES[month]}
                </h2>
                <p className="mt-1 text-sm tabular-nums" style={{ color: 'var(--fp-ink-2)' }}>
                  سدّد <bdi>{formatNumber(paidCount)}</bdi> من <bdi>{formatNumber(overview.alive)}</bdi> مشترك
                </p>
                <p className="mt-0.5 text-xs tabular-nums" style={{ color: 'var(--fp-ink-3)' }}>
                  بقي <bdi>{formatNumber(Math.max(0, overview.alive - paidCount))}</bdi> لم يسدّدوا
                </p>
              </div>
            </div>

            <div>
              <span className="mb-2 block text-xs font-semibold" style={{ color: 'var(--fp-ink-3)' }}>الأقسام</span>
              <div className="grid grid-cols-2 gap-2.5">
                {sections.map((sec) => (
                  <a
                    key={sec.href}
                    href={sec.href}
                    className="fp-home-tile flex min-h-[88px] flex-col rounded-2xl border p-3 no-underline"
                    style={{ backgroundColor: 'var(--fp-muted)', borderColor: 'var(--fp-border)' }}
                  >
                    <span className="flex items-center justify-between">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: 'var(--fp-primary-soft)', color: 'var(--fp-primary)' }}>
                        <sec.icon size={16} aria-hidden />
                      </span>
                      <ChevronLeft size={16} style={{ color: 'var(--fp-ink-3)' }} aria-hidden />
                    </span>
                    <b className="mt-2 text-lg font-bold leading-none tabular-nums" style={{ color: 'var(--fp-ink)' }}>{sec.value}</b>
                    <span className="mt-1 text-xs font-semibold" style={{ color: 'var(--fp-ink-2)' }}>{sec.label}</span>
                    <small className="text-xs" style={{ color: sec.alert ? 'var(--fp-rose)' : 'var(--fp-ink-3)' }}>{sec.note}</small>
                  </a>
                ))}
              </div>
            </div>
          </aside>

          {/* Main Dashboard Area: Aid Disbursements Table aligned with Collection Card */}
          <div className="lg:col-span-9">
            <div className="md:hidden">
              <WorkSummaryCard
                rows={workRows}
                currency={unit}
                monthName={MONTH_NAMES[month]}
                previousTotal={previousTotal || null}
                previousMonthName={month > 0 ? MONTH_NAMES[month - 1] : null}
              />
            </div>
            <div className="hidden h-full md:block">
              <AidDisbursementsTable items={sheet?.items ?? []} currency={unit} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

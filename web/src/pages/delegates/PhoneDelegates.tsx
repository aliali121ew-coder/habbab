import { AlarmClockOff, ChevronDown, CircleCheck, Clock, Search, TrendingDown, TrendingUp, UserPlus, Users, UsersRound, Heart } from 'lucide-react';
import type { ReactNode } from 'react';
import type { DelegateSummary, Overview } from '../../api';
import { MONTH_NAMES, formatNumber, initialOf, monthIndex } from '../../format';
import { registerHref } from '../../route';

export type DelegateSort = 'default' | 'alive-desc' | 'late-desc' | 'paid-desc' | 'unpaid-desc';

const SORTS: { id: DelegateSort; label: string }[] = [
  { id: 'default', label: 'الكل' },
  { id: 'alive-desc', label: 'الأكثر مشتركين' },
  { id: 'late-desc', label: 'المتأخرين' },
  { id: 'paid-desc', label: 'المسددين' },
  { id: 'unpaid-desc', label: 'غير المسددين' },
];

// Payment state of a delegate this month, by the share of their living subscribers who paid.
export const rateTone = (rate: number) => (rate >= 70 ? 'good' : rate >= 40 ? 'mid' : 'low');

/** Phone: one compact summary instead of a hero and four tiles. */
export function PhoneSummary({ overview, currency }: { overview: Overview; currency: string }) {
  const index = monthIndex(overview.focus);
  const month = overview.months[index] ?? overview.months[0];
  const previous = index > 0 ? overview.months[index - 1] : null;
  const rate = overview.alive ? (month.paid_count / overview.alive) * 100 : 0;
  const change = previous && previous.paid_amount
    ? ((month.paid_amount - previous.paid_amount) / previous.paid_amount) * 100
    : null;
  const up = change === null || change >= 0;

  return (
    <>
    <section className="pd-summary pd-sum-parent" aria-label="ملخص التسديد">
      <div className="pd-sum-head">
        <div>
          <h2>تسديد {MONTH_NAMES[index]}</h2>
          <p className="pd-summary-amount"><bdi>{formatNumber(month.paid_amount)}</bdi> <small>{currency}</small></p>
        </div>
        {change !== null && (
          <span className={`pd-trend ${up ? 'up' : 'down'}`} dir="ltr">
            {up ? <TrendingUp size={12} aria-hidden /> : <TrendingDown size={12} aria-hidden />}
            {change > 0 ? '+' : ''}{change.toFixed(1)}%
          </span>
        )}
      </div>
      <div className="pd-sum-progress">
        <div className="pd-progress-row">
          <span><bdi>{formatNumber(month.paid_count)}</bdi> من <bdi>{formatNumber(overview.alive)}</bdi> سدّدوا</span>
          <b>{Math.round(rate)}%</b>
        </div>
      </div>
    <div className="pd-sum-tiles">
      <div className="pd-sum-tile t-del"><span className="pd-sum-ico i-del"><UsersRound size={18} aria-hidden /></span><b>{formatNumber(overview.delegates.length)}</b><span>المندوبون</span></div>
      <div className="pd-sum-tile t-alive"><span className="pd-sum-ico i-alive"><Users size={18} aria-hidden /></span><b>{formatNumber(overview.alive)}</b><span>الأحياء</span><small>فئة 5,000</small></div>
      <div className="pd-sum-tile t-dead"><span className="pd-sum-ico i-dead"><Heart size={18} aria-hidden /></span><b>{formatNumber(overview.deceased)}</b><span>الأموات</span><small>فئة 1,000</small></div>
    </div>
    </section>
    </>
  );
}

/** Phone: search with the sort as swipeable chips under it. */
export function PhoneToolbar({ query, onQuery, sort, onSort }: {
  query: string;
  onQuery: (value: string) => void;
  sort: DelegateSort;
  onSort: (value: DelegateSort) => void;
}) {
  return (
    <div className="pd-toolbar">
      <label className="pd-search">
        <Search size={18} aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="بحث باسم المندوب"
          aria-label="بحث باسم المندوب"
          autoComplete="off"
        />
      </label>
      <div className="pd-chips" role="group" aria-label="ترتيب المندوبين">
        {SORTS.map((item) => (
          <button key={item.id} type="button" aria-pressed={sort === item.id} className={sort === item.id ? 'on' : undefined} onClick={() => onSort(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Phone: one delegate with this month's payment progress; the whole card opens the register. */
export function PhoneDelegateCard({ person, currency, menu }: { person: DelegateSummary; currency: string; menu: ReactNode }) {
  const rate = person.alive ? Math.round((person.paid_count / person.alive) * 100) : 0;
  // No subscribers yet: nothing to collect, so no red «0%».
  const empty = person.alive === 0;
  const tone = empty ? 'none' : rateTone(rate);
  return (
    <article className={`pd-card tone-${tone}`}>
      <div className="pd-card-head">
        <span className="pd-photo">
          <span aria-hidden>{initialOf(person.full_name)}</span>
          {/* Covers the initial; if the photo fails to load it hides itself and the initial shows. */}
          {person.avatar_url && <img src={person.avatar_url} alt="" width={320} height={320} loading="lazy" decoding="async" onError={(event) => { event.currentTarget.style.display = 'none'; }} />}
        </span>
        <div className="pd-card-info">
          <h3>{person.full_name}</h3>
          <p>
            <Users size={13} aria-hidden /> <bdi>{formatNumber(person.alive)}</bdi> مشترك
            {/* Phone only: the month's amount sits here, so the name keeps the whole first line. */}
            {!empty && <span className="pd-sub-amount"><bdi>{formatNumber(person.paid_amount)}</bdi> {currency} هذا الشهر</span>}
          </p>
        </div>
        {!empty && (
          <p className="pd-head-amount"><bdi>{formatNumber(person.paid_amount)}</bdi><small>{currency} هذا الشهر</small></p>
        )}
        {menu}
      </div>
      {empty ? (
        <p className="pd-progress pd-empty">لا مشتركين لهذا المندوب بعد</p>
      ) : (
      <div className="pd-progress">
        {/* This month: who paid, who hasn't, who is four months behind, and the paid share. */}
        <dl className="pd-trio">
          <div className="t-paid"><CircleCheck size={15} aria-hidden /><dd>{formatNumber(person.paid_count)}</dd><dt>سدّدوا</dt></div>
          <div className="t-left"><Clock size={15} aria-hidden /><dd>{formatNumber(Math.max(0, person.alive - person.paid_count))}</dd><dt>لم يسدّدوا</dt></div>
          <div className="t-late"><AlarmClockOff size={15} aria-hidden /><dd>{formatNumber(person.late ?? 0)}</dd><dt>متأخرون</dt></div>
          <div className={`t-rate r-${tone}`}><TrendingUp size={15} aria-hidden /><dd>{rate}%</dd><dt>نسبة التسديد</dt></div>
        </dl>
      </div>
      )}
      <a className="pd-open" href={registerHref(person.id)} aria-label={`فتح سجل ${person.full_name}`} />
    </article>
  );
}

export function PhoneAddButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="pd-fab" onClick={onClick}>
      <UserPlus size={20} aria-hidden /> إضافة مندوب
    </button>
  );
}

export function PhoneShowMore({ open, hidden, onToggle }: { open: boolean; hidden: number; onToggle: () => void }) {
  return (
    <button type="button" className="pd-more" onClick={onToggle}>
      {open ? 'عرض أقل' : <>عرض بقية المندوبين <span className="pd-more-count">{formatNumber(hidden)}</span></>}
      <ChevronDown size={16} className={open ? 'flip' : undefined} aria-hidden />
    </button>
  );
}

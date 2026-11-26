import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, Banknote, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Filter, Gift, MoreHorizontal, Package, Plus, Search, Users, Wallet,
} from 'lucide-react';
import { MONTH_NAMES, formatNumber, formatPercent } from '../../format';
import { donorHref } from '../../route';
import type { Donation } from '../aid/DonationDialog';
import { DonationIconTile, donationIcon } from '../aid/donationIcons';

const now = new Date();
const THIS_YEAR = now.getUTCFullYear();
const THIS_MONTH = now.getUTCMonth();
const monthOf = (item: Donation) => Number(item.received_on.slice(5, 7)) - 1;
const showDate = (iso: string) => iso.slice(0, 10).replace(/-/g, '/');
// The short month names used on Iraqi calendars, for the bars' axis.
const SHORT_MONTHS = ['ك٢', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'ت١', 'ت٢', 'ك١'];
const PURPOSE_TONES =['#16a34a', '#2563eb', '#f59e0b', '#db2777', '#7c3aed', '#0891b2'];

type Period = 'day' | 'month' | 'year';
const DAYS = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];
const TODAY = now.toISOString().slice(0, 10);
type Kind = 'all' | 'cash' | 'in_kind';
type Flow = 'cash' | 'in_kind';

// The donations page on a computer, laid out after the approved finance-dashboard picture:
// an overview header with the period switch, three summary cards (the first one green), the
// purposes «wallet», the giving flow as bars with the chosen month lit, and a table of recent
// donations with search and a kind filter. The phone keeps the «جدار العطاء» layout.
export function DonationsDesktop({ items, previousDecemberCash, year, onYear, currency, onAdd, onOpen }: {
  items: Donation[];
  previousDecemberCash: number;
  year: number;
  onYear: (year: number) => void;
  currency: string;
  onAdd: () => void;
  onOpen: (donation: Donation) => void;
}) {
  const [period, setPeriod] = useState<Period>('month');
  const focus = year === THIS_YEAR ? THIS_MONTH : 11;
  const [month, setMonth] = useState(focus);
  const [flow, setFlow] = useState<Flow>('cash');
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<Kind>('all');
  const [limit, setLimit] = useState(10);
  const [hover, setHover] = useState<number | null>(null);
  // The chosen day (YYYY-MM-DD) when the period is a single day.
  const [day, setDay] = useState<string | null>(null);

  const data = useMemo(() => {
    const cash = Array<number>(12).fill(0);
    const goods = Array<number>(12).fill(0);
    items.forEach((item) => {
      if (item.kind === 'cash') cash[monthOf(item)] += item.amount ?? 0;
      else goods[monthOf(item)] += 1;
    });
    const inPeriod = items.filter((item) => (period === 'year' ? true : period === 'day' ? item.received_on === day : monthOf(item) === month));
    // Only a whole month has a fair neighbour to compare with.
    const before = period === 'month' ? items.filter((item) => monthOf(item) === month - 1) : [];
    const sumCash = (list: Donation[]) => list.filter((item) => item.kind === 'cash').reduce((s, item) => s + (item.amount ?? 0), 0);
    const donors = (list: Donation[]) => new Set(list.map((item) => item.donor_name)).size;
    const goodsCount = (list: Donation[]) => list.filter((item) => item.kind === 'in_kind').length;
    const prevCash = period !== 'month' ? null : month > 0 ? sumCash(before) : previousDecemberCash;
    const purposes = new Map<string, { cash: number; count: number }>();
    inPeriod.forEach((item) => {
      const key = item.purpose ?? 'عامة';
      const row = purposes.get(key) ?? { cash: 0, count: 0 };
      row.cash += item.kind === 'cash' ? item.amount ?? 0 : 0;
      row.count += 1;
      purposes.set(key, row);
    });
    const byDonor = new Map<string, number>();
    inPeriod.filter((item) => item.kind === 'cash').forEach((item) => byDonor.set(item.donor_name, (byDonor.get(item.donor_name) ?? 0) + (item.amount ?? 0)));
    const top = [...byDonor].sort((a, b) => b[1] - a[1])[0] ?? null;
    const cashNow = sumCash(inPeriod);
    return {
      cash, goods,
      cashNow,
      cashDelta: prevCash !== null && prevCash > 0 ? ((cashNow - prevCash) / prevCash) * 100 : null,
      goodsNow: goodsCount(inPeriod),
      goodsDelta: period === 'month' && goodsCount(before) > 0 ? ((goodsCount(inPeriod) - goodsCount(before)) / goodsCount(before)) * 100 : null,
      donorsNow: donors(inPeriod),
      donorsDelta: period === 'month' && donors(before) > 0 ? ((donors(inPeriod) - donors(before)) / donors(before)) * 100 : null,
      purposes: [...purposes].sort((a, b) => b[1].count - a[1].count),
      top,
      inPeriod,
    };
  }, [items, period, month, day, previousDecemberCash]);

  // How many donations each donor gave in the chosen period (day, month or year).
  const giftsBy = useMemo(() => {
    const map = new Map<string, number>();
    data.inPeriod.forEach((item) => map.set(item.donor_name, (map.get(item.donor_name) ?? 0) + 1));
    return map;
  }, [data.inPeriod]);

  const rows = useMemo(() => {
    const needle = query.trim();
    return data.inPeriod
      .filter((item) => kind === 'all' || item.kind === kind)
      .filter((item) => !needle || [item.donor_name, item.item, item.purpose, item.receipt_no, item.note].some((value) => value?.includes(needle)));
  }, [data.inPeriod, kind, query]);

  const periodLabel = period === 'year' ? `سنة ${year}`
    : period === 'day' && day ? `${Number(day.slice(8, 10))} ${MONTH_NAMES[month]} ${year}`
      : `${MONTH_NAMES[month]} ${year}`;
  const values = flow === 'cash' ? data.cash : data.goods;
  const max = Math.max(...values, 1);
  const shownBar = hover ?? month;

  return (
    <div className="dd">
      <header className="dd-head">
        <div>
          <h1>نظرة عامة</h1>
          <p>ملخص تبرعات المؤسسة — {periodLabel}</p>
        </div>
        <div className="dd-head-tools">
          <DatePicker
            items={items}
            year={year}
            month={month}
            period={period}
            day={day}
            label={periodLabel}
            currency={currency}
            onYear={onYear}
            onPick={(next) => {
              setPeriod(next.period);
              if (next.month !== undefined) setMonth(next.month);
              setDay(next.day ?? null);
            }}
          />
          <a className="dd-ghost" href="#/donors"><Users size={16} aria-hidden /> سجل المتبرعين</a>
          <button type="button" className="dd-primary" onClick={onAdd}><Plus size={16} aria-hidden /> تبرع جديد</button>
        </div>
      </header>

      {/* ── Three summary cards ─────────────────────────── */}
      <section className="dd-cards" aria-label="خلاصة التبرعات">
        <article className="dd-card dd-card-hero">
          <header>
            <span className="dd-tile" aria-hidden><Wallet size={20} /></span>
            <div><h2>التبرعات المالية</h2><small>ما وصل نقداً في {periodLabel}</small></div>
            <MoreHorizontal size={18} aria-hidden className="dd-more" />
          </header>
          <p className="dd-amount"><bdi>{formatNumber(data.cashNow)}</bdi> <small>{currency}</small><Delta value={data.cashDelta} /></p>
          <a className="dd-card-foot" href="#/soon/aid">عرض السجل التفصيلي <ArrowLeft size={16} aria-hidden /></a>
        </article>
        <article className="dd-card">
          <header>
            <span className="dd-tile" aria-hidden><Package size={20} /></span>
            <div><h2>المساعدات العينية</h2><small>مواد وصلت للمؤسسة</small></div>
            <MoreHorizontal size={18} aria-hidden className="dd-more" />
          </header>
          <p className="dd-amount"><bdi>{formatNumber(data.goodsNow)}</bdi> <small>مساعدة</small><Delta value={data.goodsDelta} /></p>
        </article>
        <article className="dd-card">
          <header>
            <span className="dd-tile" aria-hidden><Users size={20} /></span>
            <div><h2>المتبرعون</h2><small>من داخل المؤسسة وخارجها</small></div>
            <MoreHorizontal size={18} aria-hidden className="dd-more" />
          </header>
          <p className="dd-amount"><bdi>{formatNumber(data.donorsNow)}</bdi> <small>متبرع</small><Delta value={data.donorsDelta} /></p>
        </article>
      </section>

      {/* Phone only: the period's donations as a ring, one colour per kind. */}
      <KindRing items={data.inPeriod} label={periodLabel} currency={currency} />

      <div className="dd-row">
        {/* ── Purposes «wallet» ─────────────────────────── */}
        <section className="dd-card dd-wallet" aria-labelledby="dd-wallet-title">
          <header className="dd-section-head">
            <div><h2 id="dd-wallet-title">تفاصيل التبرع</h2><small>{periodLabel} · <bdi>{formatNumber(data.inPeriod.length)}</bdi> تبرع</small></div>
            <button type="button" className="dd-outline" onClick={onAdd}><Plus size={15} aria-hidden /> إضافة</button>
          </header>
          {data.purposes.length === 0 ? <p className="dd-empty">لا تبرعات في {periodLabel}.</p> : (
            // Every purpose stays: two columns, and the panel scrolls down when there are more than four.
            <ul className="dd-purposes" aria-label="الأغراض">
              {data.purposes.map(([name, row], at) => (
                <li key={name}>
                  <span className="dd-flag" style={{ background: PURPOSE_TONES[at % PURPOSE_TONES.length] }} aria-hidden>{name.trim().replace(/^ال/, '').charAt(0)}</span>
                  <span className="dd-purpose-name">{name}</span>
                  <b><bdi>{formatNumber(row.cash)}</bdi> <small>{currency}</small></b>
                  <small className="dd-purpose-note"><bdi>{formatNumber(row.count)}</bdi> تبرع · <bdi>{formatPercent((row.count / Math.max(data.inPeriod.length, 1)) * 100)}</bdi></small>
                  <span className={`dd-status${row.cash > 0 ? ' on' : ''}`}>{row.cash > 0 ? 'مالي' : 'عيني'}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── Giving flow ─────────────────────────── */}
        <section className="dd-card dd-flow" aria-labelledby="dd-flow-title">
          <header className="dd-section-head">
            <div>
              <h2 id="dd-flow-title">تدفق التبرعات</h2>
              <p className="dd-flow-total"><bdi>{formatNumber(flow === 'cash' ? data.cash.reduce((s, v) => s + v, 0) : data.goods.reduce((s, v) => s + v, 0))}</bdi> <small>{flow === 'cash' ? currency : 'مساعدة عينية'}</small></p>
            </div>
            <div className={`dd-toggle${flow === 'in_kind' ? ' is-goods' : ''}`} role="group" aria-label="نوع التدفق">
              <button type="button" aria-pressed={flow === 'cash'} onClick={() => setFlow('cash')}>مالية</button>
              <button type="button" aria-pressed={flow === 'in_kind'} onClick={() => setFlow('in_kind')}>عينية</button>
            </div>
          </header>
          <div className={`dd-bars${flow === 'in_kind' ? ' is-goods' : ''}`} onPointerLeave={() => setHover(null)}>
            <div className="dd-grid" aria-hidden>
              {/* Counts of goods are whole numbers: a line between two counts stays unlabelled. */}
              {[1, 0.75, 0.5, 0.25, 0].map((part) => <span key={part}><bdi>{flow === 'cash' ? formatNumber(Math.round(max * part)) : Number.isInteger(max * part) ? max * part : ''}</bdi></span>)}
            </div>
            <ol>
              {values.map((value, at) => {
                const future = year === THIS_YEAR && at > THIS_MONTH;
                return (
                  <li key={at} className={`${at === shownBar ? 'is-on' : ''}${future ? ' is-future' : ''}`}>
                    <button
                      type="button"
                      disabled={future}
                      aria-label={`${MONTH_NAMES[at]}: ${formatNumber(value)}`}
                      aria-pressed={period === 'month' && at === month}
                      onPointerEnter={() => setHover(at)}
                      onFocus={() => setHover(at)}
                      onClick={() => { setMonth(at); setPeriod('month'); setDay(null); }}
                    >
                      <i style={{ blockSize: `${value > 0 ? Math.max((value / max) * 100, 3) : 2}%` }}>
                        {at === shownBar && value > 0 && <span className="dd-dot" aria-hidden />}
                      </i>
                    </button>
                    {at === shownBar && !future && (
                      <span className="dd-tip" role="tooltip">
                        <small>{MONTH_NAMES[at]} <bdi>{year}</bdi></small>
                        <span className="dd-tip-row cash"><em aria-hidden />تبرعات مالية <b><bdi>{formatNumber(data.cash[at])}</bdi> <small>{currency}</small></b></span>
                        <span className="dd-tip-row goods"><em aria-hidden />مساعدات عينية <b><bdi>{formatNumber(data.goods[at])}</bdi></b></span>
                      </span>
                    )}
                    <small className="dd-month" title={MONTH_NAMES[at]}>{SHORT_MONTHS[at]}</small>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>
      </div>

      {/* ── Recent donations ─────────────────────────── */}
      <section className="dd-card dd-table-card" id="dd-table" aria-labelledby="dd-table-title">
        <header className="dd-section-head">
          <div><h2 id="dd-table-title">آخر التبرعات</h2><small>{periodLabel} · <bdi>{formatNumber(rows.length)}</bdi> تبرع</small></div>
          <div className="dd-table-tools">
            <label className="dd-search">
              <Search size={16} aria-hidden />
              <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="بحث" aria-label="بحث في التبرعات" />
            </label>
            <label className="dd-filter">
              <Filter size={15} aria-hidden />
              <select value={kind} onChange={(event) => setKind(event.target.value as Kind)} aria-label="تصفية حسب النوع">
                <option value="all">كل الأنواع</option>
                <option value="cash">مالية</option>
                <option value="in_kind">عينية</option>
              </select>
            </label>
          </div>
        </header>
        {rows.length === 0 ? <p className="dd-empty">لا تبرعات تطابق الاختيار.</p> : (
          <table className="dd-table">
            <thead>
              <tr>
                <th scope="col">التبرع</th>
                <th scope="col">رقم الوصل</th>
                <th scope="col">التاريخ</th>
                <th scope="col">المتبرع</th>
                <th scope="col">المبلغ</th>
                <th scope="col">عدد التبرعات</th>
                <th scope="col" className="dd-pic-col">الصورة</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, limit).map((item) => (
                <tr key={item.id} onClick={() => onOpen(item)}>
                  <td>
                    <span className="dd-what">
                      <span>{item.kind === 'cash' ? `تبرع مالي${item.purpose ? ` · ${item.purpose}` : ''}` : `${item.item ?? 'مواد'}${item.quantity ? ` · ${formatNumber(item.quantity)} ${item.unit ?? ''}` : ''}`}</span>
                    </span>
                  </td>
                  <td><bdi className="dd-code">{item.receipt_no ?? `TB-${String(item.id).padStart(5, '0')}`}</bdi></td>
                  <td><bdi>{showDate(item.received_on)}</bdi></td>
                  <td>
                    <a className="dd-donor" href={donorHref(item.donor_name)} onClick={(event) => event.stopPropagation()}>{item.donor_name}</a>
                  </td>
                  <td className="dd-money">{item.amount ? <><bdi>{formatNumber(item.amount)}</bdi> <small>{currency}</small></> : '—'}</td>
                  <td><span className="dd-count" title={`تبرعات ${item.donor_name} في ${periodLabel}`}><bdi>{formatNumber(giftsBy.get(item.donor_name) ?? 1)}</bdi> {(giftsBy.get(item.donor_name) ?? 1) === 1 ? 'تبرع' : 'تبرعات'}</span></td>
                  <td className="dd-pic">
                    <span className="dd-pic-wrap">
                      <DonationIconTile donation={item} size={44} />
                      <small>{donationIcon(item).label}</small>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {rows.length > 0 && (
          <ul className="dd-mlist">
            {rows.slice(0, limit).map((item) => {
              const cash = item.kind === 'cash';
              const gifts = giftsBy.get(item.donor_name) ?? 1;
              return (
                <li key={item.id} className={`dd-mcard ${cash ? 'cash' : 'goods'}`}>
                  <button type="button" className="dd-mcard-main" onClick={() => onOpen(item)} aria-label={`فتح تبرع ${item.donor_name}`}>
                    <DonationIconTile donation={item} size={46} />
                    <span className="dd-mcard-what">
                      <b>{cash ? 'تبرع مالي' : item.item ?? 'مواد'}</b>
                      <small>{cash ? item.purpose || 'عامة' : donationIcon(item).label !== item.item ? donationIcon(item).label : 'تبرع عيني'}</small>
                    </span>
                    <span className="dd-mcard-value">
                      {cash
                        ? <b><bdi>{formatNumber(item.amount ?? 0)}</bdi> <small>{currency}</small></b>
                        : <b><bdi>{item.quantity ? formatNumber(item.quantity) : '—'}</bdi> <small>{item.unit || 'عيني'}</small></b>}
                      <bdi className="dd-mcard-code">{item.receipt_no ?? `TB-${String(item.id).padStart(5, '0')}`}</bdi>
                    </span>
                  </button>
                  <div className="dd-mcard-foot">
                    <a className="dd-mcard-donor" href={donorHref(item.donor_name)}>
                      <Users size={14} aria-hidden />
                      <span>{item.donor_name}</span>
                    </a>
                    <span className="dd-mcard-gifts" title={`تبرعات ${item.donor_name} في ${periodLabel}`}><bdi>{formatNumber(gifts)}</bdi> {gifts === 1 ? 'تبرع' : 'تبرعات'}</span>
                    <span className="dd-mcard-date" title={showDate(item.received_on)}><CalendarDays size={14} aria-hidden /><bdi>{Number(item.received_on.slice(8, 10))} {SHORT_MONTHS[monthOf(item)]}</bdi></span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {rows.length > limit && <button type="button" className="dd-load" onClick={() => setLimit(limit + 10)}>عرض المزيد · <bdi>{formatNumber(rows.length - limit)}</bdi></button>}
      </section>
    </div>
  );
}

function Delta({ value }: { value: number | null }) {
  if (value === null || Math.abs(value) < 0.5) return null;
  return <span className={`dd-delta${value < 0 ? ' down' : ''}`}><bdi>{value > 0 ? '+' : '−'}{formatPercent(Math.abs(value))}</bdi> {value > 0 ? '↑' : '↓'}</span>;
}

// The date control: a button with the chosen period that opens a month calendar. Every day with a
// donation is marked (green for money, amber for goods, with the day's cash); a day can be picked,
// or the whole month or year. Moving past January or December changes the year.
function DatePicker({ items, year, month, period, day, label, currency, onYear, onPick }: {
  items: Donation[];
  year: number;
  month: number;
  period: Period;
  day: string | null;
  label: string;
  currency: string;
  onYear: (year: number) => void;
  onPick: (next: { period: Period; month?: number; day?: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(month);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open) setView(month); }, [open, month]);
  useEffect(() => {
    if (!open) return undefined;
    const away = (event: PointerEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); };
    const esc = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  const key = `${year}-${String(view + 1).padStart(2, '0')}`;
  const byDay = new Map<number, { cash: number; goods: number; count: number }>();
  items.filter((item) => item.received_on.startsWith(key)).forEach((item) => {
    const d = Number(item.received_on.slice(8, 10));
    const row = byDay.get(d) ?? { cash: 0, goods: 0, count: 0 };
    if (item.kind === 'cash') row.cash += item.amount ?? 0;
    else row.goods += 1;
    row.count += 1;
    byDay.set(d, row);
  });
  const days = new Date(Date.UTC(year, view + 1, 0)).getUTCDate();
  const offset = (new Date(Date.UTC(year, view, 1)).getUTCDay() + 1) % 7;
  const cells = Array.from({ length: Math.ceil((offset + days) / 7) * 7 }, (_, cell) => cell - offset + 1);
  const monthTotal = [...byDay.values()].reduce((s, row) => s + row.cash, 0);
  const step = (delta: number) => {
    const next = view + delta;
    if (next < 0) { onYear(year - 1); setView(11); return; }
    if (next > 11) { if (year < THIS_YEAR) { onYear(year + 1); setView(0); } return; }
    setView(next);
  };
  const atEnd = year === THIS_YEAR && view >= THIS_MONTH;

  return (
    <div className="dd-date" ref={box}>
      <button type="button" className={`dd-date-btn${open ? ' on' : ''}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)}>
        <CalendarDays size={17} aria-hidden />
        <span>{label}</span>
        <ChevronDown size={16} aria-hidden className="dd-date-caret" />
      </button>
      {open && (
        <div className="dd-cal" role="dialog" aria-label="اختيار التاريخ">
          <header className="dd-cal-head">
            <button type="button" aria-label="الشهر السابق" onClick={() => step(-1)}><ChevronRight size={16} aria-hidden /></button>
            <div>
              <b>{MONTH_NAMES[view]} <bdi>{year}</bdi></b>
              <small>{byDay.size ? <><bdi>{formatNumber(byDay.size)}</bdi> يوم فيه تبرع · <bdi>{formatNumber(monthTotal)}</bdi> {currency}</> : 'لا تبرعات في هذا الشهر'}</small>
            </div>
            <button type="button" aria-label="الشهر التالي" disabled={atEnd} onClick={() => step(1)}><ChevronLeft size={16} aria-hidden /></button>
          </header>
          <div className="dd-cal-grid">
            {DAYS.map((name) => <span key={name} className="dd-cal-dow" title={name}>{name.replace(/^ال/, '')}</span>)}
            {cells.map((d, cell) => {
              if (d < 1 || d > days) return <span key={cell} className="dd-cal-blank" />;
              const iso = `${key}-${String(d).padStart(2, '0')}`;
              const row = byDay.get(d);
              const future = iso > TODAY;
              const chosen = period === 'day' && day === iso;
              return (
                <button
                  key={cell}
                  type="button"
                  className={`dd-cal-day${row ? ' has' : ''}${chosen ? ' chosen' : ''}${iso === TODAY ? ' today' : ''}`}
                  disabled={future}
                  title={row ? `${formatNumber(row.count)} تبرع · ${formatNumber(row.cash)} ${currency}${row.goods ? ` · ${row.goods} عيني` : ''}` : undefined}
                  onClick={() => { onPick({ period: 'day', month: view, day: iso }); setOpen(false); }}
                >
                  <span className="dd-cal-num"><bdi>{d}</bdi></span>
                  {row && (
                    <span className="dd-cal-marks" aria-hidden>
                      {row.cash > 0 && <i className="cash" />}
                      {row.goods > 0 && <i className="goods" />}
                    </span>
                  )}
                  {row && row.cash > 0 && <small className="dd-cal-amount">{formatCompactAr(row.cash)}</small>}
                </button>
              );
            })}
          </div>
          <footer className="dd-cal-foot">
            <span className="dd-cal-legend"><i className="cash" /> مالي <i className="goods" /> عيني</span>
            <div>
              <button type="button" className={period === 'month' && month === view ? 'on' : undefined} onClick={() => { onPick({ period: 'month', month: view }); setOpen(false); }}>الشهر كله</button>
              <button type="button" className={period === 'year' ? 'on' : undefined} onClick={() => { onPick({ period: 'year' }); setOpen(false); }}>السنة كلها</button>
            </div>
          </footer>
        </div>
      )}
    </div>
  );
}

// 1,250,000 → 1.25M; 85,000 → 85K: short enough for a day cell.
function formatCompactAr(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value % 1_000_000 ? 1 : 0)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return String(value);
}

// The ring's colours as gradients (deep → light), in a fixed order (largest kind first).
const RING_TONES: [string, string][] = [
  ['#0f9f6e', '#34d3a0'], ['#2459e0', '#5b9cf6'], ['#6d35d9', '#a07cf5'], ['#d97706', '#fbbf24'],
  ['#be185d', '#f472b6'], ['#0e7490', '#22d3ee'], ['#c2410c', '#fb923c'], ['#475569', '#94a3b8'],
];
const toneOf = (at: number) => RING_TONES[at % RING_TONES.length];

// A filled ring segment between two angles (radians, clockwise from the top).
function sector(r0: number, r1: number, a0: number, a1: number) {
  const sweep = Math.min(a1 - a0, Math.PI * 2 - 0.0001);
  const end = a0 + sweep;
  const at = (r: number, a: number) => `${(80 + r * Math.sin(a)).toFixed(2)} ${(80 - r * Math.cos(a)).toFixed(2)}`;
  const large = sweep > Math.PI ? 1 : 0;
  return `M${at(r1, a0)}A${r1} ${r1} 0 ${large} 1 ${at(r1, end)}L${at(r0, end)}A${r0} ${r0} 0 ${large} 0 ${at(r0, a0)}Z`;
}

// 0 → 1 over `ms` once `on` turns true (eased); straight to 1 for people who ask for less motion.
function useGrow(on: boolean, ms = 1200) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!on) return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setValue(1); return undefined; }
    let frame = 0;
    const begin = performance.now();
    const step = (time: number) => {
      const t = Math.min((time - begin) / ms, 1);
      setValue(1 - (1 - t) ** 3);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [on, ms]);
  return value;
}

// The period's donations as a ring: each kind (money, food basket, flour, clothes …) its own colour and
// its share of the donations' count. It fills from nothing the first time it scrolls into view; the
// raised disc in the middle shows the total, or the kind tapped (whose segment steps out of the ring).
function KindRing({ items, label, currency }: { items: Donation[]; label: string; currency: string }) {
  const [active, setActive] = useState<string | null>(null);
  const [seen, setSeen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = box.current;
    if (!node || seen) return undefined;
    const watch = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) setSeen(true); }, { threshold: 0.7, rootMargin: '0px 0px -90px 0px' });
    watch.observe(node);
    return () => watch.disconnect();
  }, [seen, items.length]);
  const grow = useGrow(seen);

  const kinds = new Map<string, { count: number; cash: number }>();
  items.forEach((item) => {
    const key = donationIcon(item).label;
    const row = kinds.get(key) ?? { count: 0, cash: 0 };
    row.count += 1;
    row.cash += item.amount ?? 0;
    kinds.set(key, row);
  });
  const rows = [...kinds].sort((a, b) => b[1].count - a[1].count || b[1].cash - a[1].cash);
  const total = items.length;
  const cashTotal = items.reduce((sum, item) => sum + (item.amount ?? 0), 0);
  const chosenAt = rows.findIndex(([name]) => name === active);
  const chosen = chosenAt >= 0 ? rows[chosenAt] : null;
  const toggle = (name: string) => setActive(active === name ? null : name);
  const full = Math.PI * 2 * grow;
  let start = 0;
  return (
    <section className="dd-card dd-ring-card" aria-labelledby="dd-ring-title">
      <header className="dd-section-head">
        <div><h2 id="dd-ring-title">توزيع التبرعات</h2><small>{label} · حسب النوع</small></div>
        {total > 0 && <span className="dd-ring-pill"><bdi>{formatNumber(rows.length)}</bdi> {rows.length === 1 ? 'نوع' : 'أنواع'}</span>}
      </header>
      {total === 0 ? <p className="dd-empty">لا تبرعات في {label}.</p> : (
        <div className="dd-ring-body">
          <div className="dd-ring" ref={box}>
            <svg viewBox="-10 -10 180 180" role="img" aria-label={`تبرعات ${label} حسب النوع`}>
              <defs>
                {rows.map(([name], at) => (
                  <linearGradient key={name} id={`dd-ring-g${at}`} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor={toneOf(at)[1]} />
                    <stop offset="1" stopColor={toneOf(at)[0]} />
                  </linearGradient>
                ))}
              </defs>
              <circle cx="80" cy="80" r="66" className="dd-ring-track" />
              {rows.map(([name, row], at) => {
                const sweep = (row.count / total) * full;
                const a0 = start;
                start += sweep;
                if (sweep <= 0.001) return null;
                const mid = a0 + sweep / 2;
                const pop = active === name ? 7 : 0;
                return (
                  <path
                    key={name}
                    d={sector(52, 80, a0, a0 + sweep)}
                    fill={`url(#dd-ring-g${at})`}
                    className={`dd-ring-arc${active === name ? ' is-on' : ''}${active && active !== name ? ' is-off' : ''}`}
                    transform={pop ? `translate(${(Math.sin(mid) * pop).toFixed(2)} ${(-Math.cos(mid) * pop).toFixed(2)})` : undefined}
                    onClick={() => toggle(name)}
                  />
                );
              })}
            </svg>
            <span className="dd-ring-disc" aria-live="polite">
              {chosen ? (
                <>
                  <b style={{ color: toneOf(chosenAt)[0] }}><bdi>{formatPercent((chosen[1].count / total) * 100)}</bdi></b>
                  <small>{chosen[0]}</small>
                </>
              ) : (
                <>
                  <b><bdi>{formatNumber(Math.round(total * grow))}</bdi></b>
                  <small>{total === 1 ? 'تبرع' : 'تبرعات'}</small>
                </>
              )}
            </span>
          </div>
          {cashTotal > 0 && (
            <p className="dd-ring-cash">
              <Wallet size={15} aria-hidden />
              <span>{chosen ? `نقداً في ${chosen[0]}` : 'مجموع المبالغ'}</span>
              <b><bdi>{formatNumber(Math.round((chosen ? chosen[1].cash : cashTotal) * grow))}</bdi> <small>{currency}</small></b>
            </p>
          )}
          <ul className="dd-ring-legend">
            {rows.map(([name, row], at) => {
              const share = (row.count / total) * 100;
              return (
                <li key={name}>
                  <button type="button" aria-pressed={active === name} onClick={() => toggle(name)} style={{ ['--tone' as string]: toneOf(at)[0], ['--tone-2' as string]: toneOf(at)[1] }}>
                    <span className="dd-ring-line">
                      <i aria-hidden />
                      <span className="dd-ring-name">{name}</span>
                      <bdi className="dd-ring-share">{formatPercent(share)}</bdi>
                    </span>
                    <span className="dd-ring-bar" aria-hidden><span style={{ width: `${Math.max(share, 3) * grow}%` }} /></span>
                    <span className="dd-ring-meta">
                      <span><bdi>{formatNumber(row.count)}</bdi> {row.count === 1 ? 'تبرع' : 'تبرعات'}</span>
                      {row.cash > 0 && <span><bdi>{formatNumber(row.cash)}</bdi> {currency}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}

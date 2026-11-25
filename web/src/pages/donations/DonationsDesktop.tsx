import { useMemo, useState } from 'react';
import {
  ArrowLeft, Banknote, ChevronLeft, ChevronRight, Filter, Gift, MoreHorizontal, Package, Plus, RotateCcw, Search, Users, Wallet,
} from 'lucide-react';
import { MONTH_NAMES, formatNumber, formatPercent } from '../../format';
import { donorHref } from '../../route';
import type { Donation } from '../aid/DonationDialog';

const now = new Date();
const THIS_YEAR = now.getUTCFullYear();
const THIS_MONTH = now.getUTCMonth();
const monthOf = (item: Donation) => Number(item.received_on.slice(5, 7)) - 1;
const showDate = (iso: string) => iso.slice(0, 10).replace(/-/g, '/');
// The short month names used on Iraqi calendars, for the bars' axis.
const SHORT_MONTHS = ['ك٢', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'ت١', 'ت٢', 'ك١'];
const PURPOSE_TONES =['#16a34a', '#2563eb', '#f59e0b', '#db2777', '#7c3aed', '#0891b2'];

type Period = 'month' | 'year';
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

  const data = useMemo(() => {
    const cash = Array<number>(12).fill(0);
    const goods = Array<number>(12).fill(0);
    items.forEach((item) => {
      if (item.kind === 'cash') cash[monthOf(item)] += item.amount ?? 0;
      else goods[monthOf(item)] += 1;
    });
    const inPeriod = items.filter((item) => period === 'year' || monthOf(item) === month);
    const before = period === 'year' ? [] : items.filter((item) => monthOf(item) === month - 1);
    const sumCash = (list: Donation[]) => list.filter((item) => item.kind === 'cash').reduce((s, item) => s + (item.amount ?? 0), 0);
    const donors = (list: Donation[]) => new Set(list.map((item) => item.donor_name)).size;
    const goodsCount = (list: Donation[]) => list.filter((item) => item.kind === 'in_kind').length;
    const prevCash = period === 'year' ? null : month > 0 ? sumCash(before) : previousDecemberCash;
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
  }, [items, period, month, previousDecemberCash]);

  const rows = useMemo(() => {
    const needle = query.trim();
    return data.inPeriod
      .filter((item) => kind === 'all' || item.kind === kind)
      .filter((item) => !needle || [item.donor_name, item.item, item.purpose, item.receipt_no, item.note].some((value) => value?.includes(needle)));
  }, [data.inPeriod, kind, query]);

  const periodLabel = period === 'year' ? `سنة ${year}` : `${MONTH_NAMES[month]} ${year}`;
  const values = flow === 'cash' ? data.cash : data.goods;
  const max = Math.max(...values, 1);
  const shownBar = hover ?? month;
  const reset = () => { setPeriod('month'); setMonth(focus); setKind('all'); setQuery(''); setFlow('cash'); };

  return (
    <div className="dd">
      <header className="dd-head">
        <div>
          <h1>نظرة عامة</h1>
          <p>ملخص تبرعات المؤسسة — {periodLabel}</p>
        </div>
        <div className="dd-head-tools">
          <div className="dd-year" role="group" aria-label="السنة">
            <button type="button" aria-label="السنة السابقة" onClick={() => onYear(year - 1)}><ChevronRight size={16} aria-hidden /></button>
            <strong><bdi>{year}</bdi></strong>
            <button type="button" aria-label="السنة التالية" disabled={year >= THIS_YEAR} onClick={() => onYear(year + 1)}><ChevronLeft size={16} aria-hidden /></button>
          </div>
          <label className="dd-select">
            <span className="sr-only">الفترة</span>
            <select value={period} onChange={(event) => setPeriod(event.target.value as Period)}>
              <option value="month">هذا الشهر</option>
              <option value="year">السنة كلها</option>
            </select>
          </label>
          <button type="button" className="dd-ghost" onClick={reset}><RotateCcw size={15} aria-hidden /> إعادة الضبط</button>
          <button type="button" className="dd-primary" onClick={onAdd}><Plus size={16} aria-hidden /> سجّل تبرعاً</button>
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
          <button type="button" className="dd-card-foot" onClick={() => { setKind('in_kind'); document.getElementById('dd-table')?.scrollIntoView({ behavior: 'smooth' }); }}>عرض المواد <ArrowLeft size={16} aria-hidden /></button>
        </article>
        <article className="dd-card">
          <header>
            <span className="dd-tile" aria-hidden><Users size={20} /></span>
            <div><h2>المتبرعون</h2><small>من داخل المؤسسة وخارجها</small></div>
            <MoreHorizontal size={18} aria-hidden className="dd-more" />
          </header>
          <p className="dd-amount"><bdi>{formatNumber(data.donorsNow)}</bdi> <small>متبرع</small><Delta value={data.donorsDelta} /></p>
          {data.top
            ? <a className="dd-card-foot" href={donorHref(data.top[0])}>أكبر متبرع: {data.top[0]} <ArrowLeft size={16} aria-hidden /></a>
            : <span className="dd-card-foot muted">لا تبرعات مالية في الفترة</span>}
        </article>
      </section>

      <div className="dd-row">
        {/* ── Purposes «wallet» ─────────────────────────── */}
        <section className="dd-card dd-wallet" aria-labelledby="dd-wallet-title">
          <header className="dd-section-head">
            <div><h2 id="dd-wallet-title">محفظة الأغراض</h2><small>{periodLabel} · <bdi>{formatNumber(data.inPeriod.length)}</bdi> تبرع</small></div>
            <button type="button" className="dd-outline" onClick={onAdd}><Plus size={15} aria-hidden /> إضافة</button>
          </header>
          {data.purposes.length === 0 ? <p className="dd-empty">لا تبرعات في {periodLabel}.</p> : (
            // Every purpose in one sideways strip, so a new one never pushes an older one out.
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
            <div className="dd-toggle" role="group" aria-label="نوع التدفق">
              <button type="button" aria-pressed={flow === 'cash'} onClick={() => setFlow('cash')}>مالية</button>
              <button type="button" aria-pressed={flow === 'in_kind'} onClick={() => setFlow('in_kind')}>عينية</button>
            </div>
          </header>
          <div className="dd-bars" onPointerLeave={() => setHover(null)}>
            <div className="dd-grid" aria-hidden>
              {[1, 0.75, 0.5, 0.25, 0].map((part) => <span key={part}><bdi>{flow === 'cash' ? formatNumber(Math.round(max * part)) : Math.round(max * part)}</bdi></span>)}
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
                      onClick={() => { setMonth(at); setPeriod('month'); }}
                    >
                      <i style={{ blockSize: `${value > 0 ? Math.max((value / max) * 100, 3) : 2}%` }}>
                        {at === shownBar && value > 0 && <span className="dd-dot" aria-hidden />}
                      </i>
                    </button>
                    {at === shownBar && !future && (
                      <span className="dd-tip" role="tooltip">
                        <small>{MONTH_NAMES[at]} <bdi>{year}</bdi></small>
                        <span><i className="g" />مالية <b><bdi>{formatNumber(data.cash[at])}</bdi></b></span>
                        <span><i className="w" />عينية <b><bdi>{formatNumber(data.goods[at])}</bdi></b></span>
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
                <th scope="col">الحالة</th>
                <th scope="col"><span className="sr-only">إجراءات</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, limit).map((item) => (
                <tr key={item.id} onClick={() => onOpen(item)}>
                  <td>
                    <span className="dd-what">
                      <span className={`dd-what-icon ${item.kind}`} aria-hidden>{item.kind === 'cash' ? <Banknote size={15} /> : <Gift size={15} />}</span>
                      <span>{item.kind === 'cash' ? `تبرع مالي${item.purpose ? ` · ${item.purpose}` : ''}` : `${item.item ?? 'مواد'}${item.quantity ? ` · ${formatNumber(item.quantity)} ${item.unit ?? ''}` : ''}`}</span>
                    </span>
                  </td>
                  <td><bdi className="dd-code">{item.receipt_no ?? `TB-${String(item.id).padStart(5, '0')}`}</bdi></td>
                  <td><bdi>{showDate(item.received_on)}</bdi></td>
                  <td>
                    <a className="dd-donor" href={donorHref(item.donor_name)} onClick={(event) => event.stopPropagation()}>{item.donor_name}</a>
                  </td>
                  <td className="dd-money">{item.amount ? <><bdi>{formatNumber(item.amount)}</bdi> <small>{currency}</small></> : '—'}</td>
                  <td><span className={`dd-state${item.receipt_no ? ' ok' : ''}`}>{item.receipt_no ? '+ موثّق' : '• بلا وصل'}</span></td>
                  <td><button type="button" className="dd-row-more" aria-label={`تعديل تبرع ${item.donor_name}`} onClick={(event) => { event.stopPropagation(); onOpen(item); }}><MoreHorizontal size={18} aria-hidden /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
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

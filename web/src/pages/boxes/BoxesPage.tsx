import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive, ArrowDown, ArrowUp, CalendarCheck, ChevronLeft, ChevronRight, Clock, HandCoins, Pencil, Plus, Search, UserCheck, Wallet,
} from 'lucide-react';
import { api, type Me } from '../../api';
import { StateMessage } from '../../components/StateMessage';
import { MONTH_NAMES, formatNumber, formatPercent } from '../../format';
import { boxHref } from '../../route';
import { SlideTabs } from '../expenses/LedgerMonthChart';
import { BoxDialog, CollectionDialog, type Box, type Delegate } from './BoxDialogs';

export interface BoxListRow extends Box {
  months: number[];
  counts: number[];
  previous_december: number;
  last_collected_on: string | null;
  last_amount: number | null;
}

interface Sheet { year: number; delegates: Delegate[]; boxes: BoxListRow[] }

const now = new Date();
const THIS_YEAR = now.getUTCFullYear();
const THIS_MONTH = now.getUTCMonth();
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const change = (before: number, after: number) => (before > 0 ? ((after - before) / before) * 100 : null);
// 2026-11-05 → 2026/11/05, the way the app writes dates.
export const showDate = (iso: string | null) => (iso ? iso.slice(0, 10).replace(/-/g, '/') : '—');

type Who = 'all' | 'delegate' | 'other';

// Charity boxes: the month's and year's box income on top, then every box — with a delegate or
// anyone else — with when it was handed over, where it sits, this month's amount, when it was last
// collected and how this month compares with the one before. A row opens the box's own page.
export function BoxesPage({ me }: { me: Me }) {
  const [year, setYear] = useState(THIS_YEAR);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [error, setError] = useState('');
  const [who, setWho] = useState<Who>('all');
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<BoxListRow | null>(null);
  const [collecting, setCollecting] = useState<BoxListRow | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      setSheet(await api<Sheet>(`/boxes?year=${year}`));
    } catch (failure) {
      setError((failure as Error).message);
    }
  }, [year]);
  useEffect(() => { setSheet(null); void load(); }, [load]);

  // The month the page speaks of: this month in this year, December in a past one.
  const focus = year === THIS_YEAR ? THIS_MONTH : 11;
  const before = (row: BoxListRow) => (focus > 0 ? row.months[focus - 1] : row.previous_december);

  const figures = useMemo(() => {
    if (!sheet) return null;
    const monthly = Array.from({ length: 12 }, (_, at) => sum(sheet.boxes.map((row) => row.months[at])));
    const active = sheet.boxes.filter((row) => row.status === 'active');
    const waiting = active.filter((row) => row.months[focus] === 0).length;
    const withDelegates = active.filter((row) => row.delegate_id).length;
    const prev = focus > 0 ? monthly[focus - 1] : sum(sheet.boxes.map((row) => row.previous_december));
    const collected = active.length - waiting;
    return { monthly, active: active.length, waiting, withDelegates, prev, collected, year: sum(monthly) };
  }, [sheet, focus]);

  const rows = useMemo(() => {
    if (!sheet) return [];
    const needle = query.trim();
    return sheet.boxes
      .filter((row) => (who === 'all' ? true : who === 'delegate' ? row.delegate_id : !row.delegate_id))
      .filter((row) => !needle || [row.holder_name, row.work, row.address, row.code, row.phone].some((value) => value?.includes(needle)))
      .sort((a, b) => (a.status === b.status ? b.months[focus] - a.months[focus] : a.status === 'active' ? -1 : 1));
  }, [sheet, who, query, focus]);

  const counts = sheet ? {
    all: sheet.boxes.length,
    delegate: sheet.boxes.filter((row) => row.delegate_id).length,
    other: sheet.boxes.filter((row) => !row.delegate_id).length,
  } : { all: 0, delegate: 0, other: 0 };

  return (
    <div className="yl bx">
      <div className="page-head exp-head yl-head">
        <span className="page-icon" aria-hidden><Archive size={24} /></span>
        <div><h1>صناديق الصدقات</h1></div>
        <div className="page-actions">
          <div className="yl-switch" role="group" aria-label="السنة">
            <button type="button" className="icon-btn" aria-label="السنة السابقة" onClick={() => setYear(year - 1)}><ChevronRight size={17} aria-hidden /></button>
            <strong><bdi>{year}</bdi></strong>
            <button type="button" className="icon-btn" aria-label="السنة التالية" disabled={year >= THIS_YEAR} onClick={() => setYear(year + 1)}><ChevronLeft size={17} aria-hidden /></button>
          </div>
          <button type="button" className="btn primary" aria-label="إضافة صندوق" onClick={() => setAdding(true)} disabled={!sheet}>
            <Plus size={18} aria-hidden />
            <span className="btn-label">إضافة صندوق</span>
          </button>
        </div>
      </div>

      {error && !sheet && <StateMessage kind="error" title="تعذّر تحميل الصناديق" hint={error} onRetry={load} />}
      {!sheet && !error && (
        <>
          <div className="yl-kpis" aria-busy="true">{[0, 1, 2, 3, 4].map((key) => <div key={key} className="yl-kpi skeleton" />)}</div>
          <div className="yl-panel skeleton yl-skel-panel" />
        </>
      )}

      {sheet && figures && (
        <>
          <section className="yl-kpis" aria-label="خلاصة الصناديق">
            <Card label="وارد الشهر" icon={Wallet} tone="box" value={formatNumber(figures.monthly[focus])} unit={me.currency}
              foot={<><span className="yl-foot-label">{MONTH_NAMES[focus]}</span><DeltaPill value={change(figures.prev, figures.monthly[focus])} /></>} />
            <Card label={`وارد ${year}`} icon={HandCoins} tone="in" value={formatNumber(figures.year)} unit={me.currency}
              foot={<span className="yl-foot-label">متوسط الشهر <b><bdi>{formatNumber(Math.round(figures.year / Math.max(figures.monthly.filter((v) => v > 0).length, 1)))}</bdi></b></span>} />
            <Card label="الصناديق الموزّعة" icon={Archive} value={formatNumber(figures.active)}
              foot={<span className="yl-foot-label"><bdi>{formatNumber(figures.withDelegates)}</bdi> عند مندوبين · <bdi>{formatNumber(figures.active - figures.withDelegates)}</bdi> عند غيرهم</span>} />
            <Card label="استُلمت هذا الشهر" icon={CalendarCheck} tone="in" value={formatNumber(figures.collected)}
              foot={<span className="yl-foot-label">من <bdi>{formatNumber(figures.active)}</bdi> صندوق</span>} />
            <Card label="بانتظار الاستلام" icon={Clock} tone="gift" value={formatNumber(figures.waiting)}
              foot={<span className="yl-foot-label">لم يُستلم في {MONTH_NAMES[focus]}</span>} />
          </section>

          <section className="yl-panel" aria-labelledby="bx-title">
            <header className="yl-panel-head">
              <div>
                <h2 id="bx-title"><Archive size={18} aria-hidden /> سجل الصناديق</h2>
                <p>مبالغ {MONTH_NAMES[focus]} <bdi>{year}</bdi> · اضغط على الصندوق لفتح صفحته</p>
              </div>
              <div className="bx-tools">
                <label className="bx-search">
                  <Search size={16} aria-hidden />
                  <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="بحث بالاسم أو المكان" aria-label="بحث" />
                </label>
                <SlideTabs<Who>
                  items={[
                    { id: 'all', label: `الكل ${counts.all}` },
                    { id: 'delegate', label: `المندوبون ${counts.delegate}`, icon: UserCheck },
                    { id: 'other', label: `غير المندوبين ${counts.other}` },
                  ]}
                  value={who}
                  onChange={setWho}
                  label="صاحب الصندوق"
                />
              </div>
            </header>

            {sheet.boxes.length === 0 ? (
              <div className="yl-chart-empty">
                <span aria-hidden><Archive size={26} /></span>
                <b>لا صناديق بعد</b>
                <p>أضف أول صندوق ثم سجّل ما يُستلم منه كل شهر.</p>
                <button type="button" className="btn primary" onClick={() => setAdding(true)}><Plus size={16} aria-hidden /> إضافة صندوق</button>
              </div>
            ) : rows.length === 0 ? (
              <p className="exp-empty">لا صناديق تطابق البحث.</p>
            ) : (
              <div className="yl-table-wrap">
                <table className="bx-table">
                  <thead>
                    <tr>
                      <th scope="col" className="bx-c-holder">صاحب الصندوق</th>
                      <th scope="col">تاريخ التسليم</th>
                      <th scope="col">العمل</th>
                      <th scope="col" className="bx-c-amount">المبلغ</th>
                      <th scope="col">تاريخ الاستلام</th>
                      <th scope="col">عن الشهر السابق</th>
                      <th scope="col" className="bx-c-actions">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const amount = row.months[focus];
                      const delta = change(before(row), amount);
                      const open = () => { location.hash = boxHref(row.id); };
                      return (
                        <tr key={row.id} className={row.status === 'returned' ? 'is-returned' : undefined} onClick={open}>
                          <th scope="row" className="bx-c-holder">
                            <a href={boxHref(row.id)} className="bx-holder" onClick={(event) => event.stopPropagation()}>
                              <span className={`bx-avatar${row.delegate_id ? ' is-delegate' : ''}`} aria-hidden>{row.holder_name.trim().charAt(0)}</span>
                              <span className="bx-holder-text">
                                <b>{row.holder_name}</b>
                                <small>
                                  {row.delegate_id ? <span className="bx-badge">مندوب</span> : <span className="bx-badge muted">غير مندوب</span>}
                                  {row.code && <span>صندوق <bdi>{row.code}</bdi></span>}
                                  {row.status === 'returned' && <span className="bx-badge warn">أُعيد</span>}
                                </small>
                              </span>
                            </a>
                          </th>
                          <td data-label="تاريخ التسليم"><bdi>{showDate(row.delivered_on)}</bdi></td>
                          <td data-label="العمل" className="bx-c-work">{row.work ?? '—'}</td>
                          <td data-label="المبلغ" className="bx-c-amount">{amount > 0 ? <bdi>{formatNumber(amount)}</bdi> : <span className="bx-none">لم يُستلم</span>}</td>
                          <td data-label="تاريخ الاستلام"><bdi>{showDate(row.last_collected_on)}</bdi></td>
                          <td data-label="عن الشهر السابق"><DeltaPill value={amount > 0 ? delta : null} empty={amount > 0 && before(row) === 0 ? 'جديد' : '—'} /></td>
                          <td className="bx-c-actions" onClick={(event) => event.stopPropagation()}>
                            <div className="bx-actions">
                              {row.status === 'active' && (
                                <button type="button" className="btn bx-collect" onClick={() => setCollecting(row)}>
                                  <HandCoins size={15} aria-hidden /> استلام
                                </button>
                              )}
                              <button type="button" className="icon-btn" aria-label={`تعديل صندوق ${row.holder_name}`} onClick={() => setEditing(row)}>
                                <Pencil size={15} aria-hidden />
                              </button>
                              <a className="icon-btn" href={boxHref(row.id)} aria-label={`فتح صندوق ${row.holder_name}`}><ChevronLeft size={17} aria-hidden /></a>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th scope="row" className="bx-c-holder">المجموع · <bdi>{formatNumber(rows.length)}</bdi> صندوق</th>
                      <td />
                      <td />
                      <td className="bx-c-amount" data-label="المبلغ"><bdi>{formatNumber(sum(rows.map((row) => row.months[focus])))}</bdi></td>
                      <td />
                      <td data-label="عن الشهر السابق"><DeltaPill value={change(sum(rows.map(before)), sum(rows.map((row) => row.months[focus])))} /></td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {(adding || editing) && sheet && (
        <BoxDialog
          box={editing}
          delegates={sheet.delegates}
          onClose={() => { setAdding(false); setEditing(null); }}
          onSaved={(id) => {
            const wasAdding = adding;
            setAdding(false);
            setEditing(null);
            if (wasAdding) location.hash = boxHref(id);
            else void load();
          }}
        />
      )}
      {collecting && (
        <CollectionDialog
          boxId={collecting.id}
          holder={collecting.holder_name}
          collection={null}
          currency={me.currency}
          onClose={() => setCollecting(null)}
          onSaved={() => { setCollecting(null); void load(); }}
        />
      )}
    </div>
  );
}

export function Card({ label, icon: Icon, tone = 'theme', value, unit, foot }: {
  label: string;
  icon: typeof Wallet;
  tone?: 'theme' | 'in' | 'gift' | 'box';
  value: string;
  unit?: string;
  foot?: React.ReactNode;
}) {
  return (
    <article className={`yl-kpi tone-${tone}`}>
      <header>
        <span className="yl-kpi-icon" aria-hidden><Icon size={17} /></span>
        <h2>{label}</h2>
      </header>
      <p className="yl-kpi-value"><bdi>{value}</bdi>{unit && <small>{unit}</small>}</p>
      <footer><div className="yl-foot">{foot}</div></footer>
    </article>
  );
}

// Box income going up is good.
export function DeltaPill({ value, empty = '—' }: { value: number | null; empty?: string }) {
  if (value === null) return <span className={`yl-delta ${empty === 'جديد' ? 'new' : 'flat'}`}>{empty}</span>;
  if (Math.abs(value) < 0.5) return <span className="yl-delta flat">بلا تغيير</span>;
  return (
    <span className={`yl-delta ${value > 0 ? 'good' : 'bad'}`}>
      {value > 0 ? <ArrowUp size={11} strokeWidth={2.8} aria-label="ارتفاع" /> : <ArrowDown size={11} strokeWidth={2.8} aria-label="انخفاض" />}
      <bdi>{formatPercent(Math.abs(value))}</bdi>
    </span>
  );
}

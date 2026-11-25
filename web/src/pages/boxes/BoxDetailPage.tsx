import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive, ArrowRight, CalendarCheck, CalendarDays, ChevronLeft, ChevronRight, HandCoins, Hash, MapPin, Pencil, Phone, Store, Trophy, UserCheck, Wallet,
} from 'lucide-react';
import { api, type Me } from '../../api';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import { StateMessage } from '../../components/StateMessage';
import { MONTH_NAMES, formatNumber } from '../../format';
import { boxIdFromHash } from '../../route';
import { MonthBars } from '../expenses/LedgerMonthChart';
import { BoxDialog, CollectionDialog, type Box, type Collection, type Delegate } from './BoxDialogs';
import { Card, DeltaPill, showDate } from './BoxesPage';

interface Detail extends Box { created_at: string; collections: Collection[]; delegates: Delegate[] }

const now = new Date();
const THIS_YEAR = now.getUTCFullYear();
const THIS_MONTH = now.getUTCMonth();
const isFuture = (year: number, month: number) => year > THIS_YEAR || (year === THIS_YEAR && month > THIS_MONTH);
const change = (before: number, after: number) => (before > 0 ? ((after - before) / before) * 100 : null);

// One box in full: who holds it and where, the year's figures, the year month by month as columns,
// and a row for every month — its amount, when it was collected and the change on the month before —
// each one open for recording or correcting.
export function BoxDetailPage({ me }: { me: Me }) {
  const id = boxIdFromHash();
  const [box, setBox] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [year, setYear] = useState(THIS_YEAR);
  const [editing, setEditing] = useState(false);
  const [collecting, setCollecting] = useState<{ collection: Collection | null; date?: string } | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      setBox(await api<Detail>(`/boxes/${id}`));
    } catch (failure) {
      setError((failure as Error).message);
    }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  const firstYear = box ? Math.min(Number(box.delivered_on.slice(0, 4)), THIS_YEAR) : THIS_YEAR;
  const deliveredMonth = box ? Number(box.delivered_on.slice(5, 7)) - 1 : 0;
  const beforeDelivery = (at: number) => !!box && (year < firstYear || (year === firstYear && at < deliveredMonth));

  const data = useMemo(() => {
    if (!box) return null;
    const months = Array<number>(12).fill(0);
    const byMonth = new Map<number, Collection[]>();
    let december = 0;
    box.collections.forEach((item) => {
      const itemYear = Number(item.month.slice(0, 4));
      const at = Number(item.month.slice(5, 7)) - 1;
      if (itemYear === year - 1 && at === 11) december += item.amount;
      if (itemYear !== year) return;
      months[at] += item.amount;
      byMonth.set(at, [...(byMonth.get(at) ?? []), item]);
    });
    const total = months.reduce((s, v) => s + v, 0);
    const collected = months.filter((v) => v > 0).length;
    const open = Array.from({ length: 12 }, (_, at) => at).filter((at) => !isFuture(year, at) && !beforeDelivery(at)).length;
    const peak = months.indexOf(Math.max(...months));
    const allTime = box.collections.reduce((s, item) => s + item.amount, 0);
    return { months, byMonth, december, total, collected, open, peak, allTime };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [box, year]);

  return (
    <div className="yl bx">
      <div className="page-head exp-head yl-head">
        <span className="page-icon" aria-hidden><Archive size={24} /></span>
        <div>
          <Breadcrumbs items={[{ label: 'صناديق الصدقات', href: '#/boxes' }, { label: box?.holder_name ?? 'الصندوق' }]} />
          <h1>{box ? `صندوق ${box.holder_name}` : 'الصندوق'}</h1>
        </div>
        <div className="page-actions">
          <div className="yl-switch" role="group" aria-label="السنة">
            <button type="button" className="icon-btn" aria-label="السنة السابقة" disabled={year <= firstYear} onClick={() => setYear(year - 1)}><ChevronRight size={17} aria-hidden /></button>
            <strong><bdi>{year}</bdi></strong>
            <button type="button" className="icon-btn" aria-label="السنة التالية" disabled={year >= THIS_YEAR} onClick={() => setYear(year + 1)}><ChevronLeft size={17} aria-hidden /></button>
          </div>
          {box && (
            <>
              <button type="button" className="btn" aria-label="تعديل الصندوق" onClick={() => setEditing(true)}>
                <Pencil size={17} aria-hidden /><span className="btn-label">تعديل</span>
              </button>
              {box.status === 'active' && (
                <button type="button" className="btn primary" aria-label="تسجيل استلام" onClick={() => setCollecting({ collection: null })}>
                  <HandCoins size={18} aria-hidden /><span className="btn-label">تسجيل استلام</span>
                </button>
              )}
            </>
          )}
          <a className="btn" href="#/boxes" aria-label="رجوع إلى الصناديق"><ArrowRight size={18} aria-hidden /></a>
        </div>
      </div>

      {error && !box && <StateMessage kind="error" title="تعذّر تحميل الصندوق" hint={error} onRetry={load} />}
      {!box && !error && (
        <>
          <div className="yl-kpis" aria-busy="true">{[0, 1, 2, 3, 4].map((key) => <div key={key} className="yl-kpi skeleton" />)}</div>
          <div className="yl-panel skeleton yl-skel-panel" />
        </>
      )}

      {box && data && (
        <>
          <ul className="bx-info" aria-label="بيانات الصندوق">
            <li className={box.delegate_id ? 'is-delegate' : undefined}><UserCheck size={15} aria-hidden />{box.delegate_id ? 'عند مندوب' : 'عند غير مندوب'}</li>
            {box.work && <li><Store size={15} aria-hidden />{box.work}</li>}
            <li><CalendarDays size={15} aria-hidden />سُلِّم في <bdi>{showDate(box.delivered_on)}</bdi></li>
            {box.code && <li><Hash size={15} aria-hidden />صندوق رقم <bdi>{box.code}</bdi></li>}
            {box.phone && <li><Phone size={15} aria-hidden /><a href={`tel:${box.phone}`} dir="ltr">{box.phone}</a></li>}
            {box.address && <li><MapPin size={15} aria-hidden />{box.address}</li>}
            {box.status === 'returned' && <li className="is-warn"><Archive size={15} aria-hidden />أُعيد للمؤسسة</li>}
            {box.notes && <li className="is-note">{box.notes}</li>}
          </ul>

          <section className="yl-kpis" aria-label={`خلاصة ${year}`}>
            <Card label={`مجموع ${year}`} icon={Wallet} tone="box" value={formatNumber(data.total)} unit={me.currency}
              foot={<span className="yl-foot-label">منذ التسليم <b><bdi>{formatNumber(data.allTime)}</bdi></b></span>} />
            <Card label="أشهر استُلم فيها" icon={CalendarCheck} tone="in" value={`${formatNumber(data.collected)} من ${formatNumber(data.open)}`}
              foot={<span className="yl-foot-label">من أشهر <bdi>{year}</bdi> المنقضية</span>} />
            <Card label="متوسط الشهر" icon={HandCoins} value={formatNumber(data.collected ? Math.round(data.total / data.collected) : 0)} unit={me.currency}
              foot={<span className="yl-foot-label">للأشهر التي استُلم فيها</span>} />
            <Card label="أعلى شهر" icon={Trophy} tone="gift" value={data.total ? MONTH_NAMES[data.peak] : '—'}
              foot={<span className="yl-foot-label">{data.total ? <><b><bdi>{formatNumber(data.months[data.peak])}</bdi></b> {me.currency}</> : 'لا استلام'}</span>} />
            <Card label="آخر استلام" icon={CalendarDays} value={showDate(box.collections[0]?.collected_on ?? null)}
              foot={<span className="yl-foot-label">{box.collections[0] ? <><b><bdi>{formatNumber(box.collections[0].amount)}</bdi></b> {me.currency}</> : 'لم يُستلم بعد'}</span>} />
          </section>

          <section className="yl-panel yl-chartcard bx-chart" aria-labelledby="bx-chart-title">
            <header className="yl-panel-head">
              <div>
                <h2 id="bx-chart-title"><Archive size={18} aria-hidden /> وارد الصندوق خلال <bdi>{year}</bdi></h2>
                <p>شهراً بشهر · بالـ{me.currency}</p>
              </div>
            </header>
            {data.total === 0
              ? <div className="yl-chart-empty"><span aria-hidden><Archive size={26} /></span><b>لا استلام في {year}</b></div>
              : (
                <MonthBars
                  key={year}
                  values={data.months}
                  year={year}
                  month={year === THIS_YEAR ? THIS_MONTH : 11}
                  tone="boxes"
                  currency={me.currency}
                  isFuture={isFuture}
                  hrefOf={() => undefined}
                />
              )}
          </section>

          <section className="yl-panel" aria-labelledby="bx-months-title">
            <header className="yl-panel-head">
              <div>
                <h2 id="bx-months-title"><CalendarDays size={18} aria-hidden /> أشهر <bdi>{year}</bdi></h2>
                <p>كل شهر بمبلغه وتاريخ استلامه · اضغط على الشهر للتسجيل أو التعديل</p>
              </div>
            </header>
            <div className="yl-table-wrap">
              <table className="bx-table bx-months">
                <thead>
                  <tr>
                    <th scope="col" className="bx-c-holder">الشهر</th>
                    <th scope="col" className="bx-c-amount">المبلغ</th>
                    <th scope="col">تاريخ الاستلام</th>
                    <th scope="col">عن الشهر السابق</th>
                    <th scope="col">ملاحظة</th>
                    <th scope="col" className="bx-c-actions">الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {MONTH_NAMES.map((name, at) => {
                    const future = isFuture(year, at);
                    const early = beforeDelivery(at);
                    const items = data.byMonth.get(at) ?? [];
                    const amount = data.months[at];
                    const prev = at > 0 ? data.months[at - 1] : data.december;
                    const state = future ? 'is-future' : early ? 'is-early' : amount === 0 ? 'is-missing' : '';
                    const canRecord = !future && !early && box.status === 'active';
                    const dayIn = at === THIS_MONTH && year === THIS_YEAR ? undefined : `${year}-${String(at + 1).padStart(2, '0')}-${String(new Date(Date.UTC(year, at + 1, 0)).getUTCDate()).padStart(2, '0')}`;
                    const openRow = () => {
                      if (items.length === 1) setCollecting({ collection: items[0] });
                      else if (items.length === 0 && canRecord) setCollecting({ collection: null, date: dayIn });
                    };
                    return (
                      <tr key={name} className={state} onClick={openRow}>
                        <th scope="row" className="bx-c-holder">
                          <span className="bx-month"><span className="bx-month-num"><bdi>{at + 1}</bdi></span>{name}</span>
                        </th>
                        <td className="bx-c-amount" data-label="المبلغ">
                          {future ? <span className="bx-none">لم يبدأ</span>
                            : early ? <span className="bx-none">قبل التسليم</span>
                              : amount > 0 ? <bdi>{formatNumber(amount)}</bdi> : <span className="bx-none warn">لم يُستلم</span>}
                        </td>
                        <td data-label="تاريخ الاستلام" className={items.length ? undefined : 'is-empty'}>{items.length ? items.map((item) => <bdi key={item.id} className="bx-date">{showDate(item.collected_on)}</bdi>) : '—'}</td>
                        <td data-label="عن الشهر السابق" className={amount > 0 ? undefined : 'is-empty'}>{amount > 0 ? <DeltaPill value={change(prev, amount)} empty={prev === 0 ? 'جديد' : '—'} /> : '—'}</td>
                        <td data-label="ملاحظة" className={`bx-c-work${items.some((item) => item.note) ? '' : ' is-empty'}`}>{items.map((item) => item.note).filter(Boolean).join(' · ') || '—'}</td>
                        <td className="bx-c-actions" onClick={(event) => event.stopPropagation()}>
                          <div className="bx-actions">
                            {items.map((item) => (
                              <button key={item.id} type="button" className="icon-btn" aria-label={`تعديل استلام ${name}`} title={`${formatNumber(item.amount)} · ${showDate(item.collected_on)}`} onClick={() => setCollecting({ collection: item })}>
                                <Pencil size={15} aria-hidden />
                              </button>
                            ))}
                            {canRecord && items.length === 0 && (
                              <button type="button" className="btn bx-collect" onClick={() => setCollecting({ collection: null, date: dayIn })}>
                                <HandCoins size={15} aria-hidden /> تسجيل
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row" className="bx-c-holder">مجموع <bdi>{year}</bdi></th>
                    <td className="bx-c-amount" data-label="المبلغ"><bdi>{formatNumber(data.total)}</bdi></td>
                    <td data-label="تاريخ الاستلام"><bdi>{formatNumber(data.collected)}</bdi> شهر</td>
                    <td />
                    <td />
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        </>
      )}

      {editing && box && (
        <BoxDialog box={box} delegates={box.delegates} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); void load(); }} />
      )}
      {collecting && box && (
        <CollectionDialog
          boxId={box.id}
          holder={box.holder_name}
          collection={collecting.collection}
          defaultDate={collecting.date}
          currency={me.currency}
          onClose={() => setCollecting(null)}
          onSaved={() => { setCollecting(null); void load(); }}
        />
      )}
    </div>
  );
}

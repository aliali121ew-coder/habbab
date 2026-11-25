import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Banknote, ChevronLeft, ChevronRight, Crown, HandHeart, Package, Pencil, Plus, Search, Users, Wallet,
} from 'lucide-react';
import { api, type Me } from '../../api';
import { StateMessage } from '../../components/StateMessage';
import { MONTH_NAMES, formatNumber } from '../../format';
import { SlideTabs } from '../expenses/LedgerMonthChart';
import { Card, DeltaPill, showDate } from '../boxes/BoxesPage';
import { DonationDialog, type Donation } from './DonationDialog';

interface Sheet { year: number; items: Donation[]; previous_december_cash: number }

const now = new Date();
const THIS_YEAR = now.getUTCFullYear();
const THIS_MONTH = now.getUTCMonth();
const isFuture = (year: number, month: number) => year > THIS_YEAR || (year === THIS_YEAR && month > THIS_MONTH);
const change = (before: number, after: number) => (before > 0 ? ((after - before) / before) * 100 : null);
const monthOf = (item: Donation) => Number(item.received_on.slice(5, 7)) - 1;
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

type Kind = 'all' | 'cash' | 'in_kind';
type DonorType = 'all' | 'internal' | 'external';

// المساعدات: the register of what donors give the foundation — people inside it or outside —
// money or goods. Cards sum up the month and the year, the months strip picks a month, and the
// table lists every donation in detail. Cash donations are the «التبرعات المالية» figure on the
// money pages.
export function AidPage({ me }: { me: Me }) {
  const [year, setYear] = useState(THIS_YEAR);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [error, setError] = useState('');
  const [month, setMonth] = useState<number | null>(null);
  const [kind, setKind] = useState<Kind>('all');
  const [donorType, setDonorType] = useState<DonorType>('all');
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState<{ donation: Donation | null } | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      setSheet(await api<Sheet>(`/donations?year=${year}`));
    } catch (failure) {
      setError((failure as Error).message);
    }
  }, [year]);
  useEffect(() => { setSheet(null); setMonth(null); void load(); }, [load]);

  const focus = year === THIS_YEAR ? THIS_MONTH : 11;
  const figures = useMemo(() => {
    if (!sheet) return null;
    const cash = Array<number>(12).fill(0);
    const goods = Array<number>(12).fill(0);
    const byDonor = new Map<string, { cash: number; count: number; type: Donation['donor_type'] }>();
    const items = new Map<string, number>();
    sheet.items.forEach((item) => {
      const at = monthOf(item);
      if (item.kind === 'cash') cash[at] += item.amount ?? 0;
      else {
        goods[at] += 1;
        items.set(item.item ?? '', (items.get(item.item ?? '') ?? 0) + 1);
      }
      const donor = byDonor.get(item.donor_name) ?? { cash: 0, count: 0, type: item.donor_type };
      donor.cash += item.kind === 'cash' ? item.amount ?? 0 : 0;
      donor.count += 1;
      byDonor.set(item.donor_name, donor);
    });
    const top = [...byDonor].sort((a, b) => b[1].cash - a[1].cash || b[1].count - a[1].count)[0] ?? null;
    const topItem = [...items].sort((a, b) => b[1] - a[1])[0] ?? null;
    const internal = [...byDonor.values()].filter((donor) => donor.type === 'internal').length;
    return {
      cash, goods, top, topItem,
      donors: byDonor.size, internal,
      prevCash: focus > 0 ? cash[focus - 1] : sheet.previous_december_cash,
      yearCash: sum(cash),
      yearGoods: sum(goods),
    };
  }, [sheet, focus]);

  const rows = useMemo(() => {
    if (!sheet) return [];
    const needle = query.trim();
    return sheet.items
      .filter((item) => month === null || monthOf(item) === month)
      .filter((item) => kind === 'all' || item.kind === kind)
      .filter((item) => donorType === 'all' || item.donor_type === donorType)
      .filter((item) => !needle || [item.donor_name, item.item, item.purpose, item.note, item.receipt_no].some((value) => value?.includes(needle)));
  }, [sheet, month, kind, donorType, query]);

  const donorNames = useMemo(() => [...new Set(sheet?.items.map((item) => item.donor_name) ?? [])], [sheet]);
  const stripMax = figures ? Math.max(...figures.cash, 1) : 1;

  return (
    <div className="yl bx aid">
      <div className="page-head exp-head yl-head">
        <span className="page-icon" aria-hidden><HandHeart size={24} /></span>
        <div><h1>المساعدات والتبرعات</h1></div>
        <div className="page-actions">
          <div className="yl-switch" role="group" aria-label="السنة">
            <button type="button" className="icon-btn" aria-label="السنة السابقة" onClick={() => setYear(year - 1)}><ChevronRight size={17} aria-hidden /></button>
            <strong><bdi>{year}</bdi></strong>
            <button type="button" className="icon-btn" aria-label="السنة التالية" disabled={year >= THIS_YEAR} onClick={() => setYear(year + 1)}><ChevronLeft size={17} aria-hidden /></button>
          </div>
          <button type="button" className="btn primary" aria-label="تسجيل تبرع" onClick={() => setDialog({ donation: null })} disabled={!sheet}>
            <Plus size={18} aria-hidden />
            <span className="btn-label">تسجيل تبرع</span>
          </button>
        </div>
      </div>

      {error && !sheet && <StateMessage kind="error" title="تعذّر تحميل التبرعات" hint={error} onRetry={load} />}
      {!sheet && !error && (
        <>
          <div className="yl-kpis" aria-busy="true">{[0, 1, 2, 3, 4].map((key) => <div key={key} className="yl-kpi skeleton" />)}</div>
          <div className="yl-panel skeleton yl-skel-panel" />
        </>
      )}

      {sheet && figures && (
        <>
          <section className="yl-kpis" aria-label="خلاصة التبرعات">
            <Card label="التبرعات المالية" icon={Banknote} tone="gift" value={formatNumber(figures.cash[focus])} unit={me.currency}
              foot={<><span className="yl-foot-label">{MONTH_NAMES[focus]}</span><DeltaPill value={change(figures.prevCash, figures.cash[focus])} /></>} />
            <Card label={`مجموع ${year}`} icon={Wallet} tone="in" value={formatNumber(figures.yearCash)} unit={me.currency}
              foot={<span className="yl-foot-label">تبرعات مالية فقط</span>} />
            <Card label="المساعدات العينية" icon={Package} tone="box" value={formatNumber(figures.yearGoods)}
              foot={<span className="yl-foot-label">{figures.topItem ? <>أكثرها: <b>{figures.topItem[0]}</b></> : `لا مساعدات عينية في ${year}`}</span>} />
            <Card label="المتبرعون" icon={Users} value={formatNumber(figures.donors)}
              foot={<span className="yl-foot-label"><bdi>{formatNumber(figures.internal)}</bdi> من داخل المؤسسة · <bdi>{formatNumber(figures.donors - figures.internal)}</bdi> من خارجها</span>} />
            <Card label="أكبر متبرع" icon={Crown} tone="gift" value={figures.top ? figures.top[0] : '—'}
              foot={<span className="yl-foot-label">{figures.top ? <><b><bdi>{formatNumber(figures.top[1].cash)}</bdi></b> {me.currency} · <bdi>{formatNumber(figures.top[1].count)}</bdi> تبرع</> : 'لا تبرعات بعد'}</span>} />
          </section>

          <section className="yl-panel" aria-labelledby="aid-months">
            <header className="yl-panel-head">
              <div>
                <h2 id="aid-months"><Banknote size={18} aria-hidden /> التبرعات المالية خلال <bdi>{year}</bdi></h2>
                <p>{month === null ? 'اضغط على شهر لعرض تبرعاته فقط' : <>يعرض الجدول {MONTH_NAMES[month]} فقط · <button type="button" className="aid-clear" onClick={() => setMonth(null)}>عرض السنة كلها</button></>}</p>
              </div>
            </header>
            <ol className="yl-months yl-strip aid-strip">
              {MONTH_NAMES.map((name, at) => {
                const future = isFuture(year, at);
                const body = (
                  <>
                    <span className="yl-month-name">{name}</span>
                    <span className="yl-month-sum">{future ? '—' : <bdi>{formatNumber(figures.cash[at])}</bdi>}</span>
                    <span className="yl-month-fill" aria-hidden><i style={{ inlineSize: `${future ? 0 : (figures.cash[at] / stripMax) * 100}%` }} /></span>
                  </>
                );
                return (
                  <li key={name}>
                    {future
                      ? <span className="yl-month is-future" aria-disabled="true">{body}</span>
                      : (
                        <button
                          type="button"
                          className={`yl-month${month === at ? ' is-now' : ''}`}
                          aria-pressed={month === at}
                          title={`${name}: ${formatNumber(figures.cash[at])} ${me.currency} · ${formatNumber(figures.goods[at])} مساعدة عينية`}
                          onClick={() => setMonth(month === at ? null : at)}
                        >
                          {body}
                        </button>
                      )}
                  </li>
                );
              })}
            </ol>
          </section>

          <section className="yl-panel" aria-labelledby="aid-table">
            <header className="yl-panel-head">
              <div>
                <h2 id="aid-table"><HandHeart size={18} aria-hidden /> سجل التبرعات {month !== null && <>— {MONTH_NAMES[month]}</>}</h2>
                <p><bdi>{formatNumber(rows.length)}</bdi> تبرع · اضغط على التبرع لتعديله</p>
              </div>
              <div className="bx-tools">
                <label className="bx-search">
                  <Search size={16} aria-hidden />
                  <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="بحث بالمتبرع أو المادة" aria-label="بحث" />
                </label>
                <SlideTabs<Kind>
                  items={[{ id: 'all', label: 'الكل' }, { id: 'cash', label: 'مالية', icon: Banknote }, { id: 'in_kind', label: 'عينية', icon: Package }]}
                  value={kind}
                  onChange={setKind}
                  label="نوع التبرع"
                />
                <SlideTabs<DonorType>
                  items={[{ id: 'all', label: 'كل المتبرعين' }, { id: 'internal', label: 'من الداخل' }, { id: 'external', label: 'من الخارج' }]}
                  value={donorType}
                  onChange={setDonorType}
                  label="صفة المتبرع"
                />
              </div>
            </header>

            {sheet.items.length === 0 ? (
              <div className="yl-chart-empty">
                <span aria-hidden><HandHeart size={26} /></span>
                <b>لا تبرعات مسجلة في <bdi>{year}</bdi></b>
                <p>سجّل أول تبرع مالي أو عيني وسيظهر هنا وفي كارت التبرعات.</p>
                <button type="button" className="btn primary" onClick={() => setDialog({ donation: null })}><Plus size={16} aria-hidden /> تسجيل تبرع</button>
              </div>
            ) : rows.length === 0 ? (
              <p className="exp-empty">لا تبرعات تطابق الاختيار.</p>
            ) : (
              <div className="yl-table-wrap">
                <table className="bx-table aid-table">
                  <thead>
                    <tr>
                      <th scope="col" className="bx-c-holder">المتبرع</th>
                      <th scope="col">النوع</th>
                      <th scope="col">التبرع</th>
                      <th scope="col" className="bx-c-amount">المبلغ / القيمة</th>
                      <th scope="col">الغرض</th>
                      <th scope="col">التاريخ</th>
                      <th scope="col">رقم الوصل</th>
                      <th scope="col" className="bx-c-actions">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} onClick={() => setDialog({ donation: row })}>
                        <th scope="row" className="bx-c-holder">
                          <span className="bx-holder">
                            <span className={`bx-avatar${row.donor_type === 'internal' ? ' is-delegate' : ''}`} aria-hidden>{row.donor_name.trim().charAt(0)}</span>
                            <span className="bx-holder-text">
                              <b>{row.donor_name}</b>
                              <small>
                                <span className={`bx-badge${row.donor_type === 'internal' ? '' : ' muted'}`}>{row.donor_type === 'internal' ? 'من داخل المؤسسة' : 'من خارج المؤسسة'}</span>
                                {row.donor_phone && <bdi dir="ltr">{row.donor_phone}</bdi>}
                              </small>
                            </span>
                          </span>
                        </th>
                        <td data-label="النوع"><span className={`aid-kind ${row.kind}`}>{row.kind === 'cash' ? <><Banknote size={13} aria-hidden /> مالي</> : <><Package size={13} aria-hidden /> عيني</>}</span></td>
                        <td data-label="التبرع" className="bx-c-work">
                          {row.kind === 'cash' ? 'مبلغ نقدي' : <>{row.item}{row.quantity ? <> · <bdi>{formatNumber(row.quantity)}</bdi> {row.unit}</> : null}</>}
                        </td>
                        <td data-label="المبلغ" className="bx-c-amount">{row.amount ? <bdi>{formatNumber(row.amount)}</bdi> : <span className="bx-none">—</span>}</td>
                        <td data-label="الغرض">{row.purpose ?? '—'}</td>
                        <td data-label="التاريخ"><bdi>{showDate(row.received_on)}</bdi></td>
                        <td data-label="رقم الوصل"><bdi>{row.receipt_no ?? '—'}</bdi></td>
                        <td className="bx-c-actions" onClick={(event) => event.stopPropagation()}>
                          <div className="bx-actions">
                            <button type="button" className="icon-btn" aria-label={`تعديل تبرع ${row.donor_name}`} onClick={() => setDialog({ donation: row })}>
                              <Pencil size={15} aria-hidden />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th scope="row" className="bx-c-holder">المجموع · <bdi>{formatNumber(rows.length)}</bdi> تبرع</th>
                      <td />
                      <td data-label="عينية"><bdi>{formatNumber(rows.filter((row) => row.kind === 'in_kind').length)}</bdi> عينية</td>
                      <td className="bx-c-amount" data-label="المبلغ"><bdi>{formatNumber(sum(rows.filter((row) => row.kind === 'cash').map((row) => row.amount ?? 0)))}</bdi></td>
                      <td />
                      <td />
                      <td />
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {dialog && (
        <DonationDialog
          donation={dialog.donation}
          donors={donorNames}
          currency={me.currency}
          onClose={() => setDialog(null)}
          onSaved={() => { setDialog(null); void load(); }}
        />
      )}
    </div>
  );
}

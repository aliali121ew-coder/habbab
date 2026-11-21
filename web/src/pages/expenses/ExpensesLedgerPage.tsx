import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight, CalendarRange, ChevronLeft, ChevronRight, Download, Receipt, Sheet, Trophy,
} from 'lucide-react';
import { api, type Me } from '../../api';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import { StateMessage } from '../../components/StateMessage';
import { MONTH_NAMES, formatNumber, formatPercent } from '../../format';
import { CATEGORIES, type ExpenseCategory } from './categories';

interface Ledger {
  year: number;
  cells: { month: number; category: ExpenseCategory; total: number; count: number }[];
}

type Unit = 'thousand' | 'full';

// The year's spending as one accounting sheet: the twelve months down the side, one column per
// heading that had spending that year (in the paper sheet's order). The figures carry no colour of
// their own, so the eye reads them as columns; the row and the column under the pointer light up
// together to follow one month or one heading, and the month's total keeps its change from the
// month before beside it.
export function ExpensesLedgerPage({ me }: { me: Me }) {
  const now = new Date();
  const thisYear = now.getUTCFullYear();
  const thisMonth = now.getUTCMonth();
  const [year, setYear] = useState(thisYear);
  const [ledger, setLedger] = useState<Ledger | null>(null);
  const [error, setError] = useState('');
  const [unit, setUnit] = useState<Unit>('thousand');
  const [column, setColumn] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      setLedger(await api<Ledger>(`/expenses/ledger?year=${year}`));
    } catch (failure) {
      setError((failure as Error).message);
    }
  }, [year]);

  useEffect(() => { setLedger(null); void load(); }, [load]);

  const grid = useMemo(() => {
    if (!ledger) return null;
    const byCategory = new Map<ExpenseCategory, number[]>();
    const counts = Array<number>(12).fill(0);
    ledger.cells.forEach((cell) => {
      const row = byCategory.get(cell.category) ?? Array<number>(12).fill(0);
      row[cell.month] += cell.total;
      byCategory.set(cell.category, row);
      counts[cell.month] += cell.count;
    });
    const columns = CATEGORIES
      .filter((item) => (byCategory.get(item.id) ?? []).some((value) => value > 0))
      .map((item) => {
        const values = byCategory.get(item.id)!;
        return { id: item.id, label: item.label, values, total: values.reduce((sum, value) => sum + value, 0) };
      });
    const monthTotals = Array.from({ length: 12 }, (_, month) => columns.reduce((sum, item) => sum + item.values[month], 0));
    const total = monthTotals.reduce((sum, value) => sum + value, 0);
    const activeMonths = monthTotals.filter((value) => value > 0).length;
    const peakMonth = monthTotals.indexOf(Math.max(...monthTotals));
    const top = [...columns].sort((a, b) => b.total - a.total)[0] ?? null;
    return { columns, monthTotals, counts, total, activeMonths, peakMonth, top };
  }, [ledger]);

  // Months after this one have not happened yet, so they stay blank rather than read as zero.
  const isFuture = (month: number) => year > thisYear || (year === thisYear && month > thisMonth);
  const change = (month: number): number | 'new' | null => {
    if (!grid || month === 0 || isFuture(month)) return null;
    const previous = grid.monthTotals[month - 1];
    const current = grid.monthTotals[month];
    if (previous === 0) return current > 0 ? 'new' : null;
    return ((current - previous) / previous) * 100;
  };
  const figure = (value: number) => formatNumber(unit === 'thousand' ? value / 1000 : value);
  const cell = (value: number) => (value > 0
    ? <bdi title={`${formatNumber(value)} ${me.currency}`}>{figure(value)}</bdi>
    : <span className="lg-zero" aria-label="لا صرف">–</span>);

  const exportCsv = () => {
    if (!grid) return;
    const head = ['الشهر', ...grid.columns.map((item) => item.label), 'المجموع'];
    const lines = MONTH_NAMES.map((name, month) => [name, ...grid.columns.map((item) => item.values[month]), grid.monthTotals[month]].join(','));
    lines.push(['المجموع', ...grid.columns.map((item) => item.total), grid.total].join(','));
    const blob = new Blob(['﻿', [head.join(','), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `سجل-الصرفيات-${year}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  // The column under the pointer, so the whole heading lights up with the row.
  const hoverProps = (id: string) => ({
    onPointerEnter: () => setColumn(id),
    className: column === id ? 'col-on' : undefined,
  });

  return (
    <>
      <div className="page-head exp-head">
        <span className="page-icon" aria-hidden><Sheet size={24} /></span>
        <div>
          <Breadcrumbs items={[{ label: 'الرئيسية', href: '#/' }, { label: 'الصرفيات', href: '#/expenses' }]} />
          <h1>سجل الصرفيات السنوي</h1>
        </div>
        <div className="page-actions">
          <div className="lg-year" role="group" aria-label="السنة">
            <button type="button" className="icon-btn" aria-label="السنة السابقة" onClick={() => setYear(year - 1)}>
              <ChevronRight size={17} aria-hidden />
            </button>
            <strong><bdi>{year}</bdi></strong>
            <button type="button" className="icon-btn" aria-label="السنة التالية" disabled={year >= thisYear} onClick={() => setYear(year + 1)}>
              <ChevronLeft size={17} aria-hidden />
            </button>
          </div>
          <button type="button" className="btn" aria-label="تصدير Excel" disabled={!grid?.columns.length} onClick={exportCsv}>
            <Download size={18} aria-hidden />
            <span className="btn-label">تصدير Excel</span>
          </button>
          <a className="btn" href="#/expenses" aria-label="رجوع إلى الصرفيات">
            <ArrowRight size={18} aria-hidden />
            <span className="btn-label">الصرفيات</span>
          </a>
        </div>
      </div>

      {error && !ledger && <StateMessage kind="error" title="تعذّر تحميل السجل" hint={error} onRetry={load} />}

      {!grid && !error && (
        <div className="stats exp-stats" aria-busy="true">{[0, 1, 2].map((key) => <div key={key} className="stat skeleton" />)}</div>
      )}

      {grid && (
        <>
          <section className="stats exp-stats" aria-label="خلاصة السنة">
            <article className="stat stat-money">
              <header><h2>صرفيات <bdi>{year}</bdi></h2><span className="stat-icon"><Receipt size={18} aria-hidden /></span></header>
              <p className="stat-value"><bdi>{formatNumber(grid.total)}</bdi> <small>{me.currency}</small></p>
              <dl className="stat-facts">
                <div><dt>أشهر فيها صرف</dt><dd><bdi>{formatNumber(grid.activeMonths)}</bdi></dd></div>
                <div><dt>متوسط الشهر</dt><dd><bdi>{grid.activeMonths ? formatNumber(Math.round(grid.total / grid.activeMonths)) : '—'}</bdi></dd></div>
              </dl>
            </article>
            <article className="stat">
              <header><h2>أعلى شهر</h2><span className="stat-icon"><CalendarRange size={18} aria-hidden /></span></header>
              <p className="stat-value exp-top-name">{grid.total > 0 ? MONTH_NAMES[grid.peakMonth] : '—'}</p>
              <dl className="stat-facts">
                <div><dt>المبلغ</dt><dd><bdi>{grid.total > 0 ? formatNumber(grid.monthTotals[grid.peakMonth]) : '—'}</bdi></dd></div>
                <div><dt>القيود</dt><dd><bdi>{grid.total > 0 ? formatNumber(grid.counts[grid.peakMonth]) : '—'}</bdi></dd></div>
              </dl>
            </article>
            <article className="stat">
              <header><h2>الأعلى استهلاكاً</h2><span className="stat-icon"><Trophy size={18} aria-hidden /></span></header>
              <p className="stat-value exp-top-name">{grid.top?.label ?? '—'}</p>
              <dl className="stat-facts">
                <div><dt>المبلغ</dt><dd><bdi>{grid.top ? formatNumber(grid.top.total) : '—'}</bdi></dd></div>
                <div><dt>من صرفيات السنة</dt><dd><bdi>{grid.top ? formatPercent((grid.top.total / grid.total) * 100) : '—'}</bdi></dd></div>
              </dl>
            </article>
          </section>

          <section className="register lg-board" aria-labelledby="lg-title">
            <header className="lg-head">
              <div>
                <h2 id="lg-title">الصرفيات الشهرية حسب نوع الصرف — <bdi>{year}</bdi></h2>
                <p>
                  {grid.columns.length
                    ? <>{formatNumber(grid.columns.length)} من {formatNumber(CATEGORIES.length)} نوع صرف فيها صرفيات · المبالغ {unit === 'thousand' ? <b>بالألف {me.currency}</b> : <b>بالـ{me.currency}</b>}</>
                    : 'لا صرفيات هذه السنة'}
                </p>
              </div>
              <div className="lg-unit" role="radiogroup" aria-label="وحدة المبالغ">
                <button type="button" role="radio" aria-checked={unit === 'thousand'} onClick={() => setUnit('thousand')}>بالألف</button>
                <button type="button" role="radio" aria-checked={unit === 'full'} onClick={() => setUnit('full')}>المبلغ كاملاً</button>
              </div>
            </header>

            {grid.columns.length === 0 ? (
              <p className="exp-empty">لا صرفيات مسجلة في سنة <bdi>{year}</bdi>.</p>
            ) : (
              <div className="lg-wrap">
                <table
                  className={`lg-table${unit === 'full' ? ' wide' : ''}`}
                  // Fixed widths: the month, one equal column per heading, the total. A short year fills
                  // the card; a full one scrolls sideways with the month and the total held in place.
                  style={{ minWidth: 150 + grid.columns.length * (unit === 'full' ? 118 : 96) + 168 }}
                  onPointerLeave={() => setColumn(null)}
                >
                  <colgroup>
                    <col className="lg-c-month" />
                    {grid.columns.map((item) => <col key={item.id} className="lg-c-cat" />)}
                    <col className="lg-c-total" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th scope="col" className="lg-month">الشهر</th>
                      {grid.columns.map((item) => (
                        <th key={item.id} scope="col" title={item.label} {...hoverProps(item.id)}>
                          <span className="lg-label">{item.label}</span>
                        </th>
                      ))}
                      <th scope="col" className="lg-total">المجموع</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MONTH_NAMES.map((name, month) => {
                      const future = isFuture(month);
                      const delta = change(month);
                      return (
                        <tr key={name} className={future ? 'future' : undefined}>
                          <th scope="row" className="lg-month">
                            <span className="lg-num"><bdi>{month + 1}</bdi></span>{name}
                          </th>
                          {grid.columns.map((item) => (
                            <td key={item.id} {...hoverProps(item.id)}>{future ? null : cell(item.values[month])}</td>
                          ))}
                          <td className="lg-total">
                            {!future && (
                              <div className="lg-tot">
                                <bdi className="lg-sum" title={`${formatNumber(grid.monthTotals[month])} ${me.currency}`}>
                                  {grid.monthTotals[month] > 0 ? figure(grid.monthTotals[month]) : '–'}
                                </bdi>
                                {delta !== null && (
                                  <small
                                    className={`lg-delta${delta === 'new' ? '' : delta > 0 ? ' up' : delta < 0 ? ' down' : ''}`}
                                    title="عن الشهر السابق"
                                  >
                                    {delta === 'new' ? 'جديد' : <><span aria-hidden>{delta > 0 ? '▲' : delta < 0 ? '▼' : ''}</span><bdi>{formatPercent(Math.abs(delta))}</bdi></>}
                                  </small>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th scope="row" className="lg-month">مجموع السنة</th>
                      {grid.columns.map((item) => <td key={item.id} {...hoverProps(item.id)}><bdi title={`${formatNumber(item.total)} ${me.currency}`}>{figure(item.total)}</bdi></td>)}
                      <td className="lg-total"><div className="lg-tot"><bdi className="lg-sum">{figure(grid.total)}</bdi></div></td>
                    </tr>
                    <tr className="lg-share">
                      <th scope="row" className="lg-month">النسبة من السنة</th>
                      {grid.columns.map((item) => <td key={item.id} {...hoverProps(item.id)}><bdi>{formatPercent((item.total / grid.total) * 100)}</bdi></td>)}
                      <td className="lg-total"><div className="lg-tot"><bdi className="lg-sum">100%</bdi></div></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}

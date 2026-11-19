import { memo, useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Printer, Search } from 'lucide-react';
import { api, type GridRow, type Me, type Overview, type Page } from '../../api';
import { StateMessage } from '../../components/StateMessage';
import { formatNumber, initialOf, today } from '../../format';
import {
  SubscriberModal,
  formatDateSlash,
  formatUnpaidSummary,
  getUnpaidMonths,
  isOverdueFourMonths,
} from './SubscriberModal';
import { PrintSheetModal } from './PrintSheetModal';
import { WhatsAppButton } from './WhatsAppButton';
import { useIsPhone } from '../../useIsPhone';

const ROWS_PER_PAGE = 10;

type PayFilter = 'all' | 'unpaid' | 'overdue' | 'paid';

interface RowProps {
  row: GridRow;
  year: number;
  currentMonth: number | null;
  currency: string;
  delegateName?: string | null;
  onSelectRow: (row: GridRow) => void;
  onPrintRow: (row: GridRow) => void;
  // WhatsApp receipts are sent by the administration only.
  canMessage: boolean;
}

const Row = memo(function Row({ row, year, currentMonth, currency, delegateName, onSelectRow, onPrintRow, canMessage }: RowProps) {
  const unpaid = formatUnpaidSummary(row.paid_mask, currentMonth);
  const lastDate = formatDateSlash(row.last_paid_date);

  const handlePrint = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onPrintRow(row);
  };

  return (
    <tr
      className="reg-row-interactive"
      tabIndex={0}
      aria-label={`عرض تفاصيل المشترك ${row.full_name}`}
      onClick={() => onSelectRow(row)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelectRow(row);
        }
      }}
    >
      <th scope="row" className="reg-name">
        <div className="sub-cell">
          <span className="sub-avatar" aria-hidden>{initialOf(row.full_name)}</span>
          <strong className="sub-name">{row.full_name}</strong>
        </div>
      </th>

      <td className="reg-col-tier" data-label="فئة الاشتراك">
        <span className="tier-badge"><bdi>{formatNumber(row.monthly_fee)}</bdi></span>
      </td>

      <td className="reg-col-unpaid" data-label="الأشهر غير المسددة" title={unpaid.detail}>
        <span className={`unpaid-text ${unpaid.count === 0 ? 'clean' : 'has-unpaid'}`}>
          <bdi>{unpaid.text}</bdi>
        </span>
      </td>

      <td className="reg-col-date" data-label="آخر تسديد بتاريخ">
        <span className={`last-paid-date${row.last_paid_date ? '' : ' none'}`}>
          <bdi>{lastDate}</bdi>
        </span>
      </td>

      <td className="reg-col-action" onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          className="print-row-btn"
          title={`طباعة كشف ${row.full_name}`}
          aria-label={`طباعة كشف ${row.full_name}`}
          onClick={handlePrint}
        >
          <Printer size={15} aria-hidden />
          <span>طباعة</span>
        </button>
        {canMessage && <WhatsAppButton row={row} year={year} currentMonth={currentMonth} currency={currency} delegateName={delegateName} />}
      </td>
    </tr>
  );
});

interface Props {
  me: Me;
  year: number;
  selectedMonth: number;
  onSelectMonth: (month: number) => void;
  delegateId: number | null;
  onSelectDelegate: (id: number | null) => void;
  overview: Overview | null;
  onPaymentChanged: () => void;
  // The living or deceased list; kept by the page so printing follows it.
  status: 'alive' | 'deceased';
  onStatusChange: (status: 'alive' | 'deceased') => void;
  /** Phone preview: only this many rows, no filters or pages, and a button to the full list. */
  limit?: number;
  onShowMore?: () => void;
  /** Set from outside (the full-list page's cards); the register's own buttons follow it. */
  filter?: PayFilter;
  onFilterChange?: (filter: PayFilter) => void;
}

export type { PayFilter };

export function Register({
  me,
  year,
  selectedMonth,
  delegateId,
  onSelectDelegate,
  overview,
  onPaymentChanged,
  status,
  onStatusChange: setStatus,
  limit,
  onShowMore,
  filter,
  onFilterChange,
}: Props) {
  const [ownFilter, setOwnFilter] = useState<PayFilter>('all');
  const payFilter = filter ?? ownFilter;
  const setPayFilter = (value: PayFilter) => (onFilterChange ? onFilterChange(value) : setOwnFilter(value));
  const preview = limit !== undefined;
  const isPhone = useIsPhone();
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<GridRow[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'more' | 'error'>('loading');
  const [error, setError] = useState('');
  const [selectedRowId, setSelectedRowId] = useState<number | null>(null);
  const [printRow, setPrintRow] = useState<GridRow | null>(null);
  const [attempt, setAttempt] = useState(0);

  const now = new Date();
  const currentMonth = year === now.getUTCFullYear() ? now.getUTCMonth() : year > now.getUTCFullYear() ? -1 : null;

  const delegateMap = useMemo(() => {
    const map = new Map<number, string>();
    if (overview?.delegate) map.set(overview.delegate.id, overview.delegate.full_name);
    overview?.delegates.forEach((d) => map.set(d.id, d.full_name));
    return map;
  }, [overview]);

  // Debounced, and short input simply shows the normal list.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(input.trim().length >= 3 ? input.trim() : ''), 350);
    return () => clearTimeout(timer);
  }, [input]);

  const effectiveMonth = currentMonth !== null ? currentMonth : selectedMonth;

  const fetchPage = useCallback((cursor: number | null, signal?: AbortSignal) => {
    if (query) {
      return api<Page<GridRow>>('/collections/search', {
        method: 'POST',
        body: { q: query, year, status, delegate_id: delegateId },
        signal,
      });
    }
    const params = new URLSearchParams({ year: String(year), status });
    if (cursor) params.set('cursor', String(cursor));
    if (delegateId !== null) params.set('delegate', String(delegateId));
    if (payFilter !== 'all') {
      params.set('pay_state', payFilter);
      params.set('month', String(effectiveMonth));
    }
    return api<Page<GridRow>>(`/collections/grid?${params}`, { signal });
  }, [query, year, status, delegateId, payFilter, effectiveMonth]);

  useEffect(() => {
    const controller = new AbortController();
    setPhase('loading');
    setError('');
    setPageIndex(0);
    fetchPage(null, controller.signal)
      .then((page) => {
        setRows(page.items);
        setNext(page.next);
        setPhase('ready');
      })
      .catch((failure) => {
        if ((failure as Error).name === 'AbortError') return;
        setError((failure as Error).message);
        setPhase('error');
      });
    return () => controller.abort();
  }, [fetchPage, attempt]);

  const filteredRows = useMemo(() => {
    const base = rows.filter((row) => {
      if (payFilter === 'all') return true;
      const unpaidCount = getUnpaidMonths(row.paid_mask, effectiveMonth).length;
      if (payFilter === 'paid') return unpaidCount === 0;
      if (payFilter === 'unpaid') return unpaidCount >= 1;
      if (payFilter === 'overdue') return isOverdueFourMonths(row.paid_mask, effectiveMonth);
      return true;
    });
    return [...base].sort((a, b) => a.full_name.localeCompare(b.full_name, 'ar'));
  }, [rows, payFilter, effectiveMonth]);

  const loadedPages = Math.max(1, Math.ceil(filteredRows.length / ROWS_PER_PAGE));
  const totalCount = status === 'alive' ? overview?.alive : overview?.deceased;
  const totalPages = useMemo(() => {
    if (!query && payFilter === 'all' && totalCount && totalCount > 0) {
      return Math.max(loadedPages, Math.ceil(totalCount / ROWS_PER_PAGE));
    }
    return next !== null ? loadedPages + 1 : loadedPages;
  }, [query, payFilter, totalCount, loadedPages, next]);

  const safePage = Math.min(pageIndex, Math.max(0, loadedPages - 1));
  const pageRows = useMemo(
    () => (limit !== undefined ? filteredRows.slice(0, limit) : filteredRows.slice(safePage * ROWS_PER_PAGE, (safePage + 1) * ROWS_PER_PAGE)),
    [filteredRows, safePage, limit],
  );
  // How many are behind "عرض المزيد": the whole list's count when known, else what has loaded.
  const hiddenCount = Math.max(0, (totalCount ?? filteredRows.length) - pageRows.length);

  const goToPage = useCallback((targetPage: number) => {
    if (targetPage < 0) return;
    if (targetPage < loadedPages) {
      setPageIndex(targetPage);
      return;
    }
    if (next === null || phase !== 'ready') return;
    setPhase('more');
    fetchPage(next)
      .then((page) => {
        setRows((current) => [...current, ...page.items]);
        setNext(page.next);
        setPhase('ready');
        setPageIndex(targetPage);
      })
      .catch((failure) => {
        setError((failure as Error).message);
        setPhase('error');
      });
  }, [loadedPages, next, phase, fetchPage]);

  const applyPayment = useCallback((subscriberId: number, month: number, paid: boolean) => {
    const bit = 1 << month;
    setRows((current) => current.map((row) => {
      if (row.id !== subscriberId) return row;
      const newMask = paid ? row.paid_mask | bit : row.paid_mask & ~bit;
      return {
        ...row,
        paid_mask: newMask,
        last_paid_date: paid ? today() : row.last_paid_date,
      };
    }));
    onPaymentChanged();
  }, [onPaymentChanged]);

  const selectedRow = useMemo(
    () => (selectedRowId === null ? null : rows.find((r) => r.id === selectedRowId) ?? null),
    [rows, selectedRowId],
  );

  const selectedDelegateName = delegateId !== null
    ? (overview?.delegate?.full_name ?? overview?.delegates.find((d) => d.id === delegateId)?.full_name ?? null)
    : null;

  const pageButtons = useMemo(() => {
    const maxVisible = Math.min(totalPages, next !== null ? loadedPages + 1 : loadedPages);
    const start = Math.max(0, Math.min(safePage - 2, maxVisible - 5));
    const end = Math.min(maxVisible, start + 5);
    const list: number[] = [];
    for (let i = start; i < end; i++) list.push(i);
    return list;
  }, [safePage, totalPages, loadedPages, next]);

  return (
    <section className="register" aria-label="سجل المشتركين">
      <header className="register-head">
        <div className="register-title">
          <h2>
            سجل المشتركين <bdi>{year}</bdi>
            {selectedDelegateName && <> — {selectedDelegateName}</>}
          </h2>
        </div>

        {/* Phone: one row — a sliding alive/deceased pill, the pay filter as a dropdown, search. */}
        {isPhone && !preview ? (
          <div className="reg-bar">
            <div className="reg-pill" role="group" aria-label="حالة المشترك" data-on={status}>
              <span className="reg-pill-thumb" aria-hidden />
              <button type="button" aria-pressed={status === 'alive'} onClick={() => setStatus('alive')}>أحياء</button>
              <button type="button" aria-pressed={status === 'deceased'} onClick={() => setStatus('deceased')}>أموات</button>
            </div>
            <label className="reg-select">
              <select value={payFilter} onChange={(event) => setPayFilter(event.target.value as PayFilter)} aria-label="فلتر حالة التسديد">
                <option value="all">الكل</option>
                <option value="unpaid">غير مسدد</option>
                <option value="overdue">المتأخرون</option>
                <option value="paid">مسدد</option>
              </select>
              <ChevronDown size={15} aria-hidden />
            </label>
            <label className="reg-search">
              <Search size={16} aria-hidden />
              <input
                type="search"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="بحث…"
                aria-label="بحث ببداية الاسم أو الهاتف، 3 أحرف على الأقل"
                autoComplete="off"
              />
            </label>
          </div>
        ) : (
        <div className="seg" role="group" aria-label="حالة المشترك">
          <button type="button" aria-pressed={status === 'alive'} onClick={() => setStatus('alive')}>
            أحياء
          </button>
          <button type="button" aria-pressed={status === 'deceased'} onClick={() => setStatus('deceased')}>
            أموات
          </button>
        </div>
        )}

        {!preview && !isPhone && <div className="register-filters">
          <div className="seg filter-seg" role="group" aria-label="فلتر حالة التسديد">
            <button type="button" aria-pressed={payFilter === 'all'} onClick={() => setPayFilter('all')}>الكل</button>
            <button type="button" aria-pressed={payFilter === 'unpaid'} onClick={() => setPayFilter('unpaid')}>
              غير مسدد
            </button>
            <button type="button" aria-pressed={payFilter === 'overdue'} onClick={() => setPayFilter('overdue')}>
              المتأخرون
            </button>
            <button type="button" aria-pressed={payFilter === 'paid'} onClick={() => setPayFilter('paid')}>
              مسدد
            </button>
          </div>

          <label className="search">
            <Search size={18} aria-hidden />
            <input
              type="search"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="بحث باسم المشترك…"
              aria-label="بحث ببداية الاسم أو الهاتف، 3 أحرف على الأقل"
              autoComplete="off"
            />
          </label>
        </div>}
      </header>

      {phase === 'loading' && <div className="reg-loading" aria-busy="true">{[0, 1, 2, 3, 4].map((key) => <div key={key} className="skeleton" />)}</div>}
      {phase === 'error' && filteredRows.length === 0 && (
        <StateMessage kind="error" title="تعذّر تحميل السجل" hint={error} onRetry={() => setAttempt((value) => value + 1)} />
      )}
      {phase !== 'loading' && phase !== 'error' && filteredRows.length === 0 && (
        <StateMessage kind="empty" title="لا توجد سجلات مطابقة" hint={query || payFilter !== 'all' ? 'جرّب تغيير البحث أو الفلتر' : 'أضف أول مشترك من الزر أعلاه'} />
      )}

      {phase !== 'loading' && pageRows.length > 0 && (
        <table className="reg-table reg-table-clean">
          <thead>
            <tr>
              <th scope="col" className="reg-name">اسم المشترك</th>
              <th scope="col" className="reg-col-tier">فئة الاشتراك</th>
              <th scope="col" className="reg-col-unpaid">الأشهر غير المسددة</th>
              <th scope="col" className="reg-col-date">آخر تسديد بتاريخ</th>
              <th scope="col" className="reg-col-action">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => (
              <Row
                key={row.id}
                row={row}
                year={year}
                currentMonth={currentMonth}
                currency={me.currency}
                delegateName={row.delegate_id ? (delegateMap.get(row.delegate_id) ?? selectedDelegateName) : selectedDelegateName}
                onSelectRow={(picked) => setSelectedRowId(picked.id)}
                onPrintRow={(picked) => setPrintRow(picked)}
                canMessage={me.role === 'admin'}
              />
            ))}
          </tbody>
        </table>
      )}

      {phase === 'error' && filteredRows.length > 0 && (
        <StateMessage kind="error" title="تعذّر تحميل الصفحة التالية" hint={error} onRetry={() => setPhase('ready')} />
      )}

      {preview && phase !== 'loading' && onShowMore && (hiddenCount > 0 || next !== null) && (
        <button type="button" className="reg-more" onClick={onShowMore}>
          عرض المزيد
          {hiddenCount > 0 && <span>(<bdi>{formatNumber(hiddenCount)}</bdi>)</span>}
          <ChevronLeft size={16} aria-hidden />
        </button>
      )}

      {!preview && phase !== 'loading' && filteredRows.length > 0 && totalPages > 1 && (
        <nav className="reg-pager" aria-label="ترقيم صفحات السجل">
          <button
            type="button"
            className="pager-btn"
            disabled={safePage === 0 || phase === 'more'}
            onClick={() => goToPage(safePage - 1)}
          >
            <ChevronRight size={16} aria-hidden />
            السابق
          </button>

          <div className="pager-pages">
            {pageButtons.map((p) => (
              <button
                key={p}
                type="button"
                className={`pager-num${p === safePage ? ' active' : ''}`}
                aria-current={p === safePage ? 'page' : undefined}
                disabled={phase === 'more'}
                onClick={() => goToPage(p)}
              >
                <bdi>{p + 1}</bdi>
              </button>
            ))}
          </div>

          <button
            type="button"
            className="pager-btn"
            disabled={(safePage >= loadedPages - 1 && next === null) || phase === 'more'}
            onClick={() => goToPage(safePage + 1)}
          >
            {phase === 'more' ? 'جارٍ التحميل…' : 'التالي'}
            <ChevronLeft size={16} aria-hidden />
          </button>
        </nav>
      )}

      {selectedRow && (
        <SubscriberModal
          me={me}
          year={year}
          row={selectedRow}
          currentMonth={currentMonth}
          delegateName={selectedRow.delegate_id ? (delegateMap.get(selectedRow.delegate_id) ?? selectedDelegateName) : selectedDelegateName}
          onClose={() => {
            setSelectedRowId(null);
            // A subscriber moved to another delegate leaves this delegate's register once closed.
            if (delegateId !== null) setRows((current) => current.filter((item) => item.delegate_id === delegateId));
          }}
          onPaymentChanged={applyPayment}
          onRowChanged={(subscriberId, patch) => {
            setRows((current) => current.map((item) => (item.id === subscriberId ? { ...item, ...patch } : item)));
            // Moving a subscriber changes both delegates' figures.
            if ('delegate_id' in patch) onPaymentChanged();
          }}
          delegates={overview?.delegates ?? []}
        />
      )}

      {printRow && (
        <PrintSheetModal
          row={printRow}
          year={year}
          currentMonth={currentMonth}
          currency={me.currency}
          delegateName={printRow.delegate_id ? (delegateMap.get(printRow.delegate_id) ?? selectedDelegateName) : selectedDelegateName}
          onClose={() => setPrintRow(null)}
        />
      )}
    </section>
  );
}

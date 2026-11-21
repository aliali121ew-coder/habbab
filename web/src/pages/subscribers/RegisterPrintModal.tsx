import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X } from 'lucide-react';
import { api, type PrintRow } from '../../api';
import { MONTH_NAMES, formatNumber, isPaid, today } from '../../format';
import { FoundationStamp } from './FoundationStamp';
import { FrameCorner } from './PrintSheetModal';
import { SendPdfButton, WhatsAppMark } from './WhatsAppButton';
import { buildRegisterPdf } from './registerPdf';

// Rows per A4 landscape sheet: the first carries the letterhead and summary, the last
// the totals and the approval, so both hold fewer than the sheets in between.
const FIRST_ROWS = 15;
const MIDDLE_ROWS = 18;
const LAST_ROWS = 11;
// A sheet carrying both the letterhead and the closing (a short register) holds only this many.
const SINGLE_ROWS = 8;
const MONTHS = Array.from({ length: 12 }, (_, index) => index);

type Cell = 'paid' | 'late' | 'future';

interface Line {
  no: number;
  row: PrintRow;
  cells: Cell[];
  unpaid: number;
  due: number;
}

interface Page {
  // The first sheet carries the letterhead and summary; the last the totals and approval.
  head: boolean;
  close: boolean;
  lines: Line[];
}

interface Props {
  year: number;
  // Index of the last month that counts as due; -1 when the whole year is still ahead.
  cutoff: number;
  status: 'alive' | 'deceased';
  delegateId: number | null;
  delegateName: string;
  currency: string;
  // Shows «إرسال للمندوب» beside the print button; it sends only from one delegate's register.
  canSend?: boolean;
  onClose: () => void;
}

// 2026-01-05 → 2026-1-5, the style the printed register uses.
const plainDate = (iso: string) => iso.slice(0, 10).split('-').map(Number).join('-');

// Sheet by sheet: each is filled to the full before the next begins, and the totals and the
// signatures follow the last row: on its sheet when there is room left, else on the next one.
function paginate(lines: Line[]): Page[] {
  const pages: Page[] = [];
  let at = 0;
  for (;;) {
    const head = pages.length === 0;
    const left = lines.length - at;
    const roomWithClose = head ? SINGLE_ROWS : LAST_ROWS;
    if (left <= roomWithClose) {
      pages.push({ head, close: true, lines: lines.slice(at) });
      return pages;
    }
    const take = Math.min(left, head ? FIRST_ROWS : MIDDLE_ROWS);
    pages.push({ head, close: false, lines: lines.slice(at, at + take) });
    at += take;
  }
}

export function Divider() {
  return (
    <div className="reg-divider" aria-hidden>
      <span />
      <svg viewBox="0 0 96 20" width="96" height="20">
        <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <path d="M40 10C34 3 26 3 24 9C23 13 28 15 30 12" />
          <path d="M56 10C62 3 70 3 72 9C73 13 68 15 66 12" />
          <path d="M24 9C18 11 10 11 3 10" />
          <path d="M72 9C78 11 86 11 93 10" />
        </g>
        <path d="M48 2L55 10L48 18L41 10Z" fill="currentColor" />
        <circle cx="48" cy="10" r="2.2" fill="#fffefc" />
      </svg>
      <span />
    </div>
  );
}

export function Frame() {
  return (
    <>
      <span className="sheet-rule top" />
      <span className="sheet-rule right" />
      <span className="sheet-rule bottom" />
      <span className="sheet-rule left" />
      <FrameCorner side="top-right" />
      <FrameCorner side="top-left" />
      <FrameCorner side="bottom-right" />
      <FrameCorner side="bottom-left" />
    </>
  );
}

function Figures({ items, className }: { items: { title: string; value: string; strong?: boolean }[]; className: string }) {
  return (
    <dl className={className}>
      {items.map((item) => (
        <div key={item.title} className={item.strong ? 'strong' : undefined}>
          <dt>{item.title}</dt>
          <dd><bdi>{item.value}</bdi></dd>
        </div>
      ))}
    </dl>
  );
}

export type RegisterReport = ReturnType<typeof buildRegister>;

// The sums and pages of one register, from the rows the print endpoint returns.
export function buildRegister(rows: PrintRow[], cutoff: number, currency: string) {
  const elapsed = cutoff + 1;
  const lines: Line[] = rows.map((row, index) => {
    const cells = MONTHS.map((month): Cell => (isPaid(row.paid_mask, month) ? 'paid' : month <= cutoff ? 'late' : 'future'));
    return { no: index + 1, row, cells, unpaid: cells.filter((cell) => cell === 'late').length, due: row.monthly_fee * elapsed };
  });
  const fees = new Set(rows.map((row) => row.monthly_fee));
  const full = lines.filter((line) => line.unpaid === 0).length;
  const dueCells = lines.length * elapsed;
  const paidCells = lines.reduce((sum, line) => sum + line.cells.slice(0, elapsed).filter((cell) => cell === 'paid').length, 0);
  const collected = rows.reduce((sum, row) => sum + row.paid_total, 0);
  const due = lines.reduce((sum, line) => sum + line.due, 0);
  const remaining = lines.reduce((sum, line) => sum + Math.max(0, line.due - line.row.paid_total), 0);
  const money = (value: number) => `${formatNumber(value)} ${currency}`;
  return {
    pages: paginate(lines),
    category: fees.size === 1 ? money([...fees][0]) : fees.size ? 'متعددة' : '—',
    summary: [
      { title: 'عدد المشتركين', value: formatNumber(lines.length) },
      { title: 'التسديد الكامل', value: formatNumber(full) },
      { title: 'لم يسدد كاملاً', value: formatNumber(lines.length - full) },
      { title: 'متأخرون 4 أشهر فأكثر', value: formatNumber(lines.filter((line) => line.unpaid >= 4).length) },
      { title: 'نسبة التسديد', value: dueCells ? `${Math.round((paidCells / dueCells) * 100)}%` : '—' },
      { title: cutoff >= 0 && cutoff < 11 ? `المحصّل حتى ${MONTH_NAMES[cutoff]}` : 'المحصّل خلال السنة', value: money(collected), strong: true },
    ],
    totals: [
      { title: elapsed ? `إجمالي المستحق حتى ${MONTH_NAMES[cutoff]}` : 'إجمالي المستحق', value: money(due) },
      { title: 'إجمالي المسدد', value: money(collected), strong: true },
      { title: 'الرصيد المتبقي', value: money(remaining) },
      { title: 'مشتركون عليهم متأخرات', value: formatNumber(lines.length - full) },
    ],
  };
}

interface SheetsProps {
  report: RegisterReport;
  year: number;
  cutoff: number;
  status: 'alive' | 'deceased';
  delegateName: string;
}

// Every A4 landscape page of the register: shown in the print dialog, and sent as a PDF.
export function RegisterSheets({ report, year, cutoff, status, delegateName }: SheetsProps) {
  const title = status === 'deceased' ? 'سجل تسديد المشتركين المتوفين' : 'سجل تسديد المشتركين';
  const untilMonth = cutoff >= 0 ? `${MONTH_NAMES[cutoff]} ${year}` : `بداية ${year}`;
  const issued = plainDate(today());

  const head = (
    <tr>
      <th scope="col" className="col-no">ت</th>
      <th scope="col" className="col-name">اسم المشترك</th>
      {MONTHS.map((month) => <th key={month} scope="col" className={month === cutoff ? 'now' : undefined}>{month + 1}</th>)}
      <th scope="col" className="col-date">آخر تسديد</th>
      <th scope="col" className="col-amount">المبلغ</th>
    </tr>
  );

  return (
    <>
      {report.pages.map((page, index) => (
        <section key={index} className="reg-sheet" aria-label={`الصفحة ${index + 1}`}>
          <Frame />
          <div className="reg-page">
            {page.head ? (
              <>
                <header className="reg-head">
                  <div className="reg-org">
                    <img src="/logo.jpg" alt="شعار مؤسسة أحباب الحسين الثقافية الخيرية" />
                    <div>
                      <strong>مؤسسة أحباب الحسين الثقافية الخيرية</strong>
                      <span>بابل - قضاء الهاشمية - حي الزهراء</span>
                      <bdi dir="ltr">07808337805 - 0760107408</bdi>
                    </div>
                  </div>
                  <div className="reg-title">
                    <h2>{title}</h2>
                    <p>المندوب: <b>{delegateName}</b> · لغاية شهر <b>{untilMonth}</b></p>
                  </div>
                  <dl className="reg-meta">
                    <div><dt>الفئة:</dt><dd>{report.category}</dd></div>
                    <div><dt>تاريخ الإصدار:</dt><dd><bdi dir="ltr">{issued}</bdi></dd></div>
                  </dl>
                </header>
                <Divider />
                <Figures items={report.summary} className="reg-figures six" />
              </>
            ) : (
              <>
                <header className="reg-head compact">
                  <div className="reg-org">
                    <img src="/logo.jpg" alt="" />
                    <strong>{title}</strong>
                  </div>
                  <p>المندوب: <b>{delegateName}</b> · لغاية شهر <b>{untilMonth}</b></p>
                </header>
                <Divider />
              </>
            )}

            <table className="reg-print-table">
              <thead>{head}</thead>
              <tbody>
                {page.lines.map((line) => (
                  <tr key={line.row.id}>
                    <td className="col-no"><bdi>{line.no}</bdi></td>
                    <th scope="row" className="col-name">{line.row.full_name}</th>
                    {line.cells.map((cell, month) => (
                      <td key={month} className={month === cutoff ? `m ${cell} now` : `m ${cell}`}>
                        <span className="mark" aria-label={cell === 'paid' ? 'مسدد' : cell === 'late' ? 'متأخر' : 'لم يحن بعد'} />
                      </td>
                    ))}
                    <td className="col-date"><bdi dir="ltr">{line.row.last_paid ? plainDate(line.row.last_paid) : '—'}</bdi></td>
                    <td className="col-amount"><bdi>{formatNumber(line.row.paid_total)}</bdi></td>
                  </tr>
                ))}
              </tbody>
            </table>

            {page.close && (
              <>
                <Figures items={report.totals} className="reg-figures four" />
                <div className="reg-approval">
                  <section>
                    <h4>المحاسب</h4>
                    <p>صباح محمد العيساوي</p>
                    <span className="reg-sig"><img src="/signature.png" alt="توقيع المحاسب" /></span>
                    <span className="line" />
                    <small>التوقيع</small>
                  </section>
                  <FoundationStamp />
                  <section>
                    <h4>مدير المؤسسة</h4>
                    <p>سماحة السيد علي كاظم داود الشريفي</p>
                    <span className="reg-sig"><img src="/signature-manager.png" alt="توقيع المدير" /></span>
                    <span className="line" />
                    <small>التوقيع</small>
                  </section>
                </div>
              </>
            )}

            <footer className="reg-foot">
              <span>مؤسسة أحباب الحسين الثقافية الخيرية</span>
              <span>{page.close ? 'بابل - قضاء الهاشمية - حي الزهراء' : 'يتبع في الصفحة التالية'}</span>
            </footer>
          </div>
        </section>
      ))}
    </>
  );
}

// A delegate who covers several areas gets each area's register on its own sheets,
// titled "delegate – area". Rows arrive sorted by area, so groups are contiguous.
function groupByArea(rows: PrintRow[]) {
  const groups: { area: string | null; rows: PrintRow[] }[] = [];
  for (const row of rows) {
    const area = row.area?.trim() || null;
    const last = groups[groups.length - 1];
    if (last && last.area === area) last.rows.push(row);
    else groups.push({ area, rows: [row] });
  }
  return groups;
}

export function buildRegisterGroups(rows: PrintRow[], cutoff: number, currency: string, delegateName: string) {
  return groupByArea(rows).map((group) => ({
    key: group.area ?? '',
    name: group.area ? `${delegateName} – ${group.area}` : delegateName,
    report: buildRegister(group.rows, cutoff, currency),
  }));
}

export function RegisterPrintModal({ year, cutoff, status, delegateId, delegateName, currency, canSend = false, onClose }: Props) {
  const [rows, setRows] = useState<PrintRow[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ year: String(year), until: String(cutoff), status });
    if (delegateId !== null) query.set('delegate', String(delegateId));
    api<{ items: PrintRow[] }>(`/collections/print?${query}`, { signal: controller.signal })
      .then((page) => setRows(page.items))
      .catch((failure) => { if (failure.name !== 'AbortError') setError(failure.message); });
    return () => controller.abort();
  }, [year, cutoff, status, delegateId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Grouped by area only for one delegate; the all-delegates register stays one list.
  const groups = useMemo(() => {
    if (!rows) return null;
    if (delegateId === null) return [{ key: '', name: delegateName, report: buildRegister(rows, cutoff, currency) }];
    return buildRegisterGroups(rows, cutoff, currency, delegateName);
  }, [rows, cutoff, currency, delegateId, delegateName]);
  const report = groups ? { pages: groups.flatMap((group) => group.report.pages) } : null;

  return createPortal(
    <div className="print-modal-overlay" role="dialog" aria-modal="true" aria-label={`طباعة سجل ${delegateName}`}>
      <div className="print-modal-container reg-print">
        <header className="print-modal-toolbar">
          <div className="pmt-head">
            <div className="pmt-title">
              <strong>{status === 'deceased' ? 'طباعة سجل المتوفين' : 'طباعة سجل المشتركين'}</strong>
              <span>
                {delegateName} • سنة {year}
                {report && <> • المشتركون: <bdi>{formatNumber(rows?.length ?? 0)}</bdi> • الصفحات: <bdi>{formatNumber(report.pages.length)}</bdi></>}
              </span>
            </div>
            <button type="button" className="icon-btn print-close-btn" aria-label="إغلاق" onClick={onClose}>
              <X size={20} aria-hidden />
            </button>
          </div>
          <div className="pmt-actions">
            <button type="button" className="btn primary print-trigger-btn" disabled={!report} onClick={() => window.print()}>
              <Printer size={17} aria-hidden />
              <span>طباعة السجل</span>
            </button>
            {canSend && delegateId === null && (
              <button type="button" className="btn whatsapp-btn" disabled title="افتح سجل مندوب واحد لإرسال سجله إليه">
                <WhatsAppMark />
                <span className="btn-label">إرسال للمندوب</span>
              </button>
            )}
            {canSend && delegateId !== null && (
              <SendPdfButton
                className="btn whatsapp-btn"
                cacheKey={`${delegateId}-${year}-${cutoff}-${status}`}
                label="إرسال للمندوب"
                title={`إرسال سجل ${delegateName} إليه على واتساب`}
                phonePath={`/collections/delegates/${delegateId}/whatsapp`}
                text={[
                  `السلام عليكم ${delegateName}،`,
                  `مرفق سجل تسديد مشتركيكم${status === 'deceased' ? ' المتوفين' : ''} لسنة ${year} لغاية شهر ${cutoff >= 0 ? MONTH_NAMES[cutoff] : 'بداية السنة'}.`,
                  'مؤسسة أحباب الحسين الثقافية الخيرية',
                ].join('\n')}
                build={() => buildRegisterPdf({ year, cutoff, status, delegateId, delegateName, currency })}
              />
            )}
          </div>
        </header>

        <div className="print-sheet-scroll reg-sheets">
          {error && <p className="form-error" role="alert">{error}</p>}
          {!report && !error && <p className="hint" aria-busy="true">جارٍ تجهيز السجل…</p>}
          {groups?.map((group) => (
            <RegisterSheets key={group.key} report={group.report} year={year} cutoff={cutoff} status={status} delegateName={group.name} />
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}

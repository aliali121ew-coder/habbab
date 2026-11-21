import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X } from 'lucide-react';
import { formatNumber, today } from '../../format';
import { FoundationStamp } from '../subscribers/FoundationStamp';
import { Divider, Frame } from '../subscribers/RegisterPrintModal';
import { CATEGORIES } from './categories';
import type { ExpenseItem } from './ExpensesPage';

// One printed line: a heading's first line carries its name and total; each further entry
// of the same heading continues beneath it.
interface Line {
  no: number;
  label: string;
  total: number;
  first: boolean;
  details: string;
  amount: number | null;
}

interface Props {
  // The period as the page names it: «تشرين الثاني 2026», or «2026/11/01 – 2026/11/07».
  title: string;
  isMonth: boolean;
  items: ExpenseItem[];
  // The filter in force on screen, in words («نوع الصرف: … · بحث: …»); empty for none.
  filterNote?: string;
  currency: string;
  onClose: () => void;
}

// 2026-01-05 → 2026-1-5, the style the printed sheets use.
const plainDate = (iso: string) => iso.slice(0, 10).split('-').map(Number).join('-');

// The expenses on screen (the chosen dates and the filter in force) as one paper sheet on the
// register's letterhead: the headings that have entries, in their usual order, each entry on its
// own line with its full details and amount, the heading's total beside its first line. Always a
// single page: when the entries are many, the table's type steps down until it fits.
export function ExpensesPrintModal({ title, isMonth, items, filterNote, currency, onClose }: Props) {
  const pageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const report = useMemo(() => {
    const lines: Line[] = [];
    let total = 0;
    let used = 0;
    let top = { label: '—', total: 0 };
    CATEGORIES.forEach((category) => {
      const entries = items.filter((item) => item.category === category.id);
      if (!entries.length) return;
      const sum = entries.reduce((value, item) => value + item.amount, 0);
      total += sum;
      used += 1;
      if (sum > top.total) top = { label: category.label, total: sum };
      const base = { no: used, label: category.label, total: sum };
      entries.forEach((item, at) => lines.push({ ...base, first: at === 0, details: [item.beneficiary_name, item.details].filter(Boolean).join(' — '), amount: item.amount }));
    });
    return {
      lines,
      total,
      summary: [
        { title: 'عدد القيود', value: formatNumber(items.length) },
        { title: 'الأبواب المستخدمة', value: `${formatNumber(used)} من 17` },
        { title: 'الأعلى استهلاكاً', value: top.label },
        { title: 'مجموع الحركات المالية', value: `${formatNumber(total)} ${currency}`, strong: true },
      ],
    };
  }, [items, currency]);

  const monthTitle = title;
  const lead = isMonth ? 'لشهر' : 'للمدة';

  // One page: step the table's type down (--fit) until the sheet's content stops overflowing.
  useLayoutEffect(() => {
    const page = pageRef.current;
    if (!page) return;
    let fit = 1;
    page.style.setProperty('--fit', '1');
    while (page.scrollHeight > page.clientHeight + 1 && fit > 0.5) {
      fit = Math.round((fit - 0.04) * 100) / 100;
      page.style.setProperty('--fit', String(fit));
    }
  }, [report]);

  return createPortal(
    <div className="print-modal-overlay" role="dialog" aria-modal="true" aria-label={`طباعة سجل صرفيات ${monthTitle}`}>
      <div className="print-modal-container reg-print exp-print">
        <header className="print-modal-toolbar">
          <div className="pmt-title">
            <strong>طباعة سجل الحركات المالية</strong>
            <span>{isMonth ? 'شهر' : 'المدة'} <bdi>{monthTitle}</bdi> • القيود: <bdi>{formatNumber(items.length)}</bdi>{filterNote && <> • {filterNote}</>} • صفحة واحدة</span>
          </div>
          <div className="pmt-actions">
            <button type="button" className="btn primary print-trigger-btn" onClick={() => window.print()}>
              <Printer size={17} aria-hidden />
              <span>طباعة السجل</span>
            </button>
            <button type="button" className="icon-btn print-close-btn" aria-label="إغلاق" onClick={onClose}>
              <X size={20} aria-hidden />
            </button>
          </div>
        </header>

        <div className="print-sheet-scroll reg-sheets">
          <section className="reg-sheet exp-sheet-print" aria-label="ورقة الصرفيات">
              <Frame />
              <div className="reg-page" ref={pageRef}>
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
                    <h2>سجل الحركات المالية</h2>
                    <p>{lead} <b><bdi>{monthTitle}</bdi></b></p>
                    {filterNote && <p className="exp-filter-note">{filterNote}</p>}
                  </div>
                  <dl className="reg-meta">
                    <div><dt>تاريخ الإصدار:</dt><dd><bdi dir="ltr">{plainDate(today())}</bdi></dd></div>
                  </dl>
                </header>
                <Divider />
                <dl className="reg-figures four">
                  {report.summary.map((item) => (
                    <div key={item.title} className={item.strong ? 'strong' : undefined}>
                      <dt>{item.title}</dt>
                      <dd><bdi>{item.value}</bdi></dd>
                    </div>
                  ))}
                </dl>

                <table className="exp-sheet-table">
                  <thead>
                    <tr>
                      <th scope="col" className="col-no">ت</th>
                      <th scope="col" className="col-cat">نوع الصرف</th>
                      <th scope="col" className="col-details">التفاصيل</th>
                      <th scope="col" className="col-amount">المبلغ</th>
                      <th scope="col" className="col-total">المجموع</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.lines.map((line, index) => {
                      const named = line.first;
                      return (
                        <tr key={`${line.no}-${index}`} className={`${line.first ? 'group-start' : 'group-cont'}${line.amount === null ? ' empty' : ''}`}>
                          <td className="col-no">{named && <bdi>{line.no}</bdi>}</td>
                          <th scope="row" className="col-cat">{named && line.label}</th>
                          <td className="col-details">{line.amount !== null && (line.details || '—')}</td>
                          <td className="col-amount">{line.amount !== null && <bdi>{formatNumber(line.amount)}</bdi>}</td>
                          <td className="col-total">{line.first && line.total > 0 && <bdi>{formatNumber(line.total)}</bdi>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                      <tr>
                        <th scope="row" colSpan={4}>المجموع الكلي</th>
                        <td className="col-total"><bdi>{formatNumber(report.total)}</bdi> <small>{currency}</small></td>
                      </tr>
                  </tfoot>
                </table>

                <div className="reg-approval">
                    <section>
                      <h4>المحاسب</h4>
                      <p>صباح محمد العيساوي</p>
                      <span className="line" />
                      <small>التوقيع</small>
                    </section>
                    <FoundationStamp />
                    <section>
                      <h4>مدير المؤسسة</h4>
                      <p>سماحة السيد علي كاظم داود الشريفي</p>
                      <span className="line" />
                      <small>التوقيع</small>
                    </section>
                </div>

                <footer className="reg-foot">
                  <span>مؤسسة أحباب الحسين الثقافية الخيرية</span>
                  <span>بابل - قضاء الهاشمية - حي الزهراء</span>
                </footer>
              </div>
            </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}

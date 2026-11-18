import { useEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Check, Printer, X } from 'lucide-react';
import { api, type GridRow, type SubscriberDetail } from '../../api';
import { MONTH_NAMES, formatNumber, isPaid, today } from '../../format';
import { FoundationStamp } from './FoundationStamp';

// The sheet is laid out once at A4 and scaled to fit the smaller pages whole.
const PAPER = {
  A4: 1,
  A5: Math.min(148 / 210, 210 / 297),
  A6: Math.min(105 / 210, 148 / 297),
} as const;
type Paper = keyof typeof PAPER;
const PAPER_KEY = 'print-paper';

function savedPaper(): Paper {
  try {
    const value = localStorage.getItem(PAPER_KEY);
    return value && value in PAPER ? value as Paper : 'A4';
  } catch {
    return 'A4';
  }
}

export const FOUNDATION = 'مؤسسة أحباب الحسين الثقافية الخيرية';
const ADDRESS = 'بابل - قضاء الهاشمية - حي الزهراء';

interface Props {
  row: GridRow;
  year: number;
  currentMonth: number | null;
  currency: string;
  delegateName?: string | null;
  onClose: () => void;
}

const formatDate = (value: string) => value.slice(0, 10).replace(/-/g, '/');

const FRAME_GOLD = '#b8862d';

// Printed vector shapes, so the paper and its corners stay sharp at any printer resolution.
function FramePatterns() {
  return (
    <svg className="sheet-defs" width="0" height="0" aria-hidden>
      <defs>
        <pattern id="sheet-arabesque" width="96" height="96" patternUnits="userSpaceOnUse" patternTransform="scale(.62)">
          <g fill="none" stroke="#d9c489" strokeWidth=".8">
            {[0, 90, 180, 270].map((angle) => (
              <g key={angle} transform={`rotate(${angle} 48 48)`}>
                <path d="M48 48C38 36 38 22 48 14C58 22 58 36 48 48Z" />
                <path d="M48 14C42 6 34 6 30 12C27 17 32 22 36 19" />
                <path d="M48 14C54 6 62 6 66 12C69 17 64 22 60 19" />
                <circle cx="48" cy="31" r="4" />
                <path d="M0 0C14 2 20 8 22 22C8 20 2 14 0 0Z" />
              </g>
            ))}
            <circle cx="48" cy="48" r="7" />
          </g>
        </pattern>
        <pattern id="sheet-lattice" width="44" height="44" patternUnits="userSpaceOnUse">
          <g fill="none" stroke="#e3c678" strokeWidth=".7">
            <rect x="11" y="11" width="22" height="22" />
            <rect x="11" y="11" width="22" height="22" transform="rotate(45 22 22)" />
            <path d="M0 0l7 7M44 0l-7 7M0 44l7-7M44 44l-7-7" />
          </g>
        </pattern>
      </defs>
    </svg>
  );
}

// One half of a corner flourish, drawn along the top edge and mirrored across the diagonal.
function CornerHalf() {
  return (
    <>
      <path d="M12 34C10 14 32 9 52 13C72 17 90 21 102 14C110 9 118 15 113 22C109 28 101 25 103 19" fill="none" stroke={FRAME_GOLD} strokeWidth="4.5" strokeLinecap="round" />
      <path d="M26 34C30 23 45 24 49 31C52 38 44 43 40 37" fill="none" stroke={FRAME_GOLD} strokeWidth="3.4" strokeLinecap="round" />
      <path d="M38 13C43 4 53 2 62 5C57 12 48 15 38 13Z" fill={FRAME_GOLD} />
      <path d="M58 15C65 25 75 29 86 28C80 19 70 14 58 15Z" fill={FRAME_GOLD} />
      <path d="M8 8H33L21 15L15 21L8 33Z" fill={FRAME_GOLD} />
      <path d="M70 18C74 9 84 6 94 9C89 16 80 20 70 18Z" fill={FRAME_GOLD} />
      <path d="M36 25C42 30 44 37 41 45C34 41 32 32 36 25Z" fill={FRAME_GOLD} />
      <circle cx="108" cy="17" r="2.6" fill={FRAME_GOLD} />
    </>
  );
}

export function FrameCorner({ side }: { side: string }) {
  return (
    <svg className={`sheet-corner ${side}`} viewBox="0 0 120 120" aria-hidden>
      <CornerHalf />
      <g transform="matrix(0 1 1 0 0 0)"><CornerHalf /></g>
      <path d="M33 33C38 43 44 48 54 50C50 40 44 34 33 33Z" fill={FRAME_GOLD} />
    </svg>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <h3 className="sheet-section">
      <span aria-hidden />
      {children}
      <span aria-hidden />
    </h3>
  );
}

export interface StatementSheetProps {
  row: GridRow;
  year: number;
  currentMonth: number | null;
  currency: string;
  delegateName?: string | null;
  detail: SubscriberDetail | null;
  paper?: Paper;
  id?: string;
}

// The subscriber's statement for one year: the printed page, and the PDF sent on WhatsApp.
export function StatementSheet({ row, year, currentMonth, currency, delegateName, detail, paper = 'A4', id }: StatementSheetProps) {
  const paymentByMonth = new Map<number, { amount: number; tx_date: string }>();
  detail?.payments?.forEach((p) => {
    const m = Number(p.period.slice(5, 7)) - 1;
    if (m >= 0 && m < 12) {
      paymentByMonth.set(m, { amount: p.amount, tx_date: p.tx_date });
    }
  });

  const fee = row.monthly_fee || 5000;
  const elapsedMonths = currentMonth !== null ? currentMonth + 1 : 12;
  const totalDue = Math.max(1, elapsedMonths) * fee;

  let paidMonthsCount = 0;
  let totalPaid = 0;
  for (let m = 0; m < 12; m++) {
    if (isPaid(row.paid_mask, m)) {
      paidMonthsCount++;
      totalPaid += paymentByMonth.get(m)?.amount || fee;
    }
  }
  const remaining = Math.max(0, totalDue - totalPaid);

  return (
    <article className="official-sheet" id={id} data-paper={paper} style={{ '--sheet-scale': PAPER[paper] } as CSSProperties}>
      <FramePatterns />
      <svg className="sheet-paper" aria-hidden>
        <rect width="100%" height="100%" fill="url(#sheet-arabesque)" />
      </svg>
      <div className="sheet-frame">
        <span className="sheet-rule top" />
        <span className="sheet-rule right" />
        <span className="sheet-rule bottom" />
        <span className="sheet-rule left" />
        <FrameCorner side="top-right" />
        <FrameCorner side="top-left" />
        <FrameCorner side="bottom-right" />
        <FrameCorner side="bottom-left" />

        <div className="sheet-page">
          <div className="sheet-opening">
            <p className="sheet-basmalah">بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</p>
            <p className="sheet-verse">
              ﴿ مَّثَلُ الَّذِينَ يُنفِقُونَ أَمْوَالَهُمْ فِي سَبِيلِ اللَّهِ كَمَثَلِ حَبَّةٍ أَنبَتَتْ سَبْعَ سَنَابِلَ فِي كُلِّ سُنبُلَةٍ مِّائَةُ حَبَّةٍ ۗ وَاللَّهُ يُضَاعِفُ لِمَن يَشَاءُ ۗ وَاللَّهُ وَاسِعٌ عَلِيمٌ ﴾
            </p>
          </div>

          <header className="sheet-banner">
            <svg className="sheet-banner-pattern" aria-hidden>
              <rect width="100%" height="100%" fill="url(#sheet-lattice)" />
            </svg>
            <div className="sheet-banner-name">
              <h1>مؤسسة أحباب الحسين</h1>
              <h2>الثقافية الخيرية</h2>
              <p>{ADDRESS}</p>
            </div>
            <span className="sheet-logo-ring">
              <img src="/logo.jpg" alt={`شعار ${FOUNDATION}`} />
            </span>
            <div className="sheet-banner-contact">
              <span>للتواصل والاستفسار</span>
              <bdi dir="ltr">07808337805</bdi>
              <bdi dir="ltr">0760107408</bdi>
              <span>تاريخ الإصدار: <bdi>{formatDate(today())}</bdi></span>
            </div>
          </header>

          <div className="sheet-title">
            <h2>كشف الاشتراكات السنوية</h2>
            <p>لسنة <bdi>{year}</bdi></p>
          </div>

          <dl className="sheet-info">
            <div className="wide"><dt>اسم المشترك</dt><dd>{row.full_name}</dd></div>
            <div><dt>رقم الهاتف</dt><dd><bdi dir="ltr">{detail?.phone || row.phone || '—'}</bdi></dd></div>
            <div><dt>العنوان</dt><dd>{detail?.address || '—'}</dd></div>
            <div><dt>المندوب</dt><dd>{delegateName || '—'}</dd></div>
          </dl>

          <SectionTitle>سجل التسديد الشهري</SectionTitle>
          <table className="sheet-table">
            <thead>
              <tr>
                <th scope="col" className="col-no">ت</th>
                <th scope="col" className="col-month">الشهر</th>
                <th scope="col">المبلغ المسدد</th>
                <th scope="col">تاريخ التسديد</th>
                <th scope="col">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {MONTH_NAMES.map((monthName, idx) => {
                const paid = isPaid(row.paid_mask, idx);
                const payment = paymentByMonth.get(idx);
                const date = payment?.tx_date ?? row.last_paid_date;
                const due = idx < elapsedMonths;
                return (
                  <tr key={monthName}>
                    <td className="col-no"><bdi>{idx + 1}</bdi></td>
                    <th scope="row" className="col-month">{monthName}</th>
                    <td>{paid ? <><bdi>{formatNumber(payment?.amount || fee)}</bdi> {currency}</> : '—'}</td>
                    <td>{paid && date ? <bdi>{formatDate(date)}</bdi> : '—'}</td>
                    <td>
                      {paid
                        ? <span className="sheet-status paid"><Check size={13} strokeWidth={3} aria-hidden /> مسدد</span>
                        : due
                          ? <span className="sheet-status unpaid">غير مسدد</span>
                          : <span className="sheet-status">لم يحن بعد</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <dl className="sheet-totals">
            <div><dt>إجمالي المستحق</dt><dd><bdi>{formatNumber(totalDue)}</bdi> <small>{currency}</small></dd></div>
            <div className="paid">
              <dt>إجمالي المسدد (<bdi>{paidMonthsCount}</bdi> شهر)</dt>
              <dd><bdi>{formatNumber(totalPaid)}</bdi> <small>{currency}</small></dd>
            </div>
            <div><dt>الرصيد المتبقي</dt><dd><bdi>{formatNumber(remaining)}</bdi> <small>{currency}</small></dd></div>
          </dl>

          <SectionTitle>المصادقة</SectionTitle>
          <div className="sheet-approval">
            <section>
              <h4>المحاسب</h4>
              <p className="sheet-approval-name">صباح محمد العيساوي</p>
              <div className="sheet-sign-line"><span>التوقيع</span></div>
            </section>
            <FoundationStamp />
            <section>
              <h4>مدير المؤسسة</h4>
              <p className="sheet-approval-name">سماحة السيد علي كاظم داود الشريفي</p>
              <div className="sheet-sign-line"><span>التوقيع</span></div>
            </section>
          </div>

          <footer className="sheet-footer">
            <span>{FOUNDATION}</span>
            <span>{ADDRESS}</span>
          </footer>
        </div>
      </div>
    </article>
  );
}

export function PrintSheetModal({
  row,
  year,
  currentMonth,
  currency,
  delegateName,
  onClose,
}: Props) {
  const [detail, setDetail] = useState<SubscriberDetail | null>(null);
  const [paper, setPaper] = useState<Paper>(savedPaper);

  const choosePaper = (next: Paper) => {
    setPaper(next);
    try { localStorage.setItem(PAPER_KEY, next); } catch { /* storage blocked: keep it for this visit only */ }
  };

  useEffect(() => {
    let active = true;
    api<SubscriberDetail>(`/collections/subscriber/${row.id}?year=${year}`)
      .then((data) => {
        if (active) setDetail(data);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [row.id, year]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Rendered on <body> so printing can drop the whole app and leave one page.
  return createPortal(
    <div className="print-modal-overlay" role="dialog" aria-modal="true" aria-label={`كشف اشتراكات ${row.full_name}`}>
      <div className="print-modal-container">
        <header className="print-modal-toolbar">
          <div className="pmt-title">
            <strong>كشف الاشتراكات السنوية</strong>
            <span>{row.full_name} • سنة {year}</span>
          </div>
          <div className="pmt-actions">
            <div className="seg" role="group" aria-label="حجم الورقة">
              {(Object.keys(PAPER) as Paper[]).map((size) => (
                <button key={size} type="button" aria-pressed={paper === size} onClick={() => choosePaper(size)}>{size}</button>
              ))}
            </div>
            <button type="button" className="btn primary print-trigger-btn" onClick={() => window.print()}>
              <Printer size={17} aria-hidden />
              <span>طباعة الكشف</span>
            </button>
            <button type="button" className="icon-btn print-close-btn" aria-label="إغلاق" onClick={onClose}>
              <X size={20} aria-hidden />
            </button>
          </div>
        </header>

        <div className="print-sheet-scroll">
          <StatementSheet row={row} year={year} currentMonth={currentMonth} currency={currency} delegateName={delegateName} detail={detail} paper={paper} id="printable-sheet" />
        </div>
      </div>
    </div>,
    document.body,
  );
}

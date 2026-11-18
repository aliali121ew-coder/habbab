import { useEffect, useState } from 'react';
import {
  CalendarCheck,
  Check,
  CreditCard,
  FileText,
  Printer,
  ShieldCheck,
  X,
} from 'lucide-react';
import { api, type DelegateSummary, type GridRow, type Me, type SubscriberDetail } from '../../api';
import { MONTH_NAMES, MONTH_STATE_LABELS, formatNumber, initialOf, isPaid, monthState } from '../../format';
import { PaymentDialog, type PaymentTarget } from './PaymentDialog';
import { PrintSheetModal } from './PrintSheetModal';
import { SubscriberInfo } from './SubscriberInfo';

const MONTHS = Array.from({ length: 12 }, (_, index) => index);

export function formatTier(fee: number, currency: string): { label: string; amount: string } {
  if (!fee || fee <= 0) return { label: 'إعفاء', amount: 'بدون رسم' };
  const amount = `${formatNumber(fee)} ${currency}`;
  if (fee >= 25000) return { label: 'فئة خاصة', amount };
  if (fee >= 10000) return { label: 'فئة أولى', amount };
  return { label: 'فئة أساسية', amount };
}

export function getUnpaidMonths(mask: number, currentMonth: number | null): number[] {
  const limit = currentMonth === null ? 11 : currentMonth;
  if (limit < 0) return [];
  const unpaid: number[] = [];
  for (let m = 0; m <= limit; m++) {
    if (!isPaid(mask, m)) unpaid.push(m + 1);
  }
  return unpaid;
}

export function formatUnpaidSummary(mask: number, currentMonth: number | null): {
  count: number;
  text: string;
  detail: string;
} {
  const unpaid = getUnpaidMonths(mask, currentMonth);
  if (unpaid.length === 0) {
    return { count: 0, text: 'مسدد', detail: 'جميع الأشهر المستحقة مسددة' };
  }
  const unit = unpaid.length >= 3 && unpaid.length <= 10 ? 'أشهر' : 'شهر';
  return {
    count: unpaid.length,
    text: `${formatNumber(unpaid.length)} ${unit}`,
    detail: `الأشهر غير المسددة: ${unpaid.map((m) => `${m} (${MONTH_NAMES[m - 1]})`).join('، ')}`,
  };
}

export function isOverdueFourMonths(mask: number, currentMonth: number | null): boolean {
  const limit = currentMonth === null ? 11 : currentMonth;
  if (limit < 3) return false;
  const unpaid = getUnpaidMonths(mask, limit);
  if (unpaid.length >= 4) return true;
  const last4Mask = ((1 << 4) - 1) << (limit - 3);
  return (mask & last4Mask) === 0;
}

export function formatDateSlash(dateStr: string | null | undefined): string {
  if (!dateStr) return 'لا يوجد تسديد';
  return dateStr.slice(0, 10).replace(/-/g, '/');
}

interface Props {
  me: Me;
  year: number;
  row: GridRow;
  currentMonth: number | null;
  delegateName?: string | null;
  onClose: () => void;
  onPaymentChanged: (subscriberId: number, month: number, paid: boolean, txDate?: string) => void;
  // Applies an edit made here to the register row behind the modal.
  onRowChanged: (subscriberId: number, patch: Partial<GridRow>) => void;
  delegates: DelegateSummary[];
}

export function SubscriberModal({
  me,
  year,
  row,
  currentMonth,
  delegateName,
  onClose,
  onPaymentChanged,
  onRowChanged,
  delegates,
}: Props) {
  const [detail, setDetail] = useState<SubscriberDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [payTarget, setPayTarget] = useState<PaymentTarget | null>(null);
  const [showPrint, setShowPrint] = useState(false);

  useEffect(() => {
    let active = true;
    setLoadingDetail(true);
    api<SubscriberDetail>(`/collections/subscriber/${row.id}?year=${year}`)
      .then((data) => {
        if (active) setDetail(data);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoadingDetail(false);
      });
    return () => { active = false; };
  }, [row.id, year, row.paid_mask]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !payTarget) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, payTarget]);

  const tier = formatTier(row.monthly_fee, me.currency);
  const unpaid = getUnpaidMonths(row.paid_mask, currentMonth);
  const paidCount = MONTHS.filter((m) => isPaid(row.paid_mask, m)).length;
  const paidAmount = paidCount * (row.monthly_fee || 0);
  const dueAmount = unpaid.length * (row.monthly_fee || 0);
  const resolvedDelegate = detail?.delegate_name ?? delegateName ?? 'غير محدد';
  const latestPayment = detail?.payments?.[0]?.tx_date ?? row.last_paid_date ?? null;

  // «تسجيل دفعة» opens the earliest unpaid month; any other month is a tap on the strip above.
  const nextUnpaid = MONTHS.find((m) => !isPaid(row.paid_mask, m)) ?? -1;

  const stateLabel = (state: string) => MONTH_STATE_LABELS[state as keyof typeof MONTH_STATE_LABELS];

  return (
    <div className="sub-overlay" role="dialog" aria-modal="true" aria-label={`تفاصيل المشترك ${row.full_name}`} onClick={onClose}>
      <div className="sub-card" onClick={(event) => event.stopPropagation()}>
        <header className="sub-hero">
          <div className="sub-hero-row">
            <span className="sub-avatar" aria-hidden>{initialOf(row.full_name)}</span>
            <div className="sub-identity">
              <h2>
                {row.full_name}
                <span className={`sub-status ${row.status === 'alive' ? 'alive' : 'deceased'}`}>{row.status === 'alive' ? 'حي' : 'متوفى'}</span>
              </h2>
              <p>رقم السجل <bdi>#{row.id}</bdi> · {resolvedDelegate}</p>
            </div>
            <div className="sub-hero-actions">
              <button type="button" className="sub-hero-btn" onClick={() => setShowPrint(true)}>
                <Printer size={16} aria-hidden /> <span>طباعة</span>
              </button>
              <button type="button" className="sub-hero-btn icon" aria-label="إغلاق" onClick={onClose}>
                <X size={18} aria-hidden />
              </button>
            </div>
          </div>

        </header>

        <div className="sub-body">
              <dl className="sub-figures">
                <div>
                  <dt><CreditCard size={14} aria-hidden /> فئة الاشتراك</dt>
                  <dd>{tier.label}</dd>
                  <small>{tier.amount} شهرياً</small>
                </div>
                <div>
                  <dt><CalendarCheck size={14} aria-hidden /> آخر تسديد</dt>
                  <dd><bdi>{formatDateSlash(latestPayment)}</bdi></dd>
                  <small>{paidCount > 0 ? `${formatNumber(paidCount)} أشهر مسددة` : `لا تسديد في ${year}`}</small>
                </div>
                <div>
                  <dt><ShieldCheck size={14} aria-hidden /> المسدد في <bdi>{year}</bdi></dt>
                  <dd className="good"><bdi>{formatNumber(paidAmount)}</bdi> <small>{me.currency}</small></dd>
                  <small><bdi>{formatNumber(paidCount)}</bdi> من 12 شهراً</small>
                </div>
                <div>
                  <dt><FileText size={14} aria-hidden /> المتبقي</dt>
                  <dd className={unpaid.length > 0 ? 'bad' : 'good'}>
                    {unpaid.length > 0 ? <><bdi>{formatNumber(dueAmount)}</bdi> <small>{me.currency}</small></> : 'لا متأخرات'}
                  </dd>
                  <small>{unpaid.length > 0 ? `${formatNumber(unpaid.length)} أشهر غير مسددة` : 'مسدد حتى تاريخه'}</small>
                </div>
              </dl>

              <section className="sub-months-strip" aria-label={`حالة الأشهر لسنة ${year}`}>
                <header>
                  <h3>حالة الأشهر لسنة <bdi>{year}</bdi></h3>
                  <span>{unpaid.length === 0 ? 'كل الأشهر المستحقة مسددة' : `غير مسدد: ${unpaid.map((m) => MONTH_NAMES[m - 1]).join('، ')}`}</span>
                </header>
                <ol>
                  {MONTHS.map((month) => {
                    const state = monthState(row.paid_mask, month, currentMonth);
                    return (
                      <li key={month}>
                        <button
                          type="button"
                          className={`sub-month ${state}`}
                          title={`${MONTH_NAMES[month]}: ${stateLabel(state)}`}
                          aria-label={`${MONTH_NAMES[month]}: ${stateLabel(state)}`}
                          onClick={() => setPayTarget({ row, month, paid: state === 'paid' })}
                        >
                          <bdi>{month + 1}</bdi>
                          {state === 'paid' && <Check size={11} strokeWidth={3} aria-hidden />}
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </section>

              <SubscriberInfo
                me={me}
                row={row}
                detail={detail}
                loading={loadingDetail}
                delegateName={resolvedDelegate}
                delegates={delegates}
                onSaved={(patch) => {
                  setDetail((current) => current && { ...current, ...patch });
                  const rowPatch: Partial<GridRow> = {};
                  if ('delegate_id' in patch) rowPatch.delegate_id = patch.delegate_id ?? null;
                  if ('family_size' in patch) rowPatch.family_size = patch.family_size;
                  if ('phone' in patch) rowPatch.phone = patch.phone ?? null;
                  onRowChanged(row.id, rowPatch);
                }}
              />
        </div>

        <footer className="sub-foot">
          <button type="button" className="btn primary" disabled={nextUnpaid < 0} onClick={() => setPayTarget({ row, month: nextUnpaid, paid: false })}>
            <CalendarCheck size={17} aria-hidden /> {nextUnpaid < 0 ? 'كل أشهر السنة مسددة' : `تسجيل دفعة ${MONTH_NAMES[nextUnpaid]}`}
          </button>
        </footer>
      </div>

      {payTarget && (
        <PaymentDialog
          me={me}
          year={year}
          target={payTarget}
          onClose={() => setPayTarget(null)}
          onDone={(paid) => {
            onPaymentChanged(row.id, payTarget.month, paid);
            setPayTarget(null);
          }}
        />
      )}

      {showPrint && (
        <PrintSheetModal
          row={row}
          year={year}
          currentMonth={currentMonth}
          currency={me.currency}
          delegateName={resolvedDelegate}
          onClose={() => setShowPrint(false)}
        />
      )}
    </div>
  );
}


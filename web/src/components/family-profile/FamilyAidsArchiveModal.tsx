import { useMemo, useState } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, HandHeart, X } from 'lucide-react';
import { formatIQDParts } from '../../mock/family';
import type { FamilyPaymentRecord, FamilyVisitRecord } from '../../types/family';

interface Props {
  familyName: string;
  payments: FamilyPaymentRecord[];
  visits: FamilyVisitRecord[];
  onClose: () => void;
}

const ARABIC_MONTHS = [
  'كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران',
  'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول',
];
const WEEKDAYS = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];

const STATUS_META: Record<FamilyPaymentRecord['status'], { label: string; bg: string; color: string }> = {
  paid: { label: 'مكتمل', bg: 'var(--fp-emerald-soft)', color: 'var(--fp-emerald)' },
  pending: { label: 'قيد التسليم', bg: 'var(--fp-amber-soft)', color: 'var(--fp-amber)' },
  overdue: { label: 'متأخر', bg: 'var(--fp-rose-soft)', color: 'var(--fp-rose)' },
};

function parseYMD(dateStr: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]) - 1, day: Number(m[3]) };
}

export function FamilyAidsArchiveModal({ familyName, payments, visits, onClose }: Props) {
  const initialDate = useMemo(() => {
    const latest = [...payments.map((p) => p.date), ...visits.map((v) => v.date)]
      .filter(Boolean)
      .sort()
      .pop();
    const parsed = latest ? parseYMD(latest) : null;
    if (parsed) return { year: parsed.year, month: parsed.month };
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  }, [payments, visits]);

  const [viewYear, setViewYear] = useState(initialDate.year);
  const [viewMonth, setViewMonth] = useState(initialDate.month);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const dayStatusMap = useMemo(() => {
    const map: Record<string, { paid: number; overdue: number; pending: number; visit: number }> = {};
    for (const p of payments) {
      const key = p.date.slice(0, 10);
      if (!map[key]) map[key] = { paid: 0, overdue: 0, pending: 0, visit: 0 };
      map[key][p.status] += 1;
    }
    for (const v of visits) {
      const key = v.date.slice(0, 10);
      if (!map[key]) map[key] = { paid: 0, overdue: 0, pending: 0, visit: 0 };
      map[key].visit += 1;
    }
    return map;
  }, [payments, visits]);

  const calendarCells = useMemo(() => {
    const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells: Array<{ day: number | null; key: string }> = [];
    for (let i = 0; i < firstDayOfWeek; i += 1) {
      cells.push({ day: null, key: `empty-${i}` });
    }
    for (let d = 1; d <= daysInMonth; d += 1) {
      const mm = String(viewMonth + 1).padStart(2, '0');
      const dd = String(d).padStart(2, '0');
      cells.push({ day: d, key: `${viewYear}-${mm}-${dd}` });
    }
    return cells;
  }, [viewYear, viewMonth]);

  const visiblePayments = useMemo(() => {
    if (!selectedDay) return payments;
    return payments.filter((p) => p.date.slice(0, 10) === selectedDay);
  }, [payments, selectedDay]);

  const goPrevMonth = () => {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const goNextMonth = () => {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="سجل المساعدات والتقويم"
      dir="rtl"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-xs sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-3xl border shadow-2xl sm:rounded-3xl"
        style={{
          backgroundColor: 'var(--fp-card)',
          borderColor: 'var(--fp-border)',
          color: 'var(--fp-ink)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between gap-3 border-b px-5 py-4"
          style={{ borderColor: 'var(--fp-border)' }}
        >
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-base font-extrabold" style={{ color: 'var(--fp-ink)' }}>
              <CalendarIcon className="h-4 w-4" style={{ color: 'var(--bar-active)' }} aria-hidden />
              <span>سجل المساعدات والتقويم</span>
            </h2>
            <p className="mt-0.5 truncate text-xs" style={{ color: 'var(--fp-ink-3)' }}>
              {familyName} • {payments.length} مساعدة مسجلة
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition hover:opacity-80"
            style={{
              backgroundColor: 'var(--fp-muted)',
              borderColor: 'var(--fp-border)',
              color: 'var(--fp-ink-2)',
            }}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {/* Scrollable Content: Calendar + Compact Aid Cards */}
        <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
          {/* Interactive Status Calendar Card */}
          <div
            className="rounded-2xl border p-4"
            style={{
              backgroundColor: 'var(--fp-muted)',
              borderColor: 'var(--fp-border)',
            }}
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={goPrevMonth}
                  aria-label="الشهر السابق"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border transition hover:opacity-80"
                  style={{ backgroundColor: 'var(--fp-card)', borderColor: 'var(--fp-border)', color: 'var(--fp-ink)' }}
                >
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </button>
                <strong className="min-w-[130px] text-center text-xs font-extrabold sm:text-sm" style={{ color: 'var(--fp-ink)' }}>
                  {ARABIC_MONTHS[viewMonth]} {viewYear}
                </strong>
                <button
                  type="button"
                  onClick={goNextMonth}
                  aria-label="الشهر التالي"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border transition hover:opacity-80"
                  style={{ backgroundColor: 'var(--fp-card)', borderColor: 'var(--fp-border)', color: 'var(--fp-ink)' }}
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                </button>
              </div>

              {/* Legend */}
              <div className="flex flex-wrap items-center gap-3 text-[11px] font-bold">
                <span className="inline-flex items-center gap-1" style={{ color: 'var(--fp-emerald)' }}>
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" aria-hidden />
                  مساعدة
                </span>
                <span className="inline-flex items-center gap-1" style={{ color: 'var(--fp-amber)' }}>
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-500" aria-hidden />
                  زيارة / معلق
                </span>
                <span className="inline-flex items-center gap-1" style={{ color: 'var(--fp-rose)' }}>
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-500" aria-hidden />
                  متأخر
                </span>
              </div>
            </div>

            {/* Weekday headers */}
            <div className="mb-1.5 grid grid-cols-7 gap-1 text-center text-[11px] font-bold" style={{ color: 'var(--fp-ink-3)' }}>
              {WEEKDAYS.map((day) => (
                <div key={day} className="py-1">{day}</div>
              ))}
            </div>

            {/* Days grid */}
            <div className="grid grid-cols-7 gap-1.5">
              {calendarCells.map((cell) => {
                if (cell.day === null) {
                  return <div key={cell.key} className="h-9" />;
                }
                const info = dayStatusMap[cell.key];
                const isSelected = selectedDay === cell.key;
                let bg = 'var(--fp-card)';
                let color = 'var(--fp-ink-2)';
                let border = 'var(--fp-border)';

                if (info) {
                  if (info.overdue > 0) {
                    bg = 'color-mix(in srgb, #e11d48 20%, var(--fp-card))';
                    color = 'var(--fp-rose)';
                    border = 'color-mix(in srgb, #e11d48 45%, transparent)';
                  } else if (info.paid > 0) {
                    bg = 'color-mix(in srgb, #10b981 20%, var(--fp-card))';
                    color = 'var(--fp-emerald)';
                    border = 'color-mix(in srgb, #10b981 45%, transparent)';
                  } else if (info.visit > 0 || info.pending > 0) {
                    bg = 'color-mix(in srgb, #f59e0b 22%, var(--fp-card))';
                    color = 'var(--fp-amber)';
                    border = 'color-mix(in srgb, #f59e0b 45%, transparent)';
                  }
                }

                if (isSelected) {
                  bg = 'var(--bar-active)';
                  color = '#ffffff';
                  border = 'var(--bar-active)';
                }

                return (
                  <button
                    key={cell.key}
                    type="button"
                    onClick={() => setSelectedDay((prev) => (prev === cell.key ? null : cell.key))}
                    className="relative flex h-9 flex-col items-center justify-center rounded-xl border text-xs font-extrabold tabular-nums transition"
                    style={{ backgroundColor: bg, color, borderColor: border }}
                  >
                    <span>{cell.day}</span>
                    {info && !isSelected && (
                      <span className="mt-0.5 flex gap-0.5">
                        {info.paid > 0 && <span className="h-1 w-1 rounded-full bg-emerald-500" />}
                        {info.visit > 0 && <span className="h-1 w-1 rounded-full bg-amber-500" />}
                        {info.overdue > 0 && <span className="h-1 w-1 rounded-full bg-rose-500" />}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {selectedDay && (
              <div className="mt-3 flex items-center justify-between gap-2 text-xs">
                <span style={{ color: 'var(--fp-ink-2)' }}>
                  عرض المساعدات بتاريخ <b dir="ltr">{selectedDay}</b> ({visiblePayments.length})
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedDay(null)}
                  className="font-bold hover:underline"
                  style={{ color: 'var(--bar-active)' }}
                >
                  عرض جميع التواريخ
                </button>
              </div>
            )}
          </div>

          {/* All Aid Cards (Compact style) */}
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {visiblePayments.map((payment) => {
              const status = STATUS_META[payment.status] ?? STATUS_META.paid;
              const amountParts = formatIQDParts(payment.amount);
              return (
                <article
                  key={payment.id}
                  className="flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--fp-card) 80%, var(--fp-muted))',
                    borderColor: 'var(--fp-border)',
                  }}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                      style={{ backgroundColor: status.bg, color: status.color }}
                    >
                      <HandHeart className="h-4 w-4" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <strong className="block truncate text-xs font-extrabold sm:text-[13px]" style={{ color: 'var(--fp-ink)' }}>
                        {payment.title || payment.typeLabel}
                      </strong>
                      <span className="mt-0.5 block truncate text-[11px]" style={{ color: 'var(--fp-ink-3)' }}>
                        <bdi dir="ltr">{payment.date}</bdi> • {payment.officer}
                      </span>
                    </div>
                  </div>

                  <div className="shrink-0 text-end tabular-nums">
                    <strong className="block whitespace-nowrap text-xs font-extrabold sm:text-[13px]" style={{ color: 'var(--fp-emerald)' }}>
                      {amountParts.value} {amountParts.currency}
                    </strong>
                    <span
                      className="mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold"
                      style={{ backgroundColor: status.bg, color: status.color }}
                    >
                      {status.label}
                    </span>
                  </div>
                </article>
              );
            })}

            {visiblePayments.length === 0 && (
              <p className="col-span-full py-6 text-center text-xs" style={{ color: 'var(--fp-ink-3)' }}>
                لا توجد مساعدات مسجلة في هذا التاريخ.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

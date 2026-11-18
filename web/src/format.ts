export const MONTH_NAMES = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'];

const numberFormat = new Intl.NumberFormat('ar-IQ-u-nu-latn');
const compactFormat = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

export const formatNumber = (value: number) => numberFormat.format(value);
export const formatCompact = (value: number) => compactFormat.format(value);
export const formatPercent = (value: number) => `${Math.round(value)}%`;

export const today = () => new Date().toISOString().slice(0, 10);
export const monthIndex = (period: string) => Number(period.slice(5, 7)) - 1;

export const isPaid = (mask: number, month: number) => (mask & (1 << month)) !== 0;

export type MonthState = 'paid' | 'overdue' | 'current' | 'future';

export function monthState(paidMask: number, month: number, currentMonth: number | null): MonthState {
  if (isPaid(paidMask, month)) return 'paid';
  if (currentMonth === null) return 'overdue';
  if (month < currentMonth) return 'overdue';
  if (month === currentMonth) return 'current';
  return 'future';
}

export const MONTH_STATE_LABELS: Record<MonthState, string> = {
  paid: 'مسدد',
  overdue: 'متأخر',
  current: 'الشهر الحالي',
  future: 'لم يحن بعد',
};

export function countOverdue(paidMask: number, currentMonth: number | null): number {
  const limit = currentMonth === null ? 11 : currentMonth;
  if (limit < 0) return 0;
  let count = 0;
  for (let m = 0; m <= limit; m++) {
    if (!isPaid(paidMask, m)) count++;
  }
  return count;
}

export const initialOf = (name: string) => {
  const words = name.trim().split(/\s+/);
  let target = (words.length > 1 && words[0] === 'مندوب') ? words[1] : words[0];
  if (target && target.startsWith('ال') && target.length > 2) {
    target = target.slice(2);
  }
  return target ? target.charAt(0) : 'م';
};

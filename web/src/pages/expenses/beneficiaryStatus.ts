import type { ExpenseCategory } from './categories';

export type BeneficiaryStatus = 'critical' | 'medium' | 'good';

export const BENEFICIARY_STATUSES: { id: BeneficiaryStatus; label: string }[] = [
  { id: 'critical', label: 'حرجة' },
  { id: 'medium', label: 'متوسطة' },
  { id: 'good', label: 'جيدة' },
];

export const STATUS_LABEL: Record<BeneficiaryStatus, string> = {
  critical: 'حرجة',
  medium: 'متوسطة',
  good: 'جيدة',
};

export const STATUS_ORDER: Record<BeneficiaryStatus, number> = {
  critical: 0,
  medium: 1,
  good: 2,
};

const STORAGE_KEY = 'ahbab:expense-status-v1';

export function defaultStatusForCategory(category: ExpenseCategory): BeneficiaryStatus {
  if (category === 'operation_aid' || category === 'patient_aid' || category === 'medicine') return 'critical';
  if (category === 'food' || category === 'building_aid' || category === 'appliances' || category === 'appliance_repair') return 'medium';
  return 'good';
}

export function nextStatus(current: BeneficiaryStatus): BeneficiaryStatus {
  if (current === 'critical') return 'medium';
  if (current === 'medium') return 'good';
  return 'critical';
}

export function loadStatusMap(): Record<number, BeneficiaryStatus> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const clean: Record<number, BeneficiaryStatus> = {};
    for (const [k, v] of Object.entries(parsed)) {
      const id = Number(k);
      if (Number.isFinite(id) && (v === 'critical' || v === 'medium' || v === 'good')) {
        clean[id] = v;
      }
    }
    return clean;
  } catch {
    return {};
  }
}

export function saveStatusMap(map: Record<number, BeneficiaryStatus>): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage quota or private-mode errors.
  }
}

export function setExpenseStatus(id: number, status: BeneficiaryStatus): Record<number, BeneficiaryStatus> {
  const next = { ...loadStatusMap(), [id]: status };
  saveStatusMap(next);
  return next;
}

export function getExpenseStatus(
  id: number,
  category: ExpenseCategory,
  map?: Record<number, BeneficiaryStatus>,
): BeneficiaryStatus {
  const source = map ?? loadStatusMap();
  return source[id] ?? defaultStatusForCategory(category);
}

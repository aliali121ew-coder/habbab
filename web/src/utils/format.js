const enNumberFormat = new Intl.NumberFormat('en-US');

/**
 * Formats an integer amount in Iraqi Dinars using Latin digits and comma thousands separators.
 * Example: 1250000 -> "1,250,000 د.ع"
 */
export function formatIQD(amount) {
  const safe = Math.round(Number(amount) || 0);
  return `${enNumberFormat.format(safe)} د.ع`;
}

export function formatNum(amount) {
  const safe = Math.round(Number(amount) || 0);
  return enNumberFormat.format(safe);
}

/**
 * Formats an ISO date ("YYYY-MM-DD") relative to an anchor date in concise Arabic.
 */
export function timeAgo(isoDate, anchorIso = '2026-11-15') {
  if (!isoDate) return 'غير مسجل';
  const target = new Date(`${isoDate}T00:00:00`).getTime();
  const anchor = new Date(`${anchorIso}T00:00:00`).getTime();
  if (Number.isNaN(target) || Number.isNaN(anchor)) return isoDate;

  const days = Math.max(0, Math.round((anchor - target) / 86_400_000));
  if (days === 0) return 'اليوم';
  if (days === 1) return 'أمس';
  if (days === 2) return 'قبل يومين';
  if (days <= 10) return `قبل ${days} أيام`;
  if (days < 30) return `قبل ${days} يوم`;
  const months = Math.floor(days / 30);
  if (months === 1) return 'قبل شهر';
  if (months === 2) return 'قبل شهرين';
  return `قبل ${months} أشهر`;
}

export function totalEntitlement(family) {
  if (!family?.entitlements) return 0;
  const { salary = 0, aid = 0, medicine = 0, checkups = 0 } = family.entitlements;
  return salary + aid + medicine + checkups;
}

export function disbursementStatus(family) {
  const due = totalEntitlement(family);
  if (family.arrears > 0 && family.paidThisMonth === 0) return 'overdue';
  if (family.arrears > 0 || family.paidThisMonth < due) return 'partial';
  return 'paid';
}

export function familyInitial(name = '') {
  const clean = name.replace(/^(عائلة|الأرملة|الحاجة|أسرة)\s+/g, '').trim();
  const parts = clean.split(/\s+/);
  const word = parts.find((p) => !['الأرملة', 'الحاجة', 'عائلة', 'أم', 'أبو'].includes(p)) || clean;
  return word.charAt(0) || 'ع';
}

export function whatsappUrl(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '#';
  const intl = digits.startsWith('0') ? `964${digits.slice(1)}` : digits;
  return `https://wa.me/${intl}`;
}

export const CATEGORY_CONFIG = {
  critical: {
    key: 'critical',
    label: 'حرجة',
    barClass: 'bg-rose-500',
    dotClass: 'bg-rose-500',
    badgeClass: 'bg-rose-500/10 text-rose-700',
    avatarBg: 'bg-gradient-to-br from-rose-500/15 to-rose-600/25 text-rose-700',
  },
  intensive: {
    key: 'intensive',
    label: 'متوسطة',
    barClass: 'bg-amber-500',
    dotClass: 'bg-amber-500',
    badgeClass: 'bg-amber-500/10 text-amber-700',
    avatarBg: 'bg-gradient-to-br from-amber-500/15 to-amber-600/25 text-amber-700',
  },
  stable: {
    key: 'stable',
    label: 'جيدة',
    barClass: 'bg-emerald-500',
    dotClass: 'bg-emerald-500',
    badgeClass: 'bg-emerald-500/10 text-emerald-700',
    avatarBg: 'bg-gradient-to-br from-emerald-500/15 to-emerald-600/25 text-emerald-700',
  },
};

export const PAYMENT_STATUS_LABELS = {
  all: 'كل الحالات',
  paid: 'مصروف',
  partial: 'جزئي',
  overdue: 'متأخر',
};

export const SORT_LABELS = {
  entitlement_desc: 'الأعلى استحقاقاً',
  visit_desc: 'الأحدث زيارة',
  arrears_desc: 'الأكثر تأخراً',
  name_asc: 'الاسم',
};

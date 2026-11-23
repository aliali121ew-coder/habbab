import type { Feature, Me } from './api';
import type { Route } from './route';

/** Features a foundation can have, in the order the system admin sees them. */
export const FEATURE_LIST: { id: Feature; label: string; hint: string }[] = [
  { id: 'subscribers', label: 'المشتركون والتحصيل', hint: 'المشتركون، المندوبون، التسديد الشهري، الإقفال' },
  { id: 'aid', label: 'المساعدات', hint: 'البرامج وسجل المساعدات' },
  { id: 'expenses', label: 'الحركات المالية', hint: 'المصاريف وسجلها السنوي' },
  { id: 'families', label: 'العوائل المتعففة', hint: 'ملفات العوائل ومساعداتها' },
  { id: 'patients', label: 'المرضى', hint: 'سجل المرضى والوصفات' },
  { id: 'donations', label: 'التبرعات', hint: 'التبرعات والمتبرعون' },
  { id: 'requests', label: 'طلبات المساعدة', hint: 'استقبال الطلبات ومتابعتها' },
  { id: 'worship', label: 'العبادات', hint: 'الصلاة والصيام والمناسبات' },
  { id: 'contests', label: 'المسابقات والجوائز', hint: 'المسابقات والفائزون' },
  { id: 'reports', label: 'التقارير', hint: 'التقارير المطبوعة' },
];

export const hasFeature = (me: Me, feature: Feature | undefined) => !feature || me.features.includes(feature);

// «قيد التطوير» pages that belong to a feature; the others (activity log, settings) are always there.
export const SOON_FEATURE: Record<string, Feature> = {
  aid: 'aid', reports: 'reports', requests: 'requests', donations: 'donations', worship: 'worship', contests: 'contests',
};

/** The feature a page needs, or undefined for pages every foundation has. */
export function routeFeature(route: Route): Feature | undefined {
  if (route === 'families' || route === 'family-detail') return 'families';
  if (route === 'patients' || route === 'patient-detail') return 'patients';
  if (route === 'expenses' || route === 'expenses-ledger') return 'expenses';
  if (route === 'delegates' || typeof route === 'number') return 'subscribers';
  if (typeof route === 'string' && route.startsWith('list:')) return 'subscribers';
  if (typeof route === 'string' && route.startsWith('soon:')) return SOON_FEATURE[route.slice(5)];
  return undefined;
}

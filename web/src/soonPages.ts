import {
  Activity, BarChart3, Gift, HandHeart, Headset, Landmark, Settings, Trophy, type LucideIcon,
} from 'lucide-react';

export type SoonGroup = 'records' | 'admin';

/** Sections already listed in the menu that will be programmed later; each opens a «قيد التطوير» page. */
export const SOON_PAGES: { slug: string; label: string; icon: LucideIcon; group: SoonGroup; hint: string }[] = [
  { slug: 'aid', label: 'المساعدات', icon: HandHeart, group: 'records', hint: 'سجل كامل لكل ما قدّمته المؤسسة من مساعدات: العوائل المتعففة والمرضى والحركات المالية والطلبات.' },
  { slug: 'activity', label: 'سجل العمليات', icon: Activity, group: 'records', hint: 'كل ما يُضاف ويُعدّل ويُحذف في النظام، بمن قام به ومتى.' },
  { slug: 'reports', label: 'التقارير', icon: BarChart3, group: 'admin', hint: 'تقارير شهرية وسنوية للتحصيل والصرف والمستفيدين، قابلة للطباعة.' },
  { slug: 'requests', label: 'طلبات المساعدة', icon: Headset, group: 'admin', hint: 'استقبال طلبات المساعدة الجديدة ومتابعتها حتى البتّ فيها.' },
  { slug: 'donations', label: 'التبرعات', icon: Gift, group: 'admin', hint: 'جدار العطاء: المتبرعون ولوحة الشرف ونبض التبرعات وكل تبرع.' },
  { slug: 'worship', label: 'العبادات', icon: Landmark, group: 'admin', hint: 'متابعة أعمال الصلاة والصيام والمناسبات الدينية المكلّف بها.' },
  { slug: 'contests', label: 'المسابقات والجوائز', icon: Trophy, group: 'admin', hint: 'تنظيم المسابقات وتسجيل الفائزين والجوائز.' },
  { slug: 'settings', label: 'الإعدادات', icon: Settings, group: 'admin', hint: 'بيانات المؤسسة والمستخدمين والصلاحيات.' },
];

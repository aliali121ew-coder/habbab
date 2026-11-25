import {
  BookOpen, Gem, Gift, HandCoins, Hammer, HeartPulse, Landmark, Package, PawPrint, Pill,
  Receipt, Refrigerator, ShoppingBasket, Stethoscope, Sunrise, Wallet, Wrench, type LucideIcon,
} from 'lucide-react';

export type ExpenseCategory =
  | 'cash_gift' | 'medicine' | 'foundation_balance' | 'patient_aid' | 'salaries' | 'building_aid'
  | 'operation_aid' | 'marriage_aid' | 'food' | 'general_aid' | 'cattle' | 'foundation_costs'
  | 'appliances' | 'prayer_fasting' | 'religious_events' | 'appliance_repair' | 'other_aid';

// The seventeen headings of the paper sheet «جدول صرفيات لشهر», in its order.
export const CATEGORIES: { id: ExpenseCategory; label: string; icon: LucideIcon }[] = [
  { id: 'cash_gift', label: 'هدية مالية', icon: Gift },
  { id: 'medicine', label: 'شراء دواء', icon: Pill },
  { id: 'foundation_balance', label: 'رصيد المؤسسة', icon: Landmark },
  { id: 'patient_aid', label: 'مساعدة مريض', icon: HeartPulse },
  { id: 'salaries', label: 'رواتب المؤسسة', icon: Wallet },
  { id: 'building_aid', label: 'مساعدة بناء', icon: Hammer },
  { id: 'operation_aid', label: 'مساعدة عملية', icon: Stethoscope },
  { id: 'marriage_aid', label: 'مساعدة زواج', icon: Gem },
  { id: 'food', label: 'شراء مواد غذائية', icon: ShoppingBasket },
  { id: 'general_aid', label: 'مساعدات عامة', icon: HandCoins },
  { id: 'cattle', label: 'شراء بقر', icon: PawPrint },
  { id: 'foundation_costs', label: 'صرفيات المؤسسة', icon: Receipt },
  { id: 'appliances', label: 'شراء أجهزة كهربائية', icon: Refrigerator },
  { id: 'prayer_fasting', label: 'صلاة – صيام', icon: Sunrise },
  { id: 'religious_events', label: 'مناسبات دينية', icon: BookOpen },
  { id: 'appliance_repair', label: 'تصليح أجهزة كهربائية', icon: Wrench },
  { id: 'other_aid', label: 'مساعدات أمور أخرى', icon: Package },
];

export const CATEGORY_BY_ID = new Map(CATEGORIES.map((item) => [item.id, item]));

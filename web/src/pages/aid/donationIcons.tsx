import {
  Backpack, Banknote, Bed, Beef, BookOpen, Carrot, Coffee, Coins, Cookie, Droplets, Egg, Fan, Fish, Fuel, Gift, Heater, Laptop, Milk, Package, Pill,
  Refrigerator, Shirt, ShoppingBasket, Smartphone, Sofa, Stethoscope, Tv, WashingMachine, Wheat, type LucideIcon,
} from 'lucide-react';

export interface DonationIcon {
  icon: LucideIcon;
  // A short name for what the picture shows.
  label: string;
  // The tile's colour.
  tone: string;
}

// What each donation looks like in the program: money gets a banknote; goods get a picture chosen
// from the words in the item's name (سلة غذائية → basket, طحين → wheat, أدوية → pill …). The first
// rule that matches wins; anything unknown is a gift box. Kept here so every page shows the same one.
const RULES: { words: string[]; icon: DonationIcon }[] = [
  { words: ['سلة', 'سلال', 'غذائية', 'مواد غذائية', 'تموين'], icon: { icon: ShoppingBasket, label: 'سلة غذائية', tone: '#16a34a' } },
  { words: ['طحين', 'رز', 'أرز', 'حنطة', 'قمح', 'شعير', 'برغل', 'عدس', 'حبوب'], icon: { icon: Wheat, label: 'حبوب وطحين', tone: '#d97706' } },
  { words: ['لحم', 'لحوم', 'أضحية', 'اضحية', 'ذبيحة', 'دجاج'], icon: { icon: Beef, label: 'لحوم', tone: '#dc2626' } },
  { words: ['سمك'], icon: { icon: Fish, label: 'سمك', tone: '#0284c7' } },
  { words: ['حليب', 'لبن', 'أجبان', 'جبن'], icon: { icon: Milk, label: 'حليب', tone: '#0ea5e9' } },
  { words: ['بيض'], icon: { icon: Egg, label: 'بيض', tone: '#ca8a04' } },
  { words: ['خضار', 'فواكه', 'فاكهة', 'خضروات'], icon: { icon: Carrot, label: 'خضار وفواكه', tone: '#ea580c' } },
  { words: ['تمر', 'حلويات', 'حلوى', 'كعك', 'معجنات'], icon: { icon: Cookie, label: 'حلويات وتمر', tone: '#b45309' } },
  { words: ['شاي', 'قهوة', 'سكر', 'زيت'], icon: { icon: Coffee, label: 'مواد منزلية', tone: '#92400e' } },
  { words: ['ماء', 'مياه'], icon: { icon: Droplets, label: 'ماء', tone: '#0891b2' } },
  { words: ['دواء', 'أدوية', 'ادوية', 'علاج', 'حبوب دوائية'], icon: { icon: Pill, label: 'أدوية', tone: '#db2777' } },
  { words: ['طبي', 'طبية', 'كرسي متحرك', 'فحوصات'], icon: { icon: Stethoscope, label: 'مستلزمات طبية', tone: '#be185d' } },
  { words: ['ملابس', 'كسوة', 'بطانية', 'بطانيات', 'أغطية', 'احذية', 'أحذية'], icon: { icon: Shirt, label: 'ملابس وأغطية', tone: '#7c3aed' } },
  { words: ['فراش', 'أفرشة', 'افرشة', 'سرير', 'مفارش'], icon: { icon: Bed, label: 'أفرشة', tone: '#6d28d9' } },
  { words: ['ثلاجة', 'براد', 'مجمدة'], icon: { icon: Refrigerator, label: 'ثلاجة', tone: '#2563eb' } },
  { words: ['غسالة'], icon: { icon: WashingMachine, label: 'غسالة', tone: '#1d4ed8' } },
  { words: ['مدفأة', 'صوبة', 'مدافئ'], icon: { icon: Heater, label: 'مدفأة', tone: '#c2410c' } },
  { words: ['مبردة', 'مروحة', 'مكيف', 'سبلت'], icon: { icon: Fan, label: 'تبريد', tone: '#0e7490' } },
  { words: ['تلفزيون', 'شاشة'], icon: { icon: Tv, label: 'تلفزيون', tone: '#334155' } },
  { words: ['حاسبة', 'لابتوب', 'حاسوب'], icon: { icon: Laptop, label: 'حاسبة', tone: '#475569' } },
  { words: ['موبايل', 'هاتف', 'جوال'], icon: { icon: Smartphone, label: 'هاتف', tone: '#475569' } },
  { words: ['أجهزة', 'اجهزة', 'جهاز'], icon: { icon: Refrigerator, label: 'أجهزة', tone: '#2563eb' } },
  { words: ['أثاث', 'اثاث', 'قنفة', 'كراسي'], icon: { icon: Sofa, label: 'أثاث', tone: '#a16207' } },
  { words: ['قرطاسية', 'كتب', 'دفاتر', 'مدرسية'], icon: { icon: BookOpen, label: 'قرطاسية وكتب', tone: '#0f766e' } },
  { words: ['حقيبة', 'حقائب'], icon: { icon: Backpack, label: 'حقائب', tone: '#0f766e' } },
  { words: ['نفط', 'كاز', 'وقود', 'غاز', 'بنزين'], icon: { icon: Fuel, label: 'وقود', tone: '#57534e' } },
  { words: ['ذهب', 'فضة', 'مجوهرات'], icon: { icon: Coins, label: 'ذهب ومجوهرات', tone: '#ca8a04' } },
];

const CASH: DonationIcon = { icon: Banknote, label: 'مبلغ مالي', tone: '#16a34a' };
const OTHER: DonationIcon = { icon: Gift, label: 'مساعدة عينية', tone: '#f59e0b' };
const BOX: DonationIcon = { icon: Package, label: 'مواد', tone: '#f59e0b' };

export function donationIcon(donation: { kind: 'cash' | 'in_kind'; item: string | null }): DonationIcon {
  if (donation.kind === 'cash') return CASH;
  const text = (donation.item ?? '').trim();
  if (!text) return BOX;
  return RULES.find((rule) => rule.words.some((word) => text.includes(word)))?.icon ?? OTHER;
}

// The picture as a rounded tile; size in pixels.
export function DonationIconTile({ donation, size = 40 }: { donation: { kind: 'cash' | 'in_kind'; item: string | null }; size?: number }) {
  const { icon: Icon, label, tone } = donationIcon(donation);
  return (
    <span
      className="dn-icon-tile"
      title={label}
      role="img"
      aria-label={label}
      style={{ width: size, height: size, '--tone': tone } as React.CSSProperties}
    >
      <Icon size={Math.round(size * 0.5)} aria-hidden />
    </span>
  );
}

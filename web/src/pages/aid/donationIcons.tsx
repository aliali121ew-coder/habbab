import type { ComponentType, ReactNode } from 'react';
import {
  Backpack, Bed, BookOpen, Carrot, Coffee, Coins, Cookie, Droplets, Fish, Fuel, Gift, Milk, Package, Pill, Sofa, Stethoscope,
} from 'lucide-react';

// Black-and-white pictures for donations. The eight the foundation asked for are drawn here in one
// line style (money, chicken, cow, egg tray, clothes, electrical appliances, food basket, a sack of
// flour or rice); the rest come from the icon set in the same weight. One rule list decides which
// picture a donation gets, so every page shows the same one.
type Icon = ComponentType<{ size?: number }>;

function Line({ size = 24, children }: { size?: number; children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

const Money: Icon = ({ size }) => (
  <Line size={size}>
    <path d="M6 5.5h13.5a1.5 1.5 0 0 1 1.5 1.5v7.5" />
    <rect x="2.5" y="8" width="16" height="10" rx="1.5" />
    <circle cx="10.5" cy="13" r="2.3" />
    <path d="M5.5 11v4M15.5 11v4" />
  </Line>
);

const Chicken: Icon = ({ size }) => (
  <Line size={size}>
    <path d="M5 13c0-2.9 2.7-5 6-5 .9 0 1.8.2 2.6.5" />
    <path d="M17.5 10.2c.3.7.5 1.5.5 2.3 0 3.6-3.1 6-7 6s-6-2.4-6-5.5" />
    <circle cx="16" cy="7.4" r="2.3" />
    <path d="M14.9 5.1l.5-1.4.8 1 .8-1.1.4 1.5" />
    <path d="M18.2 7.1l1.9.6-1.9.6" />
    <path d="M8 13.2c1.6 1.7 3.8 1.9 5.3.4" />
    <path d="M5 13 2.8 9.8l1 3.3-2-.6 3 2.2" />
    <path d="M9.8 18.5v2.8M13.2 18.5v2.8M8.8 21.3h2M12.2 21.3h2" />
  </Line>
);

const Cow: Icon = ({ size }) => (
  <Line size={size}>
    <path d="M8 7.5c-2.2 0-3.3-1.6-3.3-3.3M16 7.5c2.2 0 3.3-1.6 3.3-3.3" />
    <path d="M7 9.2 3.6 8.6l1.5 2.2M17 9.2l3.4-.6-1.5 2.2" />
    <path d="M8 7.5h8l1.2 3.8-.9 5.4H7.7l-.9-5.4z" />
    <ellipse cx="12" cy="17.6" rx="3.6" ry="2.4" />
    <path d="M10.6 17.6h.01M13.4 17.6h.01" strokeWidth={2.4} />
    <path d="M9.8 11.2h.01M14.2 11.2h.01" strokeWidth={2.6} />
  </Line>
);

const EggTray: Icon = ({ size }) => (
  <Line size={size}>
    <ellipse cx="7" cy="10.5" rx="2.2" ry="2.9" />
    <ellipse cx="12" cy="10" rx="2.2" ry="2.9" />
    <ellipse cx="17" cy="10.5" rx="2.2" ry="2.9" />
    <path d="M2.5 13.5h19l-1.6 5.2a1.5 1.5 0 0 1-1.4 1H5.5a1.5 1.5 0 0 1-1.4-1z" />
    <path d="M7 13.5c0 1.2.9 2.1 2 2.1h6c1.1 0 2-.9 2-2.1" />
  </Line>
);

const Clothes: Icon = ({ size }) => (
  <Line size={size}>
    <path d="M8.5 3.8 3.8 6.3l1.5 4.1 2.2-1v10.8h9V9.4l2.2 1 1.5-4.1-4.7-2.5c-.5 1.5-1.9 2.4-3.5 2.4s-3-.9-3.5-2.4z" />
    <path d="M10 13h4" />
  </Line>
);

const Appliance: Icon = ({ size }) => (
  <Line size={size}>
    <rect x="4.5" y="2.5" width="10" height="19" rx="1.6" />
    <path d="M4.5 9h10M7 5v2M7 11.5v3.5" />
    <path d="M19.8 8.5 17.6 12.6h2.8l-2.3 4" />
  </Line>
);

const Basket: Icon = ({ size }) => (
  <Line size={size}>
    <path d="M7.2 10 10 4.5M16.8 10 14 4.5" />
    <path d="M3 10h18" />
    <path d="M4.2 10l1.5 8.6a1.6 1.6 0 0 0 1.6 1.4h9.4a1.6 1.6 0 0 0 1.6-1.4l1.5-8.6" />
    <path d="M9 13.2v3.6M12 13.2v3.6M15 13.2v3.6" />
  </Line>
);

const Sack: Icon = ({ size }) => (
  <Line size={size}>
    <path d="M8.3 4.3c1 .9 2.2 1.2 3.7 1.2s2.7-.3 3.7-1.2l-1.1 2.8C17.8 8.8 19.5 11.9 19.5 15c0 3.6-3.1 5.6-7.5 5.6S4.5 18.6 4.5 15c0-3.1 1.7-6.2 4.9-7.9z" />
    <path d="M9.4 7.3h5.2" />
    <path d="M12 11v6.3M12 12.8l-1.7-1.2M12 12.8l1.7-1.2M12 15l-1.7-1.2M12 15l1.7-1.2" />
  </Line>
);

export interface DonationIcon {
  icon: Icon;
  // A short name for what the picture shows.
  label: string;
}

const RULES: { words: string[]; icon: DonationIcon }[] = [
  { words: ['سلة', 'سلال', 'غذائية', 'تموين'], icon: { icon: Basket, label: 'سلة غذائية' } },
  { words: ['طحين', 'رز', 'أرز', 'حنطة', 'قمح', 'شعير', 'برغل', 'عدس', 'حبوب', 'كيس'], icon: { icon: Sack, label: 'طحين ورز' } },
  { words: ['دجاج', 'دجاجة', 'فراخ', 'طيور'], icon: { icon: Chicken, label: 'دجاج' } },
  { words: ['بقر', 'بقرة', 'عجل', 'عجول', 'أضحية', 'اضحية', 'ذبيحة', 'لحم', 'لحوم', 'خروف', 'أغنام', 'غنم'], icon: { icon: Cow, label: 'بقر ولحوم' } },
  { words: ['بيض', 'طبقة'], icon: { icon: EggTray, label: 'طبقة بيض' } },
  { words: ['ملابس', 'كسوة', 'بطانية', 'بطانيات', 'أغطية', 'احذية', 'أحذية', 'قماش'], icon: { icon: Clothes, label: 'ملابس' } },
  { words: ['أجهزة', 'اجهزة', 'جهاز', 'كهربائية', 'كهربائي', 'ثلاجة', 'براد', 'مجمدة', 'غسالة', 'مدفأة', 'صوبة', 'مبردة', 'مروحة', 'مكيف', 'سبلت', 'تلفزيون', 'شاشة', 'طباخ'], icon: { icon: Appliance, label: 'أجهزة كهربائية' } },
  { words: ['سمك'], icon: { icon: Fish, label: 'سمك' } },
  { words: ['حليب', 'لبن', 'أجبان', 'جبن'], icon: { icon: Milk, label: 'حليب' } },
  { words: ['خضار', 'فواكه', 'فاكهة', 'خضروات'], icon: { icon: Carrot, label: 'خضار وفواكه' } },
  { words: ['تمر', 'حلويات', 'حلوى', 'كعك', 'معجنات'], icon: { icon: Cookie, label: 'حلويات وتمر' } },
  { words: ['شاي', 'قهوة', 'سكر', 'زيت'], icon: { icon: Coffee, label: 'مواد منزلية' } },
  { words: ['ماء', 'مياه'], icon: { icon: Droplets, label: 'ماء' } },
  { words: ['دواء', 'أدوية', 'ادوية', 'علاج'], icon: { icon: Pill, label: 'أدوية' } },
  { words: ['طبي', 'طبية', 'كرسي متحرك', 'فحوصات'], icon: { icon: Stethoscope, label: 'مستلزمات طبية' } },
  { words: ['فراش', 'أفرشة', 'افرشة', 'سرير', 'مفارش'], icon: { icon: Bed, label: 'أفرشة' } },
  { words: ['أثاث', 'اثاث', 'قنفة', 'كراسي'], icon: { icon: Sofa, label: 'أثاث' } },
  { words: ['قرطاسية', 'كتب', 'دفاتر', 'مدرسية'], icon: { icon: BookOpen, label: 'قرطاسية وكتب' } },
  { words: ['حقيبة', 'حقائب'], icon: { icon: Backpack, label: 'حقائب' } },
  { words: ['نفط', 'كاز', 'وقود', 'غاز', 'بنزين'], icon: { icon: Fuel, label: 'وقود' } },
  { words: ['ذهب', 'فضة', 'مجوهرات'], icon: { icon: Coins, label: 'ذهب ومجوهرات' } },
];

const CASH: DonationIcon = { icon: Money, label: 'مبلغ مالي' };
const OTHER: DonationIcon = { icon: Gift, label: 'مساعدة مادية' };
const BOX: DonationIcon = { icon: Package, label: 'مواد' };

// Each kind's colour (deep, light), the same in the ring, its key and the pictures in the table
// and cards, so a kind is recognised by its colour everywhere.
const TONES: Record<string, [string, string]> = {
  'مبلغ مالي': ['#0f9f6e', '#34d3a0'],
  'بقر ولحوم': ['#2459e0', '#5b9cf6'],
  'طبقة بيض': ['#6d35d9', '#a07cf5'],
  'طحين ورز': ['#d97706', '#fbbf24'],
  'سلة غذائية': ['#be185d', '#f472b6'],
  'دجاج': ['#c2410c', '#fb923c'],
  'ملابس': ['#0e7490', '#22d3ee'],
  'أجهزة كهربائية': ['#4338ca', '#818cf8'],
  'سمك': ['#0369a1', '#38bdf8'],
  'حليب': ['#0d9488', '#5eead4'],
  'خضار وفواكه': ['#15803d', '#4ade80'],
  'حلويات وتمر': ['#a16207', '#facc15'],
  'مواد منزلية': ['#9a3412', '#fdba74'],
  'ماء': ['#0284c7', '#7dd3fc'],
  'أدوية': ['#dc2626', '#f87171'],
  'مستلزمات طبية': ['#e11d48', '#fb7185'],
  'أفرشة': ['#9333ea', '#d8b4fe'],
  'أثاث': ['#92400e', '#f59e0b'],
  'قرطاسية وكتب': ['#1d4ed8', '#93c5fd'],
  'حقائب': ['#be123c', '#fda4af'],
  'وقود': ['#334155', '#94a3b8'],
  'ذهب ومجوهرات': ['#b45309', '#fcd34d'],
};
const PLAIN: [string, string] = ['#64748b', '#a3b1c4'];
export const kindTone = (label: string): [string, string] => TONES[label] ?? PLAIN;

export function donationIcon(donation: { kind: 'cash' | 'in_kind'; item: string | null }): DonationIcon {
  if (donation.kind === 'cash') return CASH;
  const text = (donation.item ?? '').trim();
  if (!text) return BOX;
  return RULES.find((rule) => rule.words.some((word) => text.includes(word)))?.icon ?? OTHER;
}

// The picture as a rounded tile in the kind's colour (white drawing); size in pixels.
export function DonationIconTile({ donation, size = 40 }: { donation: { kind: 'cash' | 'in_kind'; item: string | null }; size?: number }) {
  const { icon: Icon, label } = donationIcon(donation);
  const [deep, light] = kindTone(label);
  return (
    <span className="dn-icon-tile" title={label} role="img" aria-label={label} style={{ width: size, height: size, ['--tone' as string]: deep, ['--tone-2' as string]: light }}>
      <Icon size={Math.round(size * 0.58)} />
    </span>
  );
}

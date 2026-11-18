// Sample patients for designing the shared patients section, before it has a server. Several
// foundations record aid for the same patient; the page shows all of it, whichever foundation
// is looking. Replace with the API once the shared register exists.

export interface AidRecord {
  date: string;
  foundation: string;
  cash: number;
  medicine: number;
  exams: number;
  doctor: string;
  delegate: string;
  note: string;
}

export interface Patient {
  id: number;
  file: string;
  name: string;
  age: number;
  condition: string;
  address: string;
  phone: string;
  tone: number;
  records: AidRecord[];
}

export const FOUNDATIONS = ['مؤسسة سجلات الخير', 'مؤسسة العين للرعاية', 'جمعية الكفيل الخيرية', 'مؤسسة اليتيم'];

// The foundation this copy of the app belongs to; its own purchases are counted apart.
export const OWN_FOUNDATION = FOUNDATIONS[0];

const DOCTORS = ['د. علي الموسوي', 'د. زهراء الربيعي', 'د. حسن الجبوري', 'د. مريم التميمي', 'د. كاظم العبيدي'];

const DELEGATES = ['كرار حيدر', 'مندوب الكاظمية', 'مندوب الأعظمية', 'مندوب الزبير'];

const PEOPLE: [string, number, string, string, string][] = [
  ['حسين علي الكاظمي', 64, 'ضغط وسكري', 'بغداد – الكاظمية، محلة 431', '07701 234 561'],
  ['زينب كاظم الربيعي', 38, 'سرطان الثدي', 'بغداد – الشعلة، قطاع 12', '07802 556 120'],
  ['محمد جاسم التميمي', 9, 'ثلاسيميا', 'بغداد – مدينة الصدر، قطاع 44', '07711 908 334'],
  ['فاطمة حسن العبيدي', 71, 'قصور كلوي', 'بغداد – الحرية، محلة 410', '07903 441 872'],
  ['علي صادق الجبوري', 45, 'عملية قلب مفتوح', 'بغداد – الشعب، شارع 7', '07724 118 905'],
  ['مريم عباس الحسيني', 27, 'تصلب متعدد', 'بغداد – الكرادة، محلة 905', '07815 662 470'],
  ['حيدر كريم الشمري', 52, 'جلطة دماغية', 'بغداد – الأعظمية، محلة 314', '07707 390 218'],
  ['نور محمود الزبيدي', 33, 'ربو مزمن', 'بغداد – البياع، محلة 820', '07830 774 651'],
  ['عباس رشيد المالكي', 58, 'كسر في الحوض', 'بغداد – الدورة، حي الميكانيك', '07719 205 336'],
  ['سارة مجيد الساعدي', 16, 'سكري الأطفال', 'بغداد – الغزالية، محلة 610', '07905 318 447'],
  ['يوسف حميد الخفاجي', 67, 'ماء أبيض في العين', 'بغداد – الزعفرانية، محلة 958', '07733 860 192'],
  ['هدى سلمان البياتي', 49, 'التهاب مفاصل', 'بغداد – حي العامل، محلة 838', '07821 497 503'],
];

// A fixed pseudo-random sequence, so the sample reads the same on every load.
let seed = 7;
const next = () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};
const pick = <T,>(list: T[]) => list[Math.floor(next() * list.length)];
const round = (value: number) => Math.round(value / 5000) * 5000;

export const PATIENTS: Patient[] = PEOPLE.map(([name, age, condition, address, phone], index) => {
  const count = 2 + Math.floor(next() * 4);
  const records: AidRecord[] = Array.from({ length: count }, (_, at) => {
    const month = 1 + Math.floor(next() * 10);
    const day = 1 + Math.floor(next() * 27);
    return {
      date: `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      foundation: index % 3 === 0 && next() < 0.5 ? FOUNDATIONS[0] : pick(FOUNDATIONS),
      cash: next() < 0.75 ? round(50_000 + next() * 450_000) : 0,
      medicine: next() < 0.8 ? round(25_000 + next() * 300_000) : 0,
      exams: next() < 0.6 ? round(15_000 + next() * 60_000) : 0,
      doctor: pick(DOCTORS),
      // Chosen without drawing from the sequence, so the other sample figures stay the same.
      delegate: DELEGATES[(index + at) % DELEGATES.length],
      note: pick(['مراجعة دورية', 'صرف علاج شهري', 'تحاليل وأشعة', 'مساعدة طارئة', 'متابعة بعد العملية']),
    };
  }).sort((a, b) => b.date.localeCompare(a.date));
  return { id: index + 1, file: `PT-${String(20431 + index * 37)}`, name, age, condition, address, phone, tone: index % 6, records };
});

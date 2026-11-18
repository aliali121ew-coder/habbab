// Local-only demo expenses so the expenses pages and the yearly ledger have something to show.
// Fills every one of the seventeen headings across last year and this year up to the current
// month, with amounts sized to each heading. Every row it writes ends its description with
// «(تجريبي)», so `node scripts/seed-expenses.mjs --clear` removes exactly these rows and nothing
// entered by hand. Running it again replaces the earlier demo rows rather than adding to them.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const MARK = ' (تجريبي)';
const clearOnly = process.argv.includes('--clear');
const now = new Date();
const thisYear = now.getUTCFullYear();
const thisMonth = now.getUTCMonth() + 1;
const today = now.toISOString().slice(0, 10);

// Each heading: how often it appears in a month (0..1), entries per month, the amount range in
// dinars, and descriptions to draw from. Salaries come every month; cattle a few times a year.
const HEADINGS = {
  cash_gift: { odds: 0.6, per: [1, 3], amount: [50_000, 250_000], details: ['هدية مالية لعائلة متعففة', 'هدية بمناسبة النجاح', 'هدية لعائلة يتيم'] },
  medicine: { odds: 0.95, per: [2, 5], amount: [40_000, 600_000], details: ['أدوية ضغط وسكر', 'علاج شهري لمريض مزمن', 'أدوية أطفال', 'علاج قلب'] },
  foundation_balance: { odds: 0.5, per: [1, 1], amount: [200_000, 1_000_000], details: ['تحويل إلى رصيد المؤسسة', 'تعزيز رصيد الصندوق'] },
  patient_aid: { odds: 0.8, per: [1, 4], amount: [100_000, 750_000], details: ['مساعدة مريض سرطان', 'تكاليف فحوصات', 'أجور مستشفى'] },
  salaries: { odds: 1, per: [1, 1], amount: [1_800_000, 2_400_000], details: ['رواتب موظفي المؤسسة'] },
  building_aid: { odds: 0.35, per: [1, 2], amount: [500_000, 3_000_000], details: ['ترميم سقف منزل', 'بناء غرفة لعائلة', 'إصلاح جدار'] },
  operation_aid: { odds: 0.45, per: [1, 2], amount: [750_000, 4_000_000], details: ['عملية قلب مفتوح', 'عملية عيون', 'عملية كسر'] },
  marriage_aid: { odds: 0.3, per: [1, 2], amount: [500_000, 1_500_000], details: ['مساعدة زواج شاب', 'تجهيز عروس'] },
  food: { odds: 0.9, per: [1, 3], amount: [300_000, 1_500_000], details: ['سلات غذائية', 'مواد غذائية للعوائل', 'طحين ورز وزيت'] },
  general_aid: { odds: 0.7, per: [1, 3], amount: [50_000, 400_000], details: ['مساعدة عامة لعائلة', 'إيجار منزل', 'فاتورة كهرباء'] },
  cattle: { odds: 0.15, per: [1, 1], amount: [1_500_000, 3_500_000], details: ['شراء بقرة لعائلة منتجة', 'شراء عجل'] },
  foundation_costs: { odds: 0.85, per: [1, 2], amount: [75_000, 500_000], details: ['قرطاسية ومطبوعات', 'أجور نقل', 'صيانة مقر المؤسسة'] },
  appliances: { odds: 0.35, per: [1, 2], amount: [250_000, 900_000], details: ['ثلاجة لعائلة', 'مبردة هواء', 'طباخ غاز'] },
  prayer_fasting: { odds: 0.4, per: [1, 3], amount: [100_000, 600_000], details: ['صلاة وصيام عن متوفى'] },
  religious_events: { odds: 0.3, per: [1, 2], amount: [300_000, 2_000_000], details: ['إطعام في مناسبة دينية', 'مجلس عزاء'] },
  appliance_repair: { odds: 0.4, per: [1, 2], amount: [25_000, 200_000], details: ['تصليح ثلاجة', 'تصليح مبردة', 'تصليح غسالة'] },
  other_aid: { odds: 0.4, per: [1, 2], amount: [50_000, 500_000], details: ['مساعدة طالب جامعي', 'رسوم مدرسية', 'ملابس عيد'] },
};
// Religious months bring more of these headings; winter brings appliance repairs down, summer up.
const SEASON = { religious_events: [3, 6, 7], prayer_fasting: [3, 4], appliances: [6, 7, 8], food: [3, 4, 12] };

const NAMES = [
  'حسين علي الموسوي', 'زينب كاظم الربيعي', 'محمد جاسم التميمي', 'فاطمة حسن العبيدي', 'علي صادق الجبوري',
  'مريم عباس الحسيني', 'حيدر كريم الشمري', 'نور محمود الزبيدي', 'عباس رشيد المالكي', 'سارة مجيد الساعدي',
  'يوسف حميد الخفاجي', 'هدى سلمان البياتي', 'مصطفى جعفر الطائي', 'رقية فاضل الدليمي', 'كرار ناصر العامري',
];

// A seeded generator, so a re-run produces the same demo year.
let state = 20251108;
const random = () => {
  state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
  return state / 2_147_483_648;
};
const between = ([low, high]) => low + Math.floor(random() * (high - low + 1));
const pick = (list) => list[Math.floor(random() * list.length)];
const roundTo = (value, step) => Math.max(step, Math.round(value / step) * step);
const quote = (text) => `'${text.replaceAll("'", "''")}'`;

const lines = [`DELETE FROM expenses WHERE details LIKE ${quote(`%${MARK}`)};`];
let count = 0;

if (!clearOnly) {
  const rows = [];
  for (const year of [thisYear - 1, thisYear]) {
    const lastMonth = year === thisYear ? thisMonth : 12;
    for (let month = 1; month <= lastMonth; month++) {
      const period = `${year}-${String(month).padStart(2, '0')}`;
      // The current month only runs to today.
      const lastDay = year === thisYear && month === thisMonth ? now.getUTCDate() : new Date(Date.UTC(year, month, 0)).getUTCDate();
      for (const [category, heading] of Object.entries(HEADINGS)) {
        const inSeason = SEASON[category]?.includes(month);
        if (random() > Math.min(1, heading.odds * (inSeason ? 1.8 : 1))) continue;
        const entries = between(heading.per) + (inSeason ? 1 : 0);
        for (let index = 0; index < entries; index++) {
          const day = `${period}-${String(between([1, lastDay])).padStart(2, '0')}`;
          const amount = roundTo(between(heading.amount) * (inSeason ? 1.3 : 1), heading.amount[0] >= 500_000 ? 50_000 : 5_000);
          const person = category === 'salaries' || category === 'foundation_balance' || category === 'foundation_costs' ? 'المؤسسة' : pick(NAMES);
          rows.push(`(${quote(category)}, ${amount}, ${quote(period)}, ${quote(day > today ? today : day)}, ${quote(pick(heading.details) + MARK)}, ${quote(person)}, 1)`);
        }
      }
    }
  }
  count = rows.length;
  for (let index = 0; index < rows.length; index += 200) {
    lines.push(`INSERT INTO expenses (category, amount, month, spent_on, details, beneficiary_name, created_by) VALUES\n${rows.slice(index, index + 200).join(',\n')};`);
  }
}

mkdirSync('scripts/out', { recursive: true });
writeFileSync('scripts/out/expenses.sql', lines.join('\n'));
execFileSync('npx', ['wrangler', 'd1', 'execute', 'ahbab-db', '--local', '--file', 'scripts/out/expenses.sql'], { stdio: 'inherit', shell: true });
console.log(clearOnly ? 'Removed the demo expenses.' : `Seeded ${count} demo expenses across all ${Object.keys(HEADINGS).length} headings for ${thisYear - 1} and ${thisYear}.`);

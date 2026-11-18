// Local-only demo delegates, so the delegates page can be seen at a realistic size.
// Run after seed:dev. Each gets its own subscribers and payments; safe to run twice.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const CITIES = [
  'الموصل', 'أربيل', 'السليمانية', 'دهوك', 'كركوك', 'تكريت', 'سامراء', 'بعقوبة', 'الرمادي', 'الفلوجة', 'كربلاء', 'النجف',
  'الحلة', 'الكوت', 'الديوانية', 'السماوة', 'الناصرية', 'العمارة', 'الزبير', 'أبو الخصيب', 'الفاو', 'القرنة', 'المدائن', 'الكاظمية',
  'الأعظمية', 'الكرادة', 'المنصور', 'الدورة', 'الشعلة', 'الحرية', 'بلد', 'الدجيل', 'خانقين', 'المقدادية', 'هيت', 'حديثة',
  'تلعفر', 'زاخو', 'الكوفة', 'المحاويل', 'الشطرة', 'الرفاعي',
];
const GIVEN = [
  'أحمد', 'محمد', 'علي', 'حسين', 'حسن', 'حيدر', 'مصطفى', 'يوسف', 'عباس', 'كريم',
  'مرتضى', 'سجاد', 'عمار', 'ياسر', 'قاسم', 'زيد', 'نبيل', 'طارق', 'وليد', 'خالد',
  'زينب', 'فاطمة', 'مريم', 'سارة', 'نور', 'حوراء', 'رقية', 'زهراء', 'هدى', 'آية',
];
const FATHERS = [
  'محمد', 'علي', 'حسين', 'حسن', 'عبد الله', 'كاظم', 'جعفر', 'صادق', 'إبراهيم', 'أحمد',
  'جاسم', 'فاضل', 'عباس', 'كريم', 'صالح', 'محمود', 'حميد', 'مجيد', 'رشيد', 'سلمان',
];
const LAST = [
  'الكاظمي', 'العبيدي', 'الجبوري', 'التميمي', 'الموسوي', 'الربيعي', 'الدليمي', 'الحسيني',
  'الشمري', 'الزبيدي', 'العامري', 'الساعدي', 'المالكي', 'الخفاجي', 'البياتي', 'الطائي',
];
const normalize = (text) => text.replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');

const FEE = 5000;
const FIRST_ID = 101;
const LAST_ID = FIRST_ID + CITIES.length - 1;
const YEAR = new Date().getUTCFullYear();
const LAST_MONTH = new Date().getUTCMonth() + 1;

const lines = [];
CITIES.forEach((city, index) => {
  const id = FIRST_ID + index;
  lines.push(`INSERT OR IGNORE INTO users (id, username, full_name, role, password_hash, must_change_password)
SELECT ${id}, 'delegate${id}', 'مندوب ${city}', 'delegate', password_hash, 0 FROM users WHERE username = 'admin';`);

  const values = [];
  const count = 40 + ((index + 1) * 37) % 260;
  for (let j = 1; j <= count; j++) {
    const first = GIVEN[(j + index * 3) % GIVEN.length];
    const father = FATHERS[(j * 7 + index) % FATHERS.length];
    const resolvedFather = father === first ? FATHERS[(j * 7 + index + 1) % FATHERS.length] : father;
    const last = LAST[(j * 5 + index) % LAST.length];
    const name = `${first} ${resolvedFather} ${last}`;
    const status = j % 20 === 0 ? 'deceased' : 'alive';
    values.push(`('${name}','${normalize(name)}','0771${id}${String(j).padStart(4, '0')}','${status}',${id},${1 + (j % 8)},${FEE},1)`);
  }
  // Skipped whole when this delegate already has subscribers.
  lines.push(`INSERT INTO subscribers (full_name, name_norm, phone, status, delegate_id, family_size, monthly_fee, created_by)
SELECT * FROM (VALUES ${values.join(',')}) WHERE NOT EXISTS (SELECT 1 FROM subscribers WHERE delegate_id = ${id});`);
});

for (let month = 1; month <= LAST_MONTH; month++) {
  const period = `${YEAR}-${String(month).padStart(2, '0')}`;
  lines.push(`INSERT OR IGNORE INTO transactions (type, amount, month, tx_date, subscriber_id, party_name, delegate_id, period, created_by)
SELECT 'delegate_receipt', ${FEE}, '${period}', '${period}-10', id, full_name, delegate_id, '${period}', 1
FROM subscribers
WHERE delegate_id BETWEEN ${FIRST_ID} AND ${LAST_ID} AND status = 'alive' AND deleted_at IS NULL
  AND (id + ${month}) % (2 + delegate_id % 6) <> 0;`);
}

mkdirSync('scripts/out', { recursive: true });
writeFileSync('scripts/out/delegates.sql', lines.join('\n'));
execFileSync('npx', ['wrangler', 'd1', 'execute', 'ahbab-db', '--local', '--file', 'scripts/out/delegates.sql'], { stdio: 'inherit', shell: true });
console.log(`Seeded ${CITIES.length} delegates`);

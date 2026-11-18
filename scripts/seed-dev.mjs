// Local-only demo data. Creates one user per role (password: Test-Pass-123) and
// SEED_SUBSCRIBERS subscribers (default 25000) so row counts can be measured at real size.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { webcrypto as crypto } from 'node:crypto';

const COUNT = Number(process.env.SEED_SUBSCRIBERS ?? 25000);
const PASSWORD = 'Test-Pass-123';

const b64u = (bytes) => Buffer.from(bytes).toString('base64url');

async function hashPassword(value) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(value), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 }, key, 256);
  return `pbkdf2$100000$${b64u(salt)}$${b64u(new Uint8Array(bits))}`;
}

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

const hash = await hashPassword(PASSWORD);
const lines = [`DELETE FROM users WHERE username IN ('admin','accountant','delegate1','delegate2','health');`];
const users = [
  [1, 'admin', 'مدير النظام', 'admin'],
  [2, 'accountant', 'المحاسب', 'accountant'],
  [3, 'delegate1', 'مندوب بغداد', 'delegate'],
  [4, 'delegate2', 'مندوب البصرة', 'delegate'],
  [5, 'health', 'المسؤول الصحي', 'health'],
];
for (const [id, username, name, role] of users) {
  lines.push(`INSERT INTO users (id, username, full_name, role, password_hash, must_change_password) VALUES (${id}, '${username}', '${name}', '${role}', '${hash}', 0);`);
}

for (let i = 1; i <= COUNT; i += 500) {
  const values = [];
  for (let j = i; j < i + 500 && j <= COUNT; j++) {
    const first = GIVEN[j % GIVEN.length];
    const father = FATHERS[(j * 7 + 3) % FATHERS.length];
    const resolvedFather = father === first ? FATHERS[(j * 7 + 4) % FATHERS.length] : father;
    const last = LAST[(j * 11 + 5) % LAST.length];
    const name = `${first} ${resolvedFather} ${last}`;
    const phone = `0770${String(1000000 + j).slice(-7)}`;
    const delegate = j % 3 === 0 ? 3 : 4;
    // About one in twenty is deceased, spread by a multiplicative hash rather than j % 20: the
    // father's name also cycles every 20, so j % 20 made every deceased «زينب» share one father and
    // sort ahead of every living one, and a status-filtered name search read 447 rows, not 30.
    const status = Math.floor(((j * 2654435761) % 2 ** 32) / 2 ** 32 * 20) === 0 ? 'deceased' : 'alive';
    values.push(`('${name}','${normalize(name)}','${phone}','${status}',${delegate},${1 + (j % 8)},1)`);
  }
  lines.push(`INSERT INTO subscribers (full_name, name_norm, phone, status, delegate_id, family_size, created_by) VALUES ${values.join(',')};`);
}

mkdirSync('scripts/out', { recursive: true });
writeFileSync('scripts/out/seed.sql', lines.join('\n'));
execFileSync('npx', ['wrangler', 'd1', 'execute', 'ahbab-db', '--local', '--file', 'scripts/out/seed.sql'], { stdio: 'inherit', shell: true });
console.log(`Seeded ${COUNT} subscribers. All accounts use password ${PASSWORD}`);

// Families on the server, against the local dev server (npm run dev, port 8787).
// Foundation 1's manager files a family; its delegate sees only their own; a second foundation
// files the same family (same head's four-part name), confirms the match, and each foundation then
// sees the other's aid (type, amount, date, foundation name) and nothing else of its file.
// Everything made here is removed at the end.
import { execFileSync } from 'node:child_process';
import { webcrypto as crypto } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.BASE ?? 'http://localhost:8787';
const F2 = 2;
const PASSWORD = 'Families-Test-1';
const HEAD = 'زينب كاظم جواد الربيعي';
const SQL_FILE = join(tmpdir(), `ahbab-families-${process.pid}.sql`);
const sql = (command) => {
  writeFileSync(SQL_FILE, command);
  const out = execFileSync('npx', ['wrangler', 'd1', 'execute', 'ahbab-db', '--local', '--json', '--file', SQL_FILE],
    { encoding: 'utf8', shell: true, stdio: ['ignore', 'pipe', 'ignore'] });
  const parsed = JSON.parse(out);
  return parsed[parsed.length - 1].results;
};
const b64u = (bytes) => Buffer.from(bytes).toString('base64url');
async function hashPassword(value) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(value), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 }, key, 256);
  return `pbkdf2$100000$${b64u(salt)}$${b64u(new Uint8Array(bits))}`;
}
const cleanup = () => sql(`
  DELETE FROM family_members WHERE family_id IN (SELECT id FROM families WHERE head_name LIKE '%الربيعي' AND name LIKE '%اختبار%');
  DELETE FROM family_payments WHERE family_id IN (SELECT id FROM families WHERE name LIKE '%اختبار%');
  DELETE FROM family_visits WHERE family_id IN (SELECT id FROM families WHERE name LIKE '%اختبار%');
  DELETE FROM families WHERE name LIKE '%اختبار%';
  DELETE FROM audit_log WHERE foundation_id = ${F2};
  DELETE FROM users WHERE foundation_id = ${F2};
  DELETE FROM foundations WHERE id = ${F2};`);

async function login(username, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-app': '1' }, body: JSON.stringify({ username, password }),
  });
  if (res.status !== 200) throw new Error(`login ${username}: ${res.status}`);
  const cookie = res.headers.get('set-cookie').split(';')[0];
  return async (method, path, body) => {
    const r = await fetch(`${BASE}/api${path}`, {
      method, headers: { cookie, 'x-app': '1', ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try { json = await r.json(); } catch { /* empty */ }
    return { status: r.status, json };
  };
}

const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok, detail });
const today = new Date().toISOString().slice(0, 10);

cleanup();
const [d1] = sql("SELECT id, full_name FROM users WHERE foundation_id = 1 AND role = 'delegate' AND username = 'delegate1'");
const [d2] = sql("SELECT id FROM users WHERE foundation_id = 1 AND role = 'delegate' AND username = 'delegate2'");

const admin = await login('admin', 'Test-Pass-123');
const created = await admin('POST', '/families', {
  name: 'عائلة اختبار الربيعي', headName: HEAD, category: 'critical', socialStatus: 'أرملة وأيتام', region: 'الشعلة',
  address: 'بغداد – الشعلة، عنوان سري', housing: 'إيجار', rent: 300000, delegateId: d1.id,
  entitlements: { salary: 250000, aid: 150000, medicine: 0, checkups: 0 }, notes: 'ملاحظة خاصة بالمؤسسة الأولى',
  members: [{ name: HEAD, relation: 'الأم', age: 38, status: 'ربة بيت' }, { name: 'علي قاسم', relation: 'ابن', age: 9, status: 'طالب' }],
});
check('create family', created.status === 201, `status ${created.status} ${JSON.stringify(created.json)}`);
const id1 = created.json?.id;

const detail = await admin('GET', `/families/${id1}`);
check('file number given', /^FM-\d+$/.test(detail.json?.fileNo ?? ''), detail.json?.fileNo);
check('members saved', detail.json?.members.length === 2, `${detail.json?.members.length}`);
check('arrears = entitlements', detail.json?.arrears === 400000 && detail.json?.paidThisMonth === 0, `${detail.json?.arrears}`);

const pay = await admin('POST', `/families/${id1}/payments`, { date: today, amount: 250000, type: 'راتب شهري', receivedBy: 'زينب', by: d1.full_name });
const visit = await admin('POST', `/families/${id1}/visits`, { date: today, delegateName: d1.full_name, note: 'زيارة اختبار' });
const after = await admin('GET', `/families/${id1}`);
check('payment counts this month', pay.status === 201 && after.json?.paidThisMonth === 250000 && after.json?.arrears === 150000, `${after.json?.paidThisMonth}/${after.json?.arrears}`);
check('visit recorded', visit.status === 201 && after.json?.lastVisit === today, after.json?.lastVisit);

const addM = await admin('POST', `/families/${id1}/members`, { name: 'رقية قاسم', relation: 'ابنة', age: 7, status: 'طالبة' });
const withM = await admin('GET', `/families/${id1}`);
const rq = withM.json?.members.find((m) => m.name === 'رقية قاسم');
const editM = await admin('PATCH', `/families/${id1}/members/${rq?.id}`, { age: 8, chronic: 'ربو' });
const delM = await admin('DELETE', `/families/${id1}/members/${withM.json?.members.find((m) => m.name === 'علي قاسم')?.id}`);
const afterM = await admin('GET', `/families/${id1}`);
check('members add / edit / remove', addM.status === 201 && editM.status === 200 && delM.status === 200
  && afterM.json?.members.length === 2 && afterM.json.members.find((m) => m.name === 'رقية قاسم')?.age === 8, JSON.stringify(afterM.json?.members.map((m) => [m.name, m.age])));

const bulk = await admin('POST', '/families/bulk-pay', { ids: [id1], date: today });
const afterBulk = await admin('GET', `/families/${id1}`);
check('bulk pay settles what is due', bulk.json?.paid === 1 && afterBulk.json?.arrears === 0, `${afterBulk.json?.arrears}`);

const patch = await admin('PATCH', `/families/${id1}`, { entitlements: { salary: 300000, aid: 150000, medicine: 0, checkups: 0 } });
const afterPatch = await admin('GET', `/families/${id1}`);
check('entitlements edit', patch.status === 200 && afterPatch.json?.entitlements.salary === 300000 && afterPatch.json.arrears === 50000, `${afterPatch.json?.arrears}`);

const log = sql(`SELECT action FROM audit_log WHERE entity = 'family' AND entity_id = ${id1} ORDER BY id`).map((r) => r.action).join(',');
check('every change in the activity log', ['create', 'pay', 'visit', 'add_member', 'update_member', 'remove_member', 'update'].every((a) => log.includes(a)), log);

// The delegate: only their own families.
const del1 = await login('delegate1', 'Test-Pass-123');
const del2 = await login('delegate2', 'Test-Pass-123');
const own = await del1('GET', '/families');
check('delegate sees own family', own.json?.items.some((f) => f.id === id1), `${own.status}`);
const other = await del2('GET', `/families/${id1}`);
const otherList = await del2('GET', '/families');
check("another delegate cannot open it", other.status === 404 && !otherList.json?.items.some((f) => f.id === id1), `${other.status}`);
const move = await del1('PATCH', `/families/${id1}`, { delegateId: d2.id });
check('delegate cannot move the family', move.status === 403, `${move.status}`);

// A second foundation with the same family.
const hash = await hashPassword(PASSWORD);
sql(`INSERT INTO foundations (id, name, features) VALUES (${F2}, 'مؤسسة اختبار الربط', '["families"]');
  INSERT INTO users (id, foundation_id, username, full_name, role, password_hash, must_change_password)
    VALUES (991001, ${F2}, 'link_admin', 'مدير الربط', 'admin', '${hash}', 0);`);
const f2 = await login('link_admin', PASSWORD);
const match = await f2('POST', '/families/match', { headName: 'زينب كاظم جواد الربيعي' });
check('match by four-part name', match.json?.items.length === 1 && match.json.items[0].id === id1, JSON.stringify(match.json));
check('match shows only foundation and region', Object.keys(match.json?.items[0] ?? {}).sort().join() === 'foundation,id,region', Object.keys(match.json?.items[0] ?? {}).join());
const noMatch = await f2('POST', '/families/match', { headName: 'زينب كاظم الربيعي' });
check('three-part name does not match', noMatch.json?.items.length === 0, JSON.stringify(noMatch.json));

const c2 = await f2('POST', '/families', { name: 'عائلة اختبار الربيعي (الثانية)', headName: HEAD, region: 'الشعلة', address: 'عنوان المؤسسة الثانية', linkTo: id1 });
const id2 = c2.json?.id;
await f2('POST', `/families/${id2}/payments`, { date: today, amount: 75000, type: 'سلة غذائية' });

const seenBy1 = await admin('GET', `/families/${id1}`);
check('foundation 1 sees the other foundation\'s aid', seenBy1.json?.shared?.some((s) => s.amount === 75000 && s.type === 'سلة غذائية' && s.foundation === 'مؤسسة اختبار الربط'), JSON.stringify(seenBy1.json?.shared));
const seenBy2 = await f2('GET', `/families/${id2}`);
const sharedKeys = new Set((seenBy2.json?.shared ?? []).flatMap((s) => Object.keys(s)));
check('foundation 2 sees foundation 1\'s aid', (seenBy2.json?.shared ?? []).filter((s) => s.foundation === 'مؤسسة أحباب الحسين الثقافية الخيرية').length >= 2, `${seenBy2.json?.shared?.length}`);
check('shared aid carries no address, members or notes', [...sharedKeys].sort().join() === 'amount,foundation,foundation_id,paid_on,type', [...sharedKeys].join());
check('foundation 2 keeps its own address', seenBy2.json?.address === 'عنوان المؤسسة الثانية' && seenBy2.json?.members.length === 0, seenBy2.json?.address);
const peek = await f2('GET', `/families/${id1}`);
check('foundation 2 cannot open foundation 1\'s file', peek.status === 404, `${peek.status}`);
const peekList = await f2('GET', '/families');
check('foundation 2 lists only its own', peekList.json?.items.every((f) => f.id === id2), `${peekList.json?.items.length}`);

const unlink = await admin('DELETE', `/families/${id1}/link`);
const afterUnlink = await admin('GET', `/families/${id1}`);
check('unlink stops sharing', unlink.status === 200 && (afterUnlink.json?.shared ?? []).length === 0, `${afterUnlink.json?.shared?.length}`);

cleanup();
const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  (${r.detail})`);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);

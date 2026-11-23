// Patients on the server, against the local dev server (npm run dev, port 8787).
// Foundation 1's health officer files a patient and records aid; an accountant cannot see
// patients; a second foundation files the same patient (same four-part name), confirms the match,
// and each foundation then sees the other's aid (amounts, date, foundation name) and nothing else.
// Every change is in its own foundation's activity log. Everything made here is removed at the end.
import { execFileSync } from 'node:child_process';
import { webcrypto as crypto } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.BASE ?? 'http://localhost:8787';
const F2 = 2;
const PASSWORD = 'Patients-Test-1';
const NAME = 'حسين علي كاظم اختبار';
const SQL_FILE = join(tmpdir(), `ahbab-patients-${process.pid}.sql`);
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
  DELETE FROM audit_log WHERE entity = 'patient' AND entity_id IN (SELECT id FROM patients WHERE name LIKE '%اختبار%');
  DELETE FROM patient_aids WHERE patient_id IN (SELECT id FROM patients WHERE name LIKE '%اختبار%');
  DELETE FROM patients WHERE name LIKE '%اختبار%';
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
const health = await login('health', 'Test-Pass-123');
const admin = await login('admin', 'Test-Pass-123');
const accountant = await login('accountant', 'Test-Pass-123');

const created = await health('POST', '/patients', {
  name: NAME, age: 54, gender: 'male', condition: 'فشل كلوي', address: 'عنوان سري للمؤسسة الأولى', phone: '07700000001', notes: 'ملاحظة خاصة',
});
check('health officer files a patient', created.status === 201, `status ${created.status} ${JSON.stringify(created.json)}`);
const id1 = created.json?.id;
const fresh = await health('GET', `/patients/${id1}`);
check('file number given', /^PT-\d+$/.test(fresh.json?.file ?? ''), fresh.json?.file);
check('a new patient has no aid', fresh.json?.records?.length === 0, `${fresh.json?.records?.length}`);

const aid = await health('POST', `/patients/${id1}/aids`, { date: today, cash: 100000, medicine: 45000, exams: 0, doctor: 'د. سري', delegate: 'مندوب سري', note: 'تفصيل سري' });
const empty = await health('POST', `/patients/${id1}/aids`, { date: today, cash: 0, medicine: 0, exams: 0 });
check('aid recorded, an empty aid refused', aid.status === 201 && empty.status === 422, `${aid.status}/${empty.status}`);
const withAid = await health('GET', `/patients/${id1}`);
const rec = withAid.json?.records?.[0];
check('aid shows as own with its details', rec?.own === true && rec.cash === 100000 && rec.medicine === 45000 && rec.doctor === 'د. سري', JSON.stringify(rec));

const edit = await health('PATCH', `/patients/${id1}/aids/${rec?.id}`, { date: today, cash: 120000, medicine: 45000, exams: 25000, doctor: 'د. سري', delegate: 'مندوب سري', note: 'تفصيل سري' });
const afterEdit = await health('GET', `/patients/${id1}`);
check('aid edit', edit.status === 200 && afterEdit.json?.records?.[0]?.cash === 120000 && afterEdit.json.records[0].exams === 25000, `${edit.status}`);
const patch = await health('PATCH', `/patients/${id1}`, { condition: 'فشل كلوي — غسيل أسبوعي' });
check('patient edit', patch.status === 200, `${patch.status}`);

const list = await health('GET', '/patients');
check('list carries the patient with its aid', list.json?.items?.some((p) => p.id === id1 && p.records.length === 1), `${list.status}`);
const noAccess = await accountant('GET', '/patients');
check('accountant cannot see patients', noAccess.status === 403, `${noAccess.status}`);
const healthDelete = await health('DELETE', `/patients/${id1}/aids/${rec?.id}`);
check('only the manager deletes an aid', healthDelete.status === 403, `${healthDelete.status}`);

const log = sql(`SELECT action FROM audit_log WHERE entity = 'patient' AND entity_id = ${id1} AND foundation_id = 1 ORDER BY id`).map((r) => r.action).join(',');
check('every change in foundation 1\'s activity log', ['create', 'aid', 'update_aid', 'update'].every((a) => log.includes(a)), log);

// A second foundation with the same patient.
const hash = await hashPassword(PASSWORD);
sql(`INSERT INTO foundations (id, name, features) VALUES (${F2}, 'مؤسسة اختبار المرضى', '["patients"]');
  INSERT INTO users (id, foundation_id, username, full_name, role, password_hash, must_change_password)
    VALUES (991002, ${F2}, 'pat_admin', 'مدير المرضى', 'admin', '${hash}', 0);`);
const f2 = await login('pat_admin', PASSWORD);
const match = await f2('POST', '/patients/match', { name: 'حسين  علي كاظم اختبار' });
check('match by four-part name', match.json?.items?.length === 1 && match.json.items[0].id === id1, JSON.stringify(match.json));
check('match shows only the foundation', match.json?.items?.[0]?.foundation === 'مؤسسة أحباب الحسين الثقافية الخيرية' && !('name' in (match.json?.items?.[0] ?? {})), JSON.stringify(match.json?.items?.[0]));

const c2 = await f2('POST', '/patients', { name: NAME, condition: 'حالة المؤسسة الثانية', address: 'عنوان الثانية', linkTo: id1 });
const id2 = c2.json?.id;
await f2('POST', `/patients/${id2}/aids`, { date: today, cash: 0, medicine: 60000, exams: 15000, doctor: 'طبيب الثانية', note: 'سر الثانية' });

const seenBy1 = await health('GET', `/patients/${id1}`);
const theirs = seenBy1.json?.records?.find((r) => !r.own);
check('foundation 1 sees the other foundation\'s aid', theirs?.foundation === 'مؤسسة اختبار المرضى' && theirs.medicine === 60000 && theirs.exams === 15000, JSON.stringify(theirs));
check('...without its doctor, delegate or notes', theirs && theirs.doctor === '' && theirs.delegate === '' && theirs.note === '', JSON.stringify(theirs));
const seenBy2 = await f2('GET', `/patients/${id2}`);
const ours = seenBy2.json?.records?.find((r) => !r.own);
check('foundation 2 sees foundation 1\'s aid, not its details', ours?.cash === 120000 && ours.doctor === '' && ours.note === '', JSON.stringify(ours));
check('foundation 2 keeps its own file', seenBy2.json?.address === 'عنوان الثانية' && seenBy2.json.condition === 'حالة المؤسسة الثانية' && seenBy2.json.phone === '', seenBy2.json?.address);
const peek = await f2('GET', `/patients/${id1}`);
check('foundation 2 cannot open foundation 1\'s file', peek.status === 404, `${peek.status}`);
const peekList = await f2('GET', '/patients');
check('foundation 2 lists only its own', peekList.json?.items?.every((p) => p.id === id2), `${peekList.json?.items?.length}`);
const peekAid = await f2('PATCH', `/patients/${id1}/aids/${rec?.id}`, { date: today, cash: 1 });
check('foundation 2 cannot edit foundation 1\'s aid', peekAid.status === 404, `${peekAid.status}`);
const f2log = await f2('GET', '/audit');
check('foundation 2\'s log holds only its own entries', (f2log.json?.items ?? []).every((a) => a.user_name === 'مدير المرضى' || a.user_name === null)
  && (f2log.json?.items ?? []).some((a) => a.entity === 'patient'), `${f2log.json?.items?.length}`);
const f1log = await admin('GET', '/audit?q=' + encodeURIComponent('سر الثانية'));
check('foundation 1\'s log does not show foundation 2\'s entries', (f1log.json?.items ?? []).length === 0, `${f1log.json?.items?.length}`);

const unlink = await admin('DELETE', `/patients/${id1}/link`);
const afterUnlink = await health('GET', `/patients/${id1}`);
check('unlink stops sharing', unlink.status === 200 && afterUnlink.json?.records?.every((r) => r.own), `${afterUnlink.json?.records?.length}`);
const del = await admin('DELETE', `/patients/${id1}/aids/${rec?.id}`);
const afterDel = await health('GET', `/patients/${id1}`);
check('manager deletes an aid', del.status === 200 && afterDel.json?.records?.length === 0, `${del.status}`);

cleanup();
const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  (${r.detail})`);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);

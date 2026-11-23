// Foundation isolation test, against the local dev server (npm run dev, port 8787).
// Creates foundation 2 with its own admin, delegate, subscriber, payment and program, then signs
// in as foundation 2 and tries to read, change and delete foundation 1's records through every
// route; and the other way round. Every attempt must fail or come back empty, and foundation 1's
// rows must be unchanged afterwards. Foundation 2 is removed at the end.
import { execFileSync } from 'node:child_process';
import { webcrypto as crypto } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.BASE ?? 'http://localhost:8787';
const PASSWORD = 'Isolation-Test-1';
const F2 = 2;
const IDS = { admin: 990001, delegate: 990002, subscriber: 99000001, program: 9901 };

const b64u = (bytes) => Buffer.from(bytes).toString('base64url');
async function hashPassword(value) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(value), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 }, key, 256);
  return `pbkdf2$100000$${b64u(salt)}$${b64u(new Uint8Array(bits))}`;
}

// Through a file: a multi-line --command does not survive the Windows shell.
const SQL_FILE = join(tmpdir(), `ahbab-isolation-${process.pid}.sql`);
const sql = (command) => {
  writeFileSync(SQL_FILE, command);
  const out = execFileSync('npx', ['wrangler', 'd1', 'execute', 'ahbab-db', '--local', '--json', '--file', SQL_FILE],
    { encoding: 'utf8', shell: true, stdio: ['ignore', 'pipe', 'ignore'] });
  const parsed = JSON.parse(out);
  return parsed[parsed.length - 1].results;
};

function cleanup() {
  sql(`DELETE FROM subscriber_year WHERE subscriber_id = ${IDS.subscriber};
    DELETE FROM delegate_totals WHERE delegate_id = ${IDS.delegate};
    DELETE FROM delegate_period WHERE foundation_id = ${F2};
    DELETE FROM stats_totals WHERE foundation_id = ${F2};
    DELETE FROM stats_daily WHERE foundation_id = ${F2};
    DELETE FROM stats_monthly WHERE foundation_id = ${F2};
    DELETE FROM transactions WHERE foundation_id = ${F2};
    DELETE FROM subscriber_programs WHERE foundation_id = ${F2};
    DELETE FROM subscribers WHERE foundation_id = ${F2};
    DELETE FROM programs WHERE foundation_id = ${F2};
    DELETE FROM audit_log WHERE foundation_id = ${F2};
    DELETE FROM users WHERE foundation_id = ${F2};
    DELETE FROM foundations WHERE id = ${F2};`);
}

// ── foundation 1 targets ────────────────────────────────────────────────────────────────
const [f1] = sql(`SELECT
  (SELECT id FROM subscribers WHERE foundation_id = 1 AND deleted_at IS NULL AND status = 'alive' ORDER BY id LIMIT 1) AS sub,
  (SELECT full_name FROM subscribers WHERE foundation_id = 1 AND deleted_at IS NULL AND status = 'alive' ORDER BY id LIMIT 1) AS sub_name,
  (SELECT id FROM users WHERE foundation_id = 1 AND role = 'delegate' AND active = 1 ORDER BY id LIMIT 1) AS delegate,
  (SELECT id FROM users WHERE foundation_id = 1 AND role = 'admin' ORDER BY id LIMIT 1) AS admin,
  (SELECT id FROM transactions WHERE foundation_id = 1 AND deleted_at IS NULL ORDER BY id DESC LIMIT 1) AS tx,
  (SELECT id FROM expenses WHERE foundation_id = 1 AND deleted_at IS NULL ORDER BY id LIMIT 1) AS expense,
  (SELECT id FROM programs WHERE foundation_id = 1 ORDER BY id LIMIT 1) AS program`);

const snapshot = () => sql(`SELECT
  (SELECT COUNT(*) FROM subscribers WHERE foundation_id = 1 AND deleted_at IS NULL) AS subs,
  (SELECT COUNT(*) FROM transactions WHERE foundation_id = 1 AND deleted_at IS NULL) AS tx,
  (SELECT COUNT(*) FROM expenses WHERE foundation_id = 1 AND deleted_at IS NULL) AS exp,
  (SELECT group_concat(full_name || active || role) FROM users WHERE id = ${f1.admin}) AS admin_row,
  (SELECT full_name || IFNULL(phone,'') FROM subscribers WHERE id = ${f1.sub}) AS sub_row,
  (SELECT SUM(value) FROM stats_totals WHERE foundation_id = 1) AS stats`)[0];

// ── foundation 2 ────────────────────────────────────────────────────────────────────────
cleanup();
const hash = await hashPassword(PASSWORD);
const thisMonth = new Date().toISOString().slice(0, 7);
sql(`INSERT INTO foundations (id, name) VALUES (${F2}, 'مؤسسة اختبار العزل');
  INSERT INTO users (id, foundation_id, username, full_name, role, password_hash, must_change_password)
    VALUES (${IDS.admin}, ${F2}, 'iso_admin', 'مدير اختبار', 'admin', '${hash}', 0),
           (${IDS.delegate}, ${F2}, 'iso_delegate', 'مندوب اختبار', 'delegate', '${hash}', 0);
  INSERT INTO programs (id, foundation_id, name) VALUES (${IDS.program}, ${F2}, 'برنامج اختبار');
  INSERT INTO subscribers (id, foundation_id, full_name, name_norm, status, delegate_id, created_by)
    VALUES (${IDS.subscriber}, ${F2}, 'مشترك اختبار العزل', 'مشترك اختبار العزل', 'alive', ${IDS.delegate}, ${IDS.admin});
  INSERT INTO transactions (foundation_id, type, amount, month, tx_date, subscriber_id, party_name, delegate_id, period, created_by)
    VALUES (${F2}, 'delegate_receipt', 1000, '${thisMonth}', '${thisMonth}-02', ${IDS.subscriber}, 'مشترك اختبار العزل', ${IDS.delegate}, '${thisMonth}', ${IDS.admin});`);

const before = snapshot();

async function session(username) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-app': '1' },
    body: JSON.stringify({ username, password: PASSWORD }),
  });
  if (res.status !== 200) throw new Error(`login ${username}: ${res.status} ${await res.text()}`);
  const cookie = res.headers.get('set-cookie').split(';')[0];
  return async (method, path, body) => {
    const r = await fetch(`${BASE}/api${path}`, {
      method, headers: { cookie, 'x-app': '1', ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    let json = null;
    try { json = await r.json(); } catch { /* empty */ }
    return { status: r.status, json };
  };
}

const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok, detail });
const notFound = (r) => r.status === 404 || r.status === 422;
const ids = (r) => (r.json?.items ?? []).map((item) => item.id);
const year = new Date().getUTCFullYear();

const f2 = await session('iso_admin');

// Reading foundation 1 by id
for (const [name, method, path, body] of [
  ['subscriber by id', 'GET', `/subscribers/${f1.sub}`],
  ['reveal subscriber phone', 'POST', `/subscribers/${f1.sub}/reveal`],
  ['edit subscriber', 'PATCH', `/subscribers/${f1.sub}`, { notes: 'hacked' }],
  ['collections subscriber card', 'GET', `/collections/subscriber/${f1.sub}?year=${year}`],
  ['subscriber whatsapp number', 'POST', `/collections/subscriber/${f1.sub}/whatsapp`],
  ['overview of a foundation-1 delegate', 'GET', `/collections/overview?year=${year}&delegate=${f1.delegate}`],
  ['delegate profile', 'GET', `/collections/delegates/${f1.delegate}/profile`],
  ['edit delegate profile', 'PATCH', `/collections/delegates/${f1.delegate}/profile`, { full_name: 'hacked name' }],
  ['delegate whatsapp number', 'POST', `/collections/delegates/${f1.delegate}/whatsapp`],
  ['deactivate delegate', 'DELETE', `/collections/delegates/${f1.delegate}`],
  ['delegate summary', 'GET', `/delegates/${f1.delegate}`],
  ['pay for a foundation-1 subscriber', 'POST', '/collections/pay', { subscriber_id: f1.sub, period: thisMonth, amount: 1000, tx_date: `${thisMonth}-03` }],
  ['program enrol foundation-1 subscriber', 'POST', `/programs/${IDS.program}/members`, { subscriber_id: f1.sub }],
  ['enrol into foundation-1 program', 'POST', `/programs/${f1.program}/members`, { subscriber_id: IDS.subscriber }],
  ['transaction for foundation-1 subscriber', 'POST', '/transactions', { type: 'general_aid', amount: 1000, tx_date: `${thisMonth}-03`, subscriber_id: f1.sub }],
  ['receipt from foundation-1 delegate', 'POST', '/transactions', { type: 'delegate_receipt', amount: 1000, tx_date: `${thisMonth}-03`, delegate_id: f1.delegate }],
  ...(f1.expense ? [
    ['expense by id', 'GET', `/expenses/${f1.expense}`],
    ['edit expense', 'PATCH', `/expenses/${f1.expense}`, { details: 'hacked details' }],
    ['delete expense', 'DELETE', `/expenses/${f1.expense}`],
  ] : []),
]) {
  const r = await f2(method, path, body);
  check(name, notFound(r), `status ${r.status}`);
}

// Writes that answer ok but must not touch foundation 1 (checked against the snapshot below)
await f2('DELETE', `/subscribers/${f1.sub}`);
await f2('DELETE', `/transactions/${f1.tx}`);
await f2('POST', '/collections/undo', { subscriber_id: f1.sub, period: thisMonth });
await f2('PATCH', `/users/${f1.admin}`, { full_name: 'hacked admin', active: false });

// Lists, searches and totals hold foundation 2 only
const lists = [
  ['subscriber list', await f2('GET', '/subscribers?status=alive'), (r) => ids(r).every((id) => id === IDS.subscriber) && ids(r).length === 1],
  ['subscriber search by a foundation-1 name', await f2('POST', '/subscribers/search', { q: f1.sub_name.slice(0, 6) }), (r) => ids(r).length === 0 || ids(r).every((id) => id === IDS.subscriber)],
  ['lookup by a foundation-1 name', await f2('POST', '/subscribers/lookup', { q: f1.sub_name.slice(0, 6) }), (r) => ids(r).every((id) => id === IDS.subscriber)],
  ['collections grid', await f2('GET', `/collections/grid?year=${year}`), (r) => ids(r).every((id) => id === IDS.subscriber)],
  ['collections search', await f2('POST', '/collections/search', { q: f1.sub_name.slice(0, 6), year, status: 'alive' }), (r) => ids(r).every((id) => id === IDS.subscriber)],
  ['printed register', await f2('GET', `/collections/print?year=${year}`), (r) => ids(r).every((id) => id === IDS.subscriber)],
  ['overview totals', await f2('GET', `/collections/overview?year=${year}`), (r) => r.json?.alive === 1 && r.json.delegates.every((d) => d.id === IDS.delegate)],
  ['pay counts of a foundation-1 delegate', await f2('GET', `/collections/pay-counts?year=${year}&delegate=${f1.delegate}&month=0`), (r) => (r.json?.alive ?? 0) === 0],
  ['transactions of a foundation-1 subscriber', await f2('GET', `/transactions?subscriber=${f1.sub}`), (r) => ids(r).length === 0],
  ['transactions by month', await f2('GET', `/transactions?type=delegate_receipt&month=${thisMonth}`), (r) => (r.json?.items ?? []).every((t) => t.subscriber_id === IDS.subscriber)],
  ['members of a foundation-1 program', await f2('GET', `/programs/${f1.program}/members`), (r) => ids(r).length === 0],
  ['users', await f2('GET', '/users'), (r) => ids(r).every((id) => id === IDS.admin || id === IDS.delegate)],
  ['delegates', await f2('GET', '/delegates'), (r) => ids(r).every((id) => id === IDS.delegate)],
  ['reference data', await f2('GET', '/meta'), (r) => r.json?.delegates.every((d) => d.id === IDS.delegate) && r.json.programs.every((p) => p.id === IDS.program)],
  ['audit log', await f2('GET', '/audit'), (r) => (r.json?.items ?? []).every((a) => a.user_name === 'مدير اختبار' || a.user_name === 'مندوب اختبار' || a.user_name === null)],
  ['audit log search', await f2('GET', `/audit?q=${encodeURIComponent(f1.sub_name.slice(0, 6))}`), (r) => (r.json?.items ?? []).length === 0],
  ['audit log of a foundation-1 user', await f2('GET', `/audit?user=${f1.delegate}`), (r) => (r.json?.items ?? []).length === 0],
  ['audit log figures', await f2('GET', '/audit/stats'), (r) => {
    const own = sql(`SELECT COUNT(*) AS n FROM audit_log WHERE foundation_id = ${F2} AND action = 'login'`)[0].n;
    return r.json?.logins === own;
  }],
  ['audit log user filter', await f2('GET', '/audit/users'), (r) => ids(r).every((id) => id === IDS.admin || id === IDS.delegate)],
  ['dashboard', await f2('GET', '/dashboard'), (r) => (r.json?.totals?.subs_alive ?? 0) === 1],
  ['monthly closings', await f2('GET', '/closings'), (r) => (r.json?.items ?? []).length === 0],
  ['expenses of the month', await f2('GET', `/expenses?month=${thisMonth}`), (r) => (r.json?.items ?? []).length === 0],
  ['expense ledger', await f2('GET', `/expenses/ledger?year=${year}`), (r) => (r.json?.cells ?? []).length === 0],
  ['letterhead is its own', await f2('GET', '/branding'), (r) => r.json?.name === 'مؤسسة اختبار العزل' && !r.json.logo && !r.json.stamp && !r.json.signature && !r.json.address && r.json.phones.length === 0 && !r.json.accountant_name],
];
// Foundation 1's built-in images are public files; its uploaded ones are not reachable from here.
const img = await f2('GET', '/branding/image/logo');
check('no letterhead image of another foundation', img.status === 404, `status ${img.status}`);
const patchName = await f2('PATCH', '/branding', { address: 'عنوان اختبار' });
check('letterhead edit stays in its foundation', patchName.status === 200
  && sql(`SELECT address FROM foundations WHERE id = 1`)[0].address === 'بابل - قضاء الهاشمية - حي الزهراء', `status ${patchName.status}`);
for (const [name, r, ok] of lists) check(name, r.status === 200 && ok(r), `status ${r.status}`);

// The delegate of foundation 2 sees only their own
const d2 = await session('iso_delegate');
const dList = await d2('GET', '/subscribers?status=alive');
check('foundation-2 delegate list', dList.status === 200 && ids(dList).every((id) => id === IDS.subscriber), `status ${dList.status}`);

// And foundation 1 cannot see foundation 2
const f1Session = await (async () => {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-app': '1' },
    body: JSON.stringify({ username: 'admin', password: 'Test-Pass-123' }),
  });
  const cookie = res.headers.get('set-cookie')?.split(';')[0];
  return (path) => fetch(`${BASE}/api${path}`, { headers: { cookie } });
})();
const back = await f1Session(`/subscribers/${IDS.subscriber}`);
check('foundation 1 reading a foundation-2 subscriber', back.status === 404, `status ${back.status}`);
const backProgram = await f1Session(`/programs/${IDS.program}/members`);
check('foundation 1 reading a foundation-2 program', backProgram.status === 200 && (await backProgram.json()).items.length === 0, `status ${backProgram.status}`);

// Foundation 1 is unchanged
const after = snapshot();
for (const key of Object.keys(before)) check(`foundation 1 unchanged: ${key}`, before[key] === after[key], `${before[key]} → ${after[key]}`);

cleanup();

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  (${r.detail})`);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);

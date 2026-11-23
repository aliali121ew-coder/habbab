// Foundations and features test, against the local dev server (npm run dev, port 8787).
// Needs the local `admin` to be the system admin (UPDATE users SET is_system = 1 WHERE username = 'admin').
// The system admin creates a foundation with three features; its manager is refused every other
// section by the server; the system admin enters it, changes its features, suspends it; a
// non-system user cannot reach the system routes. Everything made here is removed at the end.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.BASE ?? 'http://localhost:8787';
const NAME = 'Ù…Ø¤Ø³Ø³Ø© Ø§Ø®ØªØ¨Ø§Ø± Ø§Ù„ØµÙØ­Ø§Øª';
const USER = 'feat_admin';
const PASSWORD = 'Feature-Test-1';

const SQL_FILE = join(tmpdir(), `ahbab-features-${process.pid}.sql`);
const sql = (command) => {
  writeFileSync(SQL_FILE, command);
  const out = execFileSync('npx', ['wrangler', 'd1', 'execute', 'ahbab-db', '--local', '--json', '--file', SQL_FILE],
    { encoding: 'utf8', shell: true, stdio: ['ignore', 'pipe', 'ignore'] });
  const parsed = JSON.parse(out);
  return parsed[parsed.length - 1].results;
};
const cleanup = () => sql(`DELETE FROM audit_log WHERE foundation_id IN (SELECT id FROM foundations WHERE name = '${NAME}');
  DELETE FROM users WHERE foundation_id IN (SELECT id FROM foundations WHERE name = '${NAME}');
  DELETE FROM foundations WHERE name = '${NAME}';`);

async function login(username, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-app': '1' }, body: JSON.stringify({ username, password }),
  });
  let cookie = res.headers.get('set-cookie')?.split(';')[0] ?? '';
  const call = async (method, path, body) => {
    const r = await fetch(`${BASE}/api${path}`, {
      method, headers: { cookie, 'x-app': '1', ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined,
    });
    const next = r.headers.get('set-cookie');
    if (next) cookie = next.split(';')[0]; // a reissued session (entering a foundation)
    let json = null;
    try { json = await r.json(); } catch { /* empty */ }
    return { status: r.status, json };
  };
  return { status: res.status, call };
}

const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok, detail });
const year = new Date().getUTCFullYear();
const month = new Date().toISOString().slice(0, 7);

cleanup();
const sys = await login('admin', 'Test-Pass-123');
check('system admin signs in', sys.status === 200, `status ${sys.status}`);

// Create a foundation that does aid, donations and patients only.
const created = await sys.call('POST', '/system/foundations', {
  name: NAME, features: ['aid', 'donations', 'patients'], admin_full_name: 'Ù…Ø¯ÙŠØ± Ø§Ù„ØµÙØ­Ø§Øª', admin_username: USER, admin_password: PASSWORD,
});
check('create foundation', created.status === 201, `status ${created.status} ${JSON.stringify(created.json)}`);
const fId = created.json?.id;
const dup = await sys.call('POST', '/system/foundations', {
  name: NAME, features: [], admin_full_name: 'Ø¢Ø®Ø±', admin_username: 'feat_other', admin_password: PASSWORD,
});
check('duplicate name refused', dup.status === 409, `status ${dup.status}`);
const list = await sys.call('GET', '/system/foundations');
check('listed with its features', list.json?.items.some((f) => f.id === fId && f.features.join() === 'aid,patients,donations'), JSON.stringify(list.json?.items.find((f) => f.id === fId)?.features));

// Its manager must change the password first; let them past that for the test.
const first = await login(USER, PASSWORD);
check('new manager signs in', first.status === 200, `status ${first.status}`);
const blocked = await first.call('GET', '/subscribers?status=alive');
check('must change password first', blocked.status === 403, `status ${blocked.status}`);
sql(`UPDATE users SET must_change_password = 0 WHERE username = '${USER}'`);
const mgr = await login(USER, PASSWORD);

const me = await mgr.call('GET', '/auth/me');
check('/me shows the foundation and its features', me.json?.foundation_id === fId && me.json.features.join() === 'aid,patients,donations' && me.json.is_system === false,
  JSON.stringify({ f: me.json?.foundation_id, ft: me.json?.features }));

for (const [name, method, path, body] of [
  ['subscribers list', 'GET', '/subscribers?status=alive'],
  ['add subscriber', 'POST', '/subscribers', { full_name: 'Ø§Ø®ØªØ¨Ø§Ø±' }],
  ['collections grid', 'GET', `/collections/grid?year=${year}`],
  ['collections pay', 'POST', '/collections/pay', { subscriber_id: 1, period: month, amount: 1000, tx_date: `${month}-02` }],
  ['printed register', 'GET', `/collections/print?year=${year}`],
  ['monthly closings', 'GET', '/closings'],
  ['delegates', 'GET', '/delegates'],
  ['expenses', 'GET', `/expenses?month=${month}`],
  ['add expense', 'POST', '/expenses', { category: 'food', amount: 1000, spent_on: `${month}-02`, beneficiary_name: 'Ø§Ø®ØªØ¨Ø§Ø±', details: 'Ø§Ø®ØªØ¨Ø§Ø±' }],
  ['system foundations', 'GET', '/system/foundations'],
  ['enter another foundation', 'POST', '/system/enter', { foundation_id: 1 }],
]) {
  const r = await mgr.call(method, path, body);
  check(`refused: ${name}`, r.status === 403, `status ${r.status}`);
}
for (const [name, method, path, body] of [
  ['overview totals (open)', 'GET', `/collections/overview?year=${year}&delegates=0`],
  ['register lookup (open)', 'POST', '/subscribers/lookup', { q: 'Ù…Ø­Ù…Ø¯' }],
  ['prescriptions (patients on)', 'GET', '/prescriptions'],
  ['dashboard', 'GET', '/dashboard'],
]) {
  const r = await mgr.call(method, path, body);
  check(`allowed: ${name}`, r.status === 200, `status ${r.status}`);
}
const ov = await mgr.call('GET', `/collections/overview?year=${year}&delegates=0`);
check('overview holds nothing of foundation 1', ov.json?.alive === 0 && ov.json?.delegate_count === 0, JSON.stringify({ alive: ov.json?.alive, delegates: ov.json?.delegate_count, deceased: ov.json?.deceased, months: ov.json?.months?.reduce((s, m) => s + m.paid_amount, 0) }));

// The system admin switches expenses on: /me follows at once.
const patched = await sys.call('PATCH', `/system/foundations/${fId}`, { features: ['aid', 'donations', 'patients', 'expenses'] });
check('features updated', patched.status === 200, `status ${patched.status}`);
const me2 = await mgr.call('GET', '/auth/me');
check('/me shows the new feature at once', me2.json?.features.includes('expenses'), JSON.stringify(me2.json?.features));
const fresh = await login(USER, PASSWORD);
const expOk = await fresh.call('GET', `/expenses?month=${month}`);
check('a new session may use it', expOk.status === 200, `status ${expOk.status}`);

// The system admin enters the foundation: same refusals, logged there; then back home.
const enter = await sys.call('POST', '/system/enter', { foundation_id: fId });
check('system admin enters', enter.status === 200, `status ${enter.status}`);
const sysMe = await sys.call('GET', '/auth/me');
check('inside the other foundation', sysMe.json?.foundation_id === fId && sysMe.json.home_foundation_id === 1 && sysMe.json.is_system, JSON.stringify({ f: sysMe.json?.foundation_id }));
const sysSubs = await sys.call('GET', '/subscribers?status=alive');
check('its features apply to the system admin too', sysSubs.status === 403, `status ${sysSubs.status}`);
const sysExp = await sys.call('GET', `/expenses?month=${month}`);
check('sees that foundation\'s data only', sysExp.status === 200 && (sysExp.json?.items ?? []).length === 0, `status ${sysExp.status}`);
const logged = sql(`SELECT COUNT(*) AS n FROM audit_log WHERE foundation_id = ${fId} AND action = 'system_enter'`)[0].n;
check('entry written to its audit log', logged === 1, `count ${logged}`);
const back = await sys.call('POST', '/system/enter', { foundation_id: 1 });
const homeMe = await sys.call('GET', '/auth/me');
check('back home', back.status === 200 && homeMe.json?.foundation_id === 1, JSON.stringify({ f: homeMe.json?.foundation_id }));
const homeSubs = await sys.call('GET', '/subscribers?status=alive');
check('home features restored', homeSubs.status === 200, `status ${homeSubs.status}`);

// Suspending: its staff cannot sign in; the system admin's own foundation cannot be suspended.
const own = await sys.call('PATCH', '/system/foundations/1', { status: 'suspended' });
check('cannot suspend own foundation', own.status === 422, `status ${own.status}`);
await sys.call('PATCH', `/system/foundations/${fId}`, { status: 'suspended' });
const suspended = await login(USER, PASSWORD);
check('suspended foundation cannot sign in', suspended.status === 403, `status ${suspended.status}`);
await sys.call('PATCH', `/system/foundations/${fId}`, { status: 'active' });
const again = await login(USER, PASSWORD);
check('reactivated foundation signs in', again.status === 200, `status ${again.status}`);

cleanup();
const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}  (${r.detail})`);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);

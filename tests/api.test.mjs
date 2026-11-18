// Runs against `npm run dev` on a database prepared with `npm run seed:dev`.
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

const BASE = process.env.BASE_URL ?? 'http://localhost:8787';
const PASSWORD = 'Test-Pass-123';
const sessions = {};

function client(cookie = '', ip = '10.0.0.1') {
  return async (path, { method = 'GET', body, form, raw = false, headers = {} } = {}) => {
    const response = await fetch(`${BASE}/api${path}`, {
      method,
      headers: {
        ...(method === 'GET' ? {} : { 'x-app': '1' }),
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(cookie ? { cookie } : {}),
        'cf-connecting-ip': ip,
        ...headers,
      },
      body: form ?? (body ? JSON.stringify(body) : undefined),
    });
    if (raw) return response;
    return { status: response.status, data: await response.json().catch(() => null), headers: response.headers };
  };
}

async function login(username, password = PASSWORD) {
  const response = await client()('/auth/login', { method: 'POST', body: { username, password }, raw: true });
  assert.equal(response.status, 200, `login ${username}`);
  return client(response.headers.get('set-cookie').split(';')[0]);
}

const rows = (result) => Object.fromEntries(result.headers.get('x-d1-rows').split(';').map((pair) => pair.split('=')).map(([k, v]) => [k, Number(v)]));
const webp = () => new Blob([new Uint8Array([0x52, 0x49, 0x46, 0x46, 8, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 1, 2, 3, 4])], { type: 'image/webp' });
const lastMonth = () => {
  const date = new Date();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - 1);
  return date.toISOString().slice(0, 7);
};

before(async () => {
  for (const name of ['admin', 'accountant', 'delegate1', 'delegate2', 'health']) sessions[name] = await login(name);
});

describe('session and request guards', () => {
  it('rejects anonymous access', async () => {
    assert.equal((await client()('/subscribers')).status, 401);
    assert.equal((await client()('/dashboard')).status, 401);
  });

  it('rejects a forged token', async () => {
    assert.equal((await client('sid=abc.def')('/subscribers')).status, 401);
  });

  it('sets an HttpOnly SameSite=Strict cookie', async () => {
    const response = await client()('/auth/login', { method: 'POST', body: { username: 'admin', password: PASSWORD }, raw: true });
    const cookie = response.headers.get('set-cookie');
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Strict/i);
  });

  it('keeps the cookie past the browser only when asked to remember', async () => {
    const plain = await client()('/auth/login', { method: 'POST', body: { username: 'admin', password: PASSWORD }, raw: true });
    assert.doesNotMatch(plain.headers.get('set-cookie'), /Max-Age/i);
    const remembered = await client()('/auth/login', { method: 'POST', body: { username: 'admin', password: PASSWORD, remember: true }, raw: true });
    assert.match(remembered.headers.get('set-cookie'), /Max-Age=2592000/i);
    const session = client(remembered.headers.get('set-cookie').split(';')[0]);
    assert.equal((await session('/auth/me')).status, 200);
  });

  it('blocks writes without the app header or from another origin', async () => {
    const noHeader = await fetch(`${BASE}/api/auth/login`, { method: 'POST', body: '{}' });
    assert.equal(noHeader.status, 403);
    const crossOrigin = await sessions.admin('/subscribers', { method: 'POST', body: { full_name: 'x y z' }, headers: { origin: 'https://evil.example' } });
    assert.equal(crossOrigin.status, 403);
  });

  it('validates input on the server', async () => {
    assert.equal((await sessions.admin('/subscribers', { method: 'POST', body: { full_name: 'ا' } })).status, 422);
    assert.equal((await sessions.accountant('/transactions', { method: 'POST', body: { type: 'general_aid', amount: -5, tx_date: '2026-01-01' } })).status, 422);
  });

  it('survives SQL metacharacters as plain data', async () => {
    const result = await sessions.admin('/subscribers/search', { method: 'POST', body: { q: "'; DROP TABLE users; --" } });
    assert.equal(result.status, 200);
    assert.equal((await sessions.admin('/users')).status, 200);
  });

  it('locks an account after repeated failures', async () => {
    const username = `lock${Date.now()}`;
    await sessions.admin('/users', { method: 'POST', body: { username, full_name: 'اختبار القفل', role: 'health', password: PASSWORD } });
    for (let i = 0; i < 5; i++) {
      const attempt = await client('', `10.1.0.${i}`)('/auth/login', { method: 'POST', body: { username, password: 'wrong-password' } });
      assert.equal(attempt.status, 401);
    }
    const locked = await client('', '10.1.1.1')('/auth/login', { method: 'POST', body: { username, password: PASSWORD } });
    assert.equal(locked.status, 429);
  });

  it('forces a temporary password to be changed before any data access', async () => {
    const username = `temp${Date.now()}`;
    await sessions.admin('/users', { method: 'POST', body: { username, full_name: 'كلمة مؤقتة', role: 'delegate', password: PASSWORD } });
    const session = await login(username);
    assert.equal((await session('/subscribers')).status, 403);
    const changed = await session('/auth/change-password', { method: 'POST', body: { current: PASSWORD, next: 'New-Pass-4567' }, raw: true });
    assert.equal(changed.status, 200);
    const fresh = client(changed.headers.get('set-cookie').split(';')[0]);
    assert.equal((await fresh('/subscribers')).status, 200);
  });
});

describe('role matrix', () => {
  const matrix = [
    ['/subscribers', { admin: 200, accountant: 403, delegate1: 200, health: 403 }],
    ['/programs/1/members', { admin: 200, accountant: 403, delegate1: 200, health: 403 }],
    ['/transactions?type=general_aid', { admin: 200, accountant: 200, delegate1: 200, health: 403 }],
    ['/prescriptions', { admin: 200, accountant: 403, delegate1: 403, health: 200 }],
    ['/closings', { admin: 200, accountant: 200, delegate1: 403, health: 403 }],
    ['/delegates', { admin: 200, accountant: 200, delegate1: 403, health: 403 }],
    ['/users', { admin: 200, accountant: 403, delegate1: 403, health: 403 }],
    ['/audit', { admin: 200, accountant: 403, delegate1: 403, health: 403 }],
  ];
  for (const [path, expected] of matrix) {
    for (const [name, status] of Object.entries(expected)) {
      it(`${name} GET ${path} -> ${status}`, async () => {
        assert.equal((await sessions[name](path)).status, status);
      });
    }
  }

  it('dashboards never leak another role\'s summary', async () => {
    const delegate = (await sessions.delegate1('/dashboard')).data;
    const health = (await sessions.health('/dashboard')).data;
    const accountant = (await sessions.accountant('/dashboard')).data;
    assert.equal(delegate.kind, 'delegate');
    assert.equal(health.kind, 'health');
    assert.equal(health.totals, undefined);
    assert.equal(accountant.kind, 'accountant');
    assert.equal(accountant.totals, undefined);
  });

  it('accountant lookup returns only id and name', async () => {
    const { data } = await sessions.accountant('/subscribers/lookup', { method: 'POST', body: { q: 'احمد' } });
    assert.ok(data.items.length > 0);
    assert.deepEqual(Object.keys(data.items[0]).sort(), ['full_name', 'id']);
  });

  it('only finance roles write money; delegates cannot', async () => {
    const result = await sessions.delegate1('/transactions', { method: 'POST', body: { type: 'general_aid', amount: 1, tx_date: '2026-01-01', subscriber_id: 3 } });
    assert.equal(result.status, 403);
  });
});

describe('delegate isolation (server side)', () => {
  it('list contains only own subscribers even if another delegate id is requested', async () => {
    const { data } = await sessions.delegate1('/subscribers?delegate=4');
    assert.ok(data.items.length > 0);
    assert.ok(data.items.every((row) => row.delegate_id === 3));
  });

  it('search is scoped to the delegate', async () => {
    const { data } = await sessions.delegate1('/subscribers/search', { method: 'POST', body: { q: '0770' } });
    assert.ok(data.items.length > 0);
    assert.ok(data.items.every((row) => row.delegate_id === 3));
  });

  it('another delegate\'s record is a 404 for read, reveal and update', async () => {
    const { data } = await sessions.delegate2('/subscribers');
    const foreign = data.items[0].id;
    assert.equal((await sessions.delegate1(`/subscribers/${foreign}`)).status, 404);
    assert.equal((await sessions.delegate1(`/subscribers/${foreign}/reveal`, { method: 'POST' })).status, 404);
    assert.equal((await sessions.delegate1(`/subscribers/${foreign}`, { method: 'PATCH', body: { notes: 'x' } })).status, 404);
  });

  it('a delegate cannot see or claim another delegate\'s page', async () => {
    assert.equal((await sessions.delegate1('/delegates/4')).status, 404);
    assert.equal((await sessions.delegate1('/delegates/3')).status, 200);
    const created = await sessions.delegate1('/subscribers', { method: 'POST', body: { full_name: 'مشترك الاختبار', delegate_id: 4 } });
    assert.equal(created.status, 201);
    assert.equal((await sessions.admin(`/subscribers/${created.data.id}`)).data.delegate_id, 3);
    const moved = await sessions.delegate1(`/subscribers/${created.data.id}`, { method: 'PATCH', body: { delegate_id: 4 } });
    assert.equal(moved.status, 403);
  });
});

describe('privacy', () => {
  it('masks phone and identity in lists, reveals them only through an audited action', async () => {
    const nationalId = String(Date.now()).slice(-10);
    const created = await sessions.admin('/subscribers', { method: 'POST', body: { full_name: 'كشف البيانات', phone: '07701234567', national_id: nationalId, delegate_id: 3 } });
    assert.equal(created.status, 201);
    const detail = await sessions.admin(`/subscribers/${created.data.id}`);
    assert.ok(!JSON.stringify(detail.data).includes('07701234567'));
    assert.ok(!JSON.stringify(detail.data).includes(nationalId));
    assert.match(detail.data.national_id, /^•+\d{4}$/);
    assert.equal(detail.data.national_id_enc, undefined);

    const revealed = await sessions.admin(`/subscribers/${created.data.id}/reveal`, { method: 'POST' });
    assert.equal(revealed.data.phone, '07701234567');
    assert.equal(revealed.data.national_id, nationalId);

    const audit = await sessions.admin('/audit');
    assert.ok(audit.data.items.some((row) => row.action === 'reveal' && row.entity_id === created.data.id));
  });

  it('rejects a duplicate national id without storing it in clear', async () => {
    const nationalId = `9${String(Date.now()).slice(-9)}`;
    assert.equal((await sessions.admin('/subscribers', { method: 'POST', body: { full_name: 'هوية أولى', national_id: nationalId } })).status, 201);
    assert.equal((await sessions.admin('/subscribers', { method: 'POST', body: { full_name: 'هوية ثانية', national_id: nationalId } })).status, 409);
  });

  it('search finds Arabic spelling variants', async () => {
    const { data } = await sessions.admin('/subscribers/search', { method: 'POST', body: { q: 'أحمد' } });
    assert.ok(data.items.length > 0);
    assert.ok(data.items.every((row) => row.full_name.startsWith('أحمد')));
  });
});

describe('prescriptions and files', () => {
  let rxId;
  let imageUrl;

  it('stores an encrypted record with its image together', async () => {
    const form = new FormData();
    form.set('data', JSON.stringify({ subscriber_id: 3, rx_date: '2026-10-01', diagnosis: 'تشخيص سري', medicines: 'دواء' }));
    form.set('image', webp(), 'image');
    form.set('thumb', webp(), 'thumb');
    assert.equal((await sessions.health('/prescriptions', { method: 'POST', form })).status, 201);

    const { data } = await sessions.health('/prescriptions');
    rxId = data.items[0].id;
    assert.ok(data.items[0].thumb_url);
    assert.equal(data.items[0].diagnosis, undefined);
    const detail = await sessions.health(`/prescriptions/${rxId}`);
    assert.equal(detail.data.diagnosis, 'تشخيص سري');
    imageUrl = detail.data.image_url.replace('/api', '');
  });

  it('serves the decrypted image only to the user the link was signed for', async () => {
    const own = await sessions.health(imageUrl, { raw: true });
    assert.equal(own.status, 200);
    assert.equal(own.headers.get('content-type'), 'image/webp');
    assert.equal((await sessions.admin(imageUrl)).status, 403);
    assert.equal((await sessions.delegate1(imageUrl)).status, 403);
    assert.equal((await sessions.health(`${imageUrl.slice(0, -2)}xx`)).status, 404);
  });

  it('rejects non-image and oversized uploads', async () => {
    const data = JSON.stringify({ subscriber_id: 3, rx_date: '2026-10-01', diagnosis: 'x', medicines: 'y' });
    const notImage = new FormData();
    notImage.set('data', data);
    notImage.set('image', new Blob(['<script>alert(1)</script>'.padEnd(64)]), 'image');
    assert.equal((await sessions.health('/prescriptions', { method: 'POST', form: notImage })).status, 422);

    const huge = new FormData();
    huge.set('data', data);
    huge.set('image', new Blob([new Uint8Array(301 * 1024)]), 'image');
    assert.equal((await sessions.health('/prescriptions', { method: 'POST', form: huge })).status, 413);
  });

  it('logs prescription views', async () => {
    const audit = await sessions.admin('/audit');
    assert.ok(audit.data.items.some((row) => row.action === 'view' && row.entity === 'prescription' && row.entity_id === rxId));
  });
});

describe('summaries and monthly closing', () => {
  const month = lastMonth();
  const date = `${month}-15`;

  it('keeps totals correct through insert and soft delete', async () => {
    const preview = async () => (await sessions.accountant(`/closings/preview?month=${month}`)).data;
    const before = await preview();
    await sessions.accountant('/transactions', { method: 'POST', body: { type: 'general_aid', amount: 1000, tx_date: date, subscriber_id: 3 } });
    await sessions.accountant('/transactions', { method: 'POST', body: { type: 'delegate_receipt', amount: 5000, tx_date: date, delegate_id: 3 } });
    const after = await preview();
    assert.equal(after.total_out - before.total_out, 1000);
    assert.equal(after.total_in - before.total_in, 5000);

    const { data } = await sessions.accountant(`/transactions?type=general_aid&month=${month}`);
    await sessions.accountant(`/transactions/${data.items[0].id}`, { method: 'DELETE' });
    await sessions.accountant(`/transactions/${data.items[0].id}`, { method: 'DELETE' });
    assert.equal((await preview()).total_out, before.total_out);
  });

  it('a closed month refuses inserts and deletes, and reopening restores them', async () => {
    assert.equal((await sessions.accountant('/closings', { method: 'POST', body: { month } })).status, 201);
    assert.equal((await sessions.accountant('/closings', { method: 'POST', body: { month } })).status, 409);

    const insert = await sessions.accountant('/transactions', { method: 'POST', body: { type: 'general_aid', amount: 10, tx_date: date, subscriber_id: 3 } });
    assert.equal(insert.status, 409);
    const { data } = await sessions.accountant(`/transactions?type=delegate_receipt&month=${month}`);
    assert.equal((await sessions.accountant(`/transactions/${data.items[0].id}`, { method: 'DELETE' })).status, 409);

    assert.equal((await sessions.accountant(`/closings/${month}/reopen`, { method: 'POST' })).status, 403);
    assert.equal((await sessions.admin(`/closings/${month}/reopen`, { method: 'POST' })).status, 200);
    assert.equal((await sessions.accountant('/transactions', { method: 'POST', body: { type: 'general_aid', amount: 10, tx_date: date, subscriber_id: 3 } })).status, 201);
  });

  it('refuses to close a month that has not ended', async () => {
    const current = new Date().toISOString().slice(0, 7);
    assert.equal((await sessions.accountant('/closings', { method: 'POST', body: { month: current } })).status, 422);
  });

  it('stays exact under 200 parallel writes', async () => {
    const parallelMonth = new Date().toISOString().slice(0, 7);
    const parallelDate = `${parallelMonth}-01`;
    const read = async () => (await sessions.accountant(`/closings/preview?month=${parallelMonth}`)).data.total_out;
    const start = await read();
    const results = await Promise.all(Array.from({ length: 200 }, () =>
      sessions.accountant('/transactions', { method: 'POST', body: { type: 'monthly_aid', amount: 7, tx_date: parallelDate, subscriber_id: 3 } })));
    assert.deepEqual([...new Set(results.map((result) => result.status))], [201]);
    assert.equal((await read()) - start, 1400);
  });
});

describe('D1 row budget at 25,000 subscribers', () => {
  const budget = async (session, path, maxRead, options) => {
    const result = await session(path, options);
    assert.equal(result.status, 200, path);
    const { read } = rows(result);
    console.log(`  rows_read=${read} (limit ${maxRead}) ${path}`);
    assert.ok(read <= maxRead, `${path} read ${read} rows`);
    return result;
  };

  it('first page reads about one page', () => budget(sessions.admin, '/subscribers', 35));
  it('a delegate page reads about one page', () => budget(sessions.delegate1, '/subscribers', 35));

  it('deep page costs the same as the first page (no OFFSET)', async () => {
    let cursor = null;
    for (let i = 0; i < 20; i++) {
      const page = await sessions.admin(`/subscribers${cursor ? `?cursor=${cursor}` : ''}`);
      cursor = page.data.next;
    }
    await budget(sessions.admin, `/subscribers?cursor=${cursor}`, 35);
  });

  it('name search stays on the index', () => budget(sessions.admin, '/subscribers/search', 35, { method: 'POST', body: { q: 'زينب' } }));
  it('name search with a status filter stays on the index', () => budget(sessions.admin, '/subscribers/search', 45, { method: 'POST', body: { q: 'زينب', status: 'alive' } }));
  it('phone search with a status filter stays on the index', () => budget(sessions.admin, '/subscribers/search', 35, { method: 'POST', body: { q: '07701', status: 'alive' } }));
  it('delegate search with a status filter stays on the index', () => budget(sessions.delegate1, '/subscribers/search', 35, { method: 'POST', body: { q: 'حسين', status: 'alive' } }));
  it('phone search stays on the index', () => budget(sessions.admin, '/subscribers/search', 35, { method: 'POST', body: { q: '07701' } }));
  it('delegate name search stays on the index', () => budget(sessions.delegate1, '/subscribers/search', 35, { method: 'POST', body: { q: 'زينب' } }));
  it('dashboard reads summaries only', () => budget(sessions.admin, '/dashboard', 30));
  it('a money page reads about one page', () => budget(sessions.accountant, '/transactions?type=monthly_aid', 35));
});

describe('monthly payments', () => {
  const year = new Date().getUTCFullYear();
  const period = `${year}-03`;
  const today = new Date().toISOString().slice(0, 10);
  let own;
  let foreign;

  const pay = (session, subscriber, target = period) => session('/collections/pay', {
    method: 'POST', body: { subscriber_id: subscriber, period: target, amount: 5000, tx_date: today },
  });
  const row = async (session, id) => (await session(`/collections/grid?year=${year}&delegate=3`)).data.items.find((item) => item.id === id);

  before(async () => {
    own = (await sessions.delegate1('/subscribers', { method: 'POST', body: { full_name: 'مشترك التسديد', monthly_fee: 5000 } })).data.id;
    foreign = (await sessions.delegate2('/subscribers', { method: 'POST', body: { full_name: 'مشترك آخر للتسديد' } })).data.id;
  });

  it('only admin and delegates reach the register', async () => {
    assert.equal((await sessions.accountant(`/collections/grid?year=${year}`)).status, 403);
    assert.equal((await sessions.health(`/collections/overview?year=${year}`)).status, 403);
  });

  it('a delegate cannot pay for, or see, another delegate\'s subscriber', async () => {
    assert.equal((await pay(sessions.delegate1, foreign)).status, 404);
    const { data } = await sessions.delegate1(`/collections/grid?year=${year}&delegate=4`);
    assert.ok(data.items.every((item) => item.delegate_id === 3));
    const overview = await sessions.delegate1(`/collections/overview?year=${year}&delegate=4`);
    assert.equal(overview.data.delegate.id, 3);
    assert.deepEqual(overview.data.delegates, []);
  });

  it('a payment sets the month, cannot repeat, and enters the money totals', async () => {
    const month = new Date().toISOString().slice(0, 7);
    const before = (await sessions.admin(`/closings/preview?month=${month}`)).data.total_in;
    const overviewBefore = (await sessions.admin(`/collections/overview?year=${year}`)).data.months[2].paid_amount;

    assert.equal((await pay(sessions.delegate1, own)).status, 201);
    assert.equal((await pay(sessions.delegate1, own)).status, 409);

    assert.equal((await row(sessions.delegate1, own)).paid_mask, 4);
    assert.equal((await sessions.admin(`/closings/preview?month=${month}`)).data.total_in - before, 5000);
    assert.equal((await sessions.admin(`/collections/overview?year=${year}`)).data.months[2].paid_amount - overviewBefore, 5000);
  });

  it('only the admin can reverse a payment, and reversal restores every total', async () => {
    const body = { subscriber_id: own, period };
    assert.equal((await sessions.delegate1('/collections/undo', { method: 'POST', body })).status, 403);
    const before = (await sessions.admin(`/collections/overview?year=${year}`)).data.months[2].paid_amount;
    assert.equal((await sessions.admin('/collections/undo', { method: 'POST', body })).status, 200);
    assert.equal((await row(sessions.delegate1, own)).paid_mask, 0);
    assert.equal(before - (await sessions.admin(`/collections/overview?year=${year}`)).data.months[2].paid_amount, 5000);
    assert.equal((await pay(sessions.delegate1, own)).status, 201);
  });

  it('masks phones in the register', async () => {
    const { data } = await sessions.admin(`/collections/grid?year=${year}`);
    const withPhone = data.items.find((item) => item.phone);
    assert.match(withPhone.phone, /•/);
  });

  it('a delegate cannot change another delegate\'s photo', async () => {
    const form = new FormData();
    form.set('image', webp(), 'image');
    assert.equal((await sessions.delegate1('/collections/delegates/4/photo', { method: 'POST', form })).status, 404);
    const mine = new FormData();
    mine.set('image', webp(), 'image');
    assert.equal((await sessions.delegate1('/collections/delegates/3/photo', { method: 'POST', form: mine })).status, 200);
  });

  it('the register stays within budget at full size', async () => {
    const grid = await sessions.admin(`/collections/grid?year=${year}`);
    const overview = await sessions.admin(`/collections/overview?year=${year}`);
    const search = await sessions.admin('/collections/search', { method: 'POST', body: { q: 'زينب', year, status: 'alive' } });
    // The overview lists every delegate, so its budget follows their number and not the register's size.
    const overviewLimit = 40 + 4 * overview.data.delegates.length;
    for (const [name, result, limit] of [['grid', grid, 62], ['overview', overview, overviewLimit], ['search', search, 62]]) {
      console.log(`  rows_read=${rows(result).read} (limit ${limit}) ${name}`);
      assert.ok(rows(result).read <= limit, name);
    }
    const payment = await pay(sessions.delegate1, own, `${year}-04`);
    console.log(`  rows_written=${rows(payment).written} payment`);
  });
});

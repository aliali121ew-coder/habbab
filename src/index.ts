import { Hono, type Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv, Env } from './env';
import { runMonthlyJobs } from './jobs';
import { requireAuth } from './lib/auth';
import { requireFeature } from './lib/features';
import { system } from './routes/system';
import { branding } from './routes/branding';
import { fail } from './lib/http';
import { audit, dashboard, delegates, meta, users } from './routes/admin';
import { auth } from './routes/auth';
import { closings } from './routes/closings';
import { collections } from './routes/collections';
import { expenses } from './routes/expenses';
import { files, prescriptions } from './routes/prescriptions';
import { programs } from './routes/programs';
import { subscribers } from './routes/subscribers';
import { transactions } from './routes/transactions';

const app = new Hono<AppEnv>();

app.use('/api/*', async (c, next) => {
  const mutating = !['GET', 'HEAD'].includes(c.req.method);
  if (mutating) {
    // SameSite=Strict is the main defence; this blocks cross-site forms on older browsers.
    const origin = c.req.header('origin');
    if (c.req.header('x-app') !== '1' || (origin && new URL(origin).host !== new URL(c.req.url).host)) {
      fail(403, 'طلب غير مسموح');
    }
  }
  await next();
  c.header('cache-control', c.res.headers.get('cache-control') ?? 'no-store');
  c.header('x-content-type-options', 'nosniff');
  if (c.env.ENVIRONMENT !== 'production') {
    c.header('x-d1-rows', `read=${c.get('d1Read') ?? 0};written=${c.get('d1Written') ?? 0}`);
  }
});

app.route('/api/auth', auth);

const api = new Hono<AppEnv>();
api.use('*', requireAuth);
api.use('*', async (c, next) => {
  const limit = await c.env.API_LIMITER?.limit({ key: String(c.get('user').id) });
  if (limit && !limit.success) fail(429, 'طلبات كثيرة، انتظر قليلاً');
  await next();
});
// Each section answers only for a foundation that has its feature switched on.
api.use('/subscribers/*', requireFeature('subscribers', '/subscribers/lookup'));
api.use('/collections/*', requireFeature('subscribers', '/collections/overview'));
api.use('/closings/*', requireFeature('subscribers'));
api.use('/delegates/*', requireFeature('subscribers'));
api.use('/programs/*', requireFeature('aid'));
api.use('/transactions/*', requireFeature('aid'));
api.use('/expenses/*', requireFeature('expenses'));
api.use('/prescriptions/*', requireFeature('patients'));
api.route('/system', system);
api.route('/branding', branding);
api.route('/dashboard', dashboard);
api.route('/meta', meta);
api.route('/subscribers', subscribers);
api.route('/programs', programs);
api.route('/transactions', transactions);
api.route('/prescriptions', prescriptions);
api.route('/files', files);
api.route('/closings', closings);
api.route('/collections', collections);
api.route('/expenses', expenses);
api.route('/delegates', delegates);
api.route('/users', users);
api.route('/audit', audit);
app.route('/api', api);

app.notFound((c) => c.json({ error: 'غير موجود' }, 404));

// The section a request belongs to, as the activity log names it.
const SECTIONS: Record<string, string> = {
  subscribers: 'المشتركون', collections: 'التحصيل والمندوبون', delegates: 'المندوبون', closings: 'الإقفال الشهري',
  programs: 'البرامج', transactions: 'الحركات المالية', expenses: 'المصاريف', prescriptions: 'الوصفات',
  users: 'الحسابات', branding: 'الإعدادات', system: 'المؤسسات', families: 'العوائل',
};

// A save or change refused for lack of permission (403) is written to the foundation's activity
// log as «تعديل مرفوض», with the section and the reason, so the manager can see who tried what.
function logDenied(c: Context<AppEnv>, reason: string) {
  const user = c.get('user');
  if (!user || ['GET', 'HEAD'].includes(c.req.method)) return;
  const section = c.req.path.split('/')[2] ?? '';
  const detail = JSON.stringify({ label: SECTIONS[section] ?? section, note: reason, changes: undefined });
  c.executionCtx.waitUntil(c.env.DB.prepare(
    "INSERT INTO audit_log (foundation_id, user_id, action, entity, entity_id, detail) VALUES (?, ?, 'denied', ?, NULL, ?)",
  ).bind(user.foundation, user.id, section || 'app', detail).run().catch(() => undefined));
}

app.onError((error, c) => {
  if (error instanceof HTTPException) {
    if (error.status === 403) logDenied(c, error.message);
    return c.json({ error: error.message }, error.status);
  }
  const message = error instanceof Error ? error.message : '';
  // The codes let a client tell these apart without reading the Arabic message (offline sync).
  if (message.includes('MONTH_CLOSED')) return c.json({ error: 'هذا الشهر مقفل ولا يقبل التعديل', code: 'month_closed' }, 409);
  if (message.includes('UNIQUE constraint failed: subscribers.national_id_bidx')) {
    return c.json({ error: 'رقم الهوية مسجل لمشترك آخر' }, 409);
  }
  if (message.includes('UNIQUE constraint failed: transactions.subscriber_id')) {
    return c.json({ error: 'هذا الشهر مسدد مسبقاً', code: 'already_paid' }, 409);
  }
  if (message.includes('UNIQUE constraint failed: subscriber_programs')) {
    return c.json({ error: 'المشترك مسجل في هذا البرنامج' }, 409);
  }
  if (message.includes('UNIQUE constraint failed')) return c.json({ error: 'هذه القيمة مستخدمة مسبقاً' }, 409);
  // Route and error class only: messages from the database could carry bound values.
  console.error(JSON.stringify({ route: c.req.routePath, method: c.req.method, error: error.name }));
  return c.json({ error: 'حدث خطأ غير متوقع' }, 500);
});

export default {
  fetch: app.fetch,
  scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runMonthlyJobs(env, new Date(event.scheduledTime)));
  },
};

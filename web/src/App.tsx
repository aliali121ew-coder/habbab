import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { api, ApiError, setSessionLostHandler, type Me } from './api';
import { Shell } from './components/Shell';
import { StateMessage } from './components/StateMessage';
import { OfflineBar } from './components/OfflineBar';
import { queuedPayments, syncPayments } from './paymentQueue';
import { Login } from './pages/Login';
import { ChangePassword } from './pages/ChangePassword';
import { useRoute } from './route';
import { hasFeature, routeFeature } from './features';
import { BrandingProvider } from './branding';
import type { Feature, Role } from './api';

// The page a role lands on by default needs this feature (the manager's home needs none).
const ROLE_FEATURE: Record<Role, Feature | undefined> = {
  admin: undefined, delegate: 'subscribers', accountant: 'expenses', health: 'patients',
};

// Each page is its own file, fetched when first opened, so a phone downloads and prepares only
// what it shows. After the first screen every page is fetched quietly in the background, so
// moving around stays instant and the whole app is on the device for offline use.
const pages = {
  delegates: () => import('./pages/delegates/DelegatesPage'),
  soon: () => import('./pages/ComingSoonPage'),
  reports: () => import('./pages/reports/ReportsPage'),
  home: () => import('./pages/home/HomePage'),
  expenses: () => import('./pages/expenses/ExpensesPage'),
  ledger: () => import('./pages/expenses/ExpensesLedgerPage'),
  families: () => import('./pages/FamiliesPage'),
  family: () => import('./pages/FamilyDetailPage'),
  patient: () => import('./pages/patients/PatientDetailPage'),
  patients: () => import('./pages/patients/PatientsPage'),
  subscribers: () => import('./pages/subscribers/SubscribersPage'),
  system: () => import('./pages/system/SystemPage'),
  settings: () => import('./pages/settings/SettingsPage'),
  activity: () => import('./pages/activity/ActivityPage'),
};
const ActivityPage = lazy(() => pages.activity().then((m) => ({ default: m.ActivityPage })));
const SystemPage = lazy(() => pages.system().then((m) => ({ default: m.SystemPage })));
const SettingsPage = lazy(() => pages.settings().then((m) => ({ default: m.SettingsPage })));
const DelegatesPage = lazy(() => pages.delegates().then((m) => ({ default: m.DelegatesPage })));
const ComingSoonPage = lazy(() => pages.soon().then((m) => ({ default: m.ComingSoonPage })));
const ReportsPage = lazy(() => pages.reports().then((m) => ({ default: m.ReportsPage })));
const HomePage = lazy(() => pages.home().then((m) => ({ default: m.HomePage })));
const ExpensesPage = lazy(() => pages.expenses().then((m) => ({ default: m.ExpensesPage })));
const ExpensesLedgerPage = lazy(() => pages.ledger().then((m) => ({ default: m.ExpensesLedgerPage })));
const FamiliesPage = lazy(() => pages.families().then((m) => ({ default: m.FamiliesPage })));
const FamilyDetailPage = lazy(() => pages.family().then((m) => ({ default: m.FamilyDetailPage })));
const PatientDetailPage = lazy(() => pages.patient().then((m) => ({ default: m.PatientDetailPage })));
const PatientsPage = lazy(() => pages.patients().then((m) => ({ default: m.PatientsPage })));
const SubscribersPage = lazy(() => pages.subscribers().then((m) => ({ default: m.SubscribersPage })));

function prefetchPages() {
  const run = () => { for (const load of Object.values(pages)) void load().catch(() => undefined); };
  const idle = (window as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback;
  if (idle) idle(run); else setTimeout(run, 1500);
}
import { clearLocalRecords } from './localRecords';

export function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'login' | 'error'>('loading');
  const route = useRoute();

  useEffect(() => { window.scrollTo(0, 0); }, [route]);
  // Once signed in and the first page is up, bring the other pages onto the device.
  useEffect(() => { if (status === 'ready') prefetchPages(); }, [status]);

  // Payments recorded offline go out when the app opens, when the connection returns, and every
  // 30 seconds while some are still waiting (paymentQueue.ts).
  const userId = status === 'ready' ? me?.id ?? null : null;
  const foundationId = status === 'ready' ? me?.foundation_id : undefined;
  useEffect(() => {
    if (userId === null) return;
    const send = () => {
      if (navigator.onLine && queuedPayments(userId, foundationId).length) void syncPayments(userId, foundationId);
    };
    send();
    window.addEventListener('online', send);
    const timer = window.setInterval(send, 30_000);
    return () => { window.removeEventListener('online', send); window.clearInterval(timer); };
  }, [userId, foundationId]);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      setMe(await api<Me>('/auth/me'));
      setStatus('ready');
    } catch (error) {
      setStatus(error instanceof ApiError && error.status === 401 ? 'login' : 'error');
    }
  }, []);

  useEffect(() => {
    setSessionLostHandler(() => {
      clearLocalRecords();
      setMe(null);
      setStatus('login');
    });
    void load();
  }, [load]);

  if (status === 'loading') return <div className="boot" aria-busy="true"><span className="boot-star" /></div>;
  if (status === 'error') return <StateMessage kind="error" title="تعذّر تحميل التطبيق" onRetry={load} />;
  if (status === 'login' || !me) return <Login onDone={load} />;
  if (me.must_change_password) {
    return (
      <ChangePassword
        name={me.full_name}
        onDone={load}
        onSignOut={async () => {
          await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
          await clearLocalRecords();
          setMe(null);
          setStatus('login');
        }}
      />
    );
  }

  return (
    <BrandingProvider name={me.foundation_name} foundationId={me.foundation_id}>
    <Shell me={me} onSignedOut={() => { clearLocalRecords(); setMe(null); setStatus('login'); }}>
      <OfflineBar userId={me.id} currency={me.currency} />
      <Suspense fallback={<div className="page-loading" aria-busy="true"><span className="boot-star" /></div>}>
      {route === 'system' && me.is_system
        ? <SystemPage me={me} />
        : !hasFeature(me, routeFeature(route) ?? ROLE_FEATURE[me.role])
        ? <StateMessage kind="empty" title="هذه الصفحة غير مفعّلة لمؤسستك" hint="يفعّلها مدير النظام من صفحة المؤسسات." />
        : route === 'soon:activity' && me.role === 'admin'
        ? <ActivityPage me={me} />
        : route === 'soon:settings' && me.role === 'admin'
        ? <SettingsPage me={me} />
        : route === 'soon:reports' && me.role === 'admin'
        ? <ReportsPage me={me} />
        : typeof route === 'string' && route.startsWith('soon:') && me.role === 'admin'
        ? <ComingSoonPage slug={route.slice(5)} />
        : route === 'family-detail' && me.role === 'admin'
        ? <FamilyDetailPage />
        : route === 'families' && me.role === 'admin'
          ? <FamiliesPage />
          : me.role === 'delegate'
            ? <SubscribersPage me={me} delegateId={me.id} />
            : route === 'patient-detail' && (me.role === 'health' || me.role === 'admin')
              ? <PatientDetailPage me={me} />
              : me.role === 'health' || (route === 'patients' && me.role === 'admin')
                ? <PatientsPage me={me} />
                : route === 'expenses-ledger'
                  ? <ExpensesLedgerPage me={me} />
                  : route === 'expenses' || me.role === 'accountant'
                    ? <ExpensesPage me={me} />
                    : typeof route === 'number'
                      ? <SubscribersPage key={route} me={me} delegateId={route} />
                      : typeof route === 'string' && route.startsWith('list:')
                      ? <SubscribersPage key={route} me={me} delegateId={Number(route.slice(5))} fullList />
                      : route === 'delegates'
                        ? <DelegatesPage me={me} />
                        : <HomePage me={me} />}
      </Suspense>
    </Shell>
    </BrandingProvider>
  );
}

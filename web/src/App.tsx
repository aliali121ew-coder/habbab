import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, setSessionLostHandler, type Me } from './api';
import { Shell } from './components/Shell';
import { StateMessage } from './components/StateMessage';
import { DelegatesPage } from './pages/delegates/DelegatesPage';
import { ComingSoonPage } from './pages/ComingSoonPage';
import { HomePage } from './pages/home/HomePage';
import { Login } from './pages/Login';
import { ChangePassword } from './pages/ChangePassword';
import { ExpensesPage } from './pages/expenses/ExpensesPage';
import { ExpensesLedgerPage } from './pages/expenses/ExpensesLedgerPage';
import { FamiliesPage } from './pages/FamiliesPage';
import { FamilyDetailPage } from './pages/FamilyDetailPage';
import { PatientDetailPage } from './pages/patients/PatientDetailPage';
import { PatientsPage } from './pages/patients/PatientsPage';
import { SubscribersPage } from './pages/subscribers/SubscribersPage';
import { useRoute } from './route';
import { clearLocalRecords } from './localRecords';

export function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'login' | 'error'>('loading');
  const route = useRoute();

  useEffect(() => { window.scrollTo(0, 0); }, [route]);

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
        onSignOut={() => {
          void api('/auth/logout', { method: 'POST' }).catch(() => undefined);
          clearLocalRecords();
          setMe(null);
          setStatus('login');
        }}
      />
    );
  }

  return (
    <Shell me={me} onSignedOut={() => { clearLocalRecords(); setMe(null); setStatus('login'); }}>
      {typeof route === 'string' && route.startsWith('soon:') && me.role === 'admin'
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
    </Shell>
  );
}

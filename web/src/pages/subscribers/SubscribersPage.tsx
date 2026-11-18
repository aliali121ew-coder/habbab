import { useCallback, useEffect, useState } from 'react';
import {
  Printer, UserPlus, Users,
} from 'lucide-react';
import { api, type Me, type Overview } from '../../api';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import { StateMessage } from '../../components/StateMessage';
import { registerHref } from '../../route';
import { DatePicker } from '../../components/DatePicker';
import { today } from '../../format';
import { AddSubscriberDialog } from './AddSubscriberDialog';
import { DelegatePanel } from './DelegatePanel';
import { Register } from './Register';
import { RegisterPrintModal } from './RegisterPrintModal';
import { StatCards } from './StatCards';

export function SubscribersPage({ me, delegateId }: { me: Me; delegateId: number | null }) {
  const now = new Date();
  const thisYear = now.getUTCFullYear();
  const thisMonth = now.getUTCMonth();
  const [year, setYear] = useState(thisYear);
  const [selectedMonth, setSelectedMonth] = useState(thisMonth);
  const [pickedDay, setPickedDay] = useState(today);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [listVersion, setListVersion] = useState(0);
  const [status, setStatus] = useState<'alive' | 'deceased'>('alive');

  const loadOverview = useCallback(async () => {
    setError('');
    try {
      const query = new URLSearchParams({ year: String(year) });
      if (delegateId !== null) query.set('delegate', String(delegateId));
      setOverview(await api<Overview>(`/collections/overview?${query}`));
    } catch (failure) {
      setError((failure as Error).message);
    }
  }, [year, delegateId]);

  useEffect(() => { void loadOverview(); }, [loadOverview]);

  const selectDelegate = (id: number | null) => { location.hash = registerHref(id); };

  // Payments are monthly: the picked day only chooses its month. When the month changes elsewhere
  // (the stat cards, the register), the field shows today in this month, else the month's 1st.
  const monthPrefix = `${year}-${String(selectedMonth + 1).padStart(2, '0')}`;
  const shownDay = pickedDay.startsWith(monthPrefix) ? pickedDay : today().startsWith(monthPrefix) ? today() : `${monthPrefix}-01`;
  const pickDay = (day: string) => {
    setPickedDay(day);
    setYear(Number(day.slice(0, 4)));
    setSelectedMonth(Number(day.slice(5, 7)) - 1);
  };

  return (
    <>
      <div className="page-head">
        <span className="page-icon" aria-hidden><Users size={24} /></span>
        <div>
          {/* The path stops at the parent: the heading below names this page. A delegate has only this page. */}
          {me.role !== 'delegate' && <Breadcrumbs items={[{ label: 'الرئيسية', href: '#/' }, { label: 'المندوبون', href: '#/delegates' }]} />}
          <h1>{overview?.delegate ? `سجل ${overview.delegate.full_name}` : 'سجل كل المشتركين'}</h1>
        </div>
        <div className="page-actions">
          <DatePicker mode="single" label="شهر التسديد" value={{ from: shownDay, to: shownDay }} onChange={({ from }) => pickDay(from)} />
          <button type="button" className="btn" aria-label="طباعة السجل" onClick={() => setPrinting(true)}>
            <Printer size={18} aria-hidden />
            <span className="btn-label">طباعة السجل</span>
          </button>
          <button type="button" className="btn primary" aria-label="إضافة مشترك" onClick={() => setAdding(true)}>
            <UserPlus size={18} aria-hidden />
            <span className="btn-label">إضافة مشترك</span>
          </button>
        </div>
      </div>

      {error && !overview
        ? <StateMessage kind="error" title="تعذّر تحميل الإحصائيات" hint={error} onRetry={loadOverview} />
        : (
          <StatCards
            overview={overview}
            currency={me.currency}
            selectedMonth={selectedMonth}
            onSelectMonth={setSelectedMonth}
          />
        )}

      <div className="workspace">
        <Register
          key={`${year}-${delegateId}-${listVersion}`}
          me={me}
          year={year}
          selectedMonth={selectedMonth}
          onSelectMonth={setSelectedMonth}
          delegateId={delegateId}
          onSelectDelegate={selectDelegate}
          overview={overview}
          onPaymentChanged={loadOverview}
          status={status}
          onStatusChange={setStatus}
        />
        <DelegatePanel
          me={me}
          overview={overview}
          selectedMonth={selectedMonth}
          onSelectMonth={setSelectedMonth}
          onPhotoChanged={loadOverview}
        />
      </div>

      {printing && (
        <RegisterPrintModal
          year={year}
          cutoff={year > thisYear ? -1 : selectedMonth}
          status={status}
          delegateId={delegateId}
          delegateName={overview?.delegate?.full_name ?? (delegateId === null ? 'كل المندوبين' : me.full_name)}
          currency={me.currency}
          // The register goes to its own delegate only, and only the administration sends it.
          canSend={me.role === 'admin' && (delegateId === null || !!overview?.delegate)}
          onClose={() => setPrinting(false)}
        />
      )}

      {adding && (
        <AddSubscriberDialog
          me={me}
          delegates={overview?.delegates ?? []}
          defaultDelegate={delegateId}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            setListVersion((value) => value + 1);
            void loadOverview();
          }}
        />
      )}
    </>
  );
}

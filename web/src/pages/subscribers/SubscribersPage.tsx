import { useCallback, useEffect, useState } from 'react';
import {
  ChevronLeft, Printer, UserPlus, Users,
} from 'lucide-react';
import { api, type Me, type Overview } from '../../api';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import { StateMessage } from '../../components/StateMessage';
import { listFilterFromHash, registerHref, subscriberListHref } from '../../route';
import { useIsPhone } from '../../useIsPhone';
import { ListCards } from './ListCards';
import type { PayFilter } from './Register';
import { DatePicker } from '../../components/DatePicker';
import { formatNumber, today } from '../../format';
import { AddSubscriberDialog } from './AddSubscriberDialog';
import { DelegatePanel } from './DelegatePanel';
import { Register } from './Register';
import { RegisterPrintModal } from './RegisterPrintModal';
import { StatCards } from './StatCards';

export function SubscribersPage({ me, delegateId, fullList = false }: { me: Me; delegateId: number | null; fullList?: boolean }) {
  const isPhone = useIsPhone();
  // Phone, one delegate's page: delegate card first, then a short list. Desktop is unchanged.
  const phonePreview = isPhone && !fullList && delegateId !== null;
  // The full list opens on the filter in its address (a card tapped on the delegate's page).
  const [payFilter, setPayFilter] = useState<PayFilter>(() => (fullList ? listFilterFromHash() : 'all'));
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
      <div className="page-head reg-head">
        <span className="page-icon" aria-hidden><Users size={24} /></span>
        <div>
          {/* The path stops at the parent: the heading below names this page. A delegate has only this page. */}
          {fullList && delegateId !== null
            ? <Breadcrumbs items={[...(me.role !== 'delegate' ? [{ label: 'المندوبون', href: '#/delegates' }] : []), { label: overview?.delegate?.full_name ?? 'السجل', href: registerHref(delegateId) }]} />
            : me.role !== 'delegate' && <Breadcrumbs items={[{ label: 'الرئيسية', href: '#/' }, { label: 'المندوبون', href: '#/delegates' }]} />}
          <h1>
            {fullList
              ? 'سجل المشتركين'
              : overview?.delegate ? `سجل ${overview.delegate.full_name}` : 'سجل كل المشتركين'}
          </h1>
        </div>
        <div className="page-actions">
          <DatePicker mode="single" label="شهر التسديد" value={{ from: shownDay, to: shownDay }} onChange={({ from }) => pickDay(from)} />
          <button type="button" className="btn" aria-label="طباعة السجل" onClick={() => setPrinting(true)}>
            <Printer size={18} aria-hidden />
            <span className="btn-label">طباعة السجل</span>
            <span className="btn-short" aria-hidden>طباعة</span>
          </button>
          <button type="button" className="btn primary" aria-label="إضافة مشترك" onClick={() => setAdding(true)}>
            <UserPlus size={18} aria-hidden />
            <span className="btn-label">إضافة مشترك</span>
            <span className="btn-short" aria-hidden>إضافة</span>
          </button>
        </div>
      </div>

      {error && !overview
        ? <StateMessage kind="error" title="تعذّر تحميل الإحصائيات" hint={error} onRetry={loadOverview} />
        : fullList && delegateId !== null
          ? (
            <ListCards
              overview={overview}
              delegateId={delegateId}
              year={year}
              // The same month the register's filters count to (Register: effectiveMonth).
              month={year === thisYear ? thisMonth : year > thisYear ? -1 : selectedMonth}
              filter={payFilter}
              onPick={(picked) => {
                setPayFilter(picked);
                // Paid, unpaid and late are about the living; "all" keeps the list shown.
                if (picked !== 'all') setStatus('alive');
              }}
            />
          )
          // The phone leaves the four summary cards out: the delegate card takes their place.
          : !phonePreview && (
            <StatCards
              overview={overview}
              currency={me.currency}
              selectedMonth={selectedMonth}
              onSelectMonth={setSelectedMonth}
            />
          )}

      <div className={phonePreview ? 'workspace workspace-phone' : 'workspace'}>
        {phonePreview && (
          <DelegatePanel
            me={me}
            overview={overview}
            selectedMonth={selectedMonth}
            onSelectMonth={setSelectedMonth}
            onPhotoChanged={loadOverview}
          />
        )}
        {/* Phone: the delegate's page holds no subscriber cards; they live on their own page,
            reached from the cards above or this button. */}
        {phonePreview && delegateId !== null ? (
          <a className="reg-more reg-open-list" href={subscriberListHref(delegateId)}>
            <Users size={17} aria-hidden />
            عرض المشتركين
            {overview && <span>(<bdi>{formatNumber(overview.alive + overview.deceased)}</bdi>)</span>}
            <ChevronLeft size={16} aria-hidden />
          </a>
        ) : (
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
          {...(fullList ? { filter: payFilter, onFilterChange: setPayFilter } : {})}
        />
        )}
        {!phonePreview && !fullList && (
          <DelegatePanel
            me={me}
            overview={overview}
            selectedMonth={selectedMonth}
            onSelectMonth={setSelectedMonth}
            onPhotoChanged={loadOverview}
          />
        )}
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

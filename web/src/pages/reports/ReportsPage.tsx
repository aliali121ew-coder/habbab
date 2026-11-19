import { useEffect, useState, type FormEvent } from 'react';
import { BarChart3, CalendarDays, Printer, UserCheck, Users } from 'lucide-react';
import { api, type Me, type Overview } from '../../api';
import { StateMessage } from '../../components/StateMessage';
import { MONTH_NAMES } from '../../format';
import { RegisterPrintModal } from '../subscribers/RegisterPrintModal';

// Reports. First section: the printed subscriber register, moved here from the register pages
// so phones keep those pages to the figures and the list. One delegate or all, alive or
// deceased, up to a chosen month; the preview prints and, for one delegate, sends on WhatsApp.
export function ReportsPage({ me }: { me: Me }) {
  const now = new Date();
  const thisYear = now.getUTCFullYear();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [delegate, setDelegate] = useState('');
  const [status, setStatus] = useState<'alive' | 'deceased'>('alive');
  const [month, setMonth] = useState(now.getUTCMonth());
  const [printing, setPrinting] = useState(false);

  const load = async () => {
    setError('');
    try {
      setOverview(await api<Overview>(`/collections/overview?year=${thisYear}`));
    } catch (failure) {
      setError((failure as Error).message);
    }
  };
  useEffect(() => { void load(); }, []);

  const delegateId = delegate ? Number(delegate) : null;
  const delegateName = delegateId === null
    ? 'كل المندوبين'
    : overview?.delegates.find((person) => person.id === delegateId)?.full_name ?? '';

  const open = (event: FormEvent) => {
    event.preventDefault();
    setPrinting(true);
  };

  return (
    <>
      <div className="page-head">
        <span className="page-icon" aria-hidden><BarChart3 size={24} /></span>
        <div><h1>التقارير</h1></div>
      </div>

      {error && !overview ? (
        <StateMessage kind="error" title="تعذّر تحميل المندوبين" hint={error} onRetry={load} />
      ) : (
        <form className="report-card" onSubmit={open}>
          <header>
            <span className="report-card-icon" aria-hidden><Printer size={20} /></span>
            <div>
              <h2>طباعة سجل المشتركين</h2>
              <p>سجل التسديد لسنة <bdi>{thisYear}</bdi> كما يُطبع ويُرسل للمندوب</p>
            </div>
          </header>

          <label className="report-field">
            <span><UserCheck size={15} aria-hidden /> المندوب</span>
            <select value={delegate} onChange={(event) => setDelegate(event.target.value)} disabled={!overview}>
              <option value="">كل المندوبين</option>
              {overview?.delegates.map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}
            </select>
          </label>

          <div className="report-field">
            <span><Users size={15} aria-hidden /> الفئة</span>
            <div className="seg" role="group" aria-label="الفئة">
              <button type="button" aria-pressed={status === 'alive'} onClick={() => setStatus('alive')}>الأحياء</button>
              <button type="button" aria-pressed={status === 'deceased'} onClick={() => setStatus('deceased')}>الأموات</button>
            </div>
          </div>

          <label className="report-field">
            <span><CalendarDays size={15} aria-hidden /> لغاية شهر</span>
            <select value={month} onChange={(event) => setMonth(Number(event.target.value))}>
              {MONTH_NAMES.map((name, index) => <option key={name} value={index}>{name}</option>)}
            </select>
          </label>

          <button type="submit" className="btn primary report-go" disabled={!overview}>
            <Printer size={18} aria-hidden /> معاينة وطباعة
          </button>
        </form>
      )}

      {printing && (
        <RegisterPrintModal
          year={thisYear}
          cutoff={month}
          status={status}
          delegateId={delegateId}
          delegateName={delegateName}
          currency={me.currency}
          canSend={me.role === 'admin'}
          onClose={() => setPrinting(false)}
        />
      )}
    </>
  );
}

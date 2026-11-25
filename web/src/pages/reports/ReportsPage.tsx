import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpDown, BarChart3, CalendarDays, HeartPulse, Layers, Printer, Receipt, UserCheck, Users } from 'lucide-react';
import { api, type Me, type Overview } from '../../api';
import { printWhenReady } from '../../components/printWhenReady';
import { StateMessage } from '../../components/StateMessage';
import { MONTH_NAMES } from '../../format';
import { PatientsReportSheet } from '../patients/PatientsReportSheet';
import type { Patient } from '../patients/sample';
import { usePatients } from '../../data/patients';
import { RegisterPrintModal } from '../subscribers/RegisterPrintModal';
import { ExpensesPrintModal } from '../expenses/ExpensesPrintModal';
import { CATEGORIES, type ExpenseCategory } from '../expenses/categories';
import type { ExpenseItem } from '../expenses/ExpensesPage';

type PatientSortKey = 'date' | 'cash' | 'name';
const PATIENT_SORT_LABELS: Record<PatientSortKey, string> = {
  date: 'الأحدث',
  cash: 'الأعلى مساعدة',
  name: 'الاسم',
};

function patientTotals(patient: Patient) {
  const sum = (key: 'cash' | 'medicine' | 'exams') => patient.records.reduce((total, record) => total + record[key], 0);
  return {
    cash: sum('cash'),
    medicine: sum('medicine'),
    exams: sum('exams'),
    last: patient.records[0] ?? { date: patient.createdAt.slice(0, 10), doctor: '', delegate: '' },
  };
}

// Reports. Sections: subscriber register print + patients shared register report, moved here
// from the register/patients pages so phones keep those pages focused on figures and lists.
export function ReportsPage({ me }: { me: Me }) {
  const now = new Date();
  const thisYear = now.getUTCFullYear();
  const PATIENTS = usePatients(me.features.includes('patients') && (me.role === 'admin' || me.role === 'health')).patients;
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [delegate, setDelegate] = useState('');
  const [status, setStatus] = useState<'alive' | 'deceased'>('alive');
  const [month, setMonth] = useState(now.getUTCMonth());
  const [printing, setPrinting] = useState(false);

  // Expenses register print (moved here from the expenses page).
  const canExpenses = me.features.includes('expenses') && (me.role === 'admin' || me.role === 'accountant');
  const [expYear, setExpYear] = useState(thisYear);
  const [expMonth, setExpMonth] = useState(now.getUTCMonth());
  const [expCategory, setExpCategory] = useState<ExpenseCategory | ''>('');
  const [expItems, setExpItems] = useState<ExpenseItem[] | null>(null);
  const [expBusy, setExpBusy] = useState(false);
  const [expError, setExpError] = useState('');
  const openExpenses = async (event: FormEvent) => {
    event.preventDefault();
    setExpError('');
    setExpBusy(true);
    try {
      const period = `${expYear}-${String(expMonth + 1).padStart(2, '0')}`;
      const sheet = await api<{ items: ExpenseItem[] }>(`/expenses?month=${period}`);
      setExpItems(expCategory ? sheet.items.filter((item) => item.category === expCategory) : sheet.items);
    } catch (failure) {
      setExpError((failure as Error).message);
    } finally {
      setExpBusy(false);
    }
  };

  // Patients report state
  const [patientSort, setPatientSort] = useState<PatientSortKey>('date');
  const [printingPatients, setPrintingPatients] = useState(false);

  const load = async () => {
    setError('');
    try {
      setOverview(await api<Overview>(`/collections/overview?year=${thisYear}`));
    } catch (failure) {
      setError((failure as Error).message);
    }
  };
  useEffect(() => { void load(); }, []);

  useEffect(() => {
    if (!printingPatients) return undefined;
    const done = () => setPrintingPatients(false);
    window.addEventListener('afterprint', done);
    const cancel = printWhenReady('.rec');
    return () => {
      cancel();
      window.removeEventListener('afterprint', done);
    };
  }, [printingPatients]);

  const patientRows = useMemo(() => {
    const mapped = PATIENTS.map((patient) => ({ patient, ...patientTotals(patient) }));
    return mapped.sort((a, b) => {
      if (patientSort === 'name') return a.patient.name.localeCompare(b.patient.name, 'ar');
      if (patientSort === 'cash') return b.cash - a.cash;
      return b.last.date.localeCompare(a.last.date);
    });
  }, [patientSort, PATIENTS]);

  const delegateId = delegate ? Number(delegate) : null;
  const delegateName = delegateId === null
    ? 'كل المندوبين'
    : overview?.delegates.find((person) => person.id === delegateId)?.full_name ?? '';

  const open = (event: FormEvent) => {
    event.preventDefault();
    setPrinting(true);
  };

  const openPatientsReport = (event: FormEvent) => {
    event.preventDefault();
    setPrintingPatients(true);
  };

  return (
    <>
      <div className="page-head">
        <span className="page-icon" aria-hidden><BarChart3 size={24} /></span>
        <div><h1>التقارير</h1></div>
      </div>

      <div style={{ display: 'grid', gap: 16 }}>
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

        {canExpenses && (
          <form className="report-card" onSubmit={openExpenses}>
            <header>
              <span className="report-card-icon" aria-hidden><Receipt size={20} /></span>
              <div>
                <h2>طباعة سجل الصرفيات</h2>
                <p>صرفيات شهر واحد على ورقة المؤسسة، كل نوع صرف مع قيوده ومجموعه</p>
              </div>
            </header>

            <label className="report-field">
              <span><CalendarDays size={15} aria-hidden /> الشهر</span>
              <select value={expMonth} onChange={(event) => setExpMonth(Number(event.target.value))}>
                {MONTH_NAMES.map((name, index) => (
                  <option key={name} value={index} disabled={expYear === thisYear && index > now.getUTCMonth()}>{name}</option>
                ))}
              </select>
            </label>

            <label className="report-field">
              <span><CalendarDays size={15} aria-hidden /> السنة</span>
              <select value={expYear} onChange={(event) => { const y = Number(event.target.value); setExpYear(y); if (y === thisYear) setExpMonth((m) => Math.min(m, now.getUTCMonth())); }}>
                {[thisYear, thisYear - 1, thisYear - 2].map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>

            <label className="report-field">
              <span><Layers size={15} aria-hidden /> نوع الصرف</span>
              <select value={expCategory} onChange={(event) => setExpCategory(event.target.value as ExpenseCategory | '')}>
                <option value="">كل الأنواع</option>
                {CATEGORIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>

            {expError && <p className="report-error" role="alert">{expError}</p>}

            <button type="submit" className="btn primary report-go" disabled={expBusy}>
              <Printer size={18} aria-hidden /> {expBusy ? 'جارٍ التحميل…' : 'معاينة وطباعة'}
            </button>
          </form>
        )}

        {/* Patients Shared Register Report (moved from PatientsPage) */}
        <form className="report-card" onSubmit={openPatientsReport}>
          <header>
            <span className="report-card-icon" aria-hidden><HeartPulse size={20} /></span>
            <div>
              <h2>تقرير سجل المرضى</h2>
              <p>السجل المشترك بين المؤسسات لكل المساعدات المقدّمة للمرضى (<bdi>{PATIENTS.length}</bdi> مريض)</p>
            </div>
          </header>

          <label className="report-field">
            <span><ArrowUpDown size={15} aria-hidden /> الترتيب حسب</span>
            <select value={patientSort} onChange={(event) => setPatientSort(event.target.value as PatientSortKey)}>
              <option value="date">الأحدث</option>
              <option value="cash">الأعلى مساعدة</option>
              <option value="name">الاسم</option>
            </select>
          </label>

          <button type="submit" className="btn primary report-go">
            <Printer size={18} aria-hidden /> طباعة تقرير المرضى
          </button>
        </form>
      </div>

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

      {expItems && (
        <ExpensesPrintModal
          title={`${MONTH_NAMES[expMonth]} ${expYear}`}
          isMonth
          items={expItems}
          filterNote={expCategory ? `نوع الصرف: ${CATEGORIES.find((item) => item.id === expCategory)?.label ?? ''}` : ''}
          currency={me.currency}
          onClose={() => setExpItems(null)}
        />
      )}

      {printingPatients && createPortal(
        <PatientsReportSheet
          rows={patientRows}
          currency={me.currency}
          query=""
          sortLabel={PATIENT_SORT_LABELS[patientSort]}
        />,
        document.body,
      )}
    </>
  );
}

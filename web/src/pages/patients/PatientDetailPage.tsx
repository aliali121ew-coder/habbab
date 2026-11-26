import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowRight, CalendarDays, ChevronLeft, ChevronRight, HandCoins, HandHeart, Pencil, Pill, Plus, Printer, Search, Stethoscope,
  Trash2, UserRound, type LucideIcon,
} from 'lucide-react';
import type { Me } from '../../api';
import { formatNumber } from '../../format';
import { patientIdFromHash } from '../../route';
import { SortTh, compare, nextSort, type SortState } from '../../components/SortTh';
import { printWhenReady } from '../../components/printWhenReady';
import { AidReceipt } from './AidReceipt';
import type { Patient } from './sample';
import { addAid, getPatient, removeAid, updateAid, updatePatient, type AidInput } from '../../data/patients';
import { AidDialog } from './PatientDialogs';
import { FollowFields } from './PatientFollow';
import '../../styles/pages/patients.css';

type Kind = 'cash' | 'medicine' | 'exams';

const KINDS: Record<Kind, { label: string; icon: LucideIcon; tone: string }> = {
  cash: { label: 'مبلغ مالي', icon: HandCoins, tone: 'tone-amber' },
  medicine: { label: 'شراء دواء', icon: Pill, tone: 'tone-teal' },
  exams: { label: 'كشفية طبية', icon: Stethoscope, tone: 'tone-rose' },
};

const PAGE_SIZE = 10;

// 2026-01-05 → «2026-1-5», read left to right.
const shortDate = (iso: string) => `${iso.slice(0, 4)}-${Number(iso.slice(5, 7))}-${Number(iso.slice(8, 10))}`;
const initials = (name: string) => name.split(' ').slice(0, 2).map((part) => part[0]).join(' ');

// One patient's page (#/patients/:id): who they are, four totals, then every aid they received,
// one row per kind of aid, ten rows to a page. From the server (/api/patients/:id).
type AidKey = 'kind' | 'amount' | 'doctor' | 'date' | 'delegate';
const AID_LABELS: Record<AidKey, string> = {
  kind: 'نوع المساعدة', amount: 'المبلغ', doctor: 'الطبيب', date: 'تاريخ المساعدة', delegate: 'المندوب',
};

export function PatientDetailPage({ me }: { me: Me }) {
  const id = patientIdFromHash();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [editing, setEditing] = useState<{ id: number; aid: AidInput } | 'new' | null>(null);
  const [failure, setFailure] = useState('');
  const load = useCallback(async () => {
    try {
      const { patient: loaded } = await getPatient(id);
      setPatient(loaded);
      setState('ready');
    } catch {
      setState('missing');
    }
  }, [id]);
  useEffect(() => { void load(); }, [load]);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<Kind | 'all'>('all');
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<SortState<AidKey>>({ key: 'date', dir: 'desc' });
  const sortBy = (key: AidKey) => {
    setSort((current) => nextSort(current, key, key === 'amount' || key === 'date' ? 'desc' : 'asc'));
    setPage(0);
  };

  // Each visit can carry cash, medicine and an exam fee: each becomes its own row.
  const aids = useMemo(() => (patient?.records ?? []).flatMap((record) => (Object.keys(KINDS) as Kind[])
    .filter((key) => record[key] > 0)
    .map((key) => ({ ...record, key: `${record.id}-${key}`, kind: key, amount: record[key] }))), [patient]);

  const rows = useMemo(() => {
    const needle = query.trim();
    const value = (aid: (typeof aids)[number]): string | number => (sort.key === 'kind' ? KINDS[aid.kind].label : aid[sort.key]);
    return aids
      .filter((aid) => (kind === 'all' || aid.kind === kind)
        && (!needle || [aid.doctor, aid.delegate, aid.note, aid.foundation].some((text) => text.includes(needle))))
      .sort((a, b) => compare(value(a), value(b), sort.dir));
  }, [aids, kind, query, sort]);

  // Print one aid as a receipt: render it outside the app, print, then remove it.
  const [printing, setPrinting] = useState<(typeof aids)[number] | null>(null);
  useEffect(() => {
    if (!printing) return undefined;
    const done = () => setPrinting(null);
    window.addEventListener('afterprint', done);
    const cancel = printWhenReady('.rcp');
    return () => {
      cancel();
      window.removeEventListener('afterprint', done);
    };
  }, [printing]);

  if (state === 'loading') {
    return <div className="pt"><section className="pt-panel ptd-missing"><p>جارٍ تحميل ملف المريض…</p></section></div>;
  }
  if (!patient) {
    return (
      <div className="pt">
        <section className="pt-panel ptd-missing">
          <h1>لا يوجد مريض بهذا الرقم</h1>
          <a className="pt-report" href="#/patients"><ArrowRight size={17} aria-hidden /> رجوع إلى المرضى</a>
        </section>
      </div>
    );
  }

  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const shown = rows.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  const sum = (key: Kind, own = false) => patient.records
    .filter((record) => !own || record.own)
    .reduce((total, record) => total + record[key], 0);
  const count = (key: Kind) => patient.records.filter((record) => record[key] > 0).length;
  const highest = Math.max(0, ...patient.records.map((record) => record.cash));
  const last = patient.records[0];
  const foundations = new Set(patient.records.map((record) => (record.own ? '' : record.foundation))).size;
  const lastDoctor = patient.records.find((record) => record.own && record.doctor)?.doctor ?? '—';

  const save = async (work: () => Promise<unknown>) => {
    setFailure('');
    try {
      await work();
      await load();
      setEditing(null);
    } catch (problem) {
      setFailure((problem as Error).message);
      throw problem;
    }
  };
  const remove = (aid: (typeof aids)[number]) => {
    const total = aid.cash + aid.medicine + aid.exams;
    if (!window.confirm(`حذف مساعدة ${shortDate(aid.date)} (${formatNumber(total)} ${me.currency})؟ تُحذف أنواعها كلها في هذا التاريخ.`)) return;
    void save(() => removeAid(patient.id, aid.id)).catch(() => undefined);
  };

  const unit = <span className="ptd-unit">{me.currency}</span>;

  return (
    <div className={`pt ptd${me.role === 'delegate' ? ' pt-readonly' : ''}`}>
      {/* The patient, as the supplier header in the reference: photo, name and tag, three facts. */}
      <header className="pt-panel ptd-hero">
        <span className={`ptd-photo tone-${patient.tone}`} aria-hidden>{initials(patient.name)}</span>
        <div className="ptd-who">
          <div className="ptd-name">
            <h1>{patient.name}</h1>
            {patient.condition && <span className="ptd-tag">{patient.condition}</span>}
          </div>
          <dl className="ptd-facts">
            <div><dt>العمر</dt><dd>{patient.age > 0 ? <><bdi>{patient.age}</bdi> سنة</> : '—'}</dd></div>
            <div><dt>رقم الهاتف</dt><dd>{patient.phone ? <bdi dir="ltr">{patient.phone}</bdi> : '—'}</dd></div>
            <div><dt>العنوان</dt><dd>{patient.address || '—'}</dd></div>
            <div><dt>المتابعة</dt><dd>{patient.delegate
              ? <>{patient.delegate.name} <small className="ptd-via">{patient.delegate.via === 'family' ? `عن طريق ${patient.family?.name ?? 'العائلة'}` : 'مباشرة'}</small></>
              : <small className="ptd-via">موظفو المؤسسة فقط</small>}</dd></div>
          </dl>
        </div>
        <button type="button" className="pt-add ptd-add" onClick={() => setEditing('new')}>
          <Plus size={17} aria-hidden /> تسجيل مساعدة
        </button>
        <a className="ptd-file" href="#/patients" aria-label="رجوع إلى سجل المرضى">
          <span className={`ptd-file-photo tone-${patient.tone}`} aria-hidden>{initials(patient.name)}</span>
          <span className="ptd-file-text">
            <small>ملف المريض</small>
            <b>{patient.name}</b>
          </span>
          <span className="ptd-file-go" aria-hidden><ArrowRight size={18} /></span>
        </a>
      </header>

      {me.role !== 'delegate' && <FollowBox patient={patient} onSaved={load} />}

      <section className="pt-panel ptd-cards" aria-label="ملخص المساعدات">
        <Card title="عدد المساعدات" icon={HandHeart} tone="tone-violet" value={<bdi>{formatNumber(aids.length)}</bdi>}
          rows={[
            ['آخر', last ? <bdi dir="ltr">{shortDate(last.date)}</bdi> : '—'],
            ['المؤسسات', <bdi>{foundations}</bdi>],
          ]} />
        <Card title="المبالغ المالية" icon={HandCoins} tone="tone-amber" value={<><bdi>{formatNumber(sum('cash'))}</bdi> {unit}</>}
          rows={[
            ['الدفعات', <bdi>{count('cash')}</bdi>],
            ['أعلى دفعة', <bdi>{formatNumber(highest)}</bdi>],
          ]} />
        <Card title="كشفيات طبية" icon={Stethoscope} tone="tone-rose" value={<><bdi>{formatNumber(sum('exams'))}</bdi> {unit}</>}
          rows={[
            ['الكشفيات', <bdi>{count('exams')}</bdi>],
            ['الطبيب', lastDoctor],
          ]} />
        <Card title="شراء دواء" icon={Pill} tone="tone-teal" value={<><bdi>{formatNumber(sum('medicine', true))}</bdi> {unit}</>}
          rows={[
            ['مشتريات', 'مؤسستنا'],
            ['الكل', <bdi>{formatNumber(sum('medicine'))}</bdi>],
          ]} />
      </section>

      {failure && <p className="pt-notice is-error" role="alert">{failure}</p>}

      <section className="pt-panel ptd-list" aria-labelledby="ptd-list-title">
        <header className="ptd-tabs">
          <h2 id="ptd-list-title" className="ptd-list-title">سجل المساعدات <span>(<bdi>{aids.length}</bdi>)</span></h2>
          <small className="ptd-sorted">مرتب حسب {AID_LABELS[sort.key]}</small>
        </header>
        <div className="ptd-tools">
          <label className="pt-search">
            <Search size={16} aria-hidden />
            <input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder="ابحث بالطبيب أو المندوب أو التفاصيل" aria-label="بحث في المساعدات" />
          </label>
          <select className="ptd-kind" value={kind} onChange={(event) => { setKind(event.target.value as Kind | 'all'); setPage(0); }} aria-label="نوع المساعدة">
            <option value="all">كل الأنواع</option>
            {(Object.keys(KINDS) as Kind[]).map((key) => <option key={key} value={key}>{KINDS[key].label}</option>)}
          </select>
        </div>

        <div className="pt-table-wrap">
          <table className="pt-table ptd-table">
            <colgroup>
              <col className="c-kind" />
              <col className="c-amount" />
              <col className="c-doctor" />
              <col className="c-date" />
              <col className="c-delegate" />
              <col className="c-details" />
              <col className="c-act" />
            </colgroup>
            <thead>
              <tr>
                <SortTh id="kind" label={AID_LABELS.kind} sort={sort} onSort={sortBy} />
                <SortTh id="amount" label={AID_LABELS.amount} sort={sort} onSort={sortBy} className="num" />
                <SortTh id="doctor" label={AID_LABELS.doctor} sort={sort} onSort={sortBy} />
                <SortTh id="date" label={AID_LABELS.date} sort={sort} onSort={sortBy} className="mid" />
                <SortTh id="delegate" label={AID_LABELS.delegate} sort={sort} onSort={sortBy} />
                <th scope="col">التفاصيل</th>
                <th scope="col" className="mid">الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((aid) => {
                const info = KINDS[aid.kind];
                const when = shortDate(aid.date);
                return (
                  <tr key={aid.key}>
                    <td><span className="ptd-type"><span className={`ptd-type-icon ${info.tone}`} aria-hidden><info.icon size={16} /></span>{info.label}</span></td>
                    <td className="num"><b><bdi>{formatNumber(aid.amount)}</bdi></b> <span className="ptd-unit">{me.currency}</span></td>
                    <td>{aid.doctor ? <span className="ptd-person"><span className="ptd-person-icon" aria-hidden><UserRound size={14} /></span>{aid.doctor}</span> : <span className="pt-nil">—</span>}</td>
                    <td className="mid"><span className="ptd-date"><CalendarDays size={14} aria-hidden /><bdi dir="ltr">{when}</bdi></span></td>
                    <td>{aid.delegate ? <span className="ptd-person"><span className="ptd-person-initials" aria-hidden>{initials(aid.delegate)}</span>{aid.delegate}</span> : <span className="pt-nil">—</span>}</td>
                    <td className="ptd-details"><b>{aid.note || (aid.own ? '' : 'مساعدة من مؤسسة أخرى')}</b><small>{aid.foundation}</small></td>
                    <td className="mid">
                      <div className="ptd-actions">
                        {aid.own && (
                          <button type="button" className="ptd-act" title="تعديل" aria-label={`تعديل ${info.label} بتاريخ ${when}`}
                            onClick={() => setEditing({ id: aid.id, aid: { date: aid.date, cash: aid.cash, medicine: aid.medicine, exams: aid.exams, doctor: aid.doctor, delegate: aid.delegate, note: aid.note } })}>
                            <Pencil size={15} aria-hidden />
                          </button>
                        )}
                        {aid.own && me.role === 'admin' && (
                          <button type="button" className="ptd-act del" title="حذف" aria-label={`حذف ${info.label} بتاريخ ${when}`} onClick={() => remove(aid)}>
                            <Trash2 size={15} aria-hidden />
                          </button>
                        )}
                        {aid.own && (
                          <button type="button" className="ptd-act print" title="طباعة" aria-label={`طباعة ${info.label} بتاريخ ${when}`} onClick={() => setPrinting(aid)}>
                            <Printer size={15} aria-hidden />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr>
                  <th scope="row">الإجمالي <small>(<bdi>{rows.length}</bdi> مساعدة)</small></th>
                  <td className="num"><b><bdi>{formatNumber(rows.reduce((total, aid) => total + aid.amount, 0))}</bdi></b> <span className="ptd-unit">{me.currency}</span></td>
                  <td colSpan={5} />
                </tr>
              </tfoot>
            )}
          </table>
          {rows.length === 0 && <p className="pt-empty">لا توجد مساعدة تطابق البحث.</p>}
        </div>

        {/* Phones: the same rows as cards (the table is hidden there). */}
        <ul className="ptd-m-list" aria-label="سجل المساعدات">
          {shown.map((aid) => {
            const info = KINDS[aid.kind];
            const when = shortDate(aid.date);
            return (
              <li key={aid.key} className="ptd-m-row">
                <span className={`ptd-type-icon ${info.tone}`} aria-hidden><info.icon size={16} /></span>
                <div className="ptd-m-main">
                  <strong>{info.label}</strong>
                  <small>
                    <bdi dir="ltr">{when}</bdi>
                    {aid.doctor && <> · {aid.doctor}</>}
                  </small>
                  <small className="ptd-m-from">{aid.own ? (aid.note || aid.foundation) : aid.foundation}</small>
                </div>
                <div className="ptd-m-end">
                  <b><bdi>{formatNumber(aid.amount)}</bdi> <span className="ptd-unit">{me.currency}</span></b>
                  <div className="ptd-actions">
                    {aid.own && (
                      <button type="button" className="ptd-act" aria-label={`تعديل ${info.label} بتاريخ ${when}`}
                        onClick={() => setEditing({ id: aid.id, aid: { date: aid.date, cash: aid.cash, medicine: aid.medicine, exams: aid.exams, doctor: aid.doctor, delegate: aid.delegate, note: aid.note } })}>
                        <Pencil size={15} aria-hidden />
                      </button>
                    )}
                    {aid.own && me.role === 'admin' && (
                      <button type="button" className="ptd-act del" aria-label={`حذف ${info.label} بتاريخ ${when}`} onClick={() => remove(aid)}>
                        <Trash2 size={15} aria-hidden />
                      </button>
                    )}
                    {aid.own && (
                      <button type="button" className="ptd-act print" aria-label={`طباعة ${info.label} بتاريخ ${when}`} onClick={() => setPrinting(aid)}>
                        <Printer size={15} aria-hidden />
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
          {rows.length === 0 && <li className="pt-empty">لا توجد مساعدة تطابق البحث.</li>}
        </ul>

        {rows.length > 0 && (
          <footer className="ptd-pager">
            <span>عرض <bdi>{current * PAGE_SIZE + 1}</bdi>–<bdi>{Math.min(rows.length, (current + 1) * PAGE_SIZE)}</bdi> من <bdi>{rows.length}</bdi></span>
            <nav aria-label="صفحات السجل">
              <button type="button" className="ptd-page" onClick={() => setPage(current - 1)} disabled={current === 0} aria-label="الصفحة السابقة">
                <ChevronRight size={16} aria-hidden />
              </button>
              {Array.from({ length: pages }, (_, index) => (
                <button key={index} type="button" className={`ptd-page${index === current ? ' on' : ''}`} onClick={() => setPage(index)} aria-current={index === current ? 'page' : undefined}>
                  <bdi>{index + 1}</bdi>
                </button>
              ))}
              <button type="button" className="ptd-page" onClick={() => setPage(current + 1)} disabled={current === pages - 1} aria-label="الصفحة التالية">
                <ChevronLeft size={16} aria-hidden />
              </button>
            </nav>
          </footer>
        )}
      </section>

      {printing && createPortal(
        <AidReceipt
          patient={patient}
          aid={printing}
          number={`${patient.file}-${String(aids.indexOf(printing) + 1).padStart(2, '0')}`}
          currency={me.currency}
        />,
        document.body,
      )}

      {editing && (
        <AidDialog
          patientName={patient.name}
          currency={me.currency}
          initial={editing === 'new' ? undefined : editing.aid}
          onClose={() => setEditing(null)}
          onSave={(aid) => save(() => (editing === 'new' ? addAid(patient.id, aid) : updateAid(patient.id, editing.id, aid)))}
        />
      )}
    </div>
  );
}

// One section of the totals strip (design A): the icon beside the title and figure, then the
// two details side by side on one line under a rule.
function Card({ title, icon: Icon, tone, value, rows }: {
  title: string; icon: LucideIcon; tone: string; value: ReactNode; rows: [string, ReactNode][];
}) {
  return (
    <article className="ptd-card">
      <div className="ptd-card-top">
        <span className={`ptd-card-icon ${tone}`} aria-hidden><Icon size={19} /></span>
        <div className="ptd-card-text">
          <h2>{title}</h2>
          <p className="ptd-card-value">{value}</p>
        </div>
      </div>
      <dl>
        {rows.map(([label, content]) => <div key={label}><dt>{label}</dt><dd>{content}</dd></div>)}
      </dl>
    </article>
  );
}

/** The manager or health officer links the patient to a family and/or a delegate. */
function FollowBox({ patient, onSaved }: { patient: Patient; onSaved: () => Promise<void> }) {
  const [value, setValue] = useState({ familyId: patient.family?.id ?? null, delegateId: patient.directDelegateId ?? null });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const changed = value.familyId !== (patient.family?.id ?? null) || value.delegateId !== (patient.directDelegateId ?? null);
  return (
    <section className="pt-panel ptd-follow" aria-label="المتابعة">
      <h2>المتابعة</h2>
      <FollowFields familyId={value.familyId} delegateId={value.delegateId} onChange={setValue} />
      <div className="ptd-follow-actions">
        <button type="button" className="pt-add" disabled={!changed || busy} onClick={async () => {
          setBusy(true); setNote('');
          try { await updatePatient(patient.id, value); await onSaved(); setNote('تم الحفظ'); } catch (e) { setNote((e as Error).message); }
          setBusy(false);
        }}>حفظ المتابعة</button>
        {note && <span role="status">{note}</span>}
      </div>
    </section>
  );
}

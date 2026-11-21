import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowRight, CalendarDays, ChevronLeft, ChevronRight, HandCoins, HandHeart, Pencil, Pill, Printer, Search, Stethoscope,
  UserRound, type LucideIcon,
} from 'lucide-react';
import type { Me } from '../../api';
import { formatNumber } from '../../format';
import { patientIdFromHash } from '../../route';
import { SortTh, compare, nextSort, type SortState } from '../../components/SortTh';
import { printWhenReady } from '../../components/printWhenReady';
import { AidReceipt } from './AidReceipt';
import { FOUNDATIONS, OWN_FOUNDATION, PATIENTS } from './sample';

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
// one row per kind of aid, ten rows to a page. Built on the sample data for now.
type AidKey = 'kind' | 'amount' | 'doctor' | 'date' | 'delegate';
const AID_LABELS: Record<AidKey, string> = {
  kind: 'نوع المساعدة', amount: 'المبلغ', doctor: 'الطبيب', date: 'تاريخ المساعدة', delegate: 'المندوب',
};

export function PatientDetailPage({ me }: { me: Me }) {
  const patient = PATIENTS.find((item) => item.id === patientIdFromHash());
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<Kind | 'all'>('all');
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<SortState<AidKey>>({ key: 'date', dir: 'desc' });
  const sortBy = (key: AidKey) => {
    setSort((current) => nextSort(current, key, key === 'amount' || key === 'date' ? 'desc' : 'asc'));
    setPage(0);
  };

  // Each visit can carry cash, medicine and an exam fee: each becomes its own row.
  const aids = useMemo(() => (patient?.records ?? []).flatMap((record, at) => (Object.keys(KINDS) as Kind[])
    .filter((key) => record[key] > 0)
    .map((key) => ({ id: `${at}-${key}`, kind: key, amount: record[key], ...record }))), [patient]);

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
    .filter((record) => !own || record.foundation === OWN_FOUNDATION)
    .reduce((total, record) => total + record[key], 0);
  const count = (key: Kind) => patient.records.filter((record) => record[key] > 0).length;
  const highest = Math.max(0, ...patient.records.map((record) => record.cash));
  const last = patient.records[0];
  const foundations = new Set(patient.records.map((record) => record.foundation)).size;

  const unit = <span className="ptd-unit">{me.currency}</span>;

  return (
    <div className="pt ptd">
      {/* The patient, as the supplier header in the reference: photo, name and tag, three facts. */}
      <header className="pt-panel ptd-hero">
        <span className={`ptd-photo tone-${patient.tone}`} aria-hidden>{initials(patient.name)}</span>
        <div className="ptd-who">
          <div className="ptd-name">
            <h1>{patient.name}</h1>
            <span className="ptd-tag">{patient.condition}</span>
          </div>
          <dl className="ptd-facts">
            <div><dt>العمر</dt><dd><bdi>{patient.age}</bdi> سنة</dd></div>
            <div><dt>رقم الهاتف</dt><dd><bdi dir="ltr">{patient.phone}</bdi></dd></div>
            <div><dt>العنوان</dt><dd>{patient.address}</dd></div>
          </dl>
        </div>
        <a className="ptd-file" href="#/patients" aria-label="رجوع إلى سجل المرضى">
          <span className={`ptd-file-photo tone-${patient.tone}`} aria-hidden>{initials(patient.name)}</span>
          <span className="ptd-file-text">
            <small>ملف المريض</small>
            <b>{patient.name}</b>
          </span>
          <span className="ptd-file-go" aria-hidden><ArrowRight size={18} /></span>
        </a>
      </header>

      <section className="pt-panel ptd-cards" aria-label="ملخص المساعدات">
        <Card title="عدد المساعدات" icon={HandHeart} tone="tone-violet" value={<bdi>{formatNumber(aids.length)}</bdi>}
          rows={[
            ['آخر', <bdi dir="ltr">{shortDate(last.date)}</bdi>],
            ['المؤسسات', <><bdi>{foundations}</bdi> من <bdi>{FOUNDATIONS.length}</bdi></>],
          ]} />
        <Card title="المبالغ المالية" icon={HandCoins} tone="tone-amber" value={<><bdi>{formatNumber(sum('cash'))}</bdi> {unit}</>}
          rows={[
            ['الدفعات', <bdi>{count('cash')}</bdi>],
            ['أعلى دفعة', <bdi>{formatNumber(highest)}</bdi>],
          ]} />
        <Card title="كشفيات طبية" icon={Stethoscope} tone="tone-rose" value={<><bdi>{formatNumber(sum('exams'))}</bdi> {unit}</>}
          rows={[
            ['الكشفيات', <bdi>{count('exams')}</bdi>],
            ['الطبيب', last.doctor],
          ]} />
        <Card title="شراء دواء" icon={Pill} tone="tone-teal" value={<><bdi>{formatNumber(sum('medicine', true))}</bdi> {unit}</>}
          rows={[
            ['مشتريات', 'مؤسستنا'],
            ['الكل', <bdi>{formatNumber(sum('medicine'))}</bdi>],
          ]} />
      </section>

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
                  <tr key={aid.id}>
                    <td><span className="ptd-type"><span className={`ptd-type-icon ${info.tone}`} aria-hidden><info.icon size={16} /></span>{info.label}</span></td>
                    <td className="num"><b><bdi>{formatNumber(aid.amount)}</bdi></b> <span className="ptd-unit">{me.currency}</span></td>
                    <td><span className="ptd-person"><span className="ptd-person-icon" aria-hidden><UserRound size={14} /></span>{aid.doctor}</span></td>
                    <td className="mid"><span className="ptd-date"><CalendarDays size={14} aria-hidden /><bdi dir="ltr">{when}</bdi></span></td>
                    <td><span className="ptd-person"><span className="ptd-person-initials" aria-hidden>{initials(aid.delegate)}</span>{aid.delegate}</span></td>
                    <td className="ptd-details"><b>{aid.note}</b><small>{aid.foundation}</small></td>
                    <td className="mid">
                      <div className="ptd-actions">
                        <button type="button" className="ptd-act" title="تعديل" aria-label={`تعديل ${info.label} بتاريخ ${when}`}>
                          <Pencil size={15} aria-hidden />
                        </button>
                        <button type="button" className="ptd-act print" title="طباعة" aria-label={`طباعة ${info.label} بتاريخ ${when}`} onClick={() => setPrinting(aid)}>
                          <Printer size={15} aria-hidden />
                        </button>
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

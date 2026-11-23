import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft, Building2, CalendarCheck, CalendarDays, HandHeart, Camera, ChevronLeft, FileText, HandCoins, HeartPulse, MapPin, Phone, Pill, Printer, Search, Stethoscope, UserCheck, UserRound, UsersRound, X,
} from 'lucide-react';
import type { Me } from '../../api';
import { formatNumber } from '../../format';
import { compressAvatar } from '../../image';
import { SortTh, compare, nextSort, type SortState } from '../../components/SortTh';
import { printWhenReady } from '../../components/printWhenReady';
import { loadFamiliesStore } from '../../data/families';
import { WhatsAppMark } from '../subscribers/WhatsAppButton';
import { PatientRecordSheet } from './PatientRecordSheet';
import { FOUNDATIONS, OWN_FOUNDATION, PATIENTS, type AidRecord, type Patient } from './sample';

const FOUNDATION_BRANDS: Record<string, { from: string; to: string; short: string }> = {
  'مؤسسة العين للرعاية': { from: '#0284c7', to: '#0369a1', short: 'العين' },
  'جمعية الكفيل الخيرية': { from: '#059669', to: '#047857', short: 'الكفيل' },
  'مؤسسة اليتيم': { from: '#d97706', to: '#b45309', short: 'اليتيم' },
};
const getFoundationBrand = (name: string) =>
  FOUNDATION_BRANDS[name] ?? { from: '#4f46e5', to: '#4338ca', short: name.slice(0, 6) };

interface StoredFamilyPayment {
  date: string;
  amount: number;
  type: string;
  receivedBy?: string;
  by?: string;
}
interface StoredFamilyVisit {
  date: string;
  delegateName?: string;
  note?: string;
}
interface StoredFamily {
  id: number;
  name: string;
  members?: Array<{ name: string }>;
  payments?: StoredFamilyPayment[];
  visits?: StoredFamilyVisit[];
}

const FEMALE_NAMES = new Set([
  'زينب', 'فاطمة', 'مريم', 'نور', 'سارة', 'هدى', 'زهراء', 'رقية', 'خديجة', 'عائشة',
  'آمنة', 'سمر', 'سعاد', 'أميرة', 'ليلى', 'ميساء', 'دعاء', 'أمل', 'حوراء', 'بتول',
  'إيناس', 'هند', 'ريم', 'شهد', 'تبارك', 'نرجس', 'غدير', 'أسماء', 'بشرى',
]);
const MALE_TA_NAMES = new Set(['حمزة', 'أسامة', 'طلحة', 'حذيفة', 'معاوية', 'قتيبة']);
const isFemale = (patient: Patient & { gender?: 'male' | 'female' }) => {
  if (patient.gender) return patient.gender === 'female';
  const first = patient.name.trim().split(/\s+/)[0] ?? '';
  if (FEMALE_NAMES.has(first)) return true;
  if (MALE_TA_NAMES.has(first)) return false;
  return first.endsWith('ة');
};

function AvatarSilhouette({ female }: { female: boolean }) {
  if (female) {
    return (
      <svg className="pt-photo-silhouette" viewBox="0 0 64 64" fill="currentColor" aria-hidden="true">
        <path d="M32 10c-8.8 0-15 6.4-15 15.2 0 4.6 1.4 8.5 3.6 11.1-5.9 2.9-10.1 8.5-10.6 15.4-.1 1.3.9 2.3 2.2 2.3h39.6c1.3 0 2.3-1 2.2-2.3-.5-6.9-4.7-12.5-10.6-15.4 2.2-2.6 3.6-6.5 3.6-11.1C47 16.4 40.8 10 32 10Zm0 6.5c4.8 0 8.5 3.8 8.5 8.8s-3.7 9.2-8.5 9.2-8.5-4.2-8.5-9.2 3.7-8.8 8.5-8.8Z" />
      </svg>
    );
  }
  return (
    <svg className="pt-photo-silhouette" viewBox="0 0 64 64" fill="currentColor" aria-hidden="true">
      <circle cx="32" cy="22" r="10.5" />
      <path d="M12.2 54c-1.3 0-2.3-1-2.2-2.3C10.9 41.7 19.6 36 32 36s21.1 5.7 22 15.7c.1 1.3-.9 2.3-2.2 2.3H12.2Z" />
    </svg>
  );
}

// 2026-01-05 → «2026-1-5», always read left to right.
const shortDate = (iso: string) => `${iso.slice(0, 4)}-${Number(iso.slice(5, 7))}-${Number(iso.slice(8, 10))}`;
const DateText = ({ iso }: { iso: string }) => <bdi dir="ltr">{shortDate(iso)}</bdi>;
const initials = (name: string) => name.split(' ').slice(0, 2).map((part) => part[0]).join(' ');

function totals(patient: Patient) {
  const sum = (key: 'cash' | 'medicine' | 'exams') => patient.records.reduce((total, record) => total + record[key], 0);
  return {
    cash: sum('cash'),
    medicine: sum('medicine'),
    exams: sum('exams'),
    last: patient.records[0],
    foundations: [...new Set(patient.records.map((record) => record.foundation))],
  };
}

// The shared patients section: four headline cards, the register of patients (three quarters of
// the width) and, beside it, the selected patient's card: who they are on a coloured band, then
// what they have received, from how many foundations. Built on sample data for now.
type ListKey = 'name' | 'date' | 'cash' | 'medicine' | 'exams' | 'doctor';
const LIST_LABELS: Record<ListKey, string> = {
  name: 'المريض', date: 'التاريخ', cash: 'مبالغ مسلّمة', medicine: 'شراء دواء', exams: 'كشفيات طبية', doctor: 'الطبيب',
};

export function PatientsPage({ me }: { me: Me }) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(PATIENTS[0]?.id ?? 0);
  const [mobileSheetPatient, setMobileSheetPatient] = useState<Patient | null>(null);
  const [mobileSheetTab, setMobileSheetTab] = useState<'records' | 'foundations'>('records');
  const [activeFoundationModal, setActiveFoundationModal] = useState<{
    foundation: string;
    patientName: string;
    records: AidRecord[];
    total: number;
    pct: number;
  } | null>(null);
  const [printing, setPrinting] = useState<Patient | null>(null);
  const [sort, setSort] = useState<SortState<ListKey>>({ key: 'date', dir: 'desc' });
  const sortBy = (key: ListKey) => setSort((current) => nextSort(current, key, key === 'name' || key === 'doctor' ? 'asc' : 'desc'));

  const rows = useMemo(() => {
    const needle = query.trim();
    const value = (row: ReturnType<typeof totals> & { patient: Patient }): string | number => {
      switch (sort.key) {
        case 'name': return row.patient.name;
        case 'date': return row.last.date;
        case 'doctor': return row.last.doctor;
        default: return row[sort.key];
      }
    };
    return PATIENTS
      .filter((patient) => !needle || patient.name.includes(needle) || patient.file.includes(needle.toUpperCase()) || patient.phone.replaceAll(' ', '').includes(needle))
      .map((patient) => ({ patient, ...totals(patient) }))
      .sort((a, b) => compare(value(a), value(b), sort.dir));
  }, [query, sort]);

  const all = useMemo(() => PATIENTS.map(totals), []);
  const headline = {
    patients: PATIENTS.length,
    cash: all.reduce((sum, item) => sum + item.cash, 0),
    // Medicine is what this foundation bought itself, not what the other foundations bought.
    medicine: PATIENTS.flatMap((patient) => patient.records)
      .filter((record) => record.foundation === OWN_FOUNDATION)
      .reduce((sum, record) => sum + record.medicine, 0),
    exams: all.reduce((sum, item) => sum + item.exams, 0),
    visits: PATIENTS.reduce((sum, patient) => sum + patient.records.length, 0),
    // Each non-zero cash, medicine or exams entry in a visit counts as one aid.
    aids: PATIENTS.flatMap((patient) => patient.records)
      .reduce((sum, record) => sum + [record.cash, record.medicine, record.exams].filter((value) => value > 0).length, 0),
    foundations: new Set(PATIENTS.flatMap((patient) => patient.records.map((record) => record.foundation))).size,
  };

  // Undefined while the register is empty: the side card is then left out.
  const selected: Patient | undefined = PATIENTS.find((patient) => patient.id === selectedId) ?? PATIENTS[0];
  const detail = selected ? totals(selected) : null;
  const emptyText = PATIENTS.length === 0 ? 'لا يوجد مرضى مسجّلون بعد.' : 'لا يوجد مريض يطابق البحث.';
  const [photos, setPhotos] = useState<Record<number, string>>(() => {
    try { return JSON.parse(localStorage.getItem('ahbab:patient-photos') || '{}') as Record<number, string>; }
    catch { return {}; }
  });

  const pickPhoto = async (patientId: number, file: File | undefined) => {
    if (!file) return;
    const blob = await compressAvatar(file);
    const dataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.readAsDataURL(blob);
    });
    if (!dataUrl) return;
    setPhotos((current) => {
      const next = { ...current, [patientId]: dataUrl };
      try { localStorage.setItem('ahbab:patient-photos', JSON.stringify(next)); } catch { /* ignore quota */ }
      return next;
    });
  };

  // Print one patient's sheet: render it outside the app, print, then remove it.
  useEffect(() => {
    if (!printing) return undefined;
    const done = () => setPrinting(null);
    window.addEventListener('afterprint', done);
    const cancel = printWhenReady('.rec');
    return () => {
      cancel();
      window.removeEventListener('afterprint', done);
    };
  }, [printing]);

  const money = (value: number) => (value > 0 ? <bdi>{formatNumber(value)}</bdi> : <span className="pt-nil">—</span>);

  return (
    <div className="pt">
      <header className="pt-top">
        <span className="pt-top-icon" aria-hidden><HeartPulse size={24} /></span>
        <div className="pt-top-text">
          <h1>المرضى</h1>
          <p>السجل المشترك بين المؤسسات لكل المساعدات المقدّمة للمرضى</p>
        </div>
      </header>

      <section className="pt-cards" aria-label="الملخص">
        <article className="pt-card">
          <header><h2>عدد المرضى</h2><UsersRound size={18} className="ink-violet" aria-hidden /></header>
          <p className="pt-card-value"><bdi>{formatNumber(headline.patients)}</bdi> <span className="ink-violet">مريض</span></p>
          <small>عبر <bdi>{formatNumber(headline.foundations)}</bdi> مؤسسات</small>
        </article>
        <article className="pt-card">
          <header><h2>عدد المساعدات</h2><HandHeart size={18} className="ink-violet" aria-hidden /></header>
          <p className="pt-card-value"><bdi>{formatNumber(headline.aids)}</bdi> <span className="ink-violet">مساعدة</span></p>
          <small>نقد ودواء وكشفيات</small>
        </article>
        <article className="pt-card">
          <header><h2>عدد الزيارات</h2><CalendarCheck size={18} className="ink-teal" aria-hidden /></header>
          <p className="pt-card-value"><bdi>{formatNumber(headline.visits)}</bdi> <span className="ink-teal">زيارة</span></p>
          <small>مراجعات مسجلة للمرضى</small>
        </article>
        <article className="pt-card">
          <header><h2>شراء دواء</h2><Pill size={18} className="ink-teal" aria-hidden /></header>
          <p className="pt-card-value"><bdi>{formatNumber(headline.medicine)}</bdi> <span className="ink-teal">{me.currency}</span></p>
          <small>مشتريات {OWN_FOUNDATION}</small>
        </article>
        <article className="pt-card">
          <header><h2>مبالغ مسلّمة</h2><HandCoins size={18} className="ink-green" aria-hidden /></header>
          <p className="pt-card-value ink-green"><bdi>{formatNumber(headline.cash)}</bdi> <span>{me.currency}</span></p>
          <small>نقداً للمرضى</small>
        </article>
        <article className="pt-card">
          <header><h2>كشفيات طبية</h2><Stethoscope size={18} className="ink-amber" aria-hidden /></header>
          <p className="pt-card-value"><bdi>{formatNumber(headline.exams)}</bdi> <span className="ink-amber">{me.currency}</span></p>
          <small>أجور أطباء وفحوصات</small>
        </article>
      </section>

      <div className="pt-main">
        <section className="pt-panel pt-register" aria-labelledby="pt-register-title">
          <header className="pt-panel-head">
            <div className="tbl-title">
              <h2 id="pt-register-title">سجل المرضى <span className="tbl-count"><bdi>{rows.length}</bdi></span></h2>
              <small>مرتب حسب {LIST_LABELS[sort.key]}</small>
            </div>
            <div className="pt-quick-pills" role="group" aria-label="فرز سريع">
              {([['date', 'الأحدث'], ['cash', 'الأعلى مساعدة'], ['name', 'الاسم']] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={sort.key === key ? 'is-on' : undefined}
                  onClick={() => sortBy(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="pt-search">
              <Search size={16} aria-hidden />
              <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث بالاسم أو الهاتف" aria-label="بحث عن مريض" />
            </label>
          </header>

          <div className="pt-table-wrap">
            <table className="pt-table">
              <thead>
                <tr>
                  <th scope="col" className="pt-idx">#</th>
                  <SortTh id="name" label={LIST_LABELS.name} sort={sort} onSort={sortBy} />
                  <SortTh id="date" label={LIST_LABELS.date} sort={sort} onSort={sortBy} className="mid" />
                  <SortTh id="cash" label={LIST_LABELS.cash} sort={sort} onSort={sortBy} className="num" />
                  <SortTh id="medicine" label={LIST_LABELS.medicine} sort={sort} onSort={sortBy} className="num" />
                  <SortTh id="exams" label={LIST_LABELS.exams} sort={sort} onSort={sortBy} className="num" />
                  <SortTh id="doctor" label={LIST_LABELS.doctor} sort={sort} onSort={sortBy} />
                  <th scope="col" className="act mid">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ patient, cash, medicine, exams, last }, index) => (
                  <tr
                    key={patient.id}
                    className={patient.id === selected?.id ? 'on' : undefined}
                    onClick={() => setSelectedId(patient.id)}
                    aria-selected={patient.id === selected?.id}
                  >
                    <td className="pt-idx">{index + 1}</td>
                    <td>
                      <div className="pt-who">
                        <span className={`pt-avatar tone-${patient.tone}`} aria-hidden>{initials(patient.name)}</span>
                        <b>{patient.name}</b>
                      </div>
                    </td>
                    <td className="pt-date mid"><span><CalendarDays size={14} aria-hidden /><DateText iso={last.date} /></span></td>
                    <td className="num pt-cash">{money(cash)}</td>
                    <td className="num">{money(medicine)}</td>
                    <td className="num">{money(exams)}</td>
                    <td className="pt-doctor"><span><UserRound size={14} aria-hidden />{last.doctor}</span></td>
                    <td className="act mid">
                      <button
                        type="button"
                        className="pt-print"
                        onClick={(event) => { event.stopPropagation(); setPrinting(patient); }}
                        aria-label={`طباعة سجل ${patient.name}`}
                      >
                        <Printer size={15} aria-hidden /> طباعة
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && <p className="pt-empty">{emptyText}</p>}
          </div>

          {/* Mobile-only compact cards matching Expenses style */}
          <div className="pt-m-list" role="list" aria-label="قائمة المرضى">
            {rows.map(({ patient, cash, medicine, exams, last }) => {
              const grandTotal = cash + medicine + exams;
              return (
                <button
                  key={patient.id}
                  type="button"
                  role="listitem"
                  className="pt-m-card"
                  onClick={() => {
                    setSelectedId(patient.id);
                    setMobileSheetTab('records');
                    setMobileSheetPatient(patient);
                  }}
                >
                  <div className="pt-m-card-main">
                    <span className={`pt-m-card-icon tone-${patient.tone}`} aria-hidden>
                      {photos[patient.id]
                        ? <img src={photos[patient.id]} alt="" />
                        : initials(patient.name)}
                    </span>
                    <div className="pt-m-card-info">
                      <strong>{patient.name}</strong>
                      <small><HeartPulse size={11} aria-hidden /> {patient.condition}</small>
                    </div>
                    <ChevronLeft size={16} className="pt-m-card-chev" aria-hidden />
                  </div>
                  <div className="pt-m-card-foot">
                    <span className="pt-m-card-meta">
                      <span><FileText size={12} aria-hidden /><bdi>{patient.records.length}</bdi> {patient.records.length === 1 ? 'مراجعة' : 'مراجعات'}</span>
                      <span><CalendarDays size={12} aria-hidden /><DateText iso={last.date} /></span>
                    </span>
                    <b className="pt-m-card-amt">
                      <bdi>{formatNumber(grandTotal)}</bdi> <span>{me.currency}</span>
                    </b>
                  </div>
                </button>
              );
            })}
            {rows.length === 0 && <p className="pt-empty">{emptyText}</p>}
          </div>
        </section>

        {selected && detail && <aside className="pt-profile" aria-label={`ملف ${selected.name}`}>
          <div className="pt-band">
            <label className={`pt-photo pt-photo-pick tone-${selected.tone}`} title="اضغط لإضافة أو تغيير الصورة">
              {photos[selected.id]
                ? <img src={photos[selected.id]} alt={selected.name} />
                : <AvatarSilhouette female={isFemale(selected)} />}
              <span className="pt-photo-cam" aria-hidden><Camera size={15} /></span>
              <input
                type="file"
                accept="image/*"
                aria-label={`صورة ${selected.name}`}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  void pickPhoto(selected.id, file);
                }}
                hidden
              />
            </label>
          </div>

          <a className="pt-name-link" href={`#/patients/${selected.id}`} title="عرض تفاصيل المريض">
            <h2>{selected.name}</h2>
            <ArrowLeft size={18} aria-hidden />
          </a>

          <div className="pt-lower">
            <div className="pt-facts">
              <article className="pt-fact">
                <span className="pt-fact-icon tone-amber"><HandCoins size={17} aria-hidden /></span>
                <h3>المبلغ المسلّم</h3>
                <p><bdi>{formatNumber(detail.cash)}</bdi></p>
              </article>
              <article className="pt-fact">
                <span className="pt-fact-icon tone-teal"><Pill size={17} aria-hidden /></span>
                <h3>شراء دواء</h3>
                <p><bdi>{formatNumber(detail.medicine)}</bdi></p>
              </article>
              <article className="pt-fact">
                <span className="pt-fact-icon tone-rose"><Stethoscope size={17} aria-hidden /></span>
                <h3>كشفيات طبية</h3>
                <p><bdi>{formatNumber(detail.exams)}</bdi></p>
              </article>
              <article className="pt-fact">
                <span className="pt-fact-icon tone-violet"><Building2 size={17} aria-hidden /></span>
                <h3>المؤسسات</h3>
                <p><bdi>{formatNumber(detail.foundations.length)}</bdi> <span>من {formatNumber(FOUNDATIONS.length)}</span></p>
              </article>
            </div>

            <FoundationChart patient={selected} />
          </div>
        </aside>}
      </div>

      {mobileSheetPatient && createPortal(
        (() => {
          const sheetTotals = totals(mobileSheetPatient);
          const grandTotal = sheetTotals.cash + sheetTotals.medicine + sheetTotals.exams;
          const phoneDigits = mobileSheetPatient.phone.replace(/\D/g, '');
          const waHref = `https://wa.me/${phoneDigits.startsWith('0') ? `964${phoneDigits.slice(1)}` : phoneDigits}`;

          // Match this patient in the Needy Families store for our own foundation's reviews/payments
          const familiesStore = loadFamiliesStore() as StoredFamily[];
          const matchedFamily = familiesStore.find(
            (f) =>
              f.members?.some((m) => m.name.trim() === mobileSheetPatient.name.trim()) ||
              f.name.includes(mobileSheetPatient.name.trim()),
          ) ?? null;

          const ownFamilyPayments = matchedFamily?.payments ?? [];
          const ownFamilyVisits = matchedFamily?.visits ?? [];
          const ownTotalCount = ownFamilyPayments.length + ownFamilyVisits.length;

          // Other foundations ONLY (exclude account owner foundation)
          const externalFoundations = FOUNDATIONS.filter((f) => f !== OWN_FOUNDATION)
            .map((foundation) => {
              const recs = mobileSheetPatient.records.filter((r) => r.foundation === foundation);
              const total = recs.reduce((s, r) => s + r.cash + r.medicine + r.exams, 0);
              return {
                foundation,
                records: recs,
                count: recs.length,
                total,
                pct: grandTotal > 0 ? Math.round((total / grandTotal) * 100) : 0,
              };
            })
            .filter((item) => item.total > 0)
            .sort((a, b) => b.total - a.total);
          return (
            <div
              className="pt-msheet-backdrop"
              role="dialog"
              aria-modal="true"
              aria-label={`تفاصيل المريض ${mobileSheetPatient.name}`}
              dir="rtl"
              onClick={(e) => { if (e.target === e.currentTarget) setMobileSheetPatient(null); }}
            >
              <aside className="pt-msheet">
                {/* Gradient Hero Header */}
                <div className="pt-msheet-hero">
                  {/* Row 1: File Code & Age (Right) + Close Button (Left) */}
                  <div className="pt-msheet-topbar">
                    <div className="pt-msheet-topmeta">
                      <span className="pt-msheet-file" dir="ltr">{mobileSheetPatient.file}</span>
                      <span className="pt-msheet-age"><bdi>{mobileSheetPatient.age}</bdi> سنة</span>
                    </div>
                    <button
                      type="button"
                      className="pt-msheet-close"
                      onClick={() => setMobileSheetPatient(null)}
                      aria-label="إغلاق"
                    >
                      <X size={17} aria-hidden />
                    </button>
                  </div>

                  {/* Row 2: Photo + Name + Diagnosis + Address */}
                  <div className="pt-msheet-who">
                    <label className={`pt-msheet-photo tone-${mobileSheetPatient.tone}`} title="اضغط لإضافة أو تغيير الصورة">
                      {photos[mobileSheetPatient.id]
                        ? <img src={photos[mobileSheetPatient.id]} alt={mobileSheetPatient.name} />
                        : <AvatarSilhouette female={isFemale(mobileSheetPatient)} />}
                      <span className="pt-msheet-cam" aria-hidden><Camera size={12} /></span>
                      <input
                        type="file"
                        accept="image/*"
                        aria-label={`صورة ${mobileSheetPatient.name}`}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          event.target.value = '';
                          void pickPhoto(mobileSheetPatient.id, file);
                        }}
                        hidden
                      />
                    </label>

                    <div className="pt-msheet-title">
                      <a
                        href={`#/patients/${mobileSheetPatient.id}`}
                        className="pt-msheet-name-link"
                        onClick={() => setMobileSheetPatient(null)}
                      >
                        <h3>{mobileSheetPatient.name}</h3>
                      </a>
                      <span className="pt-msheet-cond">
                        <HeartPulse size={11} aria-hidden /> {mobileSheetPatient.condition}
                      </span>
                      <span className="pt-msheet-addr">
                        <MapPin size={12} aria-hidden />
                        <span>{mobileSheetPatient.address}</span>
                      </span>
                    </div>
                  </div>

                  {/* Row 3: Equal 2-Column Contact Bar */}
                  {phoneDigits && (
                    <div className="pt-msheet-contact">
                      <a href={`tel:${phoneDigits}`} className="pt-msheet-call" aria-label={`اتصال بـ ${mobileSheetPatient.name}`}>
                        <Phone size={14} aria-hidden />
                        <bdi dir="ltr">{mobileSheetPatient.phone}</bdi>
                      </a>
                      <a href={waHref} target="_blank" rel="noopener noreferrer" className="pt-msheet-wa" aria-label={`واتساب ${mobileSheetPatient.name}`}>
                        <WhatsAppMark />
                        <span>واتساب</span>
                      </a>
                    </div>
                  )}
                </div>

                {/* Scrollable Body */}
                <div className="pt-msheet-scroll">
                  {/* Grand Total + 2x2 Financial Breakdown */}
                  <div className="pt-msheet-summary">
                    <div className="pt-msheet-grand">
                      <div>
                        <span>إجمالي المساعدات المقدّمة</span>
                        <small><bdi>{mobileSheetPatient.records.length}</bdi> مراجعات عبر <bdi>{sheetTotals.foundations.length}</bdi> مؤسسات</small>
                      </div>
                      <strong><bdi>{formatNumber(grandTotal)}</bdi> <span>{me.currency}</span></strong>
                    </div>

                    <div className="pt-msheet-kpis">
                      <div>
                        <span><HandCoins size={12} className="ink-green" aria-hidden /> مبالغ مسلّمة</span>
                        <b className="ink-green"><bdi>{formatNumber(sheetTotals.cash)}</bdi> <small>{me.currency}</small></b>
                      </div>
                      <div>
                        <span><Pill size={12} className="ink-teal" aria-hidden /> شراء دواء</span>
                        <b className="ink-teal"><bdi>{formatNumber(sheetTotals.medicine)}</bdi> <small>{me.currency}</small></b>
                      </div>
                      <div>
                        <span><Stethoscope size={12} className="ink-amber" aria-hidden /> كشفيات طبية</span>
                        <b className="ink-amber"><bdi>{formatNumber(sheetTotals.exams)}</bdi> <small>{me.currency}</small></b>
                      </div>
                      <div>
                        <span><Building2 size={12} className="ink-violet" aria-hidden /> المؤسسات</span>
                        <b className="ink-violet"><bdi>{sheetTotals.foundations.length}</bdi> <small>من {FOUNDATIONS.length}</small></b>
                      </div>
                    </div>
                  </div>

                  {/* Clean Segmented Tabs */}
                  <div className="pt-msheet-tabs" role="tablist">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={mobileSheetTab === 'records'}
                      className={mobileSheetTab === 'records' ? 'is-on' : undefined}
                      onClick={() => setMobileSheetTab('records')}
                    >
                      المراجعات (<bdi>{ownTotalCount}</bdi>)
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={mobileSheetTab === 'foundations'}
                      className={mobileSheetTab === 'foundations' ? 'is-on' : undefined}
                      onClick={() => setMobileSheetTab('foundations')}
                    >
                      المؤسسات (<bdi>{externalFoundations.length}</bdi>)
                    </button>
                  </div>

                  <div className="pt-msheet-body">
                    {mobileSheetTab === 'records' ? (
                      <div className="pt-msheet-records">
                        {/* Owner Foundation Header Strip linked to Needy Families */}
                        <div className="pt-msheet-own-bar">
                          <img src="/logo.jpg" alt="" className="pt-msheet-own-logo" />
                          <div className="pt-msheet-own-info">
                            <strong>مؤسسة أحباب الحسين الثقافية الخيرية</strong>
                            <small>بيانات المراجعات من سجل العوائل المتعففة</small>
                          </div>
                          {matchedFamily && (
                            <a
                              href={`#/families/${matchedFamily.id}`}
                              className="pt-msheet-own-link"
                              onClick={() => setMobileSheetPatient(null)}
                            >
                              ملف العائلة <ArrowLeft size={12} aria-hidden />
                            </a>
                          )}
                        </div>

                        {ownFamilyPayments.map((pay, idx) => (
                          <article key={`fp-${pay.date}-${idx}`} className="pt-msheet-rec">
                            <div className="pt-msheet-rec-top">
                              <strong><HandCoins size={13} className="ink-green" aria-hidden /> {pay.type}</strong>
                              <span className="pt-msheet-date"><CalendarDays size={12} aria-hidden /> <DateText iso={pay.date} /></span>
                            </div>
                            <div className="pt-msheet-rec-meta">
                              {pay.receivedBy && <span><UserRound size={12} aria-hidden /> المستلم: {pay.receivedBy}</span>}
                              {pay.by && <span><UserCheck size={12} aria-hidden /> {pay.by}</span>}
                            </div>
                            <div className="pt-msheet-rec-foot">
                              <span className="pt-msheet-source-tag">العوائل المتعففة</span>
                              <b className="pt-msheet-rec-sum ink-green"><bdi>{formatNumber(pay.amount)}</bdi> {me.currency}</b>
                            </div>
                          </article>
                        ))}

                        {ownFamilyVisits.map((visit, idx) => (
                          <article key={`fv-${visit.date}-${idx}`} className="pt-msheet-rec">
                            <div className="pt-msheet-rec-top">
                              <strong><UserCheck size={13} aria-hidden /> زيارة ميدانية — {visit.delegateName || 'المندوب'}</strong>
                              <span className="pt-msheet-date"><CalendarDays size={12} aria-hidden /> <DateText iso={visit.date} /></span>
                            </div>
                            {visit.note && (
                              <p className="pt-msheet-note">
                                <FileText size={12} aria-hidden /> {visit.note}
                              </p>
                            )}
                          </article>
                        ))}

                        {ownTotalCount === 0 && (
                          <p className="pt-empty">لا توجد مراجعات مسجلة لهذا المريض في سجل العوائل المتعففة حالياً.</p>
                        )}
                      </div>
                    ) : (
                      <div className="pt-msheet-founds">
                        {externalFoundations.map((item) => {
                          const brand = getFoundationBrand(item.foundation);
                          return (
                            <button
                              key={item.foundation}
                              type="button"
                              className="pt-msheet-fitem pt-msheet-fitem-btn"
                              onClick={() =>
                                setActiveFoundationModal({
                                  foundation: item.foundation,
                                  patientName: mobileSheetPatient.name,
                                  records: item.records,
                                  total: item.total,
                                  pct: item.pct,
                                })
                              }
                            >
                              <div className="pt-msheet-fitem-top">
                                <div className="pt-msheet-fitem-who">
                                  <span
                                    className="pt-msheet-flogo"
                                    style={{ background: `linear-gradient(135deg, ${brand.from}, ${brand.to})` }}
                                    aria-hidden
                                  >
                                    <Building2 size={16} />
                                  </span>
                                  <div>
                                    <strong>{item.foundation}</strong>
                                    <small>{item.count} {item.count === 1 ? 'مساعدة' : 'مساعدات'} • اضغط لعرض التفاصيل</small>
                                  </div>
                                </div>
                                <div className="pt-msheet-fitem-end">
                                  <b><bdi>{formatNumber(item.total)}</bdi> <span>{me.currency}</span></b>
                                  <ChevronLeft size={15} className="pt-m-card-chev" aria-hidden />
                                </div>
                              </div>
                              <div className="pt-msheet-bar" aria-hidden>
                                <span
                                  style={{
                                    width: `${Math.max(6, item.pct)}%`,
                                    background: `linear-gradient(270deg, ${brand.from}, ${brand.to})`,
                                  }}
                                />
                              </div>
                            </button>
                          );
                        })}
                        {externalFoundations.length === 0 && (
                          <p className="pt-empty">لا توجد مساعدات مسجلة من مؤسسات أخرى لهذا المريض.</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-msheet-foot">
                  <button
                    type="button"
                    className="pt-msheet-print"
                    onClick={() => {
                      const target = mobileSheetPatient;
                      setMobileSheetPatient(null);
                      setPrinting(target);
                    }}
                  >
                    <Printer size={16} aria-hidden />
                    <span>طباعة السجل</span>
                  </button>
                  <a
                    href={`#/patients/${mobileSheetPatient.id}`}
                    className="pt-msheet-full"
                    onClick={() => setMobileSheetPatient(null)}
                  >
                    <span>الملف الكامل</span>
                    <ArrowLeft size={15} aria-hidden />
                  </a>
                </div>
              </aside>
            </div>
          );
        })(),
        document.body,
      )}

      {activeFoundationModal && createPortal(
        (() => {
          const brand = getFoundationBrand(activeFoundationModal.foundation);
          const cashSum = activeFoundationModal.records.reduce((s, r) => s + r.cash, 0);
          const medSum = activeFoundationModal.records.reduce((s, r) => s + r.medicine, 0);
          const examSum = activeFoundationModal.records.reduce((s, r) => s + r.exams, 0);
          return (
            <div
              className="pt-fmodal-backdrop"
              role="dialog"
              aria-modal="true"
              aria-label={`تفاصيل مساعدات ${activeFoundationModal.foundation}`}
              dir="rtl"
              onClick={(e) => { if (e.target === e.currentTarget) setActiveFoundationModal(null); }}
            >
              <div className="pt-fmodal">
                {/* Colored Brand Header with Foundation Logo & Name */}
                <div
                  className="pt-fmodal-head"
                  style={{ background: `linear-gradient(135deg, ${brand.from}, ${brand.to})` }}
                >
                  <div className="pt-fmodal-top">
                    <div className="pt-fmodal-brand">
                      <span className="pt-fmodal-logo" aria-hidden>
                        <Building2 size={22} />
                      </span>
                      <div>
                        <h3>{activeFoundationModal.foundation}</h3>
                        <p>مساعدات المريض: {activeFoundationModal.patientName}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="pt-fmodal-close"
                      onClick={() => setActiveFoundationModal(null)}
                      aria-label="إغلاق"
                    >
                      <X size={17} aria-hidden />
                    </button>
                  </div>

                  <div className="pt-fmodal-totals">
                    <div>
                      <span>إجمالي المساهمة</span>
                      <strong><bdi>{formatNumber(activeFoundationModal.total)}</bdi> <small>{me.currency}</small></strong>
                    </div>
                    <div>
                      <span>عدد المساعدات</span>
                      <strong><bdi>{activeFoundationModal.records.length}</bdi></strong>
                    </div>
                    <div>
                      <span>النسبة</span>
                      <strong><bdi>{activeFoundationModal.pct}%</bdi></strong>
                    </div>
                  </div>
                </div>

                {/* Breakdown + Detailed Aid Records */}
                <div className="pt-fmodal-body">
                  <div className="pt-fmodal-split">
                    <div>
                      <span>نقدي</span>
                      <b className="ink-green"><bdi>{formatNumber(cashSum)}</bdi></b>
                    </div>
                    <div>
                      <span>دواء</span>
                      <b className="ink-teal"><bdi>{formatNumber(medSum)}</bdi></b>
                    </div>
                    <div>
                      <span>كشفيات</span>
                      <b className="ink-amber"><bdi>{formatNumber(examSum)}</bdi></b>
                    </div>
                  </div>

                  <div className="pt-fmodal-list">
                    {activeFoundationModal.records.map((rec, idx) => {
                      const recTotal = rec.cash + rec.medicine + rec.exams;
                      return (
                        <article key={`${rec.date}-${idx}`} className="pt-msheet-rec">
                          <div className="pt-msheet-rec-top">
                            <strong><UserRound size={13} aria-hidden /> {rec.doctor}</strong>
                            <span className="pt-msheet-date"><CalendarDays size={12} aria-hidden /> <DateText iso={rec.date} /></span>
                          </div>
                          <div className="pt-msheet-rec-meta">
                            <span><UserCheck size={12} aria-hidden /> المندوب: {rec.delegate}</span>
                          </div>
                          {rec.note && (
                            <p className="pt-msheet-note">
                              <FileText size={12} aria-hidden /> {rec.note}
                            </p>
                          )}
                          <div className="pt-msheet-rec-foot">
                            <div className="pt-msheet-pills">
                              {rec.cash > 0 && <span className="is-cash">نقدي: <bdi>{formatNumber(rec.cash)}</bdi></span>}
                              {rec.medicine > 0 && <span className="is-med">دواء: <bdi>{formatNumber(rec.medicine)}</bdi></span>}
                              {rec.exams > 0 && <span className="is-exam">كشفية: <bdi>{formatNumber(rec.exams)}</bdi></span>}
                            </div>
                            <b className="pt-msheet-rec-sum"><bdi>{formatNumber(recTotal)}</bdi> {me.currency}</b>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          );
        })(),
        document.body,
      )}

      {printing && createPortal(
        <PatientRecordSheet patient={printing} currency={me.currency} />,
        document.body,
      )}
    </div>
  );
}

// «المؤسسة» and «جمعية» add nothing on a short axis label.
const shortName = (name: string) => name.replace(/^(مؤسسة|جمعية)\s+/, '').replace(/\s+(للرعاية|الخيرية)$/, '');

// What each foundation gave this patient, as paired columns: cash, and medicine with exams.
// The foundation that gave the most is marked with a dot on top of its column.
function FoundationChart({ patient }: { patient: Patient }) {
  const groups = FOUNDATIONS.map((foundation) => {
    const records = patient.records.filter((record) => record.foundation === foundation);
    return {
      foundation,
      cash: records.reduce((sum, record) => sum + record.cash, 0),
      care: records.reduce((sum, record) => sum + record.medicine + record.exams, 0),
    };
  });
  const max = Math.max(1, ...groups.flatMap((group) => [group.cash, group.care]));
  const top = groups.reduce((best, group) => (group.cash + group.care > best.cash + best.care ? group : best), groups[0]);
  const height = (value: number) => (value > 0 ? `${Math.max(6, (value / max) * 100)}%` : '4px');
  return (
    <div className="pt-chart">
      <header>
        <h3>المساعدات حسب المؤسسة</h3>
        <ul className="pt-legend">
          <li><i className="cash" />مبالغ</li>
          <li><i className="care" />دواء وكشفيات</li>
        </ul>
      </header>
      <div className="pt-bars" role="img" aria-label={groups.map((g) => `${g.foundation}: مبالغ ${formatNumber(g.cash)}، دواء وكشفيات ${formatNumber(g.care)}`).join('؛ ')}>
        {groups.map((group) => (
          <div key={group.foundation} className={`pt-group${group === top && group.cash + group.care > 0 ? ' top' : ''}`} title={group.foundation}>
            <div className="pt-pair">
              <span className="pt-bar cash" style={{ height: height(group.cash) }} />
              <span className="pt-bar care" style={{ height: height(group.care) }} />
            </div>
            <small>{shortName(group.foundation)}</small>
          </div>
        ))}
      </div>
      <ul className="pt-found-list" aria-label="إجمالي كل مؤسسة">
        {groups.map((group) => {
          const total = group.cash + group.care;
          return (
            <li key={group.foundation} className={total === 0 ? 'is-zero' : undefined}>
              <span>{shortName(group.foundation)}</span>
              <b><bdi>{formatNumber(total)}</bdi></b>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

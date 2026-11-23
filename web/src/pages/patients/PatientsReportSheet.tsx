import { HandCoins, MapPin, Phone, Pill, Stethoscope, UsersRound } from 'lucide-react';
import { formatNumber, today } from '../../format';
import { useBranding } from '../../branding';
import { FOUNDATIONS, type Patient } from './sample';

const shortDate = (iso: string) => `${iso.slice(0, 4)}-${Number(iso.slice(5, 7))}-${Number(iso.slice(8, 10))}`;

export interface ReportRow {
  patient: Patient;
  cash: number;
  medicine: number;
  exams: number;
  last: Patient['records'][number];
}

interface Props {
  rows: ReportRow[];
  currency: string;
  query: string;
  sortLabel: string;
}

// The printed patients report (A4 portrait), in the same dress as one patient's record: angled
// dark header with the foundation and the title, what the report covers and its summary, one
// numbered table of the patients as listed on screen (totals are in the strip of cards above it),
// then the notes, the signature, stamp and contact footer. Shares its styles with the record (styles/record.css).
export function PatientsReportSheet({ rows, currency, query, sortLabel }: Props) {
  const sum = (key: 'cash' | 'medicine' | 'exams') => rows.reduce((total, row) => total + row[key], 0);
  const visits = rows.reduce((total, row) => total + row.patient.records.length, 0);
  const foundations = new Set(rows.flatMap((row) => row.patient.records.map((record) => record.foundation))).size;
  const brand = useBranding();

  return (
    <div className="rec rec-report" dir="rtl">
      <span className="rec-frame" aria-hidden />
      {brand.logo && <img className="rec-watermark" src={brand.logo} alt="" />}

      <header className="rec-head">
        <div className="rec-org">
          {brand.logo && <img src={brand.logo} alt="" />}
          <strong>{brand.name}</strong>
        </div>
        <span className="rec-gold-tab" aria-hidden />
        <div className="rec-title">
          <h1>تقرير المرضى</h1>
          <dl>
            <div><dt>النطاق</dt><dd>{query ? <>نتيجة البحث: {query}</> : 'كل المرضى'}</dd></div>
            <div><dt>الترتيب</dt><dd>حسب {sortLabel}</dd></div>
            <div><dt>تاريخ الطباعة</dt><dd dir="ltr">{shortDate(today())}</dd></div>
          </dl>
        </div>
      </header>

      {/* The summary as one strip of four joined cards, as on the patient page. */}
      <section className="rec-strip" aria-label="ملخص التقرير">
        <div>
          <span className="rec-strip-icon"><UsersRound size={15} aria-hidden /></span>
          <dl><dt>عدد المرضى</dt><dd><bdi>{rows.length}</bdi></dd></dl>
          <small><bdi>{visits}</bdi> مراجعة · <bdi>{foundations}</bdi> من <bdi>{FOUNDATIONS.length}</bdi> مؤسسات</small>
        </div>
        <div>
          <span className="rec-strip-icon"><HandCoins size={15} aria-hidden /></span>
          <dl><dt>المبالغ المسلّمة</dt><dd><bdi>{formatNumber(sum('cash'))}</bdi></dd></dl>
          <small>{currency} نقداً للمرضى</small>
        </div>
        <div>
          <span className="rec-strip-icon"><Pill size={15} aria-hidden /></span>
          <dl><dt>شراء دواء</dt><dd><bdi>{formatNumber(sum('medicine'))}</bdi></dd></dl>
          <small>{currency}</small>
        </div>
        <div>
          <span className="rec-strip-icon"><Stethoscope size={15} aria-hidden /></span>
          <dl><dt>كشفيات طبية</dt><dd><bdi>{formatNumber(sum('exams'))}</bdi></dd></dl>
          <small>{currency}</small>
        </div>
      </section>

      <table className="rec-table">
        <thead>
          <tr>
            <th className="n">ت</th>
            <th>المريض</th>
            <th>آخر مراجعة</th>
            <th className="amount">مبالغ مسلّمة</th>
            <th className="amount">شراء دواء</th>
            <th className="amount">كشفيات</th>
            <th>الطبيب</th>
            <th>المندوب</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.patient.id}>
              <td className="n">{String(index + 1).padStart(2, '0')}</td>
              <td className="who">{row.patient.name}<small>{row.patient.condition}</small></td>
              <td dir="ltr" className="date">{shortDate(row.last.date)}</td>
              <td className="amount">{formatNumber(row.cash)}</td>
              <td className="amount">{formatNumber(row.medicine)}</td>
              <td className="amount">{formatNumber(row.exams)}</td>
              <td>{row.last.doctor}</td>
              <td>{row.last.delegate}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="rec-bottom">
        <div className="rec-notes">
          <h2>ملاحظات</h2>
          <p>المبالغ مجموع ما استلمه كل مريض من جميع المؤسسات المشتركة في السجل، بالدينار العراقي.</p>
        </div>
      </section>

      <footer className="rec-foot">
        <div className="rec-sign">
          <section className="sig-slot"><h4>توقيع المحاسب</h4>{brand.signature && <img className="sig-img" src={brand.signature} alt="توقيع المحاسب" />}<span className="rec-line" /></section>
          <section className="sig-slot"><h4>توقيع المدير</h4>{brand.signature2 && <img className="sig-img" src={brand.signature2} alt="توقيع المدير" />}<span className="rec-line" /></section>
        </div>
        <div className="rec-contact">
          {brand.phones.length > 0 && <span><Phone size={12} aria-hidden /><bdi dir="ltr">{brand.phones.join(' · ')}</bdi></span>}
          {brand.address && <span><MapPin size={12} aria-hidden />{brand.address}</span>}
        </div>
      </footer>
      <div className="rec-base" aria-hidden />
    </div>
  );
}

import { MapPin, Phone } from 'lucide-react';
import { formatNumber, today } from '../../format';
import { useBranding } from '../../branding';
import { FOUNDATIONS, type Patient } from './sample';

type Kind = 'cash' | 'medicine' | 'exams';
const KINDS: [Kind, string][] = [['cash', 'مبلغ مالي'], ['medicine', 'شراء دواء'], ['exams', 'كشفية طبية']];
const TOTAL_LABELS: Record<Kind, string> = { cash: 'المبالغ المالية', medicine: 'شراء دواء', exams: 'كشفيات طبية' };

const shortDate = (iso: string) => `${iso.slice(0, 4)}-${Number(iso.slice(5, 7))}-${Number(iso.slice(8, 10))}`;

// The printed patient record (A4 portrait), after the invoice reference the user chose and made
// richer: an angled dark header with the foundation and the title, the patient and a summary of
// their record, one numbered table of every aid (grouped by kind), the totals per kind, then an
// angled footer with the foundation's contacts beside the accountant's signature and the stamp.
export function PatientRecordSheet({ patient, currency }: { patient: Patient; currency: string }) {
  const rows = KINDS.flatMap(([kind, label]) => patient.records
    .filter((record) => record[kind] > 0)
    .map((record) => ({ kind, label, amount: record[kind], ...record })));
  const sum = (kind: Kind) => patient.records.reduce((total, record) => total + record[kind], 0);
  const grand = sum('cash') + sum('medicine') + sum('exams');
  const foundations = new Set(patient.records.map((record) => record.foundation)).size;
  const brand = useBranding();

  return (
    <div className="rec" dir="rtl">
      <span className="rec-frame" aria-hidden />
      {brand.logo && <img className="rec-watermark" src={brand.logo} alt="" />}

      <header className="rec-head">
        <div className="rec-org">
          {brand.logo && <img src={brand.logo} alt="" />}
          <strong>{brand.name}</strong>
        </div>
        <span className="rec-gold-tab" aria-hidden />
        <div className="rec-title">
          <h1>سجل المريض</h1>
          <dl>
            <div><dt>رقم الملف</dt><dd dir="ltr">{patient.file}</dd></div>
            <div><dt>تاريخ الطباعة</dt><dd dir="ltr">{shortDate(today())}</dd></div>
          </dl>
        </div>
      </header>

      <section className="rec-intro">
        <div>
          <h2>بيانات المريض</h2>
          <p className="rec-name">{patient.name}</p>
          <span className="rec-chip">{patient.condition} · <bdi>{patient.age}</bdi> سنة</span>
          <dl className="rec-pairs">
            <div><dt>الهاتف</dt><dd><bdi dir="ltr">{patient.phone}</bdi></dd></div>
            <div><dt>العنوان</dt><dd>{patient.address}</dd></div>
          </dl>
        </div>
        <div>
          <h2>ملخص السجل</h2>
          <dl className="rec-pairs">
            <div><dt>عدد المساعدات</dt><dd><bdi>{rows.length}</bdi></dd></div>
            <div><dt>المؤسسات</dt><dd><bdi>{foundations}</bdi> من <bdi>{FOUNDATIONS.length}</bdi></dd></div>
            <div><dt>آخر مراجعة</dt><dd dir="ltr">{shortDate(patient.records[0].date)}</dd></div>
          </dl>
        </div>
      </section>

      <table className="rec-table">
        <thead>
          <tr>
            <th className="n">ت</th>
            <th>نوع المساعدة</th>
            <th>التاريخ</th>
            <th>الطبيب</th>
            <th>المندوب</th>
            <th className="amount">المبلغ ({currency})</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.kind}-${row.date}-${index}`}>
              <td className="n">{String(index + 1).padStart(2, '0')}</td>
              <td>{row.label}</td>
              <td dir="ltr" className="date">{shortDate(row.date)}</td>
              <td>{row.doctor}</td>
              <td>{row.delegate}</td>
              <td className="amount">{formatNumber(row.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="rec-bottom">
        <div className="rec-notes">
          <h2>ملاحظات</h2>
          <p>يشمل هذا السجل كل المساعدات المقدّمة للمريض من جميع المؤسسات المشتركة.</p>
        </div>
        <dl className="rec-totals">
          {KINDS.map(([kind]) => (
            <div key={kind}><dt>{TOTAL_LABELS[kind]}</dt><dd>{formatNumber(sum(kind))}</dd></div>
          ))}
          <div className="grand"><dt>الإجمالي</dt><dd>{formatNumber(grand)} {currency}</dd></div>
        </dl>
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

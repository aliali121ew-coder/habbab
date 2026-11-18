import { formatNumber, today } from '../../format';
import {
  CATEGORY_LABELS,
  HOUSING_LABELS,
  PRIORITY_LABELS,
  getUnifiedDisbursements,
  type Family,
} from './sample';

export function FamiliesRegisterPrint({
  families,
  currency,
  delegateFilter,
}: {
  families: Family[];
  currency: string;
  delegateFilter: string;
}) {
  const totalSalaries = families.reduce((acc, f) => acc + f.monthlySalary, 0);
  const totalSupport = families.reduce((acc, f) => acc + getUnifiedDisbursements(f).grandTotal, 0);

  return (
    <div className="fam-print-sheet" dir="rtl" lang="ar">
      <header className="fam-print-head">
        <div>
          <strong>مؤسسة سجلات الخير</strong>
          <h1>كشف العوائل المتعففة المعتمد</h1>
        </div>
        <div className="fam-print-meta">
          <span>تاريخ الطباعة: <bdi dir="ltr">{today()}</bdi></span>
          <span>المندوب: {delegateFilter === 'all' ? 'جميع المندوبين' : delegateFilter}</span>
          <span>عدد العوائل: <bdi>{formatNumber(families.length)}</bdi></span>
        </div>
      </header>

      <dl className="fam-print-kpis">
        <div><dt>إجمالي العوائل</dt><dd><bdi>{formatNumber(families.length)}</bdi> عائلة</dd></div>
        <div><dt>التزام الرواتب الشهرية</dt><dd><bdi>{formatNumber(totalSalaries)}</bdi> {currency}</dd></div>
        <div><dt>إجمالي المساعدات والكشفيات التراكمية</dt><dd><bdi>{formatNumber(totalSupport)}</bdi> {currency}</dd></div>
      </dl>

      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>رقم الملف</th>
            <th>اسم العائلة</th>
            <th>المنطقة</th>
            <th>المندوب الخاص</th>
            <th>الأفراد</th>
            <th>الراتب الشهري</th>
            <th>مساعدات ومرضى</th>
            <th>إجمالي الدعم</th>
          </tr>
        </thead>
        <tbody>
          {families.map((fam, idx) => {
            const totals = getUnifiedDisbursements(fam);
            return (
              <tr key={fam.id}>
                <td><bdi>{idx + 1}</bdi></td>
                <td><bdi dir="ltr">{fam.fileNo}</bdi></td>
                <td>{fam.headName}</td>
                <td>{fam.district}</td>
                <td>{fam.delegateName}</td>
                <td><bdi>{fam.members.length}</bdi></td>
                <td><bdi>{formatNumber(fam.monthlySalary)}</bdi></td>
                <td><bdi>{formatNumber(totals.assistanceTotal + totals.patientAidTotal)}</bdi></td>
                <td><b><bdi>{formatNumber(totals.grandTotal)}</bdi></b></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function FamilyDossierPrint({
  family,
  currency,
}: {
  family: Family;
  currency: string;
}) {
  const data = getUnifiedDisbursements(family);

  return (
    <div className="fam-print-sheet" dir="rtl" lang="ar">
      <header className="fam-print-head">
        <div>
          <strong>مؤسسة سجلات الخير — الملف الخاص الكامل للعائلة</strong>
          <h1>{family.headName}</h1>
        </div>
        <div className="fam-print-meta">
          <span>رقم الملف: <bdi dir="ltr">{family.fileNo}</bdi></span>
          <span>الأولوية: {PRIORITY_LABELS[family.priority]}</span>
          <span>التاريخ: <bdi dir="ltr">{today()}</bdi></span>
        </div>
      </header>

      <dl className="fam-print-kpis">
        <div><dt>المعيل / المسؤول</dt><dd>{family.guardianName}</dd></div>
        <div><dt>التصنيف</dt><dd>{CATEGORY_LABELS[family.category]}</dd></div>
        <div><dt>المندوب الخاص</dt><dd>{family.delegateName} (<bdi dir="ltr">{family.delegatePhone}</bdi>)</dd></div>
        <div><dt>الهاتف</dt><dd><bdi dir="ltr">{family.phone}</bdi></dd></div>
        <div><dt>العنوان والسكن</dt><dd>{family.address} — {HOUSING_LABELS[family.housing]}</dd></div>
        <div><dt>الراتب الشهري المقرر</dt><dd><bdi>{formatNumber(family.monthlySalary)}</bdi> {currency}</dd></div>
      </dl>

      <p className="fam-print-note"><strong>الملخص الميداني:</strong> {family.caseSummary}</p>

      <h2>ملخص الدعم المالي والطبي</h2>
      <dl className="fam-print-kpis">
        <div><dt>الرواتب المصروفة</dt><dd><bdi>{formatNumber(data.salariesTotal)}</bdi> {currency}</dd></div>
        <div><dt>المساعدات والغذاء والإيجار</dt><dd><bdi>{formatNumber(data.assistanceTotal)}</bdi> {currency}</dd></div>
        <div><dt>مساعدات المرضى والدواء</dt><dd><bdi>{formatNumber(data.patientCashTotal + data.patientMedicineTotal)}</bdi> {currency}</dd></div>
        <div><dt>الكشفيات الطبية ({data.patientExamsCount})</dt><dd><bdi>{formatNumber(data.patientExamsTotal)}</bdi> {currency}</dd></div>
        <div><dt>الإجمالي الكلي للدعم</dt><dd><b><bdi>{formatNumber(data.grandTotal)}</bdi> {currency}</b></dd></div>
      </dl>

      <h2>أفراد العائلة ({family.members.length})</h2>
      <table>
        <thead>
          <tr>
            <th>الاسم</th>
            <th>الصفة</th>
            <th>العمر</th>
            <th>الوضع الدراسي / المهني</th>
            <th>الحالة الصحية</th>
          </tr>
        </thead>
        <tbody>
          {family.members.map((member) => (
            <tr key={member.id}>
              <td>{member.name} {member.isOrphan ? '(يتيم)' : ''}</td>
              <td>{member.relation}</td>
              <td><bdi>{member.age}</bdi></td>
              <td>{member.roleNote}</td>
              <td>{member.healthNote}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>سجل الرواتب والمساعدات ومساعدات المرضى والكشفيات ({data.items.length})</h2>
      <table>
        <thead>
          <tr>
            <th>التاريخ</th>
            <th>الفئة</th>
            <th>البيان</th>
            <th>المصدر / المؤسسة</th>
            <th>المندوب</th>
            <th>المبلغ ({currency})</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((item) => (
            <tr key={item.id}>
              <td><bdi dir="ltr">{item.date}</bdi></td>
              <td>{item.label}</td>
              <td>{item.title}</td>
              <td>{item.source === 'patient' ? `سجل المرضى (${item.foundation})` : item.foundation}</td>
              <td>{item.delegateName}</td>
              <td><b><bdi>{formatNumber(item.amount)}</bdi></b></td>
            </tr>
          ))}
        </tbody>
      </table>

      <footer className="fam-print-signs">
        <div><span>توقيع المندوب الخاص:</span> <b>{family.delegateName}</b></div>
        <div><span>اعتماد الإدارة:</span> <b>________________________</b></div>
      </footer>
    </div>
  );
}

import {
  Activity, Building2, CalendarDays, Cake, FileText, HandCoins, HeartPulse, MapPin, Phone, Pill, Stethoscope, UserRound,
  type LucideIcon,
} from 'lucide-react';
import { phonesLine, useBranding } from '../../branding';
import { formatNumber, today } from '../../format';
import { FoundationStamp } from '../subscribers/FoundationStamp';
import type { AidRecord, Patient } from './sample';

export type AidKind = 'cash' | 'medicine' | 'exams';

const KIND: Record<AidKind, { label: string; icon: LucideIcon }> = {
  cash: { label: 'مبلغ مالي', icon: HandCoins },
  medicine: { label: 'شراء دواء', icon: Pill },
  exams: { label: 'كشفية طبية', icon: Stethoscope },
};

const shortDate = (iso: string) => `${iso.slice(0, 4)}-${Number(iso.slice(5, 7))}-${Number(iso.slice(8, 10))}`;

// 290000 → «مئتان وتسعون ألف»: the amount in words, as written on receipts.
const ONES = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة'];
const TENS = ['', 'عشرة', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
const HUNDREDS = ['', 'مئة', 'مئتان', 'ثلاثمئة', 'أربعمئة', 'خمسمئة', 'ستمئة', 'سبعمئة', 'ثمانمئة', 'تسعمئة'];

function belowThousand(n: number): string {
  const parts: string[] = [];
  if (n >= 100) parts.push(HUNDREDS[Math.floor(n / 100)]);
  const rest = n % 100;
  if (rest === 10) parts.push('عشرة');
  else if (rest === 11) parts.push('أحد عشر');
  else if (rest === 12) parts.push('اثنا عشر');
  else if (rest > 12 && rest < 20) parts.push(`${ONES[rest - 10]} عشر`);
  else if (rest >= 20) parts.push(rest % 10 ? `${ONES[rest % 10]} و${TENS[Math.floor(rest / 10)]}` : TENS[rest / 10]);
  else if (rest > 0) parts.push(ONES[rest]);
  return parts.join(' و');
}

// The counted word after a number: 1 and 2 have their own forms; the rest follows the last two
// digits (3–10 plural, 11–99 accusative singular, round hundreds plain singular).
function scale(n: number, one: string, two: string, few: string, many: string): string {
  if (n === 1) return one;
  if (n === 2) return two;
  const tail = n % 100;
  const word = tail >= 3 && tail <= 10 ? few : tail >= 11 ? many : one;
  return `${belowThousand(n)} ${word}`;
}

export function amountInWords(amount: number): string {
  if (amount === 0) return 'صفر';
  const millions = Math.floor(amount / 1_000_000);
  const thousands = Math.floor((amount % 1_000_000) / 1000);
  const rest = amount % 1000;
  const parts: string[] = [];
  if (millions) parts.push(scale(millions, 'مليون', 'مليونان', 'ملايين', 'مليوناً'));
  if (thousands) parts.push(scale(thousands, 'ألف', 'ألفان', 'آلاف', 'ألفاً'));
  if (rest) parts.push(belowThousand(rest));
  return parts.join(' و');
}

interface Props {
  patient: Patient;
  aid: AidRecord & { kind: AidKind; amount: number };
  number: string;
  currency: string;
}

// The aid receipt (design B, landscape A5): a navy side band with the foundation and the patient,
// and on the other side the aid itself: amount in figures and words, its details, room for notes,
// then the signatures and the foundation's stamp. Built for one patient's single aid.
export function AidReceipt({ patient, aid, number, currency }: Props) {
  const kind = KIND[aid.kind];
  const printed = shortDate(today());
  const brand = useBranding();

  return (
    <div className="rcp" dir="rtl">
      <aside className="rcp-band">
        <div className="rcp-org">
          {brand.logo && <img src={brand.logo} alt="" />}
          <strong>{brand.name}</strong>
        </div>

        <section className="rcp-patient">
          <h2>بيانات المريض</h2>
          <dl>
            <div><dt><UserRound size={12} aria-hidden />الاسم</dt><dd>{patient.name}</dd></div>
            <div><dt><Activity size={12} aria-hidden />الحالة</dt><dd>{patient.condition}</dd></div>
            <div><dt><Cake size={12} aria-hidden />العمر</dt><dd>{patient.age > 0 ? <><bdi>{patient.age}</bdi> سنة</> : '—'}</dd></div>
            <div><dt><Phone size={12} aria-hidden />الهاتف</dt><dd><bdi dir="ltr">{patient.phone}</bdi></dd></div>
            <div><dt><MapPin size={12} aria-hidden />العنوان</dt><dd>{patient.address}</dd></div>
          </dl>
        </section>

        <section className="rcp-org-card">
          <h2>للاتصال والاستفسار :</h2>
          <ul>
            {brand.address && <li><MapPin size={12} aria-hidden /><span>{brand.address}</span></li>}
            {brand.phones.length > 0 && <li><Phone size={12} aria-hidden /><bdi dir="ltr">{phonesLine(brand.phones)}</bdi></li>}
          </ul>
        </section>

        <HeartPulse className="rcp-mark" size={120} aria-hidden />
      </aside>

      <main className="rcp-main">
        <header className="rcp-head">
          <div>
            <h1>وصل مساعدة طبية</h1>
            <p>نسخة المريض</p>
          </div>
          <dl>
            <div><dt>رقم الوصل</dt><dd dir="ltr">{number}</dd></div>
            <div><dt>تاريخ الطباعة</dt><dd dir="ltr">{printed}</dd></div>
          </dl>
        </header>

        <section className="rcp-amount">
          <span className="rcp-kind"><kind.icon size={22} aria-hidden /></span>
          <div className="rcp-amount-figure">
            <small>{kind.label}</small>
            <b><bdi>{formatNumber(aid.amount)}</bdi> <span>{currency}</span></b>
          </div>
          <p className="rcp-words">{amountInWords(aid.amount)} دينار عراقي فقط لا غير</p>
        </section>

        <dl className="rcp-facts">
          <div><dt><CalendarDays size={13} aria-hidden />تاريخ المساعدة</dt><dd dir="ltr">{shortDate(aid.date)}</dd></div>
          <div><dt><Stethoscope size={13} aria-hidden />الطبيب</dt><dd>{aid.doctor}</dd></div>
          <div><dt><UserRound size={13} aria-hidden />المندوب</dt><dd>{aid.delegate}</dd></div>
          <div><dt><Building2 size={13} aria-hidden />الجهة المانحة</dt><dd>{aid.foundation}</dd></div>
          <div className="wide"><dt><FileText size={13} aria-hidden />التفاصيل</dt><dd>{aid.note}</dd></div>
        </dl>

        <div className="rcp-notes"><span>ملاحظات:</span></div>

        <footer className="rcp-sign">
          <section className="sig-slot"><h4>توقيع المستلم</h4><span className="rcp-line" /></section>
          <section className="sig-slot"><h4>توقيع المحاسب</h4>{brand.signature && <img className="sig-img" src={brand.signature} alt="توقيع المحاسب" />}<span className="rcp-line" /></section>
          <FoundationStamp />
        </footer>

      </main>
    </div>
  );
}

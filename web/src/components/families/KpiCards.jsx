import { Banknote, HandHeart, Pill, ShoppingBasket, Stethoscope, Wallet } from 'lucide-react';
import { Card } from '../../pages/subscribers/ListCards';
import { formatIQD } from '../../utils/format';

// This month as YYYY-MM, matched against payment dates.
const thisMonth = () => new Date().toISOString().slice(0, 7);

// The six kinds of aid, each matched to the payment types the families' records use. The older
// records say "راتب شهري", "مساعدات", "أدوية" and "كشفية"; food baskets and cash amounts are new.
export const AID_KINDS = [
  { tone: 'food', icon: ShoppingBasket, label: 'سلة غذائية', types: ['سلة غذائية'] },
  { tone: 'cash', icon: Banknote, label: 'مبالغ مالية', types: ['مبالغ مالية'] },
  { tone: 'medicine', icon: Pill, label: 'شراء دواء', types: ['أدوية'] },
  { tone: 'salary', icon: Wallet, label: 'صرف رواتب', types: ['راتب شهري'] },
  { tone: 'aid', icon: HandHeart, label: 'مساعدات إنسانية', types: ['مساعدات'] },
  { tone: 'exam', icon: Stethoscope, label: 'كشفيات طبية', types: ['كشفية'] },
];

// What the families received this month, by kind: how many times (large) and how much in total.
export function KpiCards({ families }) {
  const month = thisMonth();
  const payments = families.flatMap((family) => (family.payments ?? []).filter((payment) => payment.date.startsWith(month)));

  return (
    <section aria-label="المساعدات المصروفة هذا الشهر" className="list-cards fam-aid-cards">
      {AID_KINDS.map((kind) => {
        const own = payments.filter((payment) => kind.types.includes(payment.type));
        const total = own.reduce((sum, payment) => sum + payment.amount, 0);
        return (
          <Card
            key={kind.tone}
            tone={kind.tone}
            icon={<kind.icon size={18} />}
            label={kind.label}
            value={own.length}
            note={total ? formatIQD(total) : 'لا شيء هذا الشهر'}
          />
        );
      })}
    </section>
  );
}

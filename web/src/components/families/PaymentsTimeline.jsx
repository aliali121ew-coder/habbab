import { CheckCircle2, HandCoins, Pill, Stethoscope, Wallet } from 'lucide-react';
import { formatIQD } from '../../utils/format';

const TYPE_META = {
  'راتب شهري': { icon: Wallet, tint: 'bg-blue-600/10 text-blue-700' },
  'مساعدات': { icon: HandCoins, tint: 'bg-emerald-600/10 text-emerald-700' },
  'أدوية': { icon: Pill, tint: 'bg-amber-600/10 text-amber-700' },
  'كشفية': { icon: Stethoscope, tint: 'bg-rose-600/10 text-rose-700' },
};

export function PaymentsTimeline({ payments = [] }) {
  if (payments.length === 0) {
    return <p className="py-6 text-center text-xs text-slate-500">لم تُسجّل دفعات صرف لهذه العائلة حتى الآن.</p>;
  }

  return (
    <ol className="relative space-y-3 border-s-2 border-slate-200/80 ps-4">
      {payments.map((payment, index) => {
        const meta = TYPE_META[payment.type] ?? { icon: CheckCircle2, tint: 'bg-slate-100 text-slate-700' };
        const Icon = meta.icon;

        return (
          <li key={`${payment.date}-${index}`} className="relative">
            <span
              className={`absolute -start-[27px] top-1 inline-flex h-5 w-5 items-center justify-center rounded-full ring-4 ring-white ${meta.tint}`}
              aria-hidden
            >
              <Icon className="h-3 w-3" />
            </span>

            <div className="rounded-xl border border-slate-200/70 bg-slate-50/70 px-3.5 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-slate-900">{payment.type}</span>
                <span className="text-xs font-bold text-emerald-600 tabular-nums">{formatIQD(payment.amount)}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                <span>المستلم: {payment.receivedBy} · بيد {payment.by}</span>
                <span className="tabular-nums" dir="ltr">{payment.date}</span>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

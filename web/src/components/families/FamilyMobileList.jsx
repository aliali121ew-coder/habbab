import { ChevronLeft, HandCoins, MapPin } from 'lucide-react';
import { CATEGORY_CONFIG, familyInitial, formatIQD, totalEntitlement } from '../../utils/format';

/** Phone list: one tappable card per family, the money state at a glance, no sideways scrolling. */
export function FamilyMobileList({ families, loading, onOpenFullFile, onPay }) {
  if (loading) {
    return (
      <ul className="grid gap-2.5" aria-busy="true">
        {[0, 1, 2, 3].map((k) => <li key={k} className="h-[104px] animate-pulse rounded-2xl border border-slate-200/70 bg-white" />)}
      </ul>
    );
  }

  return (
    <ul className="grid gap-2.5" aria-label="قائمة العوائل">
      {families.map((family) => {
        const cat = CATEGORY_CONFIG[family.category] ?? CATEGORY_CONFIG.stable;
        const due = totalEntitlement(family);
        const pct = due > 0 ? Math.min(100, Math.round((family.paidThisMonth / due) * 100)) : 0;
        const late = family.arrears > 0;
        return (
          <li key={family.id} className="relative overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-[0_1px_2px_rgba(16,24,40,.04),0_4px_14px_rgba(16,24,40,.05)]">
            <span className={`absolute inset-y-0 start-0 w-1 ${cat.barClass}`} aria-hidden />
            <a
              href={`#/families/${family.id}`}
              onClick={(e) => { e.preventDefault(); onOpenFullFile(family); }}
              className="flex items-center gap-3 p-3.5 ps-4 no-underline"
            >
              <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-bold ${cat.avatarBg}`} aria-hidden>
                {familyInitial(family.name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-bold leading-snug text-slate-900">{family.name}</span>
                <span className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                  <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span className="truncate">{family.region} · {family.socialStatus}</span>
                </span>
              </span>
              <ChevronLeft className="h-5 w-5 shrink-0 text-slate-400" aria-hidden />
            </a>

            <div className="flex items-center gap-3 border-t border-slate-100 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2 text-xs tabular-nums">
                  <span className={`font-bold ${late ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {late ? `متأخر ${formatIQD(family.arrears)}` : 'مسدّد هذا الشهر'}
                  </span>
                  <span className="font-semibold text-slate-500">{pct}%</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                  <span className={`block h-full rounded-full ${late ? 'bg-rose-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
              {late && (
                <button
                  type="button"
                  onClick={() => onPay(family)}
                  className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-blue-600 px-3 text-xs font-bold text-white shadow-sm transition active:scale-95"
                >
                  <HandCoins className="h-4 w-4" aria-hidden /> صرف
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

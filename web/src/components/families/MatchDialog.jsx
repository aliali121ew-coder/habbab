import { useEffect, useRef } from 'react';
import { Building2, Link2, MapPin, UserRoundSearch, X } from 'lucide-react';

/**
 * Asked before a new family is saved when another foundation already holds a family under the
 * same head's four-part name. Names often repeat, so nothing is linked without this answer.
 * Linked files share only their aid (type, amount, date, foundation); each keeps its own address,
 * members, notes and visits.
 */
const TEXT = {
  family: {
    who: 'رب الأسرة',
    same: 'نعم، نفس العائلة',
    different: 'لا، عائلة مختلفة — احفظ بدون ربط',
    shared: 'مساعدات الأخرى لهذه العائلة',
    own: 'العنوان والأفراد والملاحظات والزيارات',
  },
  patient: {
    who: 'المريض',
    same: 'نعم، نفس المريض',
    different: 'لا، مريض مختلف — احفظ بدون ربط',
    shared: 'مساعدات الأخرى لهذا المريض (نقد، دواء، كشفية)',
    own: 'العنوان والهاتف والحالة والطبيب والملاحظات',
  },
};

// Only the foundation's manager may link files; others see the match and save without linking.
export function MatchDialog({ headName, matches, onSame, onDifferent, onCancel, kind = 'family', canLink = true }) {
  const text = TEXT[kind];
  const ref = useRef(null);
  useEffect(() => { if (ref.current && !ref.current.open) ref.current.showModal(); }, []);

  return (
    <dialog
      ref={ref}
      onClose={onCancel}
      className="fam-match rounded-3xl border-0 bg-white p-0 text-slate-900 shadow-2xl"
      aria-labelledby="fam-match-title"
      dir="rtl"
    >
      <div className="flex items-start gap-3 border-b border-slate-100 p-5">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber-50 text-amber-600" aria-hidden><UserRoundSearch size={22} /></span>
        <div className="min-w-0 flex-1">
          <h2 id="fam-match-title" className="text-base font-extrabold">اسم مطابق عند مؤسسة أخرى</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            {text.who} <b className="text-slate-800">{headName}</b> مسجّل أيضاً عند:
          </p>
        </div>
        <button type="button" onClick={() => ref.current?.close()} className="grid h-9 w-9 place-items-center rounded-xl text-slate-400 hover:bg-slate-100" aria-label="إلغاء">
          <X size={18} aria-hidden />
        </button>
      </div>

      <ul className="grid gap-2 p-5">
        {matches.map((match) => (
          <li key={match.id} className="fam-match-row rounded-2xl border border-slate-200 p-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500" aria-hidden><Building2 size={17} /></span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold leading-snug">{match.foundation}</p>
              {match.region && <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500"><MapPin size={12} aria-hidden /> {match.region}</p>}
            </div>
            {canLink && (
              <button
                type="button"
                onClick={() => onSame(match)}
                className="fam-match-yes inline-flex h-10 items-center justify-center gap-1.5 rounded-xl px-4 text-xs font-bold text-white"
                style={{ backgroundColor: 'var(--bar-active)' }}
              >
                <Link2 size={14} aria-hidden /> {text.same}
              </button>
            )}
          </li>
        ))}
      </ul>

      <div className="mx-5 mb-4 rounded-2xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
        {!canLink && <><b>الربط بين المؤسستين يقوم به مدير المؤسسة.</b>{' '}</>}
        عند الربط تظهر لكل مؤسسة {text.shared}: <b>النوع والمبلغ والتاريخ واسم المؤسسة</b> فقط.
        {' '}{text.own} تبقى خاصة بكل مؤسسة.
      </div>

      <div className="fam-match-foot border-t border-slate-100 p-4">
        <button type="button" onClick={() => ref.current?.close()} className="fam-match-cancel h-10 rounded-xl px-4 text-sm font-semibold text-slate-500 hover:bg-slate-100">إلغاء</button>
        <button type="button" onClick={onDifferent} className="fam-match-no h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50">
          {canLink ? text.different : 'احفظ بدون ربط'}
        </button>
      </div>
    </dialog>
  );
}

import { CalendarCheck, ChevronLeft, History, MapPin, Users } from 'lucide-react';
import { CATEGORY_CONFIG } from '../../utils/format';

// Two initials from the head of the family ("زينب كاظم" → "زك"), as on the reference card.
const initials = (family) => {
  const words = (family.headName || family.name || '').replace(/^(عائلة|الأرملة|الحاج|أم|أبو)\s+/g, '').trim().split(/\s+/);
  return words.slice(0, 2).map((word) => word.charAt(0)).join('') || '؟';
};


// "2026-11-10" → "10/11": short enough to keep the line whole on a phone.
const dayMonth = (date) => `${Number(date.slice(8, 10))}/${Number(date.slice(5, 7))}`;

// How many aids this month, in words that read naturally.
const monthCount = (n) => {
  if (n === 0) return 'لا مساعدات هذا الشهر';
  if (n === 1) return 'مساعدة واحدة هذا الشهر';
  if (n === 2) return 'مساعدتان هذا الشهر';
  return `${n} ${n <= 10 ? 'مساعدات' : 'مساعدة'} هذا الشهر`;
};

/**
 * Phone list, one card per family, drawn like the reference: a band in the theme's colour at the
 * start with the initials and the family's priority; the name with a small arrow,
 * the only way into the file; area and members; the last aid and how many this month.
 */
export function FamilyMobileList({ families, loading, onOpenFullFile }) {
  if (loading) {
    return (
      <ul className="grid gap-3" aria-busy="true">
        {[0, 1, 2].map((k) => <li key={k} className="h-[220px] animate-pulse rounded-3xl border border-slate-200/70 bg-white" />)}
      </ul>
    );
  }

  return (
    <ul className="fam-ref-list" aria-label="قائمة العوائل">
      {families.map((family) => {
        const cat = CATEGORY_CONFIG[family.category] ?? CATEGORY_CONFIG.stable;
        const payments = family.payments ?? [];
        const last = payments.reduce((latest, payment) => (!latest || payment.date > latest.date ? payment : latest), null);
        const month = new Date().toISOString().slice(0, 7);
        const thisMonth = payments.filter((payment) => payment.date.startsWith(month)).length;
        return (
          <li key={family.id} className="fam-ref-card">
            <div className="fam-ref-band" aria-hidden>
              <span className="fam-ref-initials">{initials(family)}</span>
              <span className="fam-ref-tier">{cat.label}</span>
            </div>

            <div className="fam-ref-body">
              <div className="fam-ref-top">
                <h3 className="fam-ref-name">{family.name}</h3>
                <button type="button" className="fam-ref-go" aria-label={`فتح ملف ${family.name}`} onClick={() => onOpenFullFile(family)}>
                  <ChevronLeft aria-hidden />
                </button>
              </div>

              <dl className="fam-ref-facts">
                <div><MapPin aria-hidden /><dt className="sr-only">المنطقة</dt><dd>{family.region}</dd></div>
                <div><Users aria-hidden /><dt className="sr-only">الأفراد</dt><dd><bdi>{(family.members ?? []).length}</bdi> أفراد</dd></div>
                <div className="is-wide"><History aria-hidden /><dt className="sr-only">آخر مساعدة</dt><dd>{last ? <>آخر صرف: {last.type} · <bdi>{dayMonth(last.date)}</bdi></> : 'لم تُصرف مساعدة بعد'}</dd></div>
                <div className={`is-wide${thisMonth ? ' is-month' : ''}`}><CalendarCheck aria-hidden /><dt className="sr-only">مساعدات هذا الشهر</dt><dd>{monthCount(thisMonth)}</dd></div>
              </dl>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

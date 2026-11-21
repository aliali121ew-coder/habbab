import { ChevronLeft, MapPin, Users } from 'lucide-react';
import { CATEGORY_CONFIG } from '../../utils/format';

// Two initials from the head of the family ("زينب كاظم" → "زك"), as on the reference card.
const initials = (family) => {
  const words = (family.headName || family.name || '').replace(/^(عائلة|الأرملة|الحاج|أم|أبو)\s+/g, '').trim().split(/\s+/);
  return words.slice(0, 2).map((word) => word.charAt(0)).join('') || '؟';
};


// "2026-11-10" → "10/11/2026": the full date, on its own line under the aid type.
const dayMonth = (date) => `${Number(date.slice(8, 10))}/${Number(date.slice(5, 7))}/${date.slice(0, 4)}`;


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

              <div className="fam-ref-meta">
                <span><MapPin aria-hidden />{family.region}</span>
                <span><Users aria-hidden /><bdi>{(family.members ?? []).length}</bdi> أفراد</span>
              </div>

              <dl className="fam-ref-stats">
                <div>
                  <dt>آخر صرف</dt>
                  <dd>{last ? <><strong>{last.type}</strong><small><bdi>{dayMonth(last.date)}</bdi></small></> : <strong className="is-none">لا يوجد</strong>}</dd>
                </div>
                <div className={thisMonth ? 'is-month' : undefined}>
                  <dt>هذا الشهر</dt>
                  <dd><strong><bdi>{thisMonth}</bdi></strong><small>{thisMonth === 1 ? 'مساعدة' : thisMonth === 2 ? 'مساعدتان' : 'مساعدات'}</small></dd>
                </div>
              </dl>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

import { Eye, MapPin, Users } from 'lucide-react';
import { CATEGORY_CONFIG } from '../../utils/format';

// Two initials from the head of the family ("زينب كاظم" → "زك"), as on the reference card.
const initials = (family) => {
  const words = (family.headName || family.name || '').replace(/^(عائلة|الأرملة|الحاج|أم|أبو)\s+/g, '').trim().split(/\s+/);
  return words.slice(0, 2).map((word) => word.charAt(0)).join('') || '؟';
};


/**
 * Phone list, one card per family, drawn like the reference: a band in the theme's colour at the
 * start with the initials and the family's priority; the name; area and members on one line; and
 * a button to open the file. The rest is in the file.
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
        const open = () => onOpenFullFile(family);
        return (
          <li key={family.id} className="fam-ref-card">
            <div className="fam-ref-band" aria-hidden>
              <span className="fam-ref-initials">{initials(family)}</span>
              <span className="fam-ref-tier">{cat.label}</span>
            </div>

            <div className="fam-ref-body">
              <a href={`#/families/${family.id}`} onClick={(event) => { event.preventDefault(); open(); }} className="fam-ref-name">
                {family.name}
              </a>

              <dl className="fam-ref-facts">
                <div><MapPin aria-hidden /><dt className="sr-only">المنطقة</dt><dd>{family.region}</dd></div>
                <div><Users aria-hidden /><dt className="sr-only">الأفراد</dt><dd><bdi>{(family.members ?? []).length}</bdi> أفراد</dd></div>
              </dl>

              <div className="fam-ref-actions">
                <button type="button" className="fam-ref-btn is-view" aria-label={`فتح ملف ${family.name}`} onClick={open}><Eye aria-hidden /></button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

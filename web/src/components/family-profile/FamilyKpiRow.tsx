import type { CSSProperties } from 'react';
import { ClipboardCheck, HeartPulse, Users, Wallet } from 'lucide-react';
import { formatIQDParts } from '../../mock/family';
import type { FamilyDetail } from '../../types/family';

export type FamilyProfileTab = 'members' | 'aids' | 'visits' | 'housing';
export type MembersQuickFilter = 'all' | 'medical' | 'orphans';

interface Props {
  family: FamilyDetail;
  activeTab: FamilyProfileTab;
  memberFilter: MembersQuickFilter;
  onSelect: (tab: FamilyProfileTab, filter?: MembersQuickFilter) => void;
}

export function FamilyKpiRow({ family, activeTab, memberFilter, onSelect }: Props) {
  const orphansCount = family.members.filter((m) => Boolean(m.orphanLabel)).length;
  const chronicCount = family.members.filter((m) => Boolean(m.chronic)).length;
  const totalAid = family.payments.reduce((sum, p) => sum + p.amount, 0);
  const totalAidParts = formatIQDParts(totalAid);
  const lastVisit = family.visits
    .map((v) => v.date)
    .filter(Boolean)
    .sort()
    .pop();

  const cards = [
    {
      id: 'members',
      tab: 'members' as FamilyProfileTab,
      filter: 'all' as MembersQuickFilter,
      isActive: activeTab === 'members' && memberFilter === 'all',
      label: 'إجمالي أفراد العائلة',
      mobileLabel: 'أفراد العائلة',
      value: `${family.members.length}`,
      valueColor: 'var(--fp-ink)',
      sub: orphansCount > 0 ? `بينهم ${orphansCount} أيتام مكفولين` : 'جميع الأفراد مسجلون',
      mobileSub: orphansCount > 0 ? `${orphansCount} أيتام مكفولين` : 'مسجلون',
      subColor: 'var(--fp-primary)',
      accent: '#4f46e5',
      soft: 'var(--fp-primary-soft)',
      Icon: Users,
    },
    {
      id: 'medical',
      tab: 'members' as FamilyProfileTab,
      filter: 'medical' as MembersQuickFilter,
      isActive: activeTab === 'members' && memberFilter === 'medical',
      label: 'الحالات الصحية الحرجة',
      mobileLabel: 'الحالات المرضية',
      value: chronicCount > 0 ? `${chronicCount} ${chronicCount === 1 ? 'حالة' : 'حالات'}` : 'سليمة',
      valueColor: chronicCount > 0 ? 'var(--fp-rose)' : 'var(--fp-emerald)',
      sub: chronicCount > 0 ? 'اضغط لعرض المرضى' : 'لا توجد حالات مزمنة',
      mobileSub: chronicCount > 0 ? 'عرض المرضى' : 'لا حالات مزمنة',
      subColor: 'var(--fp-ink-3)',
      accent: '#e11d48',
      soft: 'var(--fp-rose-soft)',
      Icon: HeartPulse,
    },
    {
      id: 'aids',
      tab: 'aids' as FamilyProfileTab,
      isActive: activeTab === 'aids',
      label: 'إجمالي المساعدات',
      mobileLabel: 'إجمالي المساعدات',
      value: `${totalAidParts.value} ${totalAidParts.currency}`,
      valueColor: 'var(--fp-emerald)',
      sub: `خلال ${family.payments.length} ${family.payments.length === 1 ? 'دفعة مسجلة' : 'دفعات مسجلة'}`,
      mobileSub: `${family.payments.length} ${family.payments.length === 1 ? 'دفعة' : 'دفعات'}`,
      subColor: 'var(--fp-ink-3)',
      accent: '#059669',
      soft: 'var(--fp-emerald-soft)',
      Icon: Wallet,
    },
    {
      id: 'visits',
      tab: 'visits' as FamilyProfileTab,
      isActive: activeTab === 'visits',
      label: 'الزيارات الميدانية',
      mobileLabel: 'الزيارات الميدانية',
      value: `${family.visits.length} ${family.visits.length === 1 ? 'زيارة' : 'زيارات'}`,
      valueColor: 'var(--fp-amber)',
      sub: lastVisit ? `آخر زيارة: ${lastVisit}` : 'لم تُسجّل زيارات بعد',
      mobileSub: lastVisit ? lastVisit : 'لا توجد زيارات',
      subColor: 'var(--fp-ink-3)',
      accent: '#d97706',
      soft: 'var(--fp-amber-soft)',
      Icon: ClipboardCheck,
    },
  ];

  return (
    <section aria-label="ملخص مؤشرات العائلة" className="hidden md:block">
      {/* Desktop & Tablet: 4 Interactive Lifting KPI Cards */}
      <div className="grid gap-3.5 md:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <button
            key={card.id}
            type="button"
            data-active={card.isActive ? 'true' : 'false'}
            onClick={() => onSelect(card.tab, card.filter)}
            className="fp-card fp-kpi-card flex items-center justify-between gap-3 p-4 text-start"
            style={
              {
                '--kpi-accent': card.accent,
                '--kpi-soft': card.soft,
              } as CSSProperties
            }
          >
            <div className="min-w-0">
              <span className="fp-kpi-card-label block text-xs font-bold">
                {card.label}
              </span>
              <strong
                className="mt-1.5 block text-xl font-extrabold tabular-nums tracking-tight"
                style={{ color: card.valueColor }}
              >
                {card.value}
              </strong>
              <span
                className="mt-1 block text-[11px] font-semibold"
                style={{ color: card.subColor }}
              >
                {card.sub}
              </span>
            </div>

            <span className="fp-kpi-card-icon inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl">
              <card.Icon className="h-5 w-5" aria-hidden />
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

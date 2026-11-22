import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Calendar as CalendarIcon,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  GraduationCap,
  HandHeart,
  HeartPulse,
  Home,
  Paperclip,
  Plus,
  Search,
  UserPlus,
  Users,
} from 'lucide-react';
import { formatIQDParts } from '../../mock/family';
import type { FamilyDetail, FamilyMember, FamilyPaymentRecord, FamilyVisitRecord } from '../../types/family';
import { FamilyAidsArchiveModal } from './FamilyAidsArchiveModal';
import type { FamilyProfileTab, MembersQuickFilter } from './FamilyKpiRow';

interface Props {
  family: FamilyDetail;
  activeTab: FamilyProfileTab;
  onTabChange: (tab: FamilyProfileTab) => void;
  memberFilter: MembersQuickFilter;
  onMemberFilterChange: (filter: MembersQuickFilter) => void;
  onOpenMember: (member: FamilyMember) => void;
  onAddMember: () => void;
  onOpenPayment: () => void;
  onOpenVisit: () => void;
}

const PAYMENT_STATUS_META: Record<FamilyPaymentRecord['status'], { label: string; bg: string; color: string }> = {
  paid: { label: 'مكتمل', bg: 'var(--fp-emerald-soft)', color: 'var(--fp-emerald)' },
  pending: { label: 'قيد التسليم', bg: 'var(--fp-amber-soft)', color: 'var(--fp-amber)' },
  overdue: { label: 'متأخر', bg: 'var(--fp-rose-soft)', color: 'var(--fp-rose)' },
};

const VISIT_RATING_META: Record<FamilyVisitRecord['rating'], { label: string; bg: string; color: string }> = {
  حرجة: { label: 'التقييم: حرجة - تتطلب أولوية قصوى', bg: 'var(--fp-rose-soft)', color: 'var(--fp-rose)' },
  'تحتاج متابعة': { label: 'التقييم: تحتاج متابعة', bg: 'var(--fp-amber-soft)', color: 'var(--fp-amber)' },
  مستقرة: { label: 'التقييم: مستقرة', bg: 'var(--fp-emerald-soft)', color: 'var(--fp-emerald)' },
};

export function FamilyDetailTabs({
  family,
  activeTab,
  onTabChange,
  memberFilter,
  onMemberFilterChange,
  onOpenMember,
  onAddMember,
  onOpenPayment,
  onOpenVisit,
}: Props) {
  const [memberQuery, setMemberQuery] = useState('');
  const [aidsArchiveOpen, setAidsArchiveOpen] = useState(false);

  const medicalCount = useMemo(
    () => family.members.filter((m) => Boolean(m.chronic)).length,
    [family.members],
  );
  const orphansCount = useMemo(
    () => family.members.filter((m) => Boolean(m.orphanLabel)).length,
    [family.members],
  );

  const filteredMembers = useMemo(() => {
    const q = memberQuery.trim().toLowerCase();
    return family.members.filter((m) => {
      if (memberFilter === 'medical' && !m.chronic) return false;
      if (memberFilter === 'orphans' && !m.orphanLabel) return false;
      if (!q) return true;
      return `${m.name} ${m.relation} ${m.status} ${m.chronic ?? ''}`.toLowerCase().includes(q);
    });
  }, [family.members, memberFilter, memberQuery]);

  const rentParts = formatIQDParts(family.rentAmount);

  const docs = useMemo(() => {
    const list: Array<{ title: string; badge: string }> = [
      { title: 'البطاقات الوطنية الموحدة لجميع أفراد العائلة', badge: 'مكتملة' },
    ];
    if (family.housing.includes('إيجار') || family.rentAmount > 0) {
      list.unshift({ title: `عقد إيجار السكن (${new Date().getFullYear()})`, badge: 'ساري المفعول' });
    } else {
      list.unshift({ title: `وثيقة إثبات السكن (${family.housing})`, badge: 'موثق ومطابق' });
    }
    if (family.socialStatus.includes('أرملة') || family.socialStatus.includes('أيتام')) {
      list.unshift({ title: 'شهادة وفاة المعيل وإثبات الحالة الاجتماعية', badge: 'موثق ومطابق' });
    }
    if (medicalCount > 0) {
      list.push({ title: 'التقارير الطبية المعتمدة للحالات المرضية', badge: 'محدثة' });
    }
    return list;
  }, [family.housing, family.rentAmount, family.socialStatus, medicalCount]);

  const tabs: Array<{ id: FamilyProfileTab; label: string; mobileLabel: string; count?: number; Icon: typeof Users }> = [
    { id: 'members', label: 'أفراد العائلة', mobileLabel: 'الأفراد', count: family.members.length, Icon: Users },
    { id: 'aids', label: 'سجل المساعدات', mobileLabel: 'المساعدات', count: family.payments.length, Icon: HandHeart },
    { id: 'visits', label: 'الزيارات الميدانية', mobileLabel: 'الزيارات', count: family.visits.length, Icon: ClipboardCheck },
    { id: 'housing', label: 'السكن والمستمسكات', mobileLabel: 'السكن والوثائق', Icon: FileText },
  ];

  return (
    <section className="fp-card overflow-hidden">
      {/* Tabs Header + Contextual CTA */}
      <div
        className="border-b px-4 py-3.5 sm:px-6 md:flex md:flex-wrap md:items-center md:justify-between md:gap-3 md:pb-0 md:pt-3"
        style={{ borderColor: 'var(--fp-border)' }}
      >
        {/* Mobile 2x2 Compact Sliding Tab Cards (half-height single row + spring glide) */}
        <div
          className="grid grid-cols-2 gap-2 rounded-2xl p-1.5 md:hidden"
          style={{
            backgroundColor: 'var(--fp-muted)',
            border: '1px solid var(--fp-border)',
          }}
          role="tablist"
          aria-label="أقسام ملف العائلة"
        >
          {tabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onTabChange(tab.id)}
                className="relative flex h-11 items-center justify-between gap-1 rounded-xl px-2 text-start outline-none transition-colors active:scale-[0.98]"
              >
                {active && (
                  <motion.span
                    layoutId="family-mobile-tab-slide"
                    transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                    className="pointer-events-none absolute inset-0 rounded-xl border"
                    style={{
                      backgroundColor: 'color-mix(in srgb, var(--bar-active) 12%, var(--fp-card))',
                      borderColor: 'color-mix(in srgb, var(--bar-active) 55%, transparent)',
                      boxShadow: '0 4px 12px -4px color-mix(in srgb, var(--bar-active) 32%, transparent)',
                    }}
                    aria-hidden
                  />
                )}

                <span className="relative z-10 flex items-center gap-1.5">
                  <span
                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg transition-colors"
                    style={
                      active
                        ? { backgroundColor: 'var(--bar-active)', color: '#ffffff' }
                        : { backgroundColor: 'var(--fp-card)', color: 'var(--fp-ink-2)' }
                    }
                  >
                    <tab.Icon className="h-3.5 w-3.5" aria-hidden />
                  </span>
                  <span
                    className="whitespace-nowrap text-[11.5px] font-extrabold transition-colors"
                    style={{ color: active ? 'var(--bar-active)' : 'var(--fp-ink)' }}
                  >
                    {tab.mobileLabel}
                  </span>
                </span>

                {typeof tab.count === 'number' && (
                  <span
                    className="relative z-10 inline-flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full px-1.5 text-[10.5px] font-extrabold tabular-nums transition-colors"
                    style={
                      active
                        ? { backgroundColor: 'var(--bar-active)', color: '#ffffff' }
                        : { backgroundColor: 'var(--fp-card)', color: 'var(--fp-ink-3)' }
                    }
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Desktop Horizontal Tabs */}
        <div className="hidden flex-wrap items-center gap-2 md:flex" role="tablist" aria-label="أقسام ملف العائلة">
          {tabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onTabChange(tab.id)}
                className="relative inline-flex items-center gap-2 px-3 pb-3 pt-1.5 text-[13px] font-bold transition"
                style={{
                  color: active ? 'var(--fp-primary)' : 'var(--fp-ink-3)',
                  borderBottom: active ? '2px solid var(--fp-primary)' : '2px solid transparent',
                }}
              >
                <tab.Icon className="h-4 w-4" aria-hidden />
                <span>{tab.label}</span>
                {typeof tab.count === 'number' && (
                  <span
                    className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-extrabold tabular-nums"
                    style={{
                      backgroundColor: active ? 'var(--fp-primary-soft)' : 'var(--fp-muted)',
                      color: active ? 'var(--fp-primary)' : 'var(--fp-ink-3)',
                    }}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="hidden md:block md:pb-2.5">
          {activeTab === 'members' && (
            <button
              type="button"
              onClick={onAddMember}
              className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl px-3.5 text-xs font-bold text-white shadow-xs transition hover:opacity-95 md:w-auto"
              style={{ backgroundImage: 'linear-gradient(135deg, var(--bar-active), var(--brand))' }}
            >
              <UserPlus className="h-3.5 w-3.5" aria-hidden />
              <span>إضافة فرد</span>
            </button>
          )}
          {activeTab === 'aids' && (
            <button
              type="button"
              onClick={onOpenPayment}
              className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-700 md:w-auto"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              <span>صرف مساعدة</span>
            </button>
          )}
          {activeTab === 'visits' && (
            <button
              type="button"
              onClick={onOpenVisit}
              className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-amber-600 px-3.5 text-xs font-bold text-white shadow-xs transition hover:bg-amber-700 md:w-auto"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              <span>تسجيل زيارة</span>
            </button>
          )}
        </div>
      </div>

      {/* Tab Body */}
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="p-4 sm:p-6"
      >
        {/* TAB 1: FAMILY MEMBERS */}
        {activeTab === 'members' && (
          <div className="space-y-4">
            {/* Search & Quick Filter Pills */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div
                className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border px-3 py-2 sm:max-w-md"
                style={{
                  backgroundColor: 'var(--fp-muted)',
                  borderColor: 'var(--fp-border)',
                }}
              >
                <Search className="h-4 w-4 shrink-0" style={{ color: 'var(--fp-ink-3)' }} aria-hidden />
                <input
                  type="search"
                  value={memberQuery}
                  onChange={(e) => setMemberQuery(e.target.value)}
                  placeholder="ابحث بالاسم، صلة القرابة، أو الحالة الصحية..."
                  className="w-full bg-transparent text-xs focus:outline-none sm:text-[13px]"
                  style={{ color: 'var(--fp-ink)' }}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onMemberFilterChange('all')}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-bold transition"
                  style={
                    memberFilter === 'all'
                      ? { backgroundColor: 'var(--fp-ink)', borderColor: 'var(--fp-ink)', color: 'var(--fp-card)' }
                      : { backgroundColor: 'var(--fp-card)', borderColor: 'var(--fp-border)', color: 'var(--fp-ink-2)' }
                  }
                >
                  <span>الكل ({family.members.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => onMemberFilterChange('medical')}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-bold transition"
                  style={
                    memberFilter === 'medical'
                      ? { backgroundColor: 'var(--fp-rose)', borderColor: 'var(--fp-rose)', color: '#fff' }
                      : {
                          backgroundColor: 'var(--fp-rose-soft)',
                          borderColor: 'color-mix(in srgb, var(--fp-rose) 30%, transparent)',
                          color: 'var(--fp-rose)',
                        }
                  }
                >
                  <HeartPulse className="h-3.5 w-3.5" aria-hidden />
                  <span>حالات مرضية ({medicalCount})</span>
                </button>

                <button
                  type="button"
                  onClick={() => onMemberFilterChange('orphans')}
                  className="inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-bold transition"
                  style={
                    memberFilter === 'orphans'
                      ? { backgroundColor: 'var(--fp-amber)', borderColor: 'var(--fp-amber)', color: '#fff' }
                      : {
                          backgroundColor: 'var(--fp-amber-soft)',
                          borderColor: 'color-mix(in srgb, var(--fp-amber) 30%, transparent)',
                          color: 'var(--fp-amber)',
                        }
                  }
                >
                  <span>الأيتام ({orphansCount})</span>
                </button>
              </div>
            </div>

            {/* Desktop Table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse text-start text-sm">
                <thead>
                  <tr
                    className="border-b text-xs font-semibold"
                    style={{ borderColor: 'var(--fp-border)', color: 'var(--fp-ink-3)' }}
                  >
                    <th className="py-3 pe-4 text-start">الاسم الكامل</th>
                    <th className="px-3 py-3 text-start">صلة القرابة</th>
                    <th className="px-3 py-3 text-start">العمر</th>
                    <th className="px-3 py-3 text-start">الدراسة / العمل</th>
                    <th className="px-3 py-3 text-start">الحالة الصحية</th>
                    <th className="py-3 ps-3 text-end">ملف الفرد</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMembers.map((member) => (
                    <tr
                      key={member.id}
                      className="border-b transition last:border-b-0 hover:bg-black/[0.02] dark:hover:bg-white/[0.03]"
                      style={{ borderColor: 'var(--fp-border)' }}
                    >
                      <td className="py-3.5 pe-4">
                        <div className="flex items-center gap-3">
                          <span
                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                            style={{
                              backgroundColor: member.chronic ? 'var(--fp-rose-soft)' : 'var(--fp-muted)',
                              color: member.chronic ? 'var(--fp-rose)' : 'var(--fp-ink-2)',
                            }}
                          >
                            {member.initials}
                          </span>
                          <div className="min-w-0">
                            <span className="block font-bold" style={{ color: 'var(--fp-ink)' }}>
                              {member.name}
                            </span>
                            {member.phone && (
                              <span className="block font-mono text-[11px]" style={{ color: 'var(--fp-ink-3)' }} dir="ltr">
                                {member.phone}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="px-3 py-3.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs font-semibold" style={{ color: 'var(--fp-ink-2)' }}>
                            {member.relation}
                          </span>
                          {member.orphanLabel && (
                            <span
                              className="rounded-full px-2 py-0.5 text-[11px] font-bold"
                              style={{ backgroundColor: 'var(--fp-amber-soft)', color: 'var(--fp-amber)' }}
                            >
                              {member.orphanLabel}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-3 py-3.5 text-xs font-semibold tabular-nums" style={{ color: 'var(--fp-ink-2)' }}>
                        {member.age} سنة
                      </td>

                      <td className="px-3 py-3.5">
                        <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: 'var(--fp-ink-2)' }}>
                          <GraduationCap className="h-3.5 w-3.5 opacity-60" aria-hidden />
                          {member.status}
                        </span>
                      </td>

                      <td className="px-3 py-3.5">
                        {member.chronic ? (
                          <span
                            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold"
                            style={{ backgroundColor: 'var(--fp-rose-soft)', color: 'var(--fp-rose)' }}
                          >
                            <HeartPulse className="h-3.5 w-3.5" aria-hidden />
                            {member.chronic}
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold"
                            style={{ backgroundColor: 'var(--fp-emerald-soft)', color: 'var(--fp-emerald)' }}
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
                            سليم
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 ps-3 text-end">
                        <button
                          type="button"
                          onClick={() => onOpenMember(member)}
                          className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition hover:opacity-85"
                          style={{
                            backgroundColor: 'var(--fp-primary-soft)',
                            color: 'var(--fp-primary)',
                          }}
                        >
                          <span>عرض الملف</span>
                          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredMembers.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-xs" style={{ color: 'var(--fp-ink-3)' }}>
                        لا يوجد أفراد مطابقون لمعايير البحث الحالية.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="space-y-3 md:hidden">
              {filteredMembers.map((member) => (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => onOpenMember(member)}
                  className="flex w-full items-center justify-between gap-3 rounded-2xl border p-3.5 text-start transition"
                  style={{ backgroundColor: 'var(--fp-muted)', borderColor: 'var(--fp-border)' }}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                      style={{
                        backgroundColor: member.chronic ? 'var(--fp-rose-soft)' : 'var(--fp-card)',
                        color: member.chronic ? 'var(--fp-rose)' : 'var(--fp-ink-2)',
                      }}
                    >
                      {member.initials}
                    </span>
                    <div className="min-w-0">
                      <span className="block truncate text-sm font-bold" style={{ color: 'var(--fp-ink)' }}>
                        {member.name}
                      </span>
                      <span className="mt-0.5 block truncate text-xs" style={{ color: 'var(--fp-ink-3)' }}>
                        {member.relation} • {member.age} سنة • {member.status}
                      </span>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {member.chronic ? (
                          <span
                            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold"
                            style={{ backgroundColor: 'var(--fp-rose-soft)', color: 'var(--fp-rose)' }}
                          >
                            {member.chronic}
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold"
                            style={{ backgroundColor: 'var(--fp-emerald-soft)', color: 'var(--fp-emerald)' }}
                          >
                            سليم
                          </span>
                        )}
                        {member.orphanLabel && (
                          <span
                            className="rounded-full px-2 py-0.5 text-[11px] font-bold"
                            style={{ backgroundColor: 'var(--fp-amber-soft)', color: 'var(--fp-amber)' }}
                          >
                            {member.orphanLabel}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <ArrowLeft className="h-4 w-4 shrink-0" style={{ color: 'var(--fp-primary)' }} aria-hidden />
                </button>
              ))}
              {filteredMembers.length === 0 && (
                <p className="py-6 text-center text-xs" style={{ color: 'var(--fp-ink-3)' }}>
                  لا يوجد أفراد مطابقون للبحث.
                </p>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: AID HISTORY (Compact half-height cards, latest 5 + "عرض المزيد" Calendar Archive) */}
        {activeTab === 'aids' && (
          <div className="space-y-3">
            {family.payments.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-sm font-semibold" style={{ color: 'var(--fp-ink-3)' }}>
                  لا توجد مساعدات مسجلة لهذه العائلة بعد.
                </p>
                <button
                  type="button"
                  onClick={onOpenPayment}
                  className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-xs font-bold text-white"
                >
                  <Plus className="h-4 w-4" aria-hidden /> صرف أول مساعدة
                </button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                  {family.payments.slice(0, 5).map((payment) => {
                    const status = PAYMENT_STATUS_META[payment.status] ?? PAYMENT_STATUS_META.paid;
                    const amountParts = formatIQDParts(payment.amount);
                    return (
                      <article
                        key={payment.id}
                        className="flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 transition hover:shadow-xs"
                        style={{
                          backgroundColor: 'color-mix(in srgb, var(--fp-card) 74%, var(--fp-muted))',
                          borderColor: 'var(--fp-border)',
                        }}
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span
                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                            style={{ backgroundColor: status.bg, color: status.color }}
                          >
                            <HandHeart className="h-4 w-4" aria-hidden />
                          </span>
                          <div className="min-w-0">
                            <strong className="block truncate text-xs font-extrabold sm:text-[13px]" style={{ color: 'var(--fp-ink)' }}>
                              {payment.title || payment.typeLabel}
                            </strong>
                            <span className="mt-0.5 block truncate text-[11px]" style={{ color: 'var(--fp-ink-3)' }}>
                              <bdi dir="ltr">{payment.date}</bdi> • {payment.officer}
                            </span>
                          </div>
                        </div>

                        <div className="shrink-0 text-end tabular-nums">
                          <strong className="block whitespace-nowrap text-xs font-extrabold sm:text-[13px]" style={{ color: 'var(--fp-emerald)' }}>
                            {amountParts.value} {amountParts.currency}
                          </strong>
                          <span
                            className="mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold"
                            style={{ backgroundColor: status.bg, color: status.color }}
                          >
                            {status.label}
                          </span>
                        </div>
                      </article>
                    );
                  })}
                </div>

                {/* Show More button -> opens Calendar + Full Cards view */}
                <button
                  type="button"
                  onClick={() => setAidsArchiveOpen(true)}
                  className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border text-xs font-extrabold transition hover:opacity-90"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--bar-active) 10%, var(--fp-card))',
                    borderColor: 'color-mix(in srgb, var(--bar-active) 30%, transparent)',
                    color: 'var(--bar-active)',
                  }}
                >
                  <CalendarIcon className="h-4 w-4" aria-hidden />
                  <span>
                    {family.payments.length > 5
                      ? `عرض المزيد (${family.payments.length - 5}+) والتقويم`
                      : 'عرض التقويم والسجل الكامل'}
                  </span>
                </button>
              </>
            )}
          </div>
        )}

        {/* TAB 3: FIELD VISITS TIMELINE */}
        {activeTab === 'visits' && (
          <div>
            {family.visits.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-sm font-semibold" style={{ color: 'var(--fp-ink-3)' }}>
                  لم تُسجّل أي زيارات ميدانية لهذه العائلة بعد.
                </p>
                <button
                  type="button"
                  onClick={onOpenVisit}
                  className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-xl bg-amber-600 px-4 text-xs font-bold text-white"
                >
                  <Plus className="h-4 w-4" aria-hidden /> تسجيل أول زيارة
                </button>
              </div>
            ) : (
              <ol
                className="relative space-y-5 border-s-2 ps-6"
                style={{ borderColor: 'var(--fp-border)' }}
              >
                {family.visits.map((visit) => {
                  const rating = VISIT_RATING_META[visit.rating] ?? VISIT_RATING_META['تحتاج متابعة'];
                  return (
                    <li key={visit.id} className="relative">
                      <span
                        className="absolute -start-[31px] top-4 h-3.5 w-3.5 rounded-full ring-4"
                        style={{
                          backgroundColor: 'var(--fp-primary)',
                          boxShadow: '0 0 0 4px var(--fp-card)',
                        }}
                        aria-hidden
                      />

                      <article
                        className="space-y-3 rounded-2xl border p-4 sm:p-5"
                        style={{ backgroundColor: 'var(--fp-card)', borderColor: 'var(--fp-border)' }}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2.5">
                            <span
                              className="rounded-lg px-2.5 py-1 font-mono text-xs font-bold tabular-nums"
                              style={{ backgroundColor: 'var(--fp-primary-soft)', color: 'var(--fp-primary)' }}
                              dir="ltr"
                            >
                              {visit.date}
                            </span>
                            <h3 className="text-sm font-extrabold" style={{ color: 'var(--fp-ink)' }}>
                              متابعة ميدانية وتقييم وضع العائلة
                            </h3>
                          </div>

                          <span
                            className="rounded-full px-3 py-1 text-[11px] font-bold"
                            style={{ backgroundColor: rating.bg, color: rating.color }}
                          >
                            {rating.label}
                          </span>
                        </div>

                        <p className="text-xs leading-relaxed sm:text-[13px]" style={{ color: 'var(--fp-ink-2)' }}>
                          {visit.summary}
                        </p>

                        <div
                          className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs"
                          style={{ borderColor: 'var(--fp-border)' }}
                        >
                          <span style={{ color: 'var(--fp-ink-3)' }}>
                            القائم بالزيارة: <b style={{ color: 'var(--fp-ink)' }}>{visit.officerName}</b>
                          </span>

                          {visit.photosCount ? (
                            <span
                              className="inline-flex items-center gap-1 font-bold"
                              style={{ color: 'var(--fp-primary)' }}
                            >
                              <Paperclip className="h-3.5 w-3.5" aria-hidden />
                              مرفقات ({visit.photosCount})
                            </span>
                          ) : null}
                        </div>
                      </article>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        )}

        {/* TAB 4: HOUSING & OFFICIAL DOCUMENTS */}
        {activeTab === 'housing' && (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {/* Right Card: Housing & Living Details */}
            <div
              className="rounded-2xl border p-5"
              style={{ backgroundColor: 'var(--fp-muted)', borderColor: 'var(--fp-border)' }}
            >
              <h3 className="mb-4 flex items-center gap-2 text-sm font-extrabold" style={{ color: 'var(--fp-ink)' }}>
                <Home className="h-4 w-4" style={{ color: 'var(--fp-primary)' }} aria-hidden />
                تفاصيل السكن والمعيشة
              </h3>

              <dl className="divide-y text-xs sm:text-[13px]" style={{ borderColor: 'var(--fp-border)' }}>
                <div className="flex items-center justify-between gap-4 py-3">
                  <dt style={{ color: 'var(--fp-ink-3)' }}>نوع السكن:</dt>
                  <dd className="font-bold" style={{ color: 'var(--fp-ink)' }}>{family.housing}</dd>
                </div>

                <div className="flex items-center justify-between gap-4 py-3">
                  <dt style={{ color: 'var(--fp-ink-3)' }}>البدل الشهري:</dt>
                  <dd className="font-extrabold tabular-nums" style={{ color: 'var(--fp-amber)' }}>
                    {family.rentAmount > 0 ? `${rentParts.value} ${rentParts.currency}` : 'لا يوجد إيجار'}
                  </dd>
                </div>

                <div className="flex items-center justify-between gap-4 py-3">
                  <dt style={{ color: 'var(--fp-ink-3)' }}>مصدر الدخل الثابت:</dt>
                  <dd className="text-end font-bold" style={{ color: 'var(--fp-ink)' }}>
                    {family.incomeNote || 'لا يوجد دخل ثابت'}
                  </dd>
                </div>

                <div className="flex items-center justify-between gap-4 py-3">
                  <dt style={{ color: 'var(--fp-ink-3)' }}>العنوان والمنطقة:</dt>
                  <dd className="text-end font-bold" style={{ color: 'var(--fp-ink)' }}>{family.address}</dd>
                </div>

                {family.patients.length > 0 && (
                  <div className="flex items-center justify-between gap-4 py-3">
                    <dt style={{ color: 'var(--fp-ink-3)' }}>الأطباء المتابعون:</dt>
                    <dd className="text-end font-bold" style={{ color: 'var(--fp-rose)' }}>
                      {family.patients.map((p) => `${p.doctor} (${p.diagnosis})`).join(' • ')}
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Left Card: Official Documents */}
            <div
              className="rounded-2xl border p-5"
              style={{ backgroundColor: 'var(--fp-muted)', borderColor: 'var(--fp-border)' }}
            >
              <h3 className="mb-4 flex items-center gap-2 text-sm font-extrabold" style={{ color: 'var(--fp-ink)' }}>
                <FileText className="h-4 w-4" style={{ color: 'var(--fp-primary)' }} aria-hidden />
                المستمسكات والوثائق الرسمية المرفقة
              </h3>

              <ul className="space-y-2.5">
                {docs.map((doc) => (
                  <li
                    key={doc.title}
                    className="flex items-center justify-between gap-3 rounded-xl border px-3.5 py-3"
                    style={{ backgroundColor: 'var(--fp-card)', borderColor: 'var(--fp-border)' }}
                  >
                    <span className="text-xs font-bold sm:text-[13px]" style={{ color: 'var(--fp-ink)' }}>
                      {doc.title}
                    </span>
                    <span
                      className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold"
                      style={{ backgroundColor: 'var(--fp-emerald-soft)', color: 'var(--fp-emerald)' }}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                      {doc.badge}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </motion.div>

      {aidsArchiveOpen && (
        <FamilyAidsArchiveModal
          familyName={family.name}
          payments={family.payments}
          visits={family.visits}
          onClose={() => setAidsArchiveOpen(false)}
        />
      )}
    </section>
  );
}

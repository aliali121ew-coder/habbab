import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Calendar, ClipboardCheck, HandCoins, HeartPulse, Home, MapPin,
  MessageCircle, Printer, Stethoscope, Wallet, X,
} from 'lucide-react';
import {
  CATEGORY_CONFIG,
  familyInitial,
  formatIQD,
  whatsappUrl,
} from '../../utils/format';
import { CategoryBadge } from './CategoryBadge';
import { DelegateChip } from './DelegateChip';
import { EmptyState } from './EmptyState';
import { EntitlementDonut } from './EntitlementDonut';
import { MembersList } from './MembersList';
import { PaymentsTimeline } from './PaymentsTimeline';

const TABS = [
  { id: 'overview', label: 'نظرة عامة' },
  { id: 'members', label: 'الأفراد' },
  { id: 'patients', label: 'المرضى' },
  { id: 'payments', label: 'سجل الصرف' },
  { id: 'visits', label: 'الزيارات' },
];

export function FamilyProfilePanel({
  family,
  onOpenFullFile,
  onPay,
  onRecordVisit,
  onPrint,
  onCloseMobile,
  loading = false,
}) {
  const [activeTab, setActiveTab] = useState('overview');
  const [expandedNotes, setExpandedNotes] = useState(false);

  if (loading) {
    return (
      <div className="h-[620px] animate-pulse rounded-2xl border border-slate-200/70 bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,.04),0_4px_16px_rgba(16,24,40,.04)]" />
    );
  }

  if (!family) {
    return <EmptyState variant="no-selection" />;
  }

  const cat = CATEGORY_CONFIG[family.category] ?? CATEGORY_CONFIG.stable;
  const notesTooLong = (family.notes?.length ?? 0) > 110;
  const visibleNotes = expandedNotes || !notesTooLong
    ? family.notes
    : `${family.notes.slice(0, 110)}…`;

  return (
    <aside
      aria-label={`ملف ${family.name}`}
      className="flex flex-col overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-[0_1px_2px_rgba(16,24,40,.04),0_4px_16px_rgba(16,24,40,.04)]"
    >
      {/* Subtle Blue Gradient Header with Geometric SVG Pattern */}
      <div className="relative overflow-hidden border-b border-slate-200/70 bg-gradient-to-bl from-blue-600/12 via-indigo-50/70 to-white px-5 pb-5 pt-6">
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full opacity-25 text-blue-300"
          aria-hidden
        >
          <defs>
            <pattern id="fam-geo-grid" width="32" height="32" patternUnits="userSpaceOnUse">
              <path d="M32 0H0v32" fill="none" stroke="currentColor" strokeWidth="0.7" />
              <circle cx="16" cy="16" r="1.5" fill="currentColor" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#fam-geo-grid)" />
        </svg>

        {onCloseMobile && (
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="إغلاق اللوحة"
            className="absolute start-4 top-4 z-10 inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200/80 bg-white text-slate-600 shadow-xs hover:text-slate-900 lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        <div className="relative flex flex-col items-center text-center">
          <div className="relative">
            <span
              className={`inline-flex h-16 w-16 items-center justify-center rounded-full text-2xl font-bold ring-4 ring-white shadow-sm ${cat.avatarBg}`}
            >
              {familyInitial(family.name)}
            </span>
            <span className={`absolute bottom-0.5 end-0.5 h-3.5 w-3.5 rounded-full ring-2 ring-white ${cat.dotClass}`} />
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
            <span className="rounded-md bg-white px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200/80" dir="ltr">
              {family.fileNo}
            </span>
            <CategoryBadge category={family.category} />
          </div>

          <h2 className="mt-2 text-lg font-bold text-slate-900">{family.name}</h2>
          <p className="mt-0.5 text-xs text-slate-500">{family.socialStatus}</p>

          <button
            type="button"
            onClick={() => onOpenFullFile(family)}
            className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-blue-600 to-indigo-600 px-4 text-xs font-semibold text-white shadow-[0_6px_16px_-6px_rgba(37,99,235,0.65)] transition hover:brightness-105"
          >
            <span>فتح الملف الكامل</span>
            <ArrowLeft className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-5 p-5">
        {/* Donut Chart Card */}
        <EntitlementDonut family={family} />

        {/* Animated Underline Tabs */}
        <div>
          <div
            role="tablist"
            aria-label="تفاصيل ملف العائلة"
            className="flex gap-1 overflow-x-auto border-b border-slate-200/80 pb-px"
          >
            {TABS.map((tab) => {
              const selected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative shrink-0 px-2.5 py-2 text-xs font-semibold transition ${
                    selected ? 'text-blue-600' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <span>{tab.label}</span>
                  {selected && (
                    <motion.span
                      layoutId="fam-panel-tab-underline"
                      className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-blue-600"
                      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                    />
                  )}
                </button>
              );
            })}
          </div>

          <div className="pt-4">
            {activeTab === 'overview' && (
              <div className="space-y-4">
                <div className="rounded-xl border border-slate-200/70 bg-slate-50/70 p-3.5 text-xs leading-relaxed text-slate-600">
                  <p>{visibleNotes}</p>
                  {notesTooLong && (
                    <button
                      type="button"
                      onClick={() => setExpandedNotes((e) => !e)}
                      className="mt-1.5 font-semibold text-blue-600 hover:underline"
                    >
                      {expandedNotes ? 'عرض أقل' : 'اقرأ المزيد'}
                    </button>
                  )}
                </div>

                <div>
                  <p className="mb-1.5 text-xs font-semibold text-slate-500">المندوب المسؤول</p>
                  <DelegateChip delegate={family.delegate} />
                </div>

                <dl className="grid grid-cols-1 gap-2.5 text-xs">
                  <div className="flex items-start justify-between gap-3 rounded-xl border border-slate-200/60 px-3 py-2.5">
                    <dt className="inline-flex items-center gap-1.5 text-slate-500">
                      <MapPin className="h-3.5 w-3.5 text-slate-400" aria-hidden /> العنوان
                    </dt>
                    <dd className="text-end font-semibold text-slate-800">{family.address}</dd>
                  </div>
                  <div className="flex items-start justify-between gap-3 rounded-xl border border-slate-200/60 px-3 py-2.5">
                    <dt className="inline-flex items-center gap-1.5 text-slate-500">
                      <Home className="h-3.5 w-3.5 text-slate-400" aria-hidden /> السكن
                    </dt>
                    <dd className="text-end font-semibold text-slate-800">
                      {family.housing} {family.rent > 0 ? `(${formatIQD(family.rent)})` : ''}
                    </dd>
                  </div>
                  <div className="flex items-start justify-between gap-3 rounded-xl border border-slate-200/60 px-3 py-2.5">
                    <dt className="inline-flex items-center gap-1.5 text-slate-500">
                      <Wallet className="h-3.5 w-3.5 text-slate-400" aria-hidden /> الدخل الحالي
                    </dt>
                    <dd className="text-end font-semibold text-slate-800">{family.income}</dd>
                  </div>
                </dl>
              </div>
            )}

            {activeTab === 'members' && <MembersList members={family.members} />}

            {activeTab === 'patients' && (
              <div className="space-y-2.5">
                {(!family.patients || family.patients.length === 0) ? (
                  <p className="py-6 text-center text-xs text-slate-500">لا توجد حالات مرضية مسجلة لهذه العائلة.</p>
                ) : (
                  family.patients.map((pt, idx) => (
                    <div
                      key={`${pt.name}-${idx}`}
                      className="rounded-xl border border-slate-200/70 bg-slate-50/70 p-3.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                            <HeartPulse className="h-3.5 w-3.5 text-rose-500" aria-hidden />
                            {pt.name}
                          </p>
                          <p className="mt-0.5 text-[11px] font-medium text-rose-700">{pt.diagnosis}</p>
                        </div>
                        <a
                          href={pt.id <= 12 ? `#/patients/${pt.id}` : '#/patients'}
                          className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-[11px] font-semibold text-blue-600 ring-1 ring-slate-200/80 hover:bg-blue-50"
                        >
                          <span>صفحة المرضى</span>
                          <ArrowLeft className="h-3 w-3" />
                        </a>
                      </div>

                      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/60 pt-2 text-[11px] text-slate-500 tabular-nums">
                        <span>آخر كشفية: <b dir="ltr" className="text-slate-700">{pt.lastVisit}</b></span>
                        <span>الأدوية: <b className="text-slate-900">{formatIQD(pt.medicineCost)}</b></span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'payments' && <PaymentsTimeline payments={family.payments} />}

            {activeTab === 'visits' && (
              <ul className="space-y-2.5">
                {(family.visits ?? []).map((visit, idx) => (
                  <li
                    key={`${visit.date}-${idx}`}
                    className="rounded-xl border border-slate-200/70 bg-slate-50/70 p-3.5"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-bold text-slate-800">{visit.delegateName}</span>
                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 tabular-nums" dir="ltr">
                        <Calendar className="h-3 w-3" aria-hidden /> {visit.date}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{visit.note}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions Footer */}
      <footer className="grid grid-cols-2 gap-2 border-t border-slate-200/70 bg-slate-50/70 p-4">
        <button
          type="button"
          onClick={() => onPay(family)}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-l from-blue-600 to-indigo-600 px-3 text-xs font-semibold text-white transition hover:brightness-105"
        >
          <HandCoins className="h-3.5 w-3.5" aria-hidden />
          <span>صرف راتب/مساعدة</span>
        </button>

        <button
          type="button"
          onClick={() => onRecordVisit(family)}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          <ClipboardCheck className="h-3.5 w-3.5 text-blue-600" aria-hidden />
          <span>تسجيل زيارة</span>
        </button>

        <button
          type="button"
          onClick={() => onPrint(family)}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          <Printer className="h-3.5 w-3.5 text-slate-500" aria-hidden />
          <span>طباعة كشف</span>
        </button>

        <a
          href={whatsappUrl(family.delegate?.phone)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-500/10 px-3 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-500 hover:text-white"
        >
          <MessageCircle className="h-3.5 w-3.5" aria-hidden />
          <span>واتساب المندوب</span>
        </a>
      </footer>
    </aside>
  );
}

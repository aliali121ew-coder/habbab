import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Calendar, ClipboardCheck, HandCoins, MapPin, MoreHorizontal,
  Printer, Stethoscope, Users,
} from 'lucide-react';
import {
  CATEGORY_CONFIG,
  familyInitial,
  formatIQD,
  timeAgo,
  totalEntitlement,
} from '../../utils/format';
import { CategoryBadge, StatusOverflowBadge } from './CategoryBadge';
import { DelegateChip } from './DelegateChip';

export function FamilyCard({
  family,
  selected,
  onSelect,
  onOpenFullFile,
  onPay,
  onRecordVisit,
  onPrint,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onOutside = (e) => {
      if (!menuRef.current?.contains(e.target)) setMenuOpen(false);
    };
    const onEsc = (e) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onOutside);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('pointerdown', onOutside);
      document.removeEventListener('keydown', onEsc);
    };
  }, [menuOpen]);

  const cat = CATEGORY_CONFIG[family.category] ?? CATEGORY_CONFIG.stable;
  const due = totalEntitlement(family);
  const paidRatio = due > 0 ? Math.min(100, Math.round((family.paidThisMonth / due) * 100)) : 0;

  const { salary = 0, aid = 0, medicine = 0, checkups = 0 } = family.entitlements ?? {};
  const medicalTotal = medicine + checkups;
  const segPct = (val) => (due > 0 ? Math.max(0, (val / due) * 100) : 0);

  // Max 2 badges visible per card; overflow hidden behind "+N"
  const extraTags = [
    family.rent > 0 ? 'سكن مأجور' : null,
    family.patients?.length > 0 ? 'رعاية مرضى' : null,
  ].filter(Boolean).length;

  const arrearsLabel = family.arrearsMonths === 1
    ? 'متأخر شهر'
    : family.arrearsMonths === 2
      ? 'متأخر شهرين'
      : `متأخر ${family.arrearsMonths} أشهر`;

  return (
    <motion.article
      layout="position"
      variants={{
        hidden: { opacity: 0, y: 12 },
        show: { opacity: 1, y: 0, transition: { duration: 0.2 } },
      }}
      onClick={() => onSelect(family.id)}
      tabIndex={0}
      role="button"
      aria-pressed={selected}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(family.id);
        }
      }}
      className={`group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border bg-white text-start shadow-[0_1px_2px_rgba(16,24,40,.04),0_4px_16px_rgba(16,24,40,.04)] transition duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-blue-600 ${
        selected ? 'border-blue-500 ring-2 ring-blue-500' : 'border-slate-200/70'
      }`}
    >
      {/* 1. Thin semantic top bar */}
      <div className={`h-1 w-full ${cat.barClass}`} aria-hidden />

      <div className="flex flex-1 flex-col gap-4 p-5">
        {/* 2. Card Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="relative shrink-0">
              <span
                className={`inline-flex h-11 w-11 items-center justify-center rounded-full text-base font-bold ${cat.avatarBg}`}
                aria-hidden
              >
                {familyInitial(family.name)}
              </span>
              <span
                className={`absolute bottom-0 end-0 h-2.5 w-2.5 rounded-full ring-2 ring-white ${cat.dotClass}`}
                aria-hidden
              />
            </div>

            <div className="min-w-0">
              <h2 className="truncate text-lg font-bold text-slate-900">{family.name}</h2>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                <span className="truncate">{family.region} · {family.housing}</span>
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-600" dir="ltr">
              {family.fileNo}
            </span>

            <div className="relative" ref={menuRef}>
              <button
                type="button"
                aria-label={`إجراءات ${family.name}`}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((prev) => !prev)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <MoreHorizontal className="h-4 w-4" aria-hidden />
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  className="absolute end-0 z-20 mt-1 w-44 rounded-xl border border-slate-200/80 bg-white p-1 shadow-lg"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { setMenuOpen(false); onOpenFullFile(family); }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <ArrowLeft className="h-3.5 w-3.5 text-blue-600" /> فتح الملف الكامل
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { setMenuOpen(false); onPay(family); }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <HandCoins className="h-3.5 w-3.5 text-emerald-600" /> صرف دفعة
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { setMenuOpen(false); onRecordVisit(family); }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <ClipboardCheck className="h-3.5 w-3.5 text-amber-600" /> تسجيل زيارة
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { setMenuOpen(false); onPrint(family); }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Printer className="h-3.5 w-3.5 text-slate-500" /> طباعة كشف
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Max 2 Badges + Overflow Pill */}
        <div className="flex flex-wrap items-center gap-1.5">
          <CategoryBadge category={family.category} />
          <StatusOverflowBadge statusLabel={family.socialStatus} extraCount={extraTags} />
        </div>

        {/* 3. Responsible Delegate Row */}
        <DelegateChip delegate={family.delegate} compact />

        {/* 4. Hero Monthly Entitlement + Segmented Hover-Tooltip Bar */}
        <div className="group/ent relative rounded-xl border border-slate-200/60 bg-slate-50/50 p-3.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-medium text-slate-500">إجمالي المستحق الشهري</span>
            <span className="text-xl font-bold text-slate-900 tabular-nums">{formatIQD(due)}</span>
          </div>

          <div
            className="mt-2.5 flex h-2 w-full overflow-hidden rounded-full bg-slate-200/70"
            aria-label={`الراتب ${formatIQD(salary)}، المساعدات ${formatIQD(aid)}، المرضى والكشفيات ${formatIQD(medicalTotal)}`}
          >
            {salary > 0 && <span className="bg-blue-600" style={{ width: `${segPct(salary)}%` }} />}
            {aid > 0 && <span className="bg-emerald-500" style={{ width: `${segPct(aid)}%` }} />}
            {medicalTotal > 0 && <span className="bg-amber-500" style={{ width: `${segPct(medicalTotal)}%` }} />}
          </div>

          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full bg-blue-600" /> راتب</span>
            <span className="inline-flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> مساعدات</span>
            <span className="inline-flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full bg-amber-500" /> مرضى وكشفيات</span>
          </div>

          {/* Hover Tooltip with Exact Breakdown */}
          <div className="pointer-events-none invisible absolute inset-x-3 -top-2 z-20 -translate-y-full rounded-xl border border-slate-200 bg-slate-900 p-3 text-white opacity-0 shadow-lg transition duration-150 group-hover/ent:visible group-hover/ent:opacity-100">
            <div className="grid grid-cols-3 gap-2 text-[11px] tabular-nums">
              <div>
                <span className="block text-slate-400">الراتب</span>
                <b className="text-blue-300">{formatIQD(salary)}</b>
              </div>
              <div>
                <span className="block text-slate-400">المساعدات</span>
                <b className="text-emerald-300">{formatIQD(aid)}</b>
              </div>
              <div>
                <span className="block text-slate-400">مرضى/كشفيات</span>
                <b className="text-amber-300">{formatIQD(medicalTotal)}</b>
              </div>
            </div>
          </div>
        </div>

        {/* 5. Compact Info Row */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5 tabular-nums">
            <Users className="h-3.5 w-3.5 text-slate-400" aria-hidden />
            الأفراد <b className="text-slate-700">{family.members?.length ?? 0}</b>
          </span>
          <span className="inline-flex items-center gap-1.5 tabular-nums">
            <Stethoscope className="h-3.5 w-3.5 text-slate-400" aria-hidden />
            مرضى <b className="text-slate-700">{family.patients?.length ?? 0}</b>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-slate-400" aria-hidden />
            آخر زيارة <b className="text-slate-700">{timeAgo(family.lastVisit)}</b>
          </span>
        </div>

        {/* 6. Month Disbursement Progress */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-slate-600 tabular-nums">
              مصروف <b className="text-emerald-600">{formatIQD(family.paidThisMonth)}</b>{' '}
              <span className="text-slate-400">من {formatIQD(due)}</span>
            </span>

            {family.arrears > 0 && (
              <span className="rounded-full bg-rose-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-rose-600">
                {arrearsLabel}
              </span>
            )}
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100" aria-hidden>
            <div
              className={`h-full rounded-full transition-all ${
                family.arrears > 0 ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${paidRatio}%` }}
            />
          </div>
        </div>

        {/* 7. Card Footer Actions */}
        <div
          className="mt-auto flex items-center justify-between gap-2 border-t border-slate-100 pt-3.5"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => onOpenFullFile(family)}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold text-blue-600 transition hover:bg-blue-50"
          >
            <span>فتح الملف</span>
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          </button>

          <button
            type="button"
            onClick={() => onPay(family)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-l from-blue-600 to-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs transition hover:brightness-105"
          >
            <HandCoins className="h-3.5 w-3.5" aria-hidden />
            <span>صرف دفعة</span>
          </button>
        </div>
      </div>
    </motion.article>
  );
}

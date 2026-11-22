import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpDown, Check, ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react';
import { DELEGATES } from '../../data/families';
import { PAYMENT_STATUS_LABELS, SORT_LABELS } from '../../utils/format';
import { DelegateAvatar } from './DelegateChip';

const SEGMENT_ITEMS = [
  { key: 'all', label: 'الكل', dot: null },
  { key: 'critical', label: 'حرجة', dot: 'bg-rose-500' },
  { key: 'intensive', label: 'متوسطة', dot: 'bg-amber-500' },
  { key: 'stable', label: 'جيدة', dot: 'bg-emerald-500' },
];

export function FiltersToolbar({
  filters,
  onChange,
  categoryCounts,
  delegateCounts,
}) {
  const [delegateOpen, setDelegateOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const searchRef = useRef(null);
  const delegateRef = useRef(null);

  // ⌘K / Ctrl+K shortcut to focus search
  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!delegateOpen) return undefined;
    const onOutside = (e) => {
      if (!delegateRef.current?.contains(e.target)) setDelegateOpen(false);
    };
    const onEsc = (e) => {
      if (e.key === 'Escape') setDelegateOpen(false);
    };
    document.addEventListener('pointerdown', onOutside);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('pointerdown', onOutside);
      document.removeEventListener('keydown', onEsc);
    };
  }, [delegateOpen]);

  useEffect(() => {
    if (!sheetOpen) return undefined;
    const onEsc = (e) => { if (e.key === 'Escape') setSheetOpen(false); };
    document.addEventListener('keydown', onEsc);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onEsc); document.body.style.overflow = overflow; };
  }, [sheetOpen]);

  // Filters that live in the phone sheet, counted on the filter button.
  const sheetActive = (filters.delegateId !== 'all' ? 1 : 0) + (filters.paymentStatus !== 'all' ? 1 : 0);

  const chipClass = (active) => `inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition ${
    active ? 'bg-[var(--bar-active)] text-white shadow-sm' : 'border border-slate-200/80 bg-white text-slate-700'
  }`;

  const activeDelegate = DELEGATES.find((d) => String(d.id) === String(filters.delegateId));

  return (
    <>
    {/* Phone: search + filter button, swipeable priority chips, everything else in a bottom sheet */}
    <section aria-label="أدوات البحث والفلترة" className="md:hidden">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute start-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            type="search"
            value={filters.query}
            onChange={(e) => onChange({ query: e.target.value })}
            placeholder="ابحث باسم العائلة أو رقم الملف"
            aria-label="بحث في سجل العوائل"
            className="h-12 w-full rounded-2xl border border-slate-200/80 bg-white ps-11 pe-3 text-[15px] text-slate-900 shadow-[0_1px_2px_rgba(16,24,40,.04)] placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-3 focus:ring-blue-500/15"
          />
        </div>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-label="خيارات التصفية والترتيب"
          className="relative inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-slate-200/80 bg-white text-slate-700 shadow-[0_1px_2px_rgba(16,24,40,.04)]"
        >
          <SlidersHorizontal className="h-5 w-5" aria-hidden />
          {sheetActive > 0 && (
            <span className="absolute -top-1 -end-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1 text-[11px] font-bold text-white">{sheetActive}</span>
          )}
        </button>
      </div>

      <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" role="group" aria-label="تصفية حسب الأولوية">
        {SEGMENT_ITEMS.map((item) => {
          const active = filters.category === item.key;
          return (
            <button key={item.key} type="button" aria-pressed={active} onClick={() => onChange({ category: item.key })} className={chipClass(active)}>
              {item.label}
              <span className={`rounded-full px-1.5 text-xs tabular-nums ${active ? 'bg-white/25' : 'bg-slate-100 text-slate-500'}`}>{categoryCounts[item.key] ?? 0}</span>
            </button>
          );
        })}
      </div>
    </section>

    {sheetOpen && createPortal(
      <div dir="rtl" className="fam-saas fixed inset-0 z-50 flex items-end md:hidden">
        <button type="button" aria-label="إغلاق" onClick={() => setSheetOpen(false)} className="absolute inset-0 cursor-default bg-slate-950/45 backdrop-blur-[2px]" />
        <div role="dialog" aria-modal="true" aria-label="التصفية والترتيب" className="fam-sheet relative max-h-[85dvh] w-full overflow-y-auto rounded-t-3xl bg-white px-4 pt-2 pb-[calc(16px+env(safe-area-inset-bottom))] shadow-2xl">
          <span className="mx-auto mb-2 block h-1.5 w-10 rounded-full bg-slate-200" aria-hidden />
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">التصفية والترتيب</h2>
            <button type="button" onClick={() => setSheetOpen(false)} aria-label="إغلاق" className="inline-flex h-11 w-11 items-center justify-center rounded-full text-slate-500">
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>

          <h3 className="mt-3 text-[13px] font-semibold text-slate-500">حالة الصرف</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {Object.entries(PAYMENT_STATUS_LABELS).map(([key, label]) => (
              <button key={key} type="button" aria-pressed={filters.paymentStatus === key} onClick={() => onChange({ paymentStatus: key })} className={chipClass(filters.paymentStatus === key)}>
                {key === 'all' ? 'الكل' : label}
              </button>
            ))}
          </div>

          <h3 className="mt-5 text-[13px] font-semibold text-slate-500">الترتيب</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {Object.entries(SORT_LABELS).map(([key, label]) => (
              <button key={key} type="button" aria-pressed={filters.sortBy === key} onClick={() => onChange({ sortBy: key })} className={chipClass(filters.sortBy === key)}>
                {label}
              </button>
            ))}
          </div>

          <h3 className="mt-5 text-[13px] font-semibold text-slate-500">المندوب</h3>
          <ul className="mt-2 divide-y divide-slate-100 rounded-2xl border border-slate-200/80">
            {[{ id: 'all', name: 'كل المندوبين' }, ...DELEGATES].map((del) => {
              const sel = String(filters.delegateId) === String(del.id);
              return (
                <li key={del.id}>
                  <button type="button" onClick={() => onChange({ delegateId: String(del.id) })} className={`flex min-h-[52px] w-full items-center gap-3 px-3.5 text-start text-sm ${sel ? 'font-bold text-blue-700' : 'text-slate-700'}`}>
                    {del.id === 'all' ? <span className="h-7 w-7" aria-hidden /> : <DelegateAvatar delegate={del} size="sm" />}
                    <span className="min-w-0 flex-1 truncate">{del.name}</span>
                    <span className="text-xs text-slate-500 tabular-nums">{del.id === 'all' ? categoryCounts.all : delegateCounts.get(del.id) ?? 0}</span>
                    {sel && <Check className="h-4 w-4 text-blue-600" aria-hidden />}
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="sticky bottom-0 mt-4 flex gap-2 bg-white pt-2">
            <button type="button" onClick={() => onChange({ delegateId: 'all', paymentStatus: 'all', sortBy: 'entitlement_desc' })} className="h-12 flex-1 rounded-2xl border border-slate-200 text-sm font-semibold text-slate-700">
              إعادة الضبط
            </button>
            <button type="button" onClick={() => setSheetOpen(false)} className="h-12 flex-[2] rounded-2xl bg-blue-600 text-sm font-bold text-white shadow-sm">
              عرض النتائج
            </button>
          </div>
        </div>
      </div>,
      document.body,
    )}

    <section
      aria-label="أدوات البحث والفلترة"
      className="hidden md:block px-5 py-3.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        {/* Individual Rounded Status Pills */}
        <div
          role="group"
          aria-label="تصفية حسب الأولوية"
          className="inline-flex flex-wrap items-center gap-2"
        >
          {SEGMENT_ITEMS.map((item) => {
            const active = filters.category === item.key;
            return (
              <button
                key={item.key}
                type="button"
                aria-pressed={active}
                onClick={() => onChange({ category: item.key })}
                className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition ${
                  active
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'border border-slate-200/80 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
                }`}
              >
                {item.dot && <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-white' : item.dot}`} aria-hidden />}
                <span>{item.label}</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] tabular-nums ${
                    active ? 'bg-white/20 text-white' : 'text-slate-400'
                  }`}
                >
                  {categoryCounts[item.key] ?? 0}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Compact Search Input beside Delegates */}
          <div className="relative flex items-center">
            <Search
              className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-slate-400"
              aria-hidden
            />
            <input
              ref={searchRef}
              type="search"
              value={filters.query}
              onChange={(e) => onChange({ query: e.target.value })}
              placeholder="بحث…"
              aria-label="بحث في سجل العوائل"
              className="h-9 w-48 rounded-xl border border-slate-200/80 bg-slate-50/70 pr-8 pl-3 text-xs text-slate-900 placeholder:text-slate-400 transition focus:w-60 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-3 focus:ring-blue-500/15"
            />
          </div>

          {/* Custom Delegate Picker with Avatar & Family Count */}
          <div className="relative" ref={delegateRef}>
            <button
              type="button"
              aria-haspopup="listbox"
              aria-expanded={delegateOpen}
              onClick={() => setDelegateOpen((prev) => !prev)}
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-300"
            >
              {activeDelegate ? (
                <>
                  <DelegateAvatar delegate={activeDelegate} size="sm" />
                  <span>{activeDelegate.name}</span>
                  <span className="rounded-full bg-slate-100 px-1.5 text-[10px] text-slate-600 tabular-nums">
                    {delegateCounts.get(activeDelegate.id) ?? 0}
                  </span>
                </>
              ) : (
                <span>كل المندوبين ({DELEGATES.length})</span>
              )}
              <ChevronDown className="h-3.5 w-3.5 text-slate-400" aria-hidden />
            </button>

            {delegateOpen && (
              <div
                role="listbox"
                aria-label="اختر المندوب"
                className="absolute start-0 z-30 mt-1.5 max-h-72 w-64 overflow-y-auto rounded-2xl border border-slate-200/80 bg-white p-1.5 shadow-xl"
              >
                <button
                  type="button"
                  role="option"
                  aria-selected={filters.delegateId === 'all'}
                  onClick={() => {
                    onChange({ delegateId: 'all' });
                    setDelegateOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold transition ${
                    filters.delegateId === 'all'
                      ? 'bg-blue-600/10 text-blue-700'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span>كل المندوبين</span>
                  <span className="text-[11px] text-slate-500 tabular-nums">{categoryCounts.all} عائلة</span>
                </button>

                {DELEGATES.map((del) => {
                  const isSel = String(filters.delegateId) === String(del.id);
                  const count = delegateCounts.get(del.id) ?? 0;
                  return (
                    <button
                      key={del.id}
                      type="button"
                      role="option"
                      aria-selected={isSel}
                      onClick={() => {
                        onChange({ delegateId: String(del.id) });
                        setDelegateOpen(false);
                      }}
                      className={`mt-0.5 flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-xs transition ${
                        isSel ? 'bg-blue-600/10 font-semibold text-blue-700' : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <DelegateAvatar delegate={del} size="sm" />
                        <span className="truncate">{del.name}</span>
                      </span>
                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 tabular-nums">
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Payment Status Select */}
          <label className="inline-flex items-center">
            <span className="sr-only">حالة الصرف</span>
            <select
              value={filters.paymentStatus}
              onChange={(e) => onChange({ paymentStatus: e.target.value })}
              className="h-9 rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-300 focus:border-blue-500 focus:outline-none"
            >
              {Object.entries(PAYMENT_STATUS_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{key === 'all' ? 'حالة الصرف: الكل' : label}</option>
              ))}
            </select>
          </label>

          {/* Sort Select */}
          <label className="relative inline-flex items-center">
            <span className="sr-only">الترتيب</span>
            <ArrowUpDown className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-slate-400" aria-hidden />
            <select
              value={filters.sortBy}
              onChange={(e) => onChange({ sortBy: e.target.value })}
              className="h-9 appearance-none rounded-xl border border-slate-200/80 bg-white pr-3 pl-8 text-xs font-semibold text-slate-700 transition hover:border-slate-300 focus:border-blue-500 focus:outline-none"
            >
              {Object.entries(SORT_LABELS).map(([key, label]) => (
                <option key={key} value={key}>ترتيب: {label}</option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </section>
    </>
  );
}

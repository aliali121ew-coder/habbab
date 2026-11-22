import { useMemo, useState } from 'react';
import {
  ArrowDown, ArrowLeft, ArrowUp, ChevronLeft, ChevronRight,
  FileSpreadsheet, HandCoins, Printer, X,
} from 'lucide-react';
import {
  CATEGORY_CONFIG,
  familyInitial,
  formatIQD,
  timeAgo,
  totalEntitlement,
} from '../../utils/format';
import { DelegateAvatar } from './DelegateChip';

const PAGE_SIZE = 8;

function getLastAid(family) {
  const payments = family?.payments ?? [];
  const nonSalary = payments.find((p) => p.type !== 'راتب شهري');
  return nonSalary ?? null;
}

function getLastSalaryDate(family) {
  const payments = family?.payments ?? [];
  return payments.find((p) => p.type === 'راتب شهري')?.date ?? null;
}

function SortHeader({ label, colKey, sortCol, sortDir, onSort }) {
  const active = sortCol === colKey;
  const Icon = !active ? ArrowUp : sortDir === 'asc' ? ArrowUp : ArrowDown;

  return (
    <th scope="col" className="px-4 py-2 text-start text-[11px] font-semibold tracking-wide text-slate-400">
      <button
        type="button"
        onClick={() => onSort(colKey)}
        className={`inline-flex items-center gap-1 whitespace-nowrap transition hover:text-slate-800 ${
          active ? 'font-bold text-slate-700' : ''
        }`}
      >
        <span>{label}</span>
        <Icon className={`h-3 w-3 ${active ? 'text-blue-600 opacity-100' : 'opacity-45'}`} aria-hidden />
      </button>
    </th>
  );
}

export function FamiliesTable({
  families,
  selectedId,
  onSelect,
  onOpenFullFile,
  onPay,
  onBulkPay,
  onBulkPrint,
  loading = false,
}) {
  const [sortCol, setSortCol] = useState('salary');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);
  const [checkedIds, setCheckedIds] = useState(() => new Set());

  const handleSort = (col) => {
    if (sortCol === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir(col === 'name' || col === 'delegate' ? 'asc' : 'desc');
    }
    setPage(1);
  };

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...families].sort((a, b) => {
      switch (sortCol) {
        case 'name': return a.name.localeCompare(b.name, 'ar') * dir;
        case 'salary': return ((a.entitlements?.salary ?? 0) - (b.entitlements?.salary ?? 0)) * dir;
        case 'aid': return ((getLastAid(a)?.amount ?? 0) - (getLastAid(b)?.amount ?? 0)) * dir;
        case 'delegate': return (a.delegate?.name ?? '').localeCompare(b.delegate?.name ?? '', 'ar') * dir;
        default: return 0;
      }
    });
  }, [families, sortCol, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const pageButtons = useMemo(() => {
    const windowSize = 5;
    const start = Math.max(1, Math.min(safePage - 2, totalPages - windowSize + 1));
    const end = Math.min(totalPages, start + windowSize - 1);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }, [safePage, totalPages]);

  const allOnPageChecked = pageRows.length > 0 && pageRows.every((r) => checkedIds.has(r.id));

  const toggleAllOnPage = () => {
    const next = new Set(checkedIds);
    if (allOnPageChecked) {
      pageRows.forEach((r) => next.delete(r.id));
    } else {
      pageRows.forEach((r) => next.add(r.id));
    }
    setCheckedIds(next);
  };

  const toggleOne = (id) => {
    const next = new Set(checkedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCheckedIds(next);
  };

  const selectedList = useMemo(
    () => families.filter((f) => checkedIds.has(f.id)),
    [families, checkedIds],
  );

  const exportCsv = () => {
    const target = selectedList.length > 0 ? selectedList : sorted;
    const headers = ['رقم الملف', 'العائلة', 'التصنيف', 'المندوب', 'المنطقة', 'الراتب', 'آخر مساعدة', 'تاريخ المساعدة', 'إجمالي المستحق'];
    const rows = target.map((f) => {
      const lastAid = getLastAid(f);
      return [
        f.fileNo,
        f.name,
        CATEGORY_CONFIG[f.category]?.label ?? f.category,
        f.delegate?.name ?? '',
        f.region,
        f.entitlements?.salary ?? 0,
        lastAid ? `${lastAid.amount} (${lastAid.type})` : 'لا توجد',
        lastAid?.date ?? '',
        totalEntitlement(f),
      ];
    });
    const csvContent = '\uFEFF' + [headers, ...rows]
      .map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `families-registry-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true">
        {[0, 1, 2, 3, 4].map((idx) => (
          <div
            key={idx}
            className="h-20 animate-pulse rounded-2xl border border-slate-200/70 bg-white shadow-xs"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="relative space-y-3">
      <div className="overflow-x-auto px-0.5 pb-1">
        <table className="w-full min-w-[760px] border-separate border-spacing-y-2.5 text-start">
          <thead>
            <tr>
              <th scope="col" className="w-12 px-4 py-2 text-center">
                <input
                  type="checkbox"
                  checked={allOnPageChecked}
                  onChange={toggleAllOnPage}
                  aria-label="تحديد كل الصفوف في هذه الصفحة"
                />
              </th>
              <SortHeader label="العائلة" colKey="name" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <SortHeader label="الراتب" colKey="salary" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <SortHeader label="المساعدات" colKey="aid" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <SortHeader label="المندوب" colKey="delegate" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <th scope="col" className="px-4 py-2 text-center text-[11px] font-semibold tracking-wide text-slate-400">
                الإجراءات
              </th>
            </tr>
          </thead>

          <tbody>
            {pageRows.map((family) => {
              const cat = CATEGORY_CONFIG[family.category] ?? CATEGORY_CONFIG.stable;
              const salary = family.entitlements?.salary ?? 0;
              const lastSalaryDate = getLastSalaryDate(family);
              const lastAid = getLastAid(family);
              const isSelected = family.id === selectedId;
              const isChecked = checkedIds.has(family.id);

              const rowShadow = isSelected
                ? 'shadow-[0_10px_28px_-6px_rgba(37,99,235,0.16),0_2px_8px_rgba(15,23,42,0.06)] ring-1 ring-blue-500/35'
                : 'shadow-[0_1px_2px_rgba(16,24,40,.04),0_4px_14px_rgba(16,24,40,.04)] hover:shadow-[0_10px_26px_-6px_rgba(15,23,42,0.1)]';

              return (
                <tr
                  key={family.id}
                  onClick={() => onSelect(family.id)}
                  className={`group cursor-pointer rounded-2xl bg-white transition duration-150 ${rowShadow}`}
                >
                  {/* Checkbox */}
                  <td
                    className="rounded-s-2xl border-y border-s border-slate-200/70 bg-white px-4 py-4 text-center"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleOne(family.id)}
                      aria-label={`تحديد ${family.name}`}
                    />
                  </td>

                  {/* 1. العائلة */}
                  <td className="border-y border-slate-200/70 bg-white px-4 py-4">
                    <div className="flex items-center gap-3.5">
                      <div className="relative shrink-0">
                        <span className={`inline-flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold ${cat.avatarBg}`}>
                          {familyInitial(family.name)}
                        </span>
                        <span className={`absolute bottom-0 end-0 h-2.5 w-2.5 rounded-full ring-2 ring-white ${cat.dotClass}`} />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-900">{family.name}</p>
                        <p className="mt-0.5 truncate text-xs text-slate-400">
                          {family.region} · {family.socialStatus} · <span className="font-mono" dir="ltr">{family.fileNo}</span>
                        </p>
                      </div>
                    </div>
                  </td>

                  {/* 2. الراتب (إن وجد) */}
                  <td className="border-y border-slate-200/70 bg-white px-4 py-4 whitespace-nowrap">
                    {salary > 0 ? (
                      <>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-900 tabular-nums">{formatIQD(salary)}</span>
                          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                            راتب شهري
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-400 tabular-nums">
                          {lastSalaryDate ? `آخر صرف ${timeAgo(lastSalaryDate)}` : 'معتمد شهرياً'}
                        </p>
                      </>
                    ) : (
                      <span className="text-xs font-medium text-slate-400">لا يوجد راتب</span>
                    )}
                  </td>

                  {/* 3. المساعدات (آخر مساعدة تم إعطاؤها) */}
                  <td className="border-y border-slate-200/70 bg-white px-4 py-4 whitespace-nowrap">
                    {lastAid ? (
                      <>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-900 tabular-nums">{formatIQD(lastAid.amount)}</span>
                          <span className="rounded-full bg-blue-600/10 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                            {lastAid.type}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-400 tabular-nums">
                          {timeAgo(lastAid.date)} · <span dir="ltr">{lastAid.date}</span>
                        </p>
                      </>
                    ) : (
                      <span className="text-xs font-medium text-slate-400">لا توجد مساعدات</span>
                    )}
                  </td>

                  {/* 4. المندوب */}
                  <td className="border-y border-slate-200/70 bg-white px-4 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <DelegateAvatar delegate={family.delegate} size="sm" />
                      <span className="text-sm font-semibold text-slate-800">{family.delegate?.name}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-400 tabular-nums" dir="ltr">
                      {family.delegate?.phone}
                    </p>
                  </td>

                  {/* 5. الإجراءات */}
                  <td
                    className="rounded-e-2xl border-y border-e border-slate-200/70 bg-white px-4 py-4 text-center whitespace-nowrap"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="inline-flex items-center justify-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onPay(family)}
                        title="صرف دفعة"
                        aria-label={`صرف دفعة لـ ${family.name}`}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-emerald-50 hover:text-emerald-600"
                      >
                        <HandCoins className="h-4 w-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => onBulkPrint([family])}
                        title="طباعة كشف"
                        aria-label={`طباعة كشف ${family.name}`}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                      >
                        <Printer className="h-4 w-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenFullFile(family)}
                        title="فتح الملف الكامل"
                        aria-label={`فتح الملف الكامل لـ ${family.name}`}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-blue-50 hover:text-blue-600"
                      >
                        <ArrowLeft className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Numbered Pagination */}
      {totalPages > 1 && (
        <nav
          className="reg-pager rounded-2xl border border-slate-200/70 bg-white shadow-xs"
          aria-label="ترقيم صفحات العوائل"
        >
          <button
            type="button"
            className="pager-btn"
            aria-label="الصفحة السابقة"
            disabled={safePage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronRight size={16} aria-hidden />
            <span className="pager-text">السابق</span>
          </button>

          <div className="pager-pages">
            {pageButtons.map((p) => (
              <button
                key={p}
                type="button"
                className={`pager-num${p === safePage ? ' active' : ''}`}
                aria-current={p === safePage ? 'page' : undefined}
                onClick={() => setPage(p)}
              >
                <bdi>{p}</bdi>
              </button>
            ))}
          </div>

          <button
            type="button"
            className="pager-btn"
            aria-label="الصفحة التالية"
            disabled={safePage >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            <span className="pager-text">التالي</span>
            <ChevronLeft size={16} aria-hidden />
          </button>
        </nav>
      )}

      {/* Floating Bulk Action Bar */}
      {selectedList.length > 0 && (
        <div
          role="region"
          aria-label="إجراءات جماعية"
          className="sticky bottom-4 z-30 mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-200 bg-slate-900 px-4 py-3 text-white shadow-2xl"
        >
          <div className="flex items-center gap-2 text-xs">
            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-blue-600 px-2 font-bold tabular-nums">
              {selectedList.length}
            </span>
            <span className="font-semibold">عوائل محددة</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onBulkPay(selectedList);
                setCheckedIds(new Set());
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-l from-blue-600 to-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110"
            >
              <HandCoins className="h-3.5 w-3.5" aria-hidden />
              <span>صرف جماعي</span>
            </button>

            <button
              type="button"
              onClick={() => onBulkPrint(selectedList)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
            >
              <Printer className="h-3.5 w-3.5" aria-hidden />
              <span>طباعة كشوفات</span>
            </button>

            <button
              type="button"
              onClick={exportCsv}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden />
              <span>تصدير Excel</span>
            </button>

            <button
              type="button"
              aria-label="إلغاء التحديد"
              onClick={() => setCheckedIds(new Set())}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-300 hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

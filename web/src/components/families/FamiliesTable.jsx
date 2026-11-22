import { useMemo, useState } from 'react';
import {
  ArrowDown, ArrowLeft, ArrowUp, ChevronLeft, ChevronRight,
  FileSpreadsheet, HandCoins, Pencil, Printer, X,
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

const STATUS_ORDER = { critical: 0, intensive: 1, stable: 2 };
const STATUS_META = {
  critical: { label: 'حرجة', badge: 'border-rose-500/30 bg-rose-500/12 text-rose-700', dot: 'bg-rose-500' },
  intensive: { label: 'متوسطة', badge: 'border-amber-500/30 bg-amber-500/12 text-amber-700', dot: 'bg-amber-500' },
  stable: { label: 'جيدة', badge: 'border-emerald-500/30 bg-emerald-500/12 text-emerald-700', dot: 'bg-emerald-500' },
};

export function FamiliesTable({
  families,
  selectedId,
  onSelect,
  onOpenFullFile,
  onPay,
  onEditAid,
  onBulkPay,
  onBulkPrint,
  loading = false,
}) {
  const [sortCol, setSortCol] = useState('payment');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);
  const [checkedIds, setCheckedIds] = useState(() => new Set());

  const handleSort = (col) => {
    if (sortCol === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir(col === 'name' || col === 'delegate' || col === 'status' ? 'asc' : 'desc');
    }
    setPage(1);
  };

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...families].sort((a, b) => {
      switch (sortCol) {
        case 'name': return a.name.localeCompare(b.name, 'ar') * dir;
        case 'status': return ((STATUS_ORDER[a.category] ?? 2) - (STATUS_ORDER[b.category] ?? 2)) * dir;
        case 'aid': return ((getLastAid(a)?.type ?? (a.entitlements?.salary > 0 ? 'راتب شهري' : '')).localeCompare(getLastAid(b)?.type ?? (b.entitlements?.salary > 0 ? 'راتب شهري' : ''), 'ar')) * dir;
        case 'payment': return (totalEntitlement(a) - totalEntitlement(b)) * dir;
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
    <div className="relative">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-start">
          <thead>
            <tr className="border-y border-slate-200/70 bg-slate-50/80">
              <th scope="col" className="w-12 px-4 py-3 text-center">
                <input
                  type="checkbox"
                  checked={allOnPageChecked}
                  onChange={toggleAllOnPage}
                  aria-label="تحديد كل الصفوف في هذه الصفحة"
                />
              </th>
              <SortHeader label="العائلة" colKey="name" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <SortHeader label="الحالة" colKey="status" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <SortHeader label="نوع المساعدة" colKey="aid" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <SortHeader label="الدفع" colKey="payment" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <SortHeader label="المندوب" colKey="delegate" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
              <th scope="col" className="px-4 py-3 text-center text-[11px] font-semibold tracking-wide text-slate-400">
                الإجراءات
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {pageRows.map((family) => {
              const cat = CATEGORY_CONFIG[family.category] ?? CATEGORY_CONFIG.stable;
              const salary = family.entitlements?.salary ?? 0;
              const lastAid = getLastAid(family);
              const isSelected = family.id === selectedId;
              const isChecked = checkedIds.has(family.id);

              return (
                <tr
                  key={family.id}
                  onClick={() => onSelect(family.id)}
                  className={`group cursor-pointer transition-colors duration-150 ${
                    isSelected ? 'bg-blue-50/40' : 'hover:bg-slate-50/70'
                  }`}
                >
                  {/* Checkbox */}
                  <td
                    className="px-4 py-3.5 text-center"
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
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="relative shrink-0">
                        <span className={`inline-flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold ${cat.avatarBg}`}>
                          {familyInitial(family.name)}
                        </span>
                        <span className={`absolute bottom-0 end-0 h-2.5 w-2.5 rounded-full ring-2 ring-white ${cat.dotClass}`} />
                      </div>
                      <p className={`min-w-0 truncate text-sm font-bold transition-colors ${isSelected ? 'text-blue-600' : 'text-slate-900 group-hover:text-blue-600'}`}>
                        {family.name}
                      </p>
                    </div>
                  </td>

                  {/* 2. الحالة */}
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    {(() => {
                      const st = STATUS_META[family.category] ?? STATUS_META.stable;
                      return (
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${st.badge}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} aria-hidden />
                          <span>{st.label}</span>
                        </span>
                      );
                    })()}
                  </td>

                  {/* 3. نوع المساعدة */}
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    {(() => {
                      const kinds = [];
                      if (salary > 0) kinds.push('راتب شهري');
                      if (lastAid?.type) kinds.push(lastAid.type);
                      return kinds.length > 0 ? (
                        <span className="text-sm font-medium text-slate-600">{kinds.join(' - ')}</span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      );
                    })()}
                  </td>

                  {/* 4. الدفع */}
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <span className="text-sm font-bold text-slate-900 tabular-nums">{formatIQD(totalEntitlement(family))}</span>
                  </td>

                  {/* 5. المندوب */}
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <div className="flex items-center gap-2.5">
                      <DelegateAvatar delegate={family.delegate} size="sm" />
                      <p className="min-w-0 truncate text-sm font-semibold text-slate-700">{family.delegate?.name}</p>
                    </div>
                  </td>

                  {/* 6. الإجراءات */}
                  <td
                    className="px-4 py-3.5 text-center whitespace-nowrap"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="inline-flex items-center justify-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onEditAid?.(family)}
                        title="تعديل المساعدة"
                        aria-label={`تعديل مساعدة ${family.name}`}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-blue-50 hover:text-blue-600"
                      >
                        <Pencil className="h-4 w-4" aria-hidden />
                      </button>
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

      {/* Numbered Pagination attached seamlessly to bottom of unified card */}
      {totalPages > 1 && (
        <nav
          className="reg-pager border-t border-slate-200/70 px-5 py-3"
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

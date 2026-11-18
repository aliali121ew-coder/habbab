import { RotateCcw } from 'lucide-react';

export function EmptyState({
  variant = 'no-results',
  title,
  description,
  onReset,
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300/80 bg-white p-10 text-center shadow-[0_1px_2px_rgba(16,24,40,.04),0_4px_16px_rgba(16,24,40,.04)]">
      <svg
        width="88"
        height="88"
        viewBox="0 0 88 88"
        fill="none"
        className="mb-4 text-blue-600"
        aria-hidden
      >
        <circle cx="44" cy="44" r="40" fill="#EFF6FF" />
        <rect x="24" y="26" width="40" height="36" rx="8" fill="#FFFFFF" stroke="#BFDBFE" strokeWidth="2" />
        <path d="M32 38h24M32 46h16M32 54h10" stroke="#93C5FD" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="62" cy="58" r="11" fill="#2563EB" />
        <path d="M58 58l3 3 5-6" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>

      <h3 className="text-base font-bold text-slate-900">
        {title ?? (variant === 'no-selection' ? 'اختر عائلة لعرض ملفها' : 'لا توجد نتائج مطابقة')}
      </h3>
      <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-slate-500">
        {description ?? (
          variant === 'no-selection'
            ? 'انقر على أي بطاقة عائلة من السجل لعرض تفاصيل المستحقات والأفراد وسجل الصرف هنا.'
            : 'لم نعثر على عوائل تطابق معايير البحث أو الفلترة الحالية.'
        )}
      </p>

      {onReset && (
        <button
          type="button"
          onClick={onReset}
          className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          مسح الفلاتر وإظهار الكل
        </button>
      )}
    </div>
  );
}

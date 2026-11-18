import { X } from 'lucide-react';

export function ActiveFilterChips({ chips, onRemove, onClearAll }) {
  if (!chips || chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="الفلاتر النشطة">
      <span className="text-xs font-medium text-slate-500">الفلاتر المفعّلة:</span>
      {chips.map((chip) => (
        <span
          key={chip.key}
          className="inline-flex items-center gap-1.5 rounded-full border border-blue-200/80 bg-blue-600/10 px-3 py-1 text-xs font-semibold text-blue-700"
        >
          <span>{chip.label}</span>
          <button
            type="button"
            onClick={() => onRemove(chip.key)}
            aria-label={`إزالة ${chip.label}`}
            className="inline-flex h-4 w-4 items-center justify-center rounded-full text-blue-600 transition hover:bg-blue-600 hover:text-white"
          >
            <X className="h-3 w-3" aria-hidden />
          </button>
        </span>
      ))}

      <button
        type="button"
        onClick={onClearAll}
        className="text-xs font-semibold text-slate-500 underline-offset-2 transition hover:text-rose-600 hover:underline"
      >
        مسح الكل
      </button>
    </div>
  );
}

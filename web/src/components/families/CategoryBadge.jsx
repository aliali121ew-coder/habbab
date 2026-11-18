import { CATEGORY_CONFIG } from '../../utils/format';

export function CategoryBadge({ category, size = 'sm' }) {
  const cfg = CATEGORY_CONFIG[category] ?? CATEGORY_CONFIG.stable;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${
        size === 'md' ? 'px-3 py-1 text-xs' : 'px-2.5 py-0.5 text-xs'
      } ${cfg.badgeClass}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dotClass}`} aria-hidden />
      <span>{cfg.label}</span>
    </span>
  );
}

export function StatusOverflowBadge({ statusLabel, extraCount = 0 }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex items-center rounded-full bg-slate-500/10 px-2.5 py-0.5 text-xs font-medium text-slate-700">
        {statusLabel}
      </span>
      {extraCount > 0 && (
        <span
          className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 tabular-nums"
          title={`${extraCount} تصنيفات إضافية`}
        >
          +{extraCount}
        </span>
      )}
    </span>
  );
}

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface Props {
  title: string;
  icon: LucideIcon;
  value: string;
  unit?: string;
  valueTone?: 'default' | 'emerald' | 'rose';
  metaLabel: string;
  metaValue: ReactNode;
  aura?: boolean;
  extra?: ReactNode;
}

export function StatCell({
  title,
  icon: Icon,
  value,
  unit,
  valueTone = 'default',
  metaLabel,
  metaValue,
  aura = false,
  extra,
}: Props) {
  const valueColor = valueTone === 'emerald'
    ? 'var(--fp-emerald)'
    : valueTone === 'rose'
      ? 'var(--fp-rose)'
      : 'var(--fp-ink)';

  return (
    <div className={`flex flex-col justify-between p-5 ${aura ? 'fp-kpi-aura' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-semibold" style={{ color: 'var(--fp-ink-3)' }}>
          {title}
        </span>
        <span
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
          style={{
            backgroundColor: 'var(--fp-muted-2)',
            color: 'var(--fp-ink-2)',
          }}
          aria-hidden
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>

      <div className="mt-3 flex items-baseline gap-1.5">
        <span
          className="text-[28px] font-bold leading-tight tracking-tight tabular-nums xl:text-[32px]"
          style={{ color: valueColor }}
        >
          {value}
        </span>
        {unit && (
          <span className="text-xs font-semibold" style={{ color: 'var(--fp-ink-3)' }}>
            {unit}
          </span>
        )}
      </div>

      <div
        className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs"
        style={{ borderColor: 'var(--fp-border)' }}
      >
        <div className="flex items-center gap-1.5">
          <span style={{ color: 'var(--fp-ink-3)' }}>{metaLabel}:</span>
          <span className="font-bold" style={{ color: 'var(--fp-ink)' }}>{metaValue}</span>
        </div>
        {extra}
      </div>
    </div>
  );
}

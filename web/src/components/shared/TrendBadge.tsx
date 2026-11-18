import { TrendingDown, TrendingUp } from 'lucide-react';

export function TrendBadge({ percent }: { percent: number }) {
  const positive = percent >= 0;
  const Icon = positive ? TrendingUp : TrendingDown;

  return (
    <span
      dir="ltr"
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums"
      style={{
        backgroundColor: positive ? 'var(--fp-emerald-soft)' : 'var(--fp-rose-soft)',
        color: positive ? 'var(--fp-emerald)' : 'var(--fp-rose)',
      }}
    >
      <Icon className="h-3 w-3" aria-hidden />
      <span>{positive ? `+${percent}%` : `${percent}%`}</span>
    </span>
  );
}

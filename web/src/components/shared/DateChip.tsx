import { Calendar } from 'lucide-react';

export function DateChip({ date }: { date: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium tabular-nums"
      style={{
        backgroundColor: 'var(--fp-muted-2)',
        color: 'var(--fp-ink-2)',
      }}
    >
      <Calendar className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--fp-ink-3)' }} aria-hidden />
      <bdi dir="ltr">{date}</bdi>
    </span>
  );
}

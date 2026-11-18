import { User } from 'lucide-react';

export function DoctorCell({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs font-medium" style={{ color: 'var(--fp-ink-2)' }}>
      <span
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border"
        style={{
          backgroundColor: 'var(--fp-muted)',
          borderColor: 'var(--fp-border)',
          color: 'var(--fp-ink-3)',
        }}
        aria-hidden
      >
        <User className="h-3.5 w-3.5" />
      </span>
      <span className="truncate">{name}</span>
    </span>
  );
}

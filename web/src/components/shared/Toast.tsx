import { CheckCircle2 } from 'lucide-react';

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-5 start-1/2 z-50 -translate-x-1/2 rtl:translate-x-1/2"
    >
      <div
        className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold shadow-lg"
        style={{
          backgroundColor: 'var(--fp-ink)',
          borderColor: 'var(--fp-border)',
          color: 'var(--fp-card)',
        }}
      >
        <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: 'var(--fp-emerald)' }} aria-hidden />
        <span>{message}</span>
      </div>
    </div>
  );
}

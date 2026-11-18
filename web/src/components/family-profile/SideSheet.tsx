import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface Props {
  title: string;
  subtitle?: ReactNode;
  badge?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}

/** A file panel that slides in from the page edge; Escape or the backdrop closes it. */
export function SideSheet({ title, subtitle, badge, onClose, children }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current(); };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);

  return createPortal(
    <div dir="rtl" className="fp-root fixed inset-0 z-50 flex justify-end" style={{ background: 'transparent' }}>
      <button
        type="button"
        aria-label="إغلاق"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-slate-950/45 backdrop-blur-[2px]"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="fp-sheet relative flex h-full w-full max-w-[520px] flex-col shadow-2xl focus:outline-none"
        style={{ backgroundColor: 'var(--fp-card)' }}
      >
        <header className="flex items-start justify-between gap-3 border-b px-6 py-5" style={{ borderColor: 'var(--fp-border)' }}>
          <div className="min-w-0">
            {badge}
            <h2 className="mt-1 text-lg font-bold" style={{ color: 'var(--fp-ink)' }}>{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs" style={{ color: 'var(--fp-ink-3)' }}>{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition hover:opacity-80"
            style={{ borderColor: 'var(--fp-border)', color: 'var(--fp-ink-2)' }}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/** Label/value grid used inside file panels. */
export function SheetFacts({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-3">
      {items.map((item) => (
        <div key={item.label} className="rounded-xl p-3" style={{ backgroundColor: 'var(--fp-muted)' }}>
          <dt className="text-[11px] font-medium" style={{ color: 'var(--fp-ink-3)' }}>{item.label}</dt>
          <dd className="mt-1 text-sm font-bold" style={{ color: 'var(--fp-ink)' }}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SheetSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6">
      <h3 className="mb-3 text-sm font-bold" style={{ color: 'var(--fp-ink)' }}>{title}</h3>
      {children}
    </section>
  );
}

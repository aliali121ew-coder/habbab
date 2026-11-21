import { useEffect, useRef, useState } from 'react';
import {
  Archive, ChevronLeft, ClipboardCheck, HandCoins,
  Home, MoreVertical, Pencil, Printer,
} from 'lucide-react';

interface Props {
  onRecordPayment: () => void;
  onAddVisit: () => void;
  onPrint: () => void;
  onEdit: () => void;
  onArchive: () => void;
}

export function PageHeader({
  onRecordPayment,
  onAddVisit,
  onPrint,
  onEdit,
  onArchive,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onPointer = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {/* On the phone the top bar already shows the path; this second copy shows on a computer only. */}
      <nav aria-label="مسار التنقل" className="hidden md:flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--fp-ink-3)' }}>
        <a href="#/" className="tap inline-flex items-center gap-1 transition hover:opacity-80" style={{ color: 'var(--fp-primary)' }}>
          <Home className="h-3.5 w-3.5" aria-hidden />
          <span>الرئيسية</span>
        </a>
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
        <a href="#/families" className="tap font-semibold transition hover:underline" style={{ color: 'var(--fp-ink)' }}>
          العوائل
        </a>
      </nav>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onAddVisit}
          className="inline-flex h-10 items-center gap-2 rounded-xl border px-3.5 text-xs font-semibold transition hover:opacity-90"
          style={{
            backgroundColor: 'var(--fp-card)',
            borderColor: 'var(--fp-border)',
            color: 'var(--fp-ink)',
          }}
        >
          <ClipboardCheck className="h-4 w-4" style={{ color: 'var(--fp-primary)' }} aria-hidden />
          <span>إضافة زيارة</span>
        </button>

        <button
          type="button"
          onClick={onRecordPayment}
          className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-xs font-semibold text-white shadow-sm transition hover:brightness-105"
          style={{
            backgroundImage: 'linear-gradient(270deg, var(--fp-primary), var(--fp-primary-2))',
            boxShadow: '0 8px 18px -8px color-mix(in srgb, var(--fp-primary) 70%, transparent)',
          }}
        >
          <HandCoins className="h-4 w-4" aria-hidden />
          <span>تسجيل دفعة</span>
        </button>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            aria-label="المزيد من الإجراءات"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((prev) => !prev)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border transition"
            style={{
              backgroundColor: 'var(--fp-card)',
              borderColor: 'var(--fp-border)',
              color: 'var(--fp-ink-2)',
            }}
          >
            <MoreVertical className="h-4 w-4" aria-hidden />
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute end-0 z-30 mt-1.5 w-44 rounded-2xl border p-1.5 shadow-xl"
              style={{
                backgroundColor: 'var(--fp-card)',
                borderColor: 'var(--fp-border)',
              }}
            >
              {[
                { label: 'تعديل البيانات', icon: Pencil, action: onEdit },
                { label: 'طباعة / حفظ PDF', icon: Printer, action: onPrint },
                { label: 'أرشفة الملف', icon: Archive, action: onArchive, danger: true },
              ].map((item) => (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    item.action();
                  }}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition hover:opacity-80"
                  style={{ color: item.danger ? 'var(--fp-rose)' : 'var(--fp-ink)' }}
                >
                  <item.icon className="h-3.5 w-3.5" aria-hidden />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

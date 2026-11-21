import { useEffect, useRef, useState } from 'react';
import { Check, MessageCircle, Phone, Search, UserCheck } from 'lucide-react';
import type { CaseOfficer } from '../../types/family';
import { InitialsAvatar } from '../shared/InitialsAvatar';

interface Props {
  officer: CaseOfficer;
  officers: CaseOfficer[];
  onChangeOfficer: (officer: CaseOfficer) => void;
  onCopyPhone: (phone: string) => void;
}

export function CaseOfficerCard({ officer, officers, onChangeOfficer, onCopyPhone }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pickerOpen) return undefined;
    const onPointer = (e: PointerEvent) => {
      if (!popRef.current?.contains(e.target as Node)) setPickerOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPickerOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [pickerOpen]);

  const filtered = officers.filter((o) =>
    `${o.name} ${o.zone} ${o.phone}`.includes(query.trim()),
  );

  const digits = officer.phone.replace(/\D/g, '');
  const waHref = `https://wa.me/${digits.startsWith('0') ? `964${digits.slice(1)}` : digits}`;

  return (
    <div
      className="relative flex flex-col justify-between gap-4 rounded-2xl border p-4"
      style={{
        backgroundColor: 'var(--fp-muted)',
        borderColor: 'var(--fp-border)',
      }}
      ref={popRef}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: 'var(--fp-ink-3)' }}>
          <UserCheck className="h-3.5 w-3.5" style={{ color: 'var(--fp-primary)' }} aria-hidden />
          المندوب المسؤول
        </span>

        <button
          type="button"
          onClick={() => { setPickerOpen((p) => !p); setQuery(''); }}
          className="-my-2 py-2 text-xs font-semibold transition hover:underline"
          style={{ color: 'var(--fp-primary)' }}
        >
          تغيير المندوب
        </button>
      </div>

      {/* On narrow phones the call buttons drop under the name rather than squeeze it onto two lines. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 basis-[14rem] items-center gap-3">
          <InitialsAvatar initials={officer.initials} size="lg" shape="circle" tone="primary" />
          <div className="min-w-0">
            <a href={`#/delegates/${officer.id}`} className="tap block whitespace-nowrap text-[clamp(13px,4vw,14px)] font-bold leading-snug hover:underline" style={{ color: 'var(--fp-ink)' }}>
              {officer.name}
            </a>
            <p className="truncate text-xs" style={{ color: 'var(--fp-ink-3)' }}>
              {officer.zone}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <a
            href={`tel:${digits}`}
            aria-label={`اتصال بـ ${officer.name}`}
            title={officer.phone}
            onClick={() => onCopyPhone(officer.phone)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border transition hover:opacity-85"
            style={{
              backgroundColor: 'var(--fp-card)',
              borderColor: 'var(--fp-border)',
              color: 'var(--fp-ink-2)',
            }}
          >
            <Phone className="h-4 w-4" aria-hidden />
          </a>

          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`واتساب ${officer.name}`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border transition hover:opacity-85"
            style={{
              backgroundColor: 'var(--fp-card)',
              borderColor: 'var(--fp-border)',
              color: 'var(--fp-emerald)',
            }}
          >
            <MessageCircle className="h-4 w-4" aria-hidden />
          </a>

        </div>
      </div>

      {/* Searchable Command Combobox for Reassigning Officer */}
      {pickerOpen && (
        <div
          role="dialog"
          aria-label="اختيار المندوب المسؤول"
          className="absolute inset-x-0 top-full z-30 mt-2 rounded-2xl border p-2.5 shadow-xl"
          style={{
            backgroundColor: 'var(--fp-card)',
            borderColor: 'var(--fp-border)',
          }}
        >
          <div
            className="flex items-center gap-2 rounded-xl border px-2.5 py-1.5"
            style={{
              backgroundColor: 'var(--fp-muted)',
              borderColor: 'var(--fp-border)',
            }}
          >
            <Search className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--fp-ink-3)' }} aria-hidden />
            <input
              type="search"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث باسم المندوب أو المنطقة..."
              className="w-full bg-transparent text-xs focus:outline-none"
              style={{ color: 'var(--fp-ink)' }}
            />
          </div>

          <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
            {filtered.map((item) => {
              const active = item.id === officer.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChangeOfficer(item);
                      setPickerOpen(false);
                    }}
                    className="flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-start text-xs transition"
                    style={{
                      backgroundColor: active ? 'var(--fp-primary-soft)' : 'transparent',
                      color: active ? 'var(--fp-primary)' : 'var(--fp-ink)',
                    }}
                  >
                    <span className="flex items-center gap-2">
                      <InitialsAvatar initials={item.initials} size="sm" shape="circle" tone="primary" />
                      <span>
                        <b className="block">{item.name}</b>
                        <small style={{ color: 'var(--fp-ink-3)' }}>{item.zone}</small>
                      </span>
                    </span>
                    {active && <Check className="h-4 w-4 shrink-0" aria-hidden />}
                  </button>
                </li>
              );
            })}
            {filtered.length === 0 && (
              <li className="py-3 text-center text-xs" style={{ color: 'var(--fp-ink-3)' }}>
                لا يوجد مندوب مطابق
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

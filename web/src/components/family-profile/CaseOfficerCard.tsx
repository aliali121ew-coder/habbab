import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, MapPin, Phone, Search, Star, UserCheck } from 'lucide-react';
import { loadFamiliesStore } from '../../data/families';
import { WhatsAppMark } from '../../pages/subscribers/WhatsAppButton';
import type { CaseOfficer } from '../../types/family';
import { DelegateAvatar } from '../families/DelegateChip';

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

  const followedCount = useMemo(() => {
    const store = loadFamiliesStore();
    const count = store.filter((f: { delegate?: { id?: number; name?: string } }) => (
      f.delegate?.id === officer.id || f.delegate?.name === officer.name
    )).length;
    return Math.max(count, 1);
  }, [officer.id, officer.name]);

  const filtered = officers.filter((o) =>
    `${o.name} ${o.zone} ${o.phone}`.includes(query.trim()),
  );

  const digits = officer.phone.replace(/\D/g, '');
  const waHref = `https://wa.me/${digits.startsWith('0') ? `964${digits.slice(1)}` : digits}`;

  return (
    <div
      ref={popRef}
      className="fp-officer-card relative flex h-full flex-col justify-between gap-4 rounded-[18px] p-5"
    >
      {/* Top row */}
      <div className="flex items-center justify-between gap-2">
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--bar-active) 12%, transparent)',
            color: 'var(--bar-active)',
          }}
        >
          <UserCheck className="h-3.5 w-3.5" aria-hidden />
          المندوب المسؤول
        </span>

        {/* Only the manager has the list of delegates (a delegate gets none). */}
        {officers.length > 0 && (
        <button
          type="button"
          onClick={() => { setPickerOpen((p) => !p); setQuery(''); }}
          className="rounded-lg border px-2.5 py-1 text-xs font-bold transition hover:opacity-85"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--fp-card) 75%, transparent)',
            borderColor: 'var(--fp-border)',
            color: 'var(--fp-ink-2)',
          }}
        >
          تغيير المندوب
        </button>
        )}
      </div>

      {/* Delegate profile */}
      <div className="flex items-center gap-3.5">
        <div className="relative shrink-0">
          <div
            className="rounded-full p-0.5"
            style={{ background: 'color-mix(in srgb, var(--bar-active) 24%, transparent)' }}
          >
            <DelegateAvatar
              delegate={{ id: officer.id, name: officer.name }}
              size="md"
            />
          </div>
          <span
            className="absolute -bottom-0.5 -left-0.5 h-3 w-3 rounded-full bg-emerald-500 ring-2"
            style={{ boxShadow: '0 0 0 2px var(--fp-card)' }}
            aria-hidden
          />
        </div>
        <div className="min-w-0">
          <a
            href={`#/delegates/${officer.id}`}
            className="block truncate text-base font-extrabold no-underline transition hover:opacity-80"
            style={{ color: 'var(--fp-ink)' }}
          >
            {officer.name}
          </a>
          <p className="mt-0.5 flex items-center gap-1 truncate text-xs" style={{ color: 'var(--fp-ink-3)' }}>
            <MapPin className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--bar-active)' }} aria-hidden />
            {officer.zone}
          </p>
        </div>
      </div>

      {/* 2 theme-matched mini-stats */}
      <div className="grid grid-cols-2 gap-2.5">
        <div
          className="rounded-xl border px-3 py-2.5"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--fp-card) 70%, var(--fp-muted))',
            borderColor: 'var(--fp-border)',
          }}
        >
          <span className="block text-[11px] font-medium" style={{ color: 'var(--fp-ink-3)' }}>
            العوائل المتابعة
          </span>
          <strong className="mt-1 block text-sm font-extrabold tabular-nums" style={{ color: 'var(--fp-ink)' }}>
            {followedCount} {followedCount === 1 ? 'عائلة' : 'عوائل'}
          </strong>
        </div>
        <div
          className="rounded-xl border px-3 py-2.5"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--fp-card) 70%, var(--fp-muted))',
            borderColor: 'var(--fp-border)',
          }}
        >
          <span className="block text-[11px] font-medium" style={{ color: 'var(--fp-ink-3)' }}>
            تقييم الاستجابة
          </span>
          <strong className="mt-1 inline-flex items-center gap-1 text-sm font-extrabold tabular-nums" style={{ color: 'var(--fp-emerald)' }}>
            <Star className="h-3.5 w-3.5 fill-current" aria-hidden />
            4.9
          </strong>
        </div>
      </div>

      {/* Bottom 2 CTA buttons */}
      <div className="grid grid-cols-2 gap-2.5">
        <a
          href={`tel:${digits}`}
          onClick={() => onCopyPhone(officer.phone)}
          title={officer.phone}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-bold no-underline shadow-xs transition hover:opacity-85"
          style={{
            backgroundColor: 'var(--fp-card)',
            borderColor: 'var(--fp-border)',
            color: 'var(--fp-ink)',
          }}
        >
          <Phone className="h-3.5 w-3.5" style={{ color: 'var(--bar-active)' }} aria-hidden />
          اتصال مباشر
        </a>
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 text-xs font-bold text-white no-underline shadow-xs transition hover:bg-emerald-700"
        >
          <WhatsAppMark />
          واتساب
        </a>
      </div>

      {/* Searchable Command Combobox for Reassigning Officer */}
      {pickerOpen && (
        <div
          role="dialog"
          aria-label="اختيار المندوب المسؤول"
          className="absolute inset-x-0 top-full z-40 mt-2 rounded-2xl border p-2.5 shadow-2xl"
          style={{
            backgroundColor: 'var(--fp-card)',
            borderColor: 'var(--fp-border)',
            color: 'var(--fp-ink)',
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

          <ul className="mt-2 max-h-52 space-y-1 overflow-y-auto">
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
                      <DelegateAvatar delegate={{ id: item.id, name: item.name }} size="sm" />
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

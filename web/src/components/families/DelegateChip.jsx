import { MessageCircle, Phone } from 'lucide-react';
import { whatsappUrl } from '../../utils/format';

const AVATAR_TONES = [
  'bg-blue-600/10 text-blue-700',
  'bg-indigo-600/10 text-indigo-700',
  'bg-sky-600/10 text-sky-700',
  'bg-emerald-600/10 text-emerald-700',
  'bg-slate-600/10 text-slate-700',
];

export function DelegateAvatar({ delegate, size = 'sm' }) {
  const tone = AVATAR_TONES[(delegate?.id ?? 0) % AVATAR_TONES.length];
  const dim = size === 'md' ? 'h-9 w-9 text-xs' : 'h-7 w-7 text-[11px]';

  if (delegate?.avatar) {
    return (
      <img
        src={delegate.avatar}
        alt={delegate.name}
        className={`${dim} shrink-0 rounded-full object-cover ring-1 ring-slate-200`}
      />
    );
  }

  const initial = delegate?.name?.trim()?.charAt(0) || 'م';
  return (
    <span
      className={`${dim} ${tone} inline-flex shrink-0 items-center justify-center rounded-full font-bold ring-1 ring-slate-200/80`}
      aria-hidden
    >
      {initial}
    </span>
  );
}

export function DelegateChip({ delegate, compact = false }) {
  if (!delegate) return null;

  return (
    <div
      className={`flex items-center justify-between gap-2 rounded-xl bg-slate-50 ${
        compact ? 'px-3 py-2' : 'px-3.5 py-2.5'
      } border border-slate-200/60`}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <DelegateAvatar delegate={delegate} size={compact ? 'sm' : 'md'} />
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-slate-800">{delegate.name}</p>
          <p className="truncate text-[11px] text-slate-500 tabular-nums" dir="ltr">
            {delegate.phone}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <a
          href={`tel:${delegate.phone.replace(/\s+/g, '')}`}
          aria-label={`اتصال بالمندوب ${delegate.name}`}
          title="اتصال هاتفي"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200/80 bg-white text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600 focus-visible:outline-2 focus-visible:outline-blue-600"
        >
          <Phone className="h-3.5 w-3.5" aria-hidden />
        </a>
        <a
          href={whatsappUrl(delegate.phone)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`مراسلة ${delegate.name} على واتساب`}
          title="واتساب"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200/80 bg-white text-emerald-600 transition hover:border-emerald-200 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-emerald-600"
        >
          <MessageCircle className="h-3.5 w-3.5" aria-hidden />
        </a>
      </div>
    </div>
  );
}

import { ArrowRight, Hammer } from 'lucide-react';
import { SOON_PAGES } from '../soonPages';

/** Placeholder for sections that are in the menu but not built yet. */
export function ComingSoonPage({ slug }: { slug: string }) {
  const page = SOON_PAGES.find((p) => p.slug === slug);
  const Icon = page?.icon ?? Hammer;

  return (
    <div dir="rtl" className="fp-root -mx-[14px] -my-3 grid min-h-[calc(100dvh-56px)] place-items-center px-4 py-10 md:-mx-[18px]">
      <div className="fp-card w-full max-w-md p-8 text-center">
        <span
          className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-2xl"
          style={{ backgroundColor: 'var(--fp-primary-soft)', color: 'var(--fp-primary)' }}
          aria-hidden
        >
          <Icon size={30} />
        </span>
        <h1 className="mt-5 text-xl font-bold" style={{ color: 'var(--fp-ink)' }}>{page?.label ?? 'قسم جديد'}</h1>
        <span
          className="mt-2 inline-flex rounded-full px-3 py-1 text-xs font-bold"
          style={{ backgroundColor: 'var(--fp-amber-soft)', color: 'var(--fp-amber)' }}
        >
          قيد التطوير
        </span>
        <p className="mt-4 text-sm leading-relaxed" style={{ color: 'var(--fp-ink-2)' }}>
          {page?.hint ?? 'هذا القسم سيُضاف قريباً.'}
        </p>
        <a
          href="#/"
          className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-bold no-underline"
          style={{ backgroundColor: 'var(--fp-primary)', color: 'var(--fp-card)' }}
        >
          <ArrowRight size={16} aria-hidden /> العودة إلى الرئيسية
        </a>
      </div>
    </div>
  );
}

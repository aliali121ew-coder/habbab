import { useState } from 'react';
import { ChevronDown, ChevronLeft, FileText } from 'lucide-react';
import { formatIQDText } from '../../mock/family';
import type { AidSource, FamilyMember } from '../../types/family';
import { InitialsAvatar } from '../shared/InitialsAvatar';
import { useBranding } from '../../branding';
import { OrgLogo, orgTone } from './AidSections';

// Short tag for each of the foundation's programs.
const PROGRAM_TAGS: Record<string, string> = {
  'int-salary': 'راتب',
  'int-aid': 'مساعدة مالية',
  'int-medicine': 'أدوية',
  'int-checkups': 'كشفيات',
};

interface Column {
  key: string;
  name: string;
  subtitle: string;
  tone: { bg: string; color: string };
  logo: React.ReactNode;
  paused: boolean;
  people: { member: FamilyMember; tags: string[] }[];
  onOpen: () => void;
}

interface Props {
  members: FamilyMember[];
  internal: AidSource[];
  external: AidSource[];
  onOpenFoundation: () => void;
  onOpenSource: (source: AidSource) => void;
  onOpenMember: (member: FamilyMember) => void;
}

const countPeople = (n: number) => (n === 1 ? 'فرد واحد' : n === 2 ? 'فردان' : `${n} أفراد`);

/** One column per organization, holding the family members it helps. */
export function AidBoard({ members, internal, external, onOpenFoundation, onOpenSource, onOpenMember }: Props) {
  const brand = useBranding();
  const byId = new Map(members.map((m) => [m.id, m]));
  // Phone: which organization is expanded (one at a time).
  const [openKey, setOpenKey] = useState<string | null>(null);

  const foundationPeople = members
    .map((member) => ({
      member,
      tags: internal.filter((p) => p.beneficiaryIds.includes(member.id)).map((p) => PROGRAM_TAGS[p.id] ?? p.name),
    }))
    .filter((row) => row.tags.length > 0);
  const foundationDue = internal.reduce((sum, p) => sum + p.monthlyAmount, 0);

  const columns: Column[] = [
    {
      key: 'foundation',
      name: brand.name,
      subtitle: `${formatIQDText(foundationDue)} شهرياً`,
      tone: { bg: 'var(--fp-primary-soft)', color: 'var(--fp-primary)' },
      logo: brand.logo
        ? <img src={brand.logo} alt="" className="h-8 w-8 shrink-0 rounded-full border object-cover" style={{ borderColor: 'var(--fp-border)' }} />
        : <OrgLogo name={brand.name} size="sm" />,
      paused: false,
      people: foundationPeople,
      onOpen: onOpenFoundation,
    },
    ...external.map((source) => ({
      key: source.id,
      name: source.name,
      subtitle: `${formatIQDText(source.monthlyAmount)} · ${source.frequency}`,
      tone: orgTone(source.name),
      logo: <OrgLogo name={source.name} size="sm" />,
      paused: source.status === 'paused',
      people: source.beneficiaryIds
        .map((id) => byId.get(id))
        .filter((m): m is FamilyMember => Boolean(m))
        .map((member) => ({ member, tags: [source.aidType] })),
      onOpen: () => onOpenSource(source),
    })),
  ];

  const renderPeople = (column: Column) => (
    <>
    {column.people.length === 0 ? (
      <p className="rounded-xl border border-dashed p-4 text-center text-xs" style={{ borderColor: 'var(--fp-border)', color: 'var(--fp-ink-3)' }}>
        لا يوجد مستفيدون
      </p>
    ) : column.people.map(({ member, tags }) => (
      <button
        key={member.id}
        type="button"
        onClick={() => onOpenMember(member)}
        className="fp-card fp-aid-card w-full p-3"
        style={{ borderRadius: 14 }}
      >
        <span className="flex items-center gap-2.5">
          <InitialsAvatar initials={member.initials} size="sm" shape="circle" tone="neutral" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-bold" style={{ color: 'var(--fp-ink)' }}>{member.name}</span>
            <span className="block truncate text-[11px]" style={{ color: 'var(--fp-ink-3)' }}>
              {member.relation} · {member.age} سنة
            </span>
          </span>
        </span>
        <span className="mt-2.5 flex flex-wrap gap-1">
          {tags.map((tag) => (
            <span
              key={tag}
              className="rounded-md border px-1.5 py-0.5 text-[10px] font-semibold"
              style={{ borderColor: 'var(--fp-border)', color: 'var(--fp-ink-2)' }}
            >
              {tag}
            </span>
          ))}
          {member.chronic && (
            <span className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: 'var(--fp-rose-soft)', color: 'var(--fp-rose)' }}>
              {member.chronic}
            </span>
          )}
        </span>
      </button>
    ))}
    </>
  );

  return (
    <section className="fp-card p-6" aria-label="المساعدات">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold" style={{ color: 'var(--fp-ink)' }}>المساعدات حسب المؤسسة</h2>
        <p className="hidden text-xs md:block" style={{ color: 'var(--fp-ink-3)' }}>من ساعدت كل جهة من أفراد العائلة</p>
      </div>

      {/* Phone: the organizations only; tapping one opens its people underneath */}
      <ul className="mt-4 grid gap-2.5 md:hidden">
        {columns.map((column) => {
          const open = openKey === column.key;
          return (
            <li key={column.key} className="overflow-hidden rounded-2xl" style={{ backgroundColor: 'var(--fp-muted)', opacity: column.paused ? 0.75 : 1 }}>
              {/* The header opens the people underneath; the file icon beside it opens the provider's file. */}
              <div className="flex items-center" style={{ backgroundColor: column.tone.bg, borderInlineStart: `3px solid ${column.tone.color}` }}>
                <button
                  type="button"
                  onClick={() => setOpenKey(open ? null : column.key)}
                  aria-expanded={open}
                  className="flex min-h-[64px] min-w-0 flex-1 items-center gap-3 py-3 ps-3.5 pe-1 text-start"
                >
                  {column.logo}
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-bold leading-snug" style={{ color: column.tone.color }}>{column.name}</span>
                    <span className="mt-0.5 block text-xs tabular-nums" style={{ color: 'var(--fp-ink-3)' }}>
                      {column.paused ? 'متوقف حالياً' : column.subtitle} · {countPeople(column.people.length)}
                    </span>
                  </span>
                  <ChevronDown className={`h-5 w-5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} style={{ color: column.tone.color }} aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={column.onOpen}
                  aria-label={`ملف ${column.name}`}
                  title="ملف الجهة"
                  className="me-2.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition active:scale-95"
                  style={{ backgroundColor: 'color-mix(in srgb, var(--fp-card) 75%, transparent)', color: column.tone.color, boxShadow: '0 1px 2px rgb(0 0 0 / 8%)' }}
                >
                  <FileText className="h-[18px] w-[18px]" aria-hidden />
                </button>
              </div>
              {open && (
                <div className="grid gap-2.5 p-2.5">
                  {renderPeople(column)}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/* Desktop board. width:0 + min-width:100% keeps wide boards scrolling inside the card, not the page */}
      <div className="relative mt-5 hidden w-0 min-w-full overflow-x-auto pb-1 md:block">
        <div className="flex items-stretch gap-4">
          {columns.map((column) => (
            <div
              key={column.key}
              className="flex min-w-[260px] flex-1 basis-0 flex-col gap-2.5 rounded-2xl p-2.5"
              style={{ backgroundColor: 'var(--fp-muted)', opacity: column.paused ? 0.75 : 1 }}
            >
              <button
                type="button"
                onClick={column.onOpen}
                className="fp-row-button flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-start transition hover:brightness-95"
                style={{ backgroundColor: column.tone.bg, borderInlineStart: `3px solid ${column.tone.color}` }}
                aria-label={`فتح ملف ${column.name}`}
              >
                {column.logo}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold leading-snug" style={{ color: column.tone.color }}>{column.name}</span>
                  {/* The amount line may wrap (badge under it) rather than cut the amount on a tablet. */}
                  <span className="mt-0.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[11px] tabular-nums" style={{ color: 'var(--fp-ink-3)' }}>
                    <span className="min-w-0">{column.paused ? 'متوقف حالياً' : column.subtitle}</span>
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5 font-bold"
                      style={{ backgroundColor: 'var(--fp-card)', color: column.tone.color }}
                    >
                      {countPeople(column.people.length)}
                    </span>
                  </span>
                </span>
                <ChevronLeft className="h-4 w-4 shrink-0" style={{ color: column.tone.color }} aria-hidden />
              </button>

              {renderPeople(column)}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

import type { ReactNode } from 'react';
import { Building2, ChevronLeft, HandCoins, HeartHandshake, Info, MessageCircle, Phone, Pill, Repeat, Stethoscope, Wallet } from 'lucide-react';
import { formatIQDParts, formatIQDText } from '../../mock/family';
import type { AidSource, AidSourceStatus } from '../../types/family';
import { SideSheet } from './SideSheet';

export const AID_STATUS: Record<AidSourceStatus, { label: string; bg: string; color: string }> = {
  active: { label: 'منتظم', bg: 'var(--fp-emerald-soft)', color: 'var(--fp-emerald)' },
  late: { label: 'متأخر', bg: 'var(--fp-rose-soft)', color: 'var(--fp-rose)' },
  paused: { label: 'متوقف', bg: 'var(--fp-muted-2)', color: 'var(--fp-ink-3)' },
};

export const FOUNDATION_NAME = 'مؤسسة أحباب الحسين الثقافية الخيرية';

const ORG_TONES = [
  { bg: 'var(--fp-amber-soft)', color: 'var(--fp-amber)' },
  { bg: 'var(--fp-emerald-soft)', color: 'var(--fp-emerald)' },
  { bg: 'var(--fp-rose-soft)', color: 'var(--fp-rose)' },
  { bg: 'var(--fp-primary-soft)', color: 'var(--fp-primary)' },
];

const ORG_WORDS = ['مؤسسة', 'جمعية', 'شبكة', 'مستوصف'];

export const orgTone = (name: string) => ORG_TONES[[...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % ORG_TONES.length];

/** Organizations have no uploaded logos yet, so each gets a steady monogram badge. */
export function OrgLogo({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const words = name.split(' ').filter((w) => !ORG_WORDS.includes(w));
  const letter = (words[0] ?? name).replace(/^ال/, '').charAt(0);
  const tone = orgTone(name);
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold ${size === 'sm' ? 'h-8 w-8 text-sm' : 'h-12 w-12 text-lg'}`}
      style={{ backgroundColor: tone.bg, color: tone.color }}
      aria-hidden
    >
      {letter}
    </span>
  );
}

const countPrograms = (n: number) => (n === 1 ? 'برنامج واحد' : n === 2 ? 'برنامجان' : `${n} برامج`);

/** The foundation's own file: every program it runs for this family. */
// Each of the foundation's programs gets an icon that says what it pays for.
const programIcon = (name: string) => (/راتب/.test(name) ? Wallet : /دوي|دواء/.test(name) ? Pill : /كشف/.test(name) ? Stethoscope : HandCoins);

/**
 * The foundation's own aid for a family, laid out like an outside provider's panel: a header
 * (logo, name, programs, overall state), the monthly amount in large type, number of aids / last
 * receipt / total as joined facts, a note, one card per program (opens it), and every program's
 * receipts as one timeline with their total.
 */
export function FoundationSheet({ programs, onOpenProgram, onClose }: {
  programs: AidSource[];
  onOpenProgram: (program: AidSource) => void;
  onClose: () => void;
}) {
  const due = programs.reduce((sum, a) => sum + a.monthlyAmount, 0);
  const dueParts = formatIQDParts(due);
  const late = programs.filter((p) => p.status === 'late').length;
  const tone = 'var(--fp-primary)';
  // Every receipt from every program, newest first, each labelled with its program.
  const receipts = programs
    .flatMap((program) => program.history.map((record) => ({ ...record, program: program.name })))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const received = receipts.reduce((sum, r) => sum + r.amount, 0);
  const lastReceived = receipts[0]?.date ?? null;
  // Same three joined facts as an outside provider: how many aids, the last receipt, the total.
  const facts: [string, ReactNode][] = [
    ['عدد المساعدات', `${receipts.length}`],
    ['آخر استلام', <bdi key="l" dir="ltr">{lastReceived ?? '—'}</bdi>],
    ['المبلغ الكلي', formatIQDText(received)],
  ];

  return (
    <SideSheet title={FOUNDATION_NAME} onClose={onClose} bare>
      {/* Header */}
      <div className="px-6 pb-5 pt-10 text-center" style={{ backgroundImage: `linear-gradient(180deg, color-mix(in srgb, ${tone} 15%, transparent) 0%, transparent 100%)` }}>
        <img
          src="/logo.jpg"
          alt=""
          className="mx-auto h-[72px] w-[72px] rounded-full object-cover"
          style={{ boxShadow: `0 12px 26px -12px ${tone}, 0 0 0 4px var(--fp-card)` }}
        />
        <h2 className="mt-3 text-lg font-extrabold leading-snug" style={{ color: 'var(--fp-ink)' }}>{FOUNDATION_NAME}</h2>
        <div className="mt-2.5 flex flex-wrap justify-center gap-1.5">
          <span className="rounded-full px-3 py-1 text-xs font-bold" style={{ backgroundColor: `color-mix(in srgb, ${tone} 14%, transparent)`, color: tone }}>{countPrograms(programs.length)}</span>
          {late > 0
            ? <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold" style={{ backgroundColor: 'var(--fp-rose-soft)', color: 'var(--fp-rose)' }}><span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--fp-rose)' }} aria-hidden /><bdi>{late}</bdi> متأخر</span>
            : <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold" style={{ backgroundColor: 'var(--fp-emerald-soft)', color: 'var(--fp-emerald)' }}><span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--fp-emerald)' }} aria-hidden />كلها منتظمة</span>}
        </div>
      </div>

      <div className="space-y-4 px-5 pb-6">
        {/* The monthly amount, large, as on an outside provider's panel */}
        <div className="flex items-center justify-between gap-3 rounded-2xl px-4 py-4" style={{ backgroundImage: `linear-gradient(135deg, color-mix(in srgb, ${tone} 16%, var(--fp-card)), var(--fp-card))`, border: `1px solid color-mix(in srgb, ${tone} 25%, transparent)` }}>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold" style={{ color: 'var(--fp-ink-3)' }}>المستحق الشهري</p>
            <p className="mt-1 whitespace-nowrap tabular-nums" style={{ color: 'var(--fp-ink)' }}>
              <span className="text-[26px] font-extrabold leading-none"><bdi>{dueParts.value}</bdi></span>
              <span className="ms-1.5 text-xs font-semibold" style={{ color: 'var(--fp-ink-3)' }}>{dueParts.currency}</span>
            </p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold" style={{ backgroundColor: 'var(--fp-card)', color: tone, boxShadow: '0 1px 2px rgb(0 0 0 / 8%)' }}>
            <Repeat className="h-3.5 w-3.5" aria-hidden /> شهري
          </span>
        </div>

        {/* Joined facts */}
        <dl className="grid grid-cols-3 overflow-hidden rounded-2xl border text-center" style={{ borderColor: 'var(--fp-border)', backgroundColor: 'var(--fp-muted)' }}>
          {facts.map(([label, value], i) => (
            <div key={label} className={`min-w-0 px-2 py-3${i ? ' border-s' : ''}`} style={{ borderColor: 'var(--fp-border)' }}>
              <dt className="text-[11px] font-semibold" style={{ color: 'var(--fp-ink-3)' }}>{label}</dt>
              <dd className="mt-1 whitespace-nowrap text-[clamp(11.5px,3.4vw,13px)] font-extrabold tabular-nums" style={{ color: 'var(--fp-ink)' }}>{value}</dd>
            </div>
          ))}
        </dl>

        {/* Note */}
        <p className="flex gap-2.5 rounded-2xl px-4 py-3 text-xs leading-relaxed" style={{ backgroundColor: 'color-mix(in srgb, var(--fp-amber) 10%, transparent)', color: 'var(--fp-ink-2)' }}>
          <Info className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--fp-amber)' }} aria-hidden />
          <span>تُصرف من المؤسسة مباشرة عبر المندوب المسؤول، وتُسجَّل كل دفعة عند استلامها.</span>
        </p>

        {/* Programs */}
        <section>
          <h3 className="mb-2 text-xs font-bold" style={{ color: 'var(--fp-ink-3)' }}>البرامج</h3>
          <ul className="space-y-2.5">
            {programs.map((program) => {
              const done = program.paidThisMonth ?? 0;
              const p = program.monthlyAmount > 0 ? Math.min(100, Math.round((done / program.monthlyAmount) * 100)) : 0;
              const st = AID_STATUS[program.status];
              const bar = program.status === 'late' ? 'var(--fp-rose)' : 'var(--fp-emerald)';
              const Icon = programIcon(program.name);
              return (
                <li key={program.id}>
                  <button
                    type="button"
                    onClick={() => onOpenProgram(program)}
                    className="fp-aid-card flex w-full items-center gap-3 rounded-2xl border p-3.5 text-start transition hover:brightness-[.98]"
                    style={{ borderColor: 'var(--fp-border)', backgroundColor: 'var(--fp-card)' }}
                  >
                    <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: `color-mix(in srgb, ${bar} 13%, transparent)`, color: bar }}>
                      <Icon className="h-5 w-5" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-extrabold" style={{ color: 'var(--fp-ink)' }}>{program.name}</span>
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ backgroundColor: st.bg, color: st.color }}>
                          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: st.color }} aria-hidden />{st.label}
                        </span>
                      </span>
                      <span className="mt-1 flex items-baseline justify-between gap-2 text-[11px] tabular-nums" style={{ color: 'var(--fp-ink-3)' }}>
                        <span><b style={{ color: 'var(--fp-ink-2)' }}>{formatIQDText(done)}</b> من {formatIQDText(program.monthlyAmount)}</span>
                        <span className="font-bold" style={{ color: bar }}><bdi>{p}%</bdi></span>
                      </span>
                      <span className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: 'var(--fp-muted-2)' }} aria-hidden>
                        <span className="block h-full rounded-full" style={{ width: `${p}%`, backgroundColor: bar }} />
                      </span>
                    </span>
                    <ChevronLeft className="h-4 w-4 shrink-0" style={{ color: 'var(--fp-ink-3)' }} aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Receipts from all programs, as a timeline */}
        <section>
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h3 className="text-xs font-bold" style={{ color: 'var(--fp-ink-3)' }}>سجل الاستلام · <bdi>{receipts.length}</bdi> دفعات</h3>
            {received > 0 && <span className="text-xs font-bold tabular-nums" style={{ color: 'var(--fp-emerald)' }}>المجموع {formatIQDText(received)}</span>}
          </div>
          {receipts.length === 0 ? (
            <p className="rounded-2xl px-4 py-5 text-center text-xs" style={{ backgroundColor: 'var(--fp-muted)', color: 'var(--fp-ink-3)' }}>لا توجد دفعات مسجلة بعد.</p>
          ) : (
            <ol className="rounded-2xl border px-4 py-1" style={{ borderColor: 'var(--fp-border)', backgroundColor: 'var(--fp-card)' }}>
              {receipts.map((record, i) => (
                <li key={`${record.program}-${record.id}`} className="relative flex items-center gap-3 py-3 ps-6">
                  {i < receipts.length - 1 && <span className="absolute start-[7px] top-1/2 h-full w-px" style={{ backgroundColor: 'var(--fp-border)' }} aria-hidden />}
                  <span className="absolute start-0 top-1/2 h-[15px] w-[15px] -translate-y-1/2 rounded-full border-[3px]" style={{ borderColor: i === 0 ? 'var(--fp-emerald)' : 'var(--fp-border)', backgroundColor: 'var(--fp-card)' }} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-bold tabular-nums" style={{ color: 'var(--fp-ink)' }}><bdi dir="ltr">{record.date}</bdi></p>
                    <p className="text-[11px]" style={{ color: 'var(--fp-ink-3)' }}>{record.program}</p>
                  </div>
                  <b className="shrink-0 rounded-lg px-2 py-1 text-[13px] tabular-nums" style={{ backgroundColor: 'var(--fp-emerald-soft)', color: 'var(--fp-emerald)' }}>{formatIQDText(record.amount)}</b>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </SideSheet>
  );
}

/**
 * One aid provider in a family's file: a header (the provider's icon, name, kind, aid type and
 * status), the payment amount in large type with how often it comes, joined facts, the note,
 * the contact person with call and WhatsApp, and the receipts as a timeline with their total.
 */
export function AidSourceSheet({ source, onClose }: { source: AidSource; onClose: () => void }) {
  const internal = source.kind === 'internal';
  const status = AID_STATUS[source.status];
  const tone = internal ? 'var(--fp-primary)' : 'var(--fp-violet, #7c3aed)';
  const amount = formatIQDParts(source.monthlyAmount);
  const received = source.history.reduce((sum, r) => sum + r.amount, 0);
  const digits = source.contact?.phone.replace(/\D/g, '') ?? '';
  const wa = digits ? `https://wa.me/${digits.startsWith('0') ? `964${digits.slice(1)}` : digits}` : '';
  const Icon = internal ? HeartHandshake : Building2;
  // Three joined facts, read right to left: how many aids, the last receipt, the total received.
  const facts: [string, ReactNode][] = [
    ['عدد المساعدات', `${source.history.length}`],
    ['آخر استلام', <bdi key="l" dir="ltr">{source.lastReceived ?? '—'}</bdi>],
    ['المبلغ الكلي', formatIQDText(received)],
  ];

  return (
    <SideSheet title={source.name} onClose={onClose} bare>
      {/* Header */}
      <div className="px-6 pb-5 pt-10 text-center" style={{ backgroundImage: `linear-gradient(180deg, color-mix(in srgb, ${tone} 15%, transparent) 0%, transparent 100%)` }}>
        <span
          className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-2xl text-white"
          style={{ backgroundImage: `linear-gradient(145deg, color-mix(in srgb, ${tone} 70%, #fff), ${tone})`, boxShadow: `0 12px 26px -12px ${tone}, 0 0 0 4px var(--fp-card)` }}
          aria-hidden
        >
          <Icon className="h-8 w-8" />
        </span>
        <h2 className="mt-3 text-xl font-extrabold leading-snug" style={{ color: 'var(--fp-ink)' }}>{source.name}</h2>
        <div className="mt-2.5 flex flex-wrap justify-center gap-1.5">
          <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold" style={{ backgroundColor: status.bg, color: status.color }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: status.color }} aria-hidden />{status.label}
          </span>
          <span className="rounded-full px-3 py-1 text-xs font-bold" style={{ backgroundColor: `color-mix(in srgb, ${tone} 14%, transparent)`, color: tone }}>{internal ? 'برنامج المؤسسة' : 'جهة خارجية'}</span>
          <span className="rounded-full px-3 py-1 text-xs font-bold" style={{ backgroundColor: 'var(--fp-muted)', color: 'var(--fp-ink-2)' }}>{source.aidType}</span>
        </div>
      </div>

      <div className="space-y-4 px-5 pb-6">
        {/* The amount, large, with how often it comes */}
        <div className="flex items-center justify-between gap-3 rounded-2xl px-4 py-4" style={{ backgroundImage: `linear-gradient(135deg, color-mix(in srgb, ${tone} 16%, var(--fp-card)), var(--fp-card))`, border: `1px solid color-mix(in srgb, ${tone} 25%, transparent)` }}>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold" style={{ color: 'var(--fp-ink-3)' }}>{internal ? 'المستحق الشهري' : 'قيمة الدفعة'}</p>
            <p className="mt-1 whitespace-nowrap tabular-nums" style={{ color: 'var(--fp-ink)' }}>
              <span className="text-[26px] font-extrabold leading-none"><bdi>{amount.value}</bdi></span>
              <span className="ms-1.5 text-xs font-semibold" style={{ color: 'var(--fp-ink-3)' }}>{amount.currency}</span>
            </p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold" style={{ backgroundColor: 'var(--fp-card)', color: tone, boxShadow: '0 1px 2px rgb(0 0 0 / 8%)' }}>
            <Repeat className="h-3.5 w-3.5" aria-hidden /> {source.frequency}
          </span>
        </div>

        {/* Joined facts */}
        <dl className="grid grid-cols-3 overflow-hidden rounded-2xl border text-center" style={{ borderColor: 'var(--fp-border)', backgroundColor: 'var(--fp-muted)' }}>
          {facts.map(([label, value], i) => (
            <div key={label} className={`min-w-0 px-2 py-3${i ? ' border-s' : ''}`} style={{ borderColor: 'var(--fp-border)' }}>
              <dt className="text-[11px] font-semibold" style={{ color: 'var(--fp-ink-3)' }}>{label}</dt>
              <dd className="mt-1 whitespace-nowrap text-[clamp(11.5px,3.4vw,13px)] font-extrabold tabular-nums" style={{ color: 'var(--fp-ink)' }}>{value}</dd>
            </div>
          ))}
        </dl>

        {/* Note */}
        <p className="flex gap-2.5 rounded-2xl px-4 py-3 text-xs leading-relaxed" style={{ backgroundColor: 'color-mix(in srgb, var(--fp-amber) 10%, transparent)', color: 'var(--fp-ink-2)' }}>
          <Info className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--fp-amber)' }} aria-hidden />
          <span>{source.note}</span>
        </p>

        {/* Contact */}
        {source.contact && (
          <section>
            <h3 className="mb-2 text-xs font-bold" style={{ color: 'var(--fp-ink-3)' }}>جهة الاتصال</h3>
            <div className="flex items-center gap-3 rounded-2xl border p-3" style={{ borderColor: 'var(--fp-border)', backgroundColor: 'var(--fp-card)' }}>
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-extrabold" style={{ backgroundColor: `color-mix(in srgb, ${tone} 14%, transparent)`, color: tone }} aria-hidden>
                {/* A department (قسم …) gets an icon; a person gets two initials. */}
                {/^قسم\s/.test(source.contact.person)
                  ? <Building2 className="h-5 w-5" />
                  : source.contact.person.replace(/^(أبو|أم|د\.)\s+/, '').trim().split(/\s+/).filter((w) => /^[؀-ۿ]/.test(w)).slice(0, 2).map((w) => w.charAt(0)).join(' ')}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold leading-snug" style={{ color: 'var(--fp-ink)' }}>{source.contact.person}</p>
                <p className="text-xs tabular-nums" style={{ color: 'var(--fp-ink-3)' }} dir="ltr">{source.contact.phone}</p>
              </div>
              <a href={`tel:${digits}`} aria-label={`اتصال بـ ${source.contact.person}`} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: 'var(--fp-primary-soft)', color: 'var(--fp-primary)' }}>
                <Phone className="h-4 w-4" aria-hidden />
              </a>
              <a href={wa} target="_blank" rel="noreferrer" aria-label={`مراسلة ${source.contact.person} على واتساب`} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: 'color-mix(in srgb, #25d366 14%, transparent)', color: '#1fa855' }}>
                <MessageCircle className="h-4 w-4" aria-hidden />
              </a>
            </div>
          </section>
        )}

        {/* Receipts as a timeline */}
        <section>
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h3 className="text-xs font-bold" style={{ color: 'var(--fp-ink-3)' }}>سجل الاستلام · <bdi>{source.history.length}</bdi> دفعات</h3>
            {received > 0 && <span className="text-xs font-bold tabular-nums" style={{ color: 'var(--fp-emerald)' }}>المجموع {formatIQDText(received)}</span>}
          </div>
          {source.history.length === 0 ? (
            <p className="rounded-2xl px-4 py-5 text-center text-xs" style={{ backgroundColor: 'var(--fp-muted)', color: 'var(--fp-ink-3)' }}>لا توجد دفعات مسجلة بعد.</p>
          ) : (
            <ol className="rounded-2xl border px-4 py-1" style={{ borderColor: 'var(--fp-border)', backgroundColor: 'var(--fp-card)' }}>
              {source.history.map((record, i) => (
                <li key={record.id} className="relative flex items-center gap-3 py-3 ps-6">
                  {/* the line through the dots */}
                  {i < source.history.length - 1 && <span className="absolute start-[7px] top-1/2 h-full w-px" style={{ backgroundColor: 'var(--fp-border)' }} aria-hidden />}
                  <span className="absolute start-0 top-1/2 h-[15px] w-[15px] -translate-y-1/2 rounded-full border-[3px]" style={{ borderColor: i === 0 ? 'var(--fp-emerald)' : 'var(--fp-border)', backgroundColor: 'var(--fp-card)' }} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-bold tabular-nums" style={{ color: 'var(--fp-ink)' }}><bdi dir="ltr">{record.date}</bdi></p>
                    <p className="truncate text-[11px]" style={{ color: 'var(--fp-ink-3)' }}>{record.note}</p>
                  </div>
                  <b className="shrink-0 rounded-lg px-2 py-1 text-[13px] tabular-nums" style={{ backgroundColor: 'var(--fp-emerald-soft)', color: 'var(--fp-emerald)' }}>{formatIQDText(record.amount)}</b>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </SideSheet>
  );
}

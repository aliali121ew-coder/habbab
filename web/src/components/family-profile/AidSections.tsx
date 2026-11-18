import { ArrowLeft, Phone } from 'lucide-react';
import { formatIQDText } from '../../mock/family';
import type { AidSource, AidSourceStatus } from '../../types/family';
import { SheetFacts, SheetSection, SideSheet } from './SideSheet';

export const AID_STATUS: Record<AidSourceStatus, { label: string; bg: string; color: string }> = {
  active: { label: 'منتظم', bg: 'var(--fp-emerald-soft)', color: 'var(--fp-emerald)' },
  late: { label: 'متأخر', bg: 'var(--fp-rose-soft)', color: 'var(--fp-rose)' },
  paused: { label: 'متوقف', bg: 'var(--fp-muted-2)', color: 'var(--fp-ink-3)' },
};

function StatusChip({ status }: { status: AidSourceStatus }) {
  const meta = AID_STATUS[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold"
      style={{ backgroundColor: meta.bg, color: meta.color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: meta.color }} aria-hidden />
      {meta.label}
    </span>
  );
}

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
export function FoundationSheet({ programs, onOpenProgram, onClose }: {
  programs: AidSource[];
  onOpenProgram: (program: AidSource) => void;
  onClose: () => void;
}) {
  const due = programs.reduce((sum, a) => sum + a.monthlyAmount, 0);
  const paid = programs.reduce((sum, a) => sum + (a.paidThisMonth ?? 0), 0);
  return (
    <SideSheet title={FOUNDATION_NAME} subtitle={`${countPrograms(programs.length)} لهذه العائلة`} onClose={onClose}>
      <SheetFacts
        items={[
          { label: 'المستحق الشهري', value: formatIQDText(due) },
          { label: 'المصروف هذا الشهر', value: formatIQDText(paid) },
        ]}
      />
      <SheetSection title="البرامج">
        <ul className="space-y-2">
          {programs.map((program) => {
            const done = program.paidThisMonth ?? 0;
            const pct = program.monthlyAmount > 0 ? Math.min(100, Math.round((done / program.monthlyAmount) * 100)) : 0;
            return (
              <li key={program.id}>
                <button
                  type="button"
                  onClick={() => onOpenProgram(program)}
                  className="fp-aid-card flex w-full items-center gap-3 rounded-xl border p-3.5"
                  style={{ borderColor: 'var(--fp-border)' }}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold" style={{ color: 'var(--fp-ink)' }}>{program.name}</span>
                      <StatusChip status={program.status} />
                    </span>
                    <span className="mt-1 flex justify-between text-[11px] tabular-nums" style={{ color: 'var(--fp-ink-3)' }}>
                      <span>{formatIQDText(done)} من {formatIQDText(program.monthlyAmount)}</span>
                      <span>{pct}%</span>
                    </span>
                    <span className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: 'var(--fp-muted-2)' }}>
                      <span
                        className="block h-full rounded-full"
                        style={{ width: `${pct}%`, backgroundColor: program.status === 'late' ? 'var(--fp-rose)' : 'var(--fp-emerald)' }}
                      />
                    </span>
                  </span>
                  <ArrowLeft className="h-4 w-4 shrink-0" style={{ color: 'var(--fp-ink-3)' }} aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      </SheetSection>
    </SideSheet>
  );
}

export function AidSourceSheet({ source, onClose }: { source: AidSource; onClose: () => void }) {
  const internal = source.kind === 'internal';
  const facts = [
    { label: internal ? 'المستحق الشهري' : 'قيمة الدفعة', value: formatIQDText(source.monthlyAmount) },
    internal
      ? { label: 'المصروف هذا الشهر', value: formatIQDText(source.paidThisMonth ?? 0) }
      : { label: 'التكرار', value: source.frequency },
    { label: 'بداية الدعم', value: <bdi dir="ltr">{source.since}</bdi> },
    { label: 'آخر استلام', value: <bdi dir="ltr">{source.lastReceived ?? '—'}</bdi> },
  ];

  return (
    <SideSheet
      title={source.name}
      subtitle={`${internal ? 'برنامج المؤسسة' : 'جهة خارجية'} · ${source.aidType}`}
      badge={<StatusChip status={source.status} />}
      onClose={onClose}
    >
      <SheetFacts items={facts} />

      <p className="mt-4 rounded-xl border px-3.5 py-3 text-xs leading-relaxed" style={{ borderColor: 'var(--fp-border)', color: 'var(--fp-ink-2)' }}>
        {source.note}
      </p>

      {source.contact && (
        <SheetSection title="جهة الاتصال">
          <div className="flex items-center justify-between gap-3 rounded-xl p-3" style={{ backgroundColor: 'var(--fp-muted)' }}>
            <div>
              <p className="text-sm font-bold" style={{ color: 'var(--fp-ink)' }}>{source.contact.person}</p>
              <p className="text-xs tabular-nums" style={{ color: 'var(--fp-ink-3)' }} dir="ltr">{source.contact.phone}</p>
            </div>
            <a
              href={`tel:${source.contact.phone.replace(/\D/g, '')}`}
              aria-label={`اتصال بـ ${source.contact.person}`}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border"
              style={{ backgroundColor: 'var(--fp-card)', borderColor: 'var(--fp-border)', color: 'var(--fp-ink-2)' }}
            >
              <Phone className="h-4 w-4" aria-hidden />
            </a>
          </div>
        </SheetSection>
      )}

      <SheetSection title={`سجل الاستلام (${source.history.length})`}>
        {source.history.length === 0 ? (
          <p className="text-xs" style={{ color: 'var(--fp-ink-3)' }}>لا توجد دفعات مسجلة بعد.</p>
        ) : (
          <ol className="divide-y rounded-xl border" style={{ borderColor: 'var(--fp-border)' }}>
            {source.history.map((record) => (
              <li key={record.id} className="flex items-center justify-between gap-3 px-3.5 py-3" style={{ borderColor: 'var(--fp-border)' }}>
                <div className="min-w-0">
                  <p className="text-xs font-bold" style={{ color: 'var(--fp-ink)' }}>
                    <bdi dir="ltr" className="tabular-nums">{record.date}</bdi>
                  </p>
                  <p className="truncate text-[11px]" style={{ color: 'var(--fp-ink-3)' }}>{record.note}</p>
                </div>
                <b className="shrink-0 text-sm tabular-nums" style={{ color: 'var(--fp-ink)' }}>{formatIQDText(record.amount)}</b>
              </li>
            ))}
          </ol>
        )}
      </SheetSection>
    </SideSheet>
  );
}

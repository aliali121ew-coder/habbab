import { Copy, Home, MapPin, Phone, UserCheck, Users } from 'lucide-react';
import { WhatsAppMark } from '../../pages/subscribers/WhatsAppButton';
import { formatIQDParts, formatIQDText } from '../../mock/family';
import type { CaseOfficer, FamilyDetail, FamilyPriority } from '../../types/family';
import { CaseOfficerCard } from './CaseOfficerCard';

interface Props {
  family: FamilyDetail;
  officers: CaseOfficer[];
  onCopy: (text: string, label: string) => void;
  onChangeOfficer: (officer: CaseOfficer) => void;
}

const PRIORITY_META: Record<FamilyPriority, { label: string; bg: string; color: string; dot: string }> = {
  critical: { label: 'حرجة', bg: 'var(--fp-rose-soft)', color: 'var(--fp-rose)', dot: 'var(--fp-rose)' },
  intensive: { label: 'متوسطة', bg: 'var(--fp-amber-soft)', color: 'var(--fp-amber)', dot: 'var(--fp-amber)' },
  stable: { label: 'جيدة', bg: 'var(--fp-emerald-soft)', color: 'var(--fp-emerald)', dot: 'var(--fp-emerald)' },
};

export function FamilyHero({ family, officers, onCopy, onChangeOfficer }: Props) {
  const prio = PRIORITY_META[family.priority];
  const rentFormatted = formatIQDParts(family.rentAmount);

  const due = family.internalAid.reduce((sum, a) => sum + a.monthlyAmount, 0);
  const paid = family.paidThisMonth;
  const pct = due > 0 ? Math.min(100, Math.round((paid / due) * 100)) : 0;
  const late = family.arrears > 0;
  // WhatsApp opens the user's own app on the delegate's chat (no business account).
  const officerDigits = family.officer.phone.replace(/\D/g, '');
  const officerWa = `https://wa.me/${officerDigits.startsWith('0') ? `964${officerDigits.slice(1)}` : officerDigits}`;

  return (
    <>
    {/* Phone: who the family is, then whether this month is covered, then the delegate */}
    <section className="fp-card overflow-hidden md:hidden">
      <div className="px-4 pb-4 pt-4" style={{ backgroundImage: `linear-gradient(180deg, ${prio.bg} 0%, transparent 100%)` }}>
        <div className="flex items-center justify-between gap-2">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold" style={{ backgroundColor: 'var(--fp-card)', color: prio.color }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: prio.dot }} aria-hidden />
              {prio.label}
            </span>
            <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ backgroundColor: 'var(--fp-card)', color: 'var(--fp-ink-2)' }}>
              {family.socialStatus}
            </span>
          </span>
          <button
            type="button"
            onClick={() => onCopy(family.fileNo, 'رقم الملف')}
            aria-label={`نسخ رقم الملف ${family.fileNo}`}
            className="tap inline-flex min-h-[32px] items-center gap-1 font-mono text-xs font-bold"
            style={{ color: 'var(--fp-ink-3)' }}
            dir="ltr"
          >
            {family.fileNo} <Copy className="h-3 w-3" aria-hidden />
          </button>
        </div>

        <h1 id="fp-main-heading-phone" className="mt-3 text-[22px] font-extrabold leading-snug" style={{ color: 'var(--fp-ink)' }}>
          {family.name}
        </h1>

        {/* Under the name: address, members, the family's phone, and the delegate in charge with
            a WhatsApp button beside the name (the delegate card is not shown on the phone). */}
        <ul className="mt-2.5 grid gap-2 text-[13px]" style={{ color: 'var(--fp-ink-2)' }}>
          <li className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--fp-ink-3)' }} aria-hidden />{family.address}</li>
          <li className="flex items-center gap-2"><Users className="h-4 w-4 shrink-0" style={{ color: 'var(--fp-ink-3)' }} aria-hidden /><span><bdi>{family.members.length}</bdi> أفراد</span></li>
          <li className="flex items-center gap-2">
            <Phone className="h-4 w-4 shrink-0" style={{ color: 'var(--fp-ink-3)' }} aria-hidden />
            {family.phone
              ? <a href={`tel:${family.phone.replace(/\s/g, '')}`} className="tap font-semibold tabular-nums" style={{ color: 'var(--fp-ink)' }} dir="ltr">{family.phone}</a>
              : <span style={{ color: 'var(--fp-ink-3)' }}>لم يُسجَّل رقم</span>}
          </li>
          <li className="flex items-center gap-2">
            <UserCheck className="h-4 w-4 shrink-0" style={{ color: 'var(--fp-ink-3)' }} aria-hidden />
            <span className="min-w-0">
              <span style={{ color: 'var(--fp-ink-3)' }}>المندوب: </span>
              <a href={`#/delegates/${family.officer.id}`} className="tap font-bold" style={{ color: 'var(--fp-ink)' }}>{family.officer.name}</a>
            </span>
            <a
              href={officerWa}
              target="_blank"
              rel="noreferrer"
              aria-label={`مراسلة ${family.officer.name} على واتساب`}
              className="fam-wa-btn"
            >
              <WhatsAppMark />
            </a>
          </li>
        </ul>
      </div>

      {/* This month: the one thing the file must answer at a glance */}
      <div className="mx-4 rounded-2xl p-3.5" style={{ backgroundColor: 'var(--fp-muted)' }}>
        <div className="flex items-center justify-between text-xs font-semibold" style={{ color: 'var(--fp-ink-3)' }}>
          <span>حالة {family.monthLabel}</span>
          <span className="tabular-nums" style={{ color: late ? 'var(--fp-rose)' : 'var(--fp-emerald)' }}>{pct}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--fp-muted-2)' }} aria-hidden>
          <span className="block h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: late ? 'var(--fp-rose)' : 'var(--fp-emerald)' }} />
        </div>
        <dl className="mt-3 grid grid-cols-3 gap-2 text-center tabular-nums">
          <div>
            <dt className="text-[11px]" style={{ color: 'var(--fp-ink-3)' }}>المستحق</dt>
            <dd className="mt-0.5 text-[13px] font-bold" style={{ color: 'var(--fp-ink)' }}>{formatIQDText(due)}</dd>
          </div>
          <div>
            <dt className="text-[11px]" style={{ color: 'var(--fp-ink-3)' }}>المصروف</dt>
            <dd className="mt-0.5 text-[13px] font-bold" style={{ color: 'var(--fp-emerald)' }}>{formatIQDText(paid)}</dd>
          </div>
          <div>
            <dt className="text-[11px]" style={{ color: 'var(--fp-ink-3)' }}>المتأخر</dt>
            <dd className="mt-0.5 text-[13px] font-bold" style={{ color: late ? 'var(--fp-rose)' : 'var(--fp-ink-3)' }}>{late ? formatIQDText(family.arrears) : 'لا يوجد'}</dd>
          </div>
        </dl>
      </div>

      <div className="h-4" aria-hidden />
    </section>

    <section className="fp-card hidden p-6 md:block">
      <div className="grid grid-cols-1 items-center gap-6 lg:grid-cols-12">
        {/* Right: Avatar + Title + Badges + Facts */}
        <div className="lg:col-span-8">

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onCopy(family.fileNo, 'رقم الملف')}
                title="نسخ رقم الملف"
                className="tap inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-xs font-bold transition hover:opacity-80"
                style={{
                  backgroundColor: 'var(--fp-muted-2)',
                  borderColor: 'var(--fp-border)',
                  color: 'var(--fp-ink-2)',
                }}
                dir="ltr"
              >
                <span>{family.fileNo}</span>
                <Copy className="h-3 w-3" aria-hidden />
              </button>

              <span
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-xs font-bold"
                style={{ backgroundColor: prio.bg, color: prio.color }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: prio.dot }}
                  aria-hidden
                />
                {prio.label}
              </span>

              <span
                className="inline-flex items-center rounded-full px-3 py-0.5 text-xs font-semibold"
                style={{ backgroundColor: 'var(--fp-muted-2)', color: 'var(--fp-ink-2)' }}
              >
                {family.socialStatus}
              </span>
            </div>

            <h1
              id="fp-main-heading"
              tabIndex={-1}
              className="mt-2.5 text-2xl font-bold leading-snug tracking-tight focus:outline-none md:text-3xl"
              style={{ color: 'var(--fp-ink)' }}
            >
              {family.name}
            </h1>

            <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
              <div>
                <dt className="text-xs font-medium" style={{ color: 'var(--fp-ink-3)' }}>العنوان</dt>
                <dd className="mt-0.5 text-xs font-bold leading-relaxed sm:text-sm" style={{ color: 'var(--fp-ink)' }}>
                  {family.address}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium" style={{ color: 'var(--fp-ink-3)' }}>السكن</dt>
                <dd className="mt-0.5 text-xs font-bold sm:text-sm tabular-nums" style={{ color: 'var(--fp-ink)' }}>
                  {family.housing} {family.rentAmount > 0 ? `· ${rentFormatted.value} ${rentFormatted.currency}` : ''}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium" style={{ color: 'var(--fp-ink-3)' }}>عدد الأفراد</dt>
                <dd className="mt-0.5 text-xs font-bold sm:text-sm tabular-nums" style={{ color: 'var(--fp-ink)' }}>
                  {family.members.length} أفراد
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium" style={{ color: 'var(--fp-ink-3)' }}>تاريخ التسجيل</dt>
                <dd className="mt-0.5 text-xs font-bold sm:text-sm tabular-nums" style={{ color: 'var(--fp-ink)' }}>
                  <bdi dir="ltr">{family.registeredAt}</bdi>
                </dd>
              </div>
            </dl>
          </div>
        </div>

        {/* Left: Case Officer Sub-card */}
        <div className="lg:col-span-4">
          <CaseOfficerCard
            officer={family.officer}
            officers={officers}
            onChangeOfficer={onChangeOfficer}
            onCopyPhone={(phone) => onCopy(phone, 'رقم الهاتف')}
          />
        </div>
      </div>
    </section>
    </>
  );
}

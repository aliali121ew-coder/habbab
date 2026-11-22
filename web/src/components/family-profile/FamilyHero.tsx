import {
  Calendar,
  Clock,
  HandHeart,
  Home,
  MapPin,
  Users,
} from 'lucide-react';
import { formatIQDParts } from '../../mock/family';
import type { CaseOfficer, FamilyDetail } from '../../types/family';
import { CaseOfficerCard } from './CaseOfficerCard';

interface Props {
  family: FamilyDetail;
  officers: CaseOfficer[];
  onCopy: (text: string, label: string) => void;
  onChangeOfficer: (officer: CaseOfficer) => void;
  onOpenPayment: () => void;
}

export function FamilyHero({
  family,
  officers,
  onCopy,
  onChangeOfficer,
  onOpenPayment,
}: Props) {
  const rentFormatted = formatIQDParts(family.rentAmount);

  const latestUpdate = [
    family.registeredAt,
    ...family.visits.map((v) => v.date),
    ...family.payments.map((p) => p.date),
  ]
    .filter(Boolean)
    .sort()
    .pop() ?? family.registeredAt;

  return (
    <div className="space-y-4">
      {/* Primary Quick Action */}
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={onOpenPayment}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl px-4 text-xs font-bold text-white shadow-sm transition hover:opacity-95"
          style={{
            backgroundImage: 'linear-gradient(135deg, var(--bar-active), var(--brand))',
          }}
        >
          <HandHeart className="h-3.5 w-3.5" aria-hidden />
          <span>صرف مساعدة</span>
        </button>
      </div>

      {/* Top Hero Bento Grid: 8 cols Family Identity (Right) + 4 cols Delegate Card (Left) */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <section className="fp-card fp-hero-main relative flex flex-col justify-between overflow-hidden lg:col-span-8">
          {/* Theme-aware gradient top accent strip */}
          <div
            className="h-1.5 w-full"
            style={{ backgroundImage: 'linear-gradient(270deg, var(--bar-active) 0%, var(--brand) 100%)' }}
            aria-hidden
          />

          <div className="flex flex-1 flex-col justify-between gap-5 p-5 sm:p-6">
            {/* Family Title + Last Updated */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h1
                id="fp-main-heading"
                className="text-xl font-extrabold tracking-tight sm:text-2xl"
                style={{ color: 'var(--fp-ink)' }}
              >
                {family.name}
              </h1>

              <span
                className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold"
                style={{
                  backgroundColor: 'color-mix(in srgb, var(--fp-card) 72%, transparent)',
                  borderColor: 'var(--fp-border)',
                  color: 'var(--fp-ink-3)',
                }}
              >
                <Clock className="h-3.5 w-3.5" aria-hidden />
                <span>آخر تحديث: <bdi dir="ltr">{latestUpdate}</bdi></span>
              </span>
            </div>

            {/* 2x2 Inner Info Tiles */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div
                className="flex items-center gap-3 rounded-xl border px-3.5 py-3"
                style={{
                  backgroundColor: 'color-mix(in srgb, var(--fp-card) 74%, var(--fp-muted))',
                  borderColor: 'var(--fp-border)',
                }}
              >
                <span
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                  style={{ backgroundColor: 'var(--fp-primary-soft)', color: 'var(--fp-primary)' }}
                >
                  <MapPin className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0">
                  <span className="block text-[11px] font-medium" style={{ color: 'var(--fp-ink-3)' }}>
                    العنوان السكني
                  </span>
                  <strong className="mt-0.5 block truncate text-xs font-bold sm:text-[13px]" style={{ color: 'var(--fp-ink)' }}>
                    {family.address}
                  </strong>
                </div>
              </div>

              <div
                className="flex items-center gap-3 rounded-xl border px-3.5 py-3"
                style={{
                  backgroundColor: 'color-mix(in srgb, var(--fp-card) 74%, var(--fp-muted))',
                  borderColor: 'var(--fp-border)',
                }}
              >
                <span
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                  style={{ backgroundColor: 'var(--fp-amber-soft)', color: 'var(--fp-amber)' }}
                >
                  <Home className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0">
                  <span className="block text-[11px] font-medium" style={{ color: 'var(--fp-ink-3)' }}>
                    حالة السكن
                  </span>
                  <strong className="mt-0.5 block truncate text-xs font-bold sm:text-[13px]" style={{ color: 'var(--fp-ink)' }}>
                    {family.housing}
                    {family.rentAmount > 0 && (
                      <span className="ms-1.5 font-extrabold tabular-nums" style={{ color: 'var(--fp-amber)' }}>
                        • {rentFormatted.value} {rentFormatted.currency}
                      </span>
                    )}
                  </strong>
                </div>
              </div>

              <div
                className="flex items-center gap-3 rounded-xl border px-3.5 py-3"
                style={{
                  backgroundColor: 'color-mix(in srgb, var(--fp-card) 74%, var(--fp-muted))',
                  borderColor: 'var(--fp-border)',
                }}
              >
                <span
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                  style={{ backgroundColor: 'var(--fp-emerald-soft)', color: 'var(--fp-emerald)' }}
                >
                  <Users className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0">
                  <span className="block text-[11px] font-medium" style={{ color: 'var(--fp-ink-3)' }}>
                    عدد الأفراد
                  </span>
                  <strong className="mt-0.5 block truncate text-xs font-bold tabular-nums sm:text-[13px]" style={{ color: 'var(--fp-ink)' }}>
                    {family.members.length} أفراد مسجلين
                  </strong>
                </div>
              </div>

              <div
                className="flex items-center gap-3 rounded-xl border px-3.5 py-3"
                style={{
                  backgroundColor: 'color-mix(in srgb, var(--fp-card) 74%, var(--fp-muted))',
                  borderColor: 'var(--fp-border)',
                }}
              >
                <span
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                  style={{ backgroundColor: 'color-mix(in srgb, var(--fp-ink-3) 14%, transparent)', color: 'var(--fp-ink-2)' }}
                >
                  <Calendar className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0">
                  <span className="block text-[11px] font-medium" style={{ color: 'var(--fp-ink-3)' }}>
                    تاريخ التسجيل
                  </span>
                  <strong className="mt-0.5 block truncate text-xs font-bold tabular-nums sm:text-[13px]" style={{ color: 'var(--fp-ink)' }} dir="ltr">
                    {family.registeredAt}
                  </strong>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="lg:col-span-4">
          <CaseOfficerCard
            officer={family.officer}
            officers={officers}
            onChangeOfficer={onChangeOfficer}
            onCopyPhone={(phone) => onCopy(phone, 'رقم المندوب')}
          />
        </div>
      </div>
    </div>
  );
}

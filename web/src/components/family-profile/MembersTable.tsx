import { ArrowLeft, ChevronLeft, HeartPulse, UserPlus } from 'lucide-react';
import { formatIQDText } from '../../mock/family';
import type { FamilyMember, FamilyPatientRecord } from '../../types/family';
import { InitialsAvatar } from '../shared/InitialsAvatar';
import { SheetFacts, SheetSection, SideSheet } from './SideSheet';

interface Props {
  members: FamilyMember[];
  onOpen: (member: FamilyMember) => void;
  onAdd: () => void;
}

const th = 'px-4 py-3 text-start text-[11px] font-semibold';

export function MembersTable({ members, onOpen, onAdd }: Props) {
  return (
    <section className="fp-card overflow-hidden" aria-label="أفراد العائلة">
      <div className="flex items-center justify-between gap-2 px-6 py-4">
        <div>
          <h2 className="text-base font-bold" style={{ color: 'var(--fp-ink)' }}>أفراد العائلة</h2>
          <p className="mt-0.5 text-xs" style={{ color: 'var(--fp-ink-3)' }}>{members.length} أفراد<span className="hidden md:inline"> · اضغط على الفرد لفتح ملفه</span></p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition hover:opacity-85"
          style={{ borderColor: 'var(--fp-border)', color: 'var(--fp-primary)' }}
        >
          <UserPlus className="h-4 w-4" aria-hidden /> إضافة فرد
        </button>
      </div>

      {/* Mobile Cards: tap any member card to open full details */}
      <div className="divide-y border-t md:hidden" style={{ borderColor: 'var(--fp-border)' }}>
        {members.map((member) => (
          <button
            key={member.id}
            type="button"
            onClick={() => onOpen(member)}
            className="fp-member-row flex w-full items-center justify-between gap-3 px-4 py-3 text-start"
            style={{ borderColor: 'var(--fp-border)' }}
          >
            <div className="flex min-w-0 items-center gap-3">
              <InitialsAvatar initials={member.initials} size="md" shape="circle" tone="neutral" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm font-bold" style={{ color: 'var(--fp-ink)' }}>{member.name}</span>
                  {member.orphanLabel && (
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                      style={{ backgroundColor: 'var(--fp-amber-soft)', color: 'var(--fp-amber)' }}
                    >
                      {member.orphanLabel}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs" style={{ color: 'var(--fp-ink-2)' }}>
                  {member.relation} · <span className="tabular-nums">{member.age} سنة</span>
                </p>
                {member.chronic ? (
                  <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: 'var(--fp-rose)' }}>
                    <HeartPulse className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span>{member.chronic}</span>
                  </p>
                ) : (
                  <p className="mt-0.5 text-[11px]" style={{ color: 'var(--fp-ink-3)' }}>{member.status}</p>
                )}
              </div>
            </div>
            <ChevronLeft className="h-5 w-5 shrink-0" style={{ color: 'var(--fp-ink-3)' }} aria-hidden />
          </button>
        ))}
      </div>

      {/* Desktop Table */}
      <div className="relative hidden w-0 min-w-full overflow-x-auto md:block">
        <table className="w-full min-w-[640px] border-t text-sm" style={{ borderColor: 'var(--fp-border)' }}>
          <thead style={{ backgroundColor: 'var(--fp-muted)', color: 'var(--fp-ink-3)' }}>
            <tr>
              <th className={th}>الاسم</th>
              <th className={th}>صلة القرابة</th>
              <th className={th}>العمر</th>
              <th className={th}>الدراسة / العمل</th>
              <th className={th}>الحالة الصحية</th>
              <th className={th}><span className="sr-only">الملف</span></th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr
                key={member.id}
                className="fp-member-row border-t"
                style={{ borderColor: 'var(--fp-border)' }}
                onClick={() => onOpen(member)}
              >
                <td className="px-4 py-3">
                  <span className="flex items-center gap-3">
                    <InitialsAvatar initials={member.initials} size="sm" shape="circle" tone="neutral" />
                    <span className="font-bold" style={{ color: 'var(--fp-ink)' }}>{member.name}</span>
                  </span>
                </td>
                <td className="px-4 py-3 text-xs" style={{ color: 'var(--fp-ink-2)' }}>
                  {member.relation}
                  {member.orphanLabel && (
                    <span className="ms-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ backgroundColor: 'var(--fp-amber-soft)', color: 'var(--fp-amber)' }}>
                      {member.orphanLabel}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs tabular-nums" style={{ color: 'var(--fp-ink-2)' }}>{member.age} سنة</td>
                <td className="px-4 py-3 text-xs" style={{ color: 'var(--fp-ink-2)' }}>{member.status}</td>
                <td className="px-4 py-3 text-xs">
                  {member.chronic ? (
                    <span className="inline-flex items-center gap-1 font-semibold" style={{ color: 'var(--fp-rose)' }}>
                      <HeartPulse className="h-3.5 w-3.5" aria-hidden /> {member.chronic}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--fp-ink-3)' }}>سليم</span>
                  )}
                </td>
                <td className="px-4 py-3 text-end">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onOpen(member); }}
                    className="tap fp-row-button inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold"
                    style={{ color: 'var(--fp-primary)' }}
                    aria-label={`فتح ملف ${member.name}`}
                  >
                    الملف <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function MemberSheet({ member, patient, onClose }: { member: FamilyMember; patient?: FamilyPatientRecord; onClose: () => void }) {
  return (
    <SideSheet title={member.name} subtitle={`${member.relation} · ${member.age} سنة`} onClose={onClose}>
      <SheetFacts
        items={[
          { label: 'صلة القرابة', value: member.relation },
          { label: 'العمر', value: `${member.age} سنة` },
          { label: 'الدراسة / العمل', value: member.status },
          { label: 'الحالة الصحية', value: member.chronic ?? 'سليم' },
          ...(member.gender ? [{ label: 'الجنس', value: member.gender }] : []),
          ...(member.phone ? [{ label: 'رقم الهاتف', value: <a href={`tel:${member.phone.replace(/\s/g, '')}`} dir="ltr">{member.phone}</a> }] : []),
          ...(member.notes ? [{ label: 'ملاحظات', value: member.notes }] : []),
        ]}
      />

      {patient ? (
        <SheetSection title="الملف الصحي">
          <SheetFacts
            items={[
              { label: 'التشخيص', value: patient.diagnosis },
              { label: 'الطبيب المعالج', value: patient.doctor },
              { label: 'آخر مراجعة', value: <bdi dir="ltr">{patient.lastVisit}</bdi> },
              { label: 'كلفة الأدوية', value: formatIQDText(patient.medicineCost) },
              { label: 'كلفة الكشفيات', value: formatIQDText(patient.examsCost) },
              { label: 'المصروف له نقداً', value: formatIQDText(patient.deliveredCash) },
            ]}
          />
          <a
            href={`#/patients/${patient.id}`}
            className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl text-xs font-bold text-white"
            style={{ backgroundColor: 'var(--fp-primary)' }}
          >
            فتح ملف المريض الكامل <ArrowLeft className="h-4 w-4" aria-hidden />
          </a>
        </SheetSection>
      ) : member.chronic ? (
        <p className="mt-5 rounded-xl px-3.5 py-3 text-xs" style={{ backgroundColor: 'var(--fp-amber-soft)', color: 'var(--fp-amber)' }}>
          لديه حالة مزمنة ولم يُسجَّل بعد في سجل المرضى.
        </p>
      ) : null}
    </SideSheet>
  );
}

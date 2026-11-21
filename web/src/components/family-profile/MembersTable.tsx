import { useState, type ReactNode } from 'react';
import { ArrowLeft, Briefcase, ChevronLeft, GraduationCap, HeartPulse, MessageCircle, Phone, ShieldCheck, Pencil, StickyNote, Trash2, UserPlus, UserRound, type LucideIcon } from 'lucide-react';
import { formatIQDText } from '../../mock/family';
import type { FamilyMember, FamilyPatientRecord } from '../../types/family';
import { InitialsAvatar } from '../shared/InitialsAvatar';
import { SideSheet } from './SideSheet';

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

// One information row in the member card: a tinted icon tile, a small label and the value.
function InfoRow({ icon: Icon, tone, label, children }: { icon: LucideIcon; tone: string; label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: `color-mix(in srgb, ${tone} 13%, transparent)`, color: tone }}>
        <Icon className="h-[18px] w-[18px]" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold" style={{ color: 'var(--fp-ink-3)' }}>{label}</p>
        <div className="mt-0.5 text-sm font-bold" style={{ color: 'var(--fp-ink)' }}>{children}</div>
      </div>
    </div>
  );
}

/**
 * A family member's card: a profile header (initials, name, relation, orphan mark), three joined
 * facts (age, gender, health), then study or work, health, phone (call and WhatsApp) and notes as
 * rows with tinted icons; the health file follows when the member is on the patients registry.
 */
export function MemberSheet({ member, patient, onClose, onRemove, onEdit }: { member: FamilyMember; patient?: FamilyPatientRecord; onClose: () => void; onRemove?: (member: FamilyMember) => void; onEdit?: (member: FamilyMember) => void }) {
  // Removing asks once more inside the card before anything is deleted.
  const [confirming, setConfirming] = useState(false);
  const female = member.gender ? member.gender === 'أنثى' : /(^|\s)(الأم|ابنة|أخت|الجدة|الزوجة|حفيدة)/.test(member.relation);
  const tone = female ? 'var(--fp-rose)' : 'var(--fp-primary)';
  const healthy = !member.chronic;
  const student = member.status.includes('طالب');
  const working = /يعمل|موظف|كاسب/.test(member.status);
  const digits = member.phone?.replace(/\D/g, '') ?? '';
  const wa = digits ? `https://wa.me/${digits.startsWith('0') ? `964${digits.slice(1)}` : digits}` : '';
  // «ابنة يتيمة الأب» → relation «ابنة» and the loss «يتيمة الأب» as its own badge.
  const baseRelation = member.relation.replace(/\s+(يتيم|يتيمة|فقيد|فقيدة)(\s.*)?$/, '');
  const loss = member.relation.slice(baseRelation.length).trim();

  return (
    <SideSheet title={member.name} onClose={onClose} bare>
      {/* Profile header */}
      <div className="relative px-6 pb-6 pt-10 text-center" style={{ backgroundImage: `linear-gradient(180deg, color-mix(in srgb, ${tone} 16%, transparent) 0%, transparent 100%)` }}>
        <span
          className="mx-auto inline-flex h-20 w-20 items-center justify-center rounded-full text-2xl font-extrabold text-white"
          style={{ backgroundImage: `linear-gradient(145deg, color-mix(in srgb, ${tone} 70%, #fff), ${tone})`, boxShadow: `0 12px 26px -12px ${tone}, 0 0 0 4px var(--fp-card)` }}
          aria-hidden
        >
          {member.initials}
        </span>
        <h2 className="mt-3 text-xl font-extrabold leading-snug" style={{ color: 'var(--fp-ink)' }}>{member.name}</h2>
        <div className="mt-2.5 flex flex-wrap justify-center gap-1.5">
          <span className="rounded-full px-3 py-1 text-xs font-bold" style={{ backgroundColor: `color-mix(in srgb, ${tone} 14%, transparent)`, color: tone }}>{baseRelation}</span>
          {loss && <span className="rounded-full px-3 py-1 text-xs font-bold" style={{ backgroundColor: 'var(--fp-amber-soft)', color: 'var(--fp-amber)' }}>{loss}</span>}
          {!healthy && <span className="rounded-full px-3 py-1 text-xs font-bold" style={{ backgroundColor: 'var(--fp-rose-soft)', color: 'var(--fp-rose)' }}>حالة صحية</span>}
        </div>
      </div>

      <div className="space-y-4 px-5 pb-6">
        {/* Three joined facts */}
        <dl className="grid grid-cols-3 overflow-hidden rounded-2xl border text-center" style={{ borderColor: 'var(--fp-border)', backgroundColor: 'var(--fp-muted)' }}>
          <div className="px-2 py-3">
            <dt className="text-[11px] font-semibold" style={{ color: 'var(--fp-ink-3)' }}>العمر</dt>
            <dd className="mt-1 text-lg font-extrabold leading-none tabular-nums" style={{ color: 'var(--fp-ink)' }}><bdi>{member.age}</bdi><small className="ms-1 text-[11px] font-semibold" style={{ color: 'var(--fp-ink-3)' }}>سنة</small></dd>
          </div>
          <div className="border-s px-2 py-3" style={{ borderColor: 'var(--fp-border)' }}>
            <dt className="text-[11px] font-semibold" style={{ color: 'var(--fp-ink-3)' }}>الجنس</dt>
            <dd className="mt-1 text-sm font-extrabold leading-tight" style={{ color: 'var(--fp-ink)' }}>{member.gender ?? (female ? 'أنثى' : 'ذكر')}</dd>
          </div>
          <div className="border-s px-2 py-3" style={{ borderColor: 'var(--fp-border)' }}>
            <dt className="text-[11px] font-semibold" style={{ color: 'var(--fp-ink-3)' }}>الصحة</dt>
            <dd className="mt-1 text-sm font-extrabold leading-tight" style={{ color: healthy ? 'var(--fp-emerald)' : 'var(--fp-rose)' }}>{healthy ? 'سليم' : 'تحتاج رعاية'}</dd>
          </div>
        </dl>

        {/* Details */}
        <div className="divide-y divide-[color:var(--fp-border)] overflow-hidden rounded-2xl border" style={{ borderColor: 'var(--fp-border)', backgroundColor: 'var(--fp-card)' }}>
          <InfoRow icon={student ? GraduationCap : working ? Briefcase : UserRound} tone="var(--fp-primary)" label="الدراسة / العمل">{member.status}</InfoRow>
          <InfoRow icon={healthy ? ShieldCheck : HeartPulse} tone={healthy ? 'var(--fp-emerald)' : 'var(--fp-rose)'} label="الحالة الصحية">
            {member.chronic ?? 'سليم — لا أمراض مسجلة'}
          </InfoRow>
          <InfoRow icon={Phone} tone="var(--fp-ink-2)" label="رقم الهاتف">
            {member.phone ? (
              <span className="flex items-center justify-between gap-2">
                <bdi dir="ltr" className="tabular-nums">{member.phone}</bdi>
                <span className="flex shrink-0 gap-1.5">
                  <a href={`tel:${digits}`} aria-label={`اتصال بـ ${member.name}`} className="inline-flex h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: 'var(--fp-primary-soft)', color: 'var(--fp-primary)' }}><Phone className="h-4 w-4" aria-hidden /></a>
                  <a href={wa} target="_blank" rel="noreferrer" aria-label={`مراسلة ${member.name} على واتساب`} className="inline-flex h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: 'color-mix(in srgb, #25d366 14%, transparent)', color: '#1fa855' }}><MessageCircle className="h-4 w-4" aria-hidden /></a>
                </span>
              </span>
            ) : <span className="font-semibold" style={{ color: 'var(--fp-ink-3)' }}>لم يُسجَّل رقم</span>}
          </InfoRow>
          {member.notes && <InfoRow icon={StickyNote} tone="var(--fp-amber)" label="ملاحظات"><span className="font-semibold leading-relaxed">{member.notes}</span></InfoRow>}
        </div>

        {patient ? (
          <section className="overflow-hidden rounded-2xl border" style={{ borderColor: 'var(--fp-border)' }}>
            <h3 className="flex items-center gap-2 px-4 py-3 text-sm font-extrabold" style={{ backgroundColor: 'var(--fp-rose-soft)', color: 'var(--fp-rose)' }}>
              <HeartPulse className="h-4 w-4" aria-hidden /> الملف الصحي
            </h3>
            <dl className="grid grid-cols-2 gap-px" style={{ backgroundColor: 'var(--fp-border)' }}>
              {([
                ['التشخيص', patient.diagnosis],
                ['الطبيب المعالج', patient.doctor],
                ['آخر مراجعة', <bdi key="d" dir="ltr">{patient.lastVisit}</bdi>],
                ['كلفة الأدوية', formatIQDText(patient.medicineCost)],
                ['كلفة الكشفيات', formatIQDText(patient.examsCost)],
                ['المصروف له نقداً', formatIQDText(patient.deliveredCash)],
              ] as [string, ReactNode][]).map(([label, value]) => (
                <div key={label} className="px-4 py-3" style={{ backgroundColor: 'var(--fp-card)' }}>
                  <dt className="text-[11px] font-semibold" style={{ color: 'var(--fp-ink-3)' }}>{label}</dt>
                  <dd className="mt-0.5 text-sm font-bold" style={{ color: 'var(--fp-ink)' }}>{value}</dd>
                </div>
              ))}
            </dl>
            <a href={`#/patients/${patient.id}`} className="flex h-11 items-center justify-center gap-2 text-xs font-bold text-white" style={{ backgroundColor: 'var(--fp-primary)' }}>
              فتح ملف المريض الكامل <ArrowLeft className="h-4 w-4" aria-hidden />
            </a>
          </section>
        ) : member.chronic ? (
          <p className="flex items-center gap-2 rounded-2xl px-4 py-3 text-xs font-semibold" style={{ backgroundColor: 'var(--fp-amber-soft)', color: 'var(--fp-amber)' }}>
            <HeartPulse className="h-4 w-4 shrink-0" aria-hidden /> لديه حالة صحية ولم يُسجَّل بعد في سجل المرضى.
          </p>
        ) : null}

        {onRemove && (
          confirming ? (
            <div className="rounded-2xl border p-4" role="alertdialog" aria-labelledby="remove-member-q" style={{ borderColor: 'color-mix(in srgb, var(--fp-rose) 35%, transparent)', backgroundColor: 'var(--fp-rose-soft)' }}>
              <p id="remove-member-q" className="text-sm font-extrabold" style={{ color: 'var(--fp-ink)' }}>حذف {member.name} من العائلة؟</p>
              <p className="mt-1 text-xs" style={{ color: 'var(--fp-ink-2)' }}>سيُزال من أفراد هذا الملف نهائياً، ولا يمكن التراجع.</p>
              <div className="mt-3 flex gap-2">
                <button type="button" autoFocus onClick={() => onRemove(member)} className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl text-sm font-bold text-white" style={{ backgroundColor: 'var(--fp-rose)' }}>
                  <Trash2 className="h-4 w-4" aria-hidden /> نعم، احذف
                </button>
                <button type="button" onClick={() => setConfirming(false)} className="h-10 rounded-xl border px-5 text-sm font-semibold" style={{ borderColor: 'var(--fp-border)', color: 'var(--fp-ink-2)', backgroundColor: 'var(--fp-card)' }}>
                  إلغاء
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              {onEdit && (
                <button type="button" onClick={() => onEdit(member)} className="inline-flex h-11 flex-[2] items-center justify-center gap-2 rounded-2xl text-sm font-bold text-white transition hover:opacity-90" style={{ backgroundColor: 'var(--fp-primary)' }}>
                  <Pencil className="h-4 w-4" aria-hidden /> تعديل البيانات
                </button>
              )}
              <button type="button" onClick={() => setConfirming(true)} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl border text-sm font-bold transition hover:opacity-90" style={{ borderColor: 'color-mix(in srgb, var(--fp-rose) 35%, transparent)', color: 'var(--fp-rose)' }}>
                <Trash2 className="h-4 w-4" aria-hidden /> إزالة
              </button>
            </div>
          )
        )}
      </div>
    </SideSheet>
  );
}

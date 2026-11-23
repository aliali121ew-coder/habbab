import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { MotionConfig, motion } from 'framer-motion';
import { ArrowRight, HeartHandshake } from 'lucide-react';
import { printWhenReady } from '../components/printWhenReady';
import { OfficialFamiliesPrintSheet, PaymentModal, VisitModal } from '../components/families/FamilyModalsAndPrint';
import { useLiveDelegates } from '../components/families/DelegateChip';
import { AddMemberDialog, type EditableMember, type NewMember } from '../components/family-profile/AddMemberDialog';
import { FamilyDetailTabs } from '../components/family-profile/FamilyDetailTabs';
import { FamilyHero } from '../components/family-profile/FamilyHero';
import { FamilyKpiRow, type FamilyProfileTab, type MembersQuickFilter } from '../components/family-profile/FamilyKpiRow';
import { MemberSheet } from '../components/family-profile/MembersTable';
import { ProfileSkeleton } from '../components/family-profile/ProfileSkeleton';
import { Toast } from '../components/shared/Toast';
import { addMember, getFamily, payFamily, removeMember, updateFamily, updateMember, visitFamily } from '../data/families';
import { toFamilyDetail, toInitials } from '../mock/family';
import { familyIdFromHash } from '../route';
import type { CaseOfficer, FamilyMember } from '../types/family';

// Member ids on the page are "mem-<family>-<member id on the server>".
const memberIdOf = (member: FamilyMember) => Number(member.id.split('-').pop());

export function FamilyDetailPage() {
  const familyId = familyIdFromHash();
  // The family as the server returns it; the page's own shape is derived from it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [raw, setRaw] = useState<any | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing'>('loading');
  const family = useMemo(() => (raw ? toFamilyDetail(raw) : null), [raw]);
  const [selectedMember, setSelectedMember] = useState<FamilyMember | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [payOpen, setPayOpen] = useState(false);
  const [visitOpen, setVisitOpen] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<{ id: number; data: EditableMember } | null>(null);
  const [printing, setPrinting] = useState(false);
  const [activeTab, setActiveTab] = useState<FamilyProfileTab>('members');
  const [memberFilter, setMemberFilter] = useState<MembersQuickFilter>('all');

  const delegates = useLiveDelegates() as { id: number; name: string; phone: string; region: string }[];
  const officers: CaseOfficer[] = delegates.map((d) => ({
    id: d.id, name: d.name, zone: d.region ? `مندوب ${d.region}` : 'مندوب', phone: d.phone, initials: toInitials(d.name),
  }));

  const load = useCallback(async () => {
    try {
      setRaw(await getFamily(familyId));
      setStatus('ready');
    } catch {
      setStatus('missing');
    }
  }, [familyId]);
  useEffect(() => { setStatus('loading'); void load(); }, [load]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!printing) return undefined;
    const done = () => setPrinting(false);
    window.addEventListener('afterprint', done);
    const cancel = printWhenReady('.fam-v2-print');
    return () => {
      cancel();
      window.removeEventListener('afterprint', done);
    };
  }, [printing]);

  const showToast = (msg: string) => setToast(msg);

  // Saves on the server, then reads the family again so every figure comes from the record.
  const save = async (work: () => Promise<unknown>, done: string) => {
    try {
      await work();
      await load();
      showToast(done);
    } catch (failure) {
      showToast((failure as Error).message || 'تعذّر الحفظ، حاول مرة أخرى');
    }
  };

  const handleCopy = async (value: string, label: string) => {
    try {
      await navigator.clipboard?.writeText(value);
    } catch {
      // Clipboard fallback ignored cleanly
    }
    showToast(`تم نسخ ${label}: ${value}`);
  };

  const handleChangeOfficer = (officer: CaseOfficer) =>
    void save(() => updateFamily(familyId, { delegateId: officer.id }), `تم إسناد الملف إلى ${officer.name}`);

  const handleConfirmPayment = (_id: number, payment: { date: string; amount: number; type: string; receivedBy: string; by: string }) =>
    void save(() => payFamily(familyId, payment), 'تم تسجيل الدفعة المالية بنجاح');

  const handleConfirmVisit = (_id: number, visit: { date: string; delegateName: string; note: string }) =>
    void save(() => visitFamily(familyId, visit), 'تم تسجيل زيارة المندوب بنجاح');

  const handleAddMember = (member: NewMember) => {
    setAddMemberOpen(false);
    void save(() => addMember(familyId, member), `تمت إضافة ${member.name} إلى أفراد العائلة`);
  };

  const handleEditMember = (member: NewMember) => {
    if (!editingMember) return;
    const { id } = editingMember;
    setEditingMember(null);
    void save(() => updateMember(familyId, id, member), `تم حفظ تعديلات ${member.name}`);
  };

  const handleRemoveMember = (member: FamilyMember) => {
    setSelectedMember(null);
    void save(() => removeMember(familyId, memberIdOf(member)), `تمت إزالة ${member.name} من أفراد العائلة`);
  };

  if (status === 'missing' || (status === 'ready' && !family)) {
    return (
      <div dir="rtl" className="fp-root -mx-[14px] -my-3 min-h-[calc(100dvh-56px)] px-4 py-12 md:-mx-[18px]">
        <div className="fp-card mx-auto max-w-md p-8 text-center">
          <HeartHandshake className="mx-auto mb-3 h-10 w-10" style={{ color: 'var(--fp-ink-3)' }} aria-hidden />
          <h1 className="text-lg font-bold" style={{ color: 'var(--fp-ink)' }}>ملف العائلة غير موجود</h1>
          <p className="mt-1 text-xs" style={{ color: 'var(--fp-ink-3)' }}>تعذّر العثور على سجل العائلة المطلوبة.</p>
          <a
            href="#/families"
            className="mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold text-white"
            style={{ backgroundColor: 'var(--fp-primary)' }}
          >
            <ArrowRight className="h-4 w-4" aria-hidden /> العودة إلى العوائل المتعففة
          </a>
        </div>
      </div>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <div dir="rtl" className="fp-root -mx-[14px] -mb-3 min-h-[calc(100dvh-56px)] px-4 pb-8 pt-2 md:-mx-[18px] md:px-7 md:pb-10">
        <div className="mx-auto max-w-[2400px] space-y-6">
          {status === 'loading' || !family ? (
            <ProfileSkeleton />
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22 }}
              className="space-y-6"
            >
              <FamilyHero
                family={family}
                officers={officers}
                onCopy={handleCopy}
                onChangeOfficer={handleChangeOfficer}
                onOpenPayment={() => setPayOpen(true)}
              />

              <FamilyKpiRow
                family={family}
                activeTab={activeTab}
                memberFilter={memberFilter}
                onSelect={(tab, filter) => {
                  setActiveTab(tab);
                  if (filter) setMemberFilter(filter);
                }}
              />

              <FamilyDetailTabs
                family={family}
                activeTab={activeTab}
                onTabChange={setActiveTab}
                memberFilter={memberFilter}
                onMemberFilterChange={setMemberFilter}
                onOpenMember={setSelectedMember}
                onAddMember={() => setAddMemberOpen(true)}
                onOpenPayment={() => setPayOpen(true)}
                onOpenVisit={() => setVisitOpen(true)}
              />
            </motion.div>
          )}
        </div>

        {family && selectedMember && (
          <MemberSheet
            member={selectedMember}
            patient={family.patients.find((p) => p.id === selectedMember.patientId)}
            onClose={() => setSelectedMember(null)}
            onRemove={handleRemoveMember}
            onEdit={(member) => {
              const id = memberIdOf(member);
              const stored = raw?.members?.find((m: { id: number }) => m.id === id);
              if (!stored) return;
              setSelectedMember(null);
              setEditingMember({ id, data: stored });
            }}
          />
        )}

        {payOpen && raw && (
          <PaymentModal family={raw} onClose={() => setPayOpen(false)} onConfirm={handleConfirmPayment} />
        )}

        {visitOpen && raw && (
          <VisitModal family={raw} onClose={() => setVisitOpen(false)} onConfirm={handleConfirmVisit} />
        )}

        {family && addMemberOpen && (
          <AddMemberDialog familyName={family.name} onClose={() => setAddMemberOpen(false)} onSave={handleAddMember} />
        )}
        {family && editingMember && (
          <AddMemberDialog familyName={family.name} member={editingMember.data} onClose={() => setEditingMember(null)} onSave={handleEditMember} />
        )}

        {printing && raw && family && createPortal(
          <OfficialFamiliesPrintSheet families={[raw]} monthLabel={family.monthLabel} />,
          document.body,
        )}

        <Toast message={toast} />
      </div>
    </MotionConfig>
  );
}

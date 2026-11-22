import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { MotionConfig, motion } from 'framer-motion';
import { ArrowRight, HeartHandshake } from 'lucide-react';
import { printWhenReady } from '../components/printWhenReady';
import { OfficialFamiliesPrintSheet, PaymentModal, VisitModal } from '../components/families/FamilyModalsAndPrint';
import { AddMemberDialog, type EditableMember, type NewMember } from '../components/family-profile/AddMemberDialog';
import { FamilyDetailTabs } from '../components/family-profile/FamilyDetailTabs';
import { FamilyHero } from '../components/family-profile/FamilyHero';
import { FamilyKpiRow, type FamilyProfileTab, type MembersQuickFilter } from '../components/family-profile/FamilyKpiRow';
import { MemberSheet } from '../components/family-profile/MembersTable';
import { ProfileSkeleton } from '../components/family-profile/ProfileSkeleton';
import { Toast } from '../components/shared/Toast';
import { DELEGATES, loadFamiliesStore, saveFamiliesStore } from '../data/families';
import { CASE_OFFICERS, getFamilyDetailById } from '../mock/family';
import { familyIdFromHash } from '../route';
import type { CaseOfficer, FamilyDetail, FamilyMember } from '../types/family';

export function FamilyDetailPage() {
  const familyId = familyIdFromHash();
  const [family, setFamily] = useState<FamilyDetail | null>(() => getFamilyDetailById(familyId));
  // Read from this device at once: no waiting screen (it used to hold one for 500 ms each visit).
  const loading = false;
  const [selectedMember, setSelectedMember] = useState<FamilyMember | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [payOpen, setPayOpen] = useState(false);
  const [visitOpen, setVisitOpen] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  // The member being edited (its index in the stored list), when the dialog edits rather than adds.
  const [editingMember, setEditingMember] = useState<{ index: number; data: EditableMember } | null>(null);
  const [printing, setPrinting] = useState(false);
  const [activeTab, setActiveTab] = useState<FamilyProfileTab>('members');
  const [memberFilter, setMemberFilter] = useState<MembersQuickFilter>('all');


  useEffect(() => {
    setFamily(getFamilyDetailById(familyId));
  }, [familyId]);

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

  const handleCopy = async (value: string, label: string) => {
    try {
      await navigator.clipboard?.writeText(value);
    } catch {
      // Clipboard fallback ignored cleanly
    }
    showToast(`تم نسخ ${label}: ${value}`);
  };

  const rawStoreFamily = loadFamiliesStore().find((f) => f.id === familyId) ?? null;

  const handleChangeOfficer = (officer: CaseOfficer) => {
    const store = loadFamiliesStore();
    const matchedDelegate = DELEGATES.find((d) => d.id === officer.id);
    if (matchedDelegate) {
      const updated = store.map((f) => (f.id === familyId ? { ...f, delegate: matchedDelegate } : f));
      saveFamiliesStore(updated);
    }
    setFamily((prev) => (prev ? { ...prev, officer } : prev));
    showToast(`تم إسناد الملف إلى ${officer.name}`);
  };

  const handleConfirmPayment = (_id: number, payment: { date: string; amount: number; type: string; receivedBy: string; by: string }) => {
    const store = loadFamiliesStore();
    const updated = store.map((f) => {
      if (f.id !== familyId) return f;
      const due = (f.entitlements?.salary ?? 0) + (f.entitlements?.aid ?? 0) + (f.entitlements?.medicine ?? 0) + (f.entitlements?.checkups ?? 0);
      const nextPaid = f.paidThisMonth + payment.amount;
      const nextArrears = Math.max(0, due - nextPaid);
      return {
        ...f,
        paidThisMonth: nextPaid,
        arrears: nextArrears,
        arrearsMonths: nextArrears === 0 ? 0 : f.arrearsMonths,
        payments: [payment, ...(f.payments ?? [])],
      };
    });
    saveFamiliesStore(updated);
    setFamily(getFamilyDetailById(familyId));
    showToast('تم تسجيل الدفعة المالية بنجاح');
  };

  const handleConfirmVisit = (_id: number, visit: { date: string; delegateName: string; note: string }) => {
    const store = loadFamiliesStore();
    const updated = store.map((f) => (f.id === familyId
      ? { ...f, lastVisit: visit.date, visits: [visit, ...(f.visits ?? [])] }
      : f));
    saveFamiliesStore(updated);
    setFamily(getFamilyDetailById(familyId));
    showToast('تم تسجيل زيارة المندوب بنجاح');
  };

  const handleAddMember = (member: NewMember) => {
    const store = loadFamiliesStore();
    const updated = store.map((f) => (f.id === familyId ? { ...f, members: [...(f.members ?? []), member] } : f));
    saveFamiliesStore(updated);
    setFamily(getFamilyDetailById(familyId));
    setAddMemberOpen(false);
    showToast(`تمت إضافة ${member.name} إلى أفراد العائلة`);
  };

  const handleEditMember = (member: NewMember) => {
    if (!editingMember) return;
    const { index } = editingMember;
    const store = loadFamiliesStore();
    const updated = store.map((f) => (f.id === familyId
      ? { ...f, members: (f.members ?? []).map((m: EditableMember, i: number) => (i === index ? { ...m, ...member } : m)) }
      : f));
    saveFamiliesStore(updated);
    setFamily(getFamilyDetailById(familyId));
    setEditingMember(null);
    showToast(`تم حفظ تعديلات ${member.name}`);
  };

  // Member ids are "mem-<family>-<index>", the index in the stored members list.
  const handleRemoveMember = (member: FamilyMember) => {
    const index = Number(member.id.split('-').pop());
    const store = loadFamiliesStore();
    const updated = store.map((f) => (f.id === familyId
      ? { ...f, members: (f.members ?? []).filter((_: unknown, i: number) => i !== index) }
      : f));
    saveFamiliesStore(updated);
    setFamily(getFamilyDetailById(familyId));
    setSelectedMember(null);
    showToast(`تمت إزالة ${member.name} من أفراد العائلة`);
  };

  if (!family) {
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
          {loading ? (
            <ProfileSkeleton />
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22 }}
              className="space-y-6"
            >
              {/* 1. Hero Bento Section (Identity + Delegate Card) */}
              <FamilyHero
                family={family}
                officers={CASE_OFFICERS}
                onCopy={handleCopy}
                onChangeOfficer={handleChangeOfficer}
                onOpenPayment={() => setPayOpen(true)}
              />

              {/* 2. 4 Interactive KPI Stat Cards */}
              <FamilyKpiRow
                family={family}
                activeTab={activeTab}
                memberFilter={memberFilter}
                onSelect={(tab, filter) => {
                  setActiveTab(tab);
                  if (filter) setMemberFilter(filter);
                }}
              />

              {/* 3. Tabbed Content Container (Members / Aids / Visits / Housing & Docs) */}
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

        {/* Side Sheets */}
        {selectedMember && (
          <MemberSheet
            member={selectedMember}
            patient={family.patients.find((p) => p.id === selectedMember.patientId)}
            onClose={() => setSelectedMember(null)}
            onRemove={handleRemoveMember}
            onEdit={(member) => {
              const index = Number(member.id.split('-').pop());
              const stored = loadFamiliesStore().find((f) => f.id === familyId)?.members?.[index];
              if (!stored) return;
              setSelectedMember(null);
              setEditingMember({ index, data: stored });
            }}
          />
        )}

        {/* Modals */}
        {payOpen && rawStoreFamily && (
          <PaymentModal
            family={rawStoreFamily}
            onClose={() => setPayOpen(false)}
            onConfirm={handleConfirmPayment}
          />
        )}

        {visitOpen && rawStoreFamily && (
          <VisitModal
            family={rawStoreFamily}
            onClose={() => setVisitOpen(false)}
            onConfirm={handleConfirmVisit}
          />
        )}

        {addMemberOpen && (
          <AddMemberDialog familyName={family.name} onClose={() => setAddMemberOpen(false)} onSave={handleAddMember} />
        )}
        {editingMember && (
          <AddMemberDialog familyName={family.name} member={editingMember.data} onClose={() => setEditingMember(null)} onSave={handleEditMember} />
        )}

        {printing && rawStoreFamily && createPortal(
          <OfficialFamiliesPrintSheet families={[rawStoreFamily]} monthLabel={family.monthLabel} />,
          document.body,
        )}

        <Toast message={toast} />
      </div>
    </MotionConfig>
  );
}

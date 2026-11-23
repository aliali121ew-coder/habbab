import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AVAILABLE_MONTHS,
  bulkPayFamilies,
  createFamily,
  matchFamily,
  payFamily,
  updateFamily,
  uploadFamilyPhoto,
  useFamilies,
  visitFamily,
} from '../data/families';
import { MatchDialog } from '../components/families/MatchDialog';
import { useFamiliesFilter } from '../hooks/useFamiliesFilter';
import { printWhenReady } from '../components/printWhenReady';
import { ActiveFilterChips } from '../components/families/ActiveFilterChips';
import { EmptyState } from '../components/families/EmptyState';
import { FamiliesGrid } from '../components/families/FamiliesGrid';
import { FamiliesTable } from '../components/families/FamiliesTable';
import {
  AddFamilyModal,
  EditAidModal,
  OfficialFamiliesPrintSheet,
  PaymentModal,
  VisitModal,
} from '../components/families/FamilyModalsAndPrint';
import { FiltersToolbar } from '../components/families/FiltersToolbar';
import { FamilyMobileList } from '../components/families/FamilyMobileList';
import { KpiCards } from '../components/families/KpiCards';
import { PageHeader } from '../components/families/PageHeader';
import { totalEntitlement } from '../utils/format';

const DEFAULT_FILTERS = {
  query: '',
  category: 'all',
  delegateId: 'all',
  paymentStatus: 'all',
  sortBy: 'entitlement_desc',
};

export function FamiliesPage() {
  // From the server; every change below is saved there first, then the list is read again.
  const { families, loading, error, reload } = useFamilies();
  const [selectedMonth, setSelectedMonth] = useState(AVAILABLE_MONTHS[0].id);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [viewMode, setViewMode] = useState('table');
  const [selectedId, setSelectedId] = useState(null);
  // A new family whose head's name is on file at another foundation, waiting for the answer.
  const [pendingMatch, setPendingMatch] = useState(null);
  const [notice, setNotice] = useState('');
  const fail = (failure) => setNotice(failure?.message || 'تعذّر الحفظ، حاول مرة أخرى');
  const save = async (work) => {
    setNotice('');
    try { await work(); await reload(); } catch (failure) { fail(failure); }
  };

  const [addOpen, setAddOpen] = useState(false);
  const [payingFamily, setPayingFamily] = useState(null);
  const [editingAidFamily, setEditingAidFamily] = useState(null);
  const [visitingFamily, setVisitingFamily] = useState(null);
  const [printingList, setPrintingList] = useState(null);

  useEffect(() => {
    if (!printingList) return undefined;
    const onDone = () => setPrintingList(null);
    window.addEventListener('afterprint', onDone);
    const cancel = printWhenReady('.fam-v2-print');
    return () => {
      cancel();
      window.removeEventListener('afterprint', onDone);
    };
  }, [printingList]);

  const { filtered, categoryCounts, delegateCounts, activeChips } = useFamiliesFilter(families, filters);

  const selectedFamily = useMemo(
    () => filtered.find((f) => f.id === selectedId) ?? families.find((f) => f.id === selectedId) ?? null,
    [filtered, families, selectedId],
  );

  const updateFilters = (patch) => setFilters((prev) => ({ ...prev, ...patch }));
  const clearAllFilters = () => setFilters(DEFAULT_FILTERS);

  const handleSelectFamily = (id) => {
    setSelectedId(id);
  };

  const handleOpenFullFile = (family) => {
    window.location.hash = `#/families/${family.id}`;
  };

  // Before saving a new family, ask the server whether another foundation holds a family under
  // the same head's four-part name; if so, the user says whether it is the same family.
  const handleCreateFamily = async (newFamily) => {
    setNotice('');
    try {
      const matches = await matchFamily(newFamily.headName);
      if (matches.length) { setPendingMatch({ family: newFamily, matches }); return; }
      const id = await createFamily(newFamily);
      await reload();
      setSelectedId(id);
    } catch (failure) { fail(failure); }
  };
  const finishCreate = async (linkTo) => {
    const { family } = pendingMatch;
    setPendingMatch(null);
    await save(async () => { const id = await createFamily(family, linkTo); setSelectedId(id); });
  };

  const handleConfirmPayment = (familyId, payment) => save(() => payFamily(familyId, payment));

  const handleBulkPay = (targetList) => save(() => bulkPayFamilies(targetList.filter((f) => f.arrears > 0).map((f) => f.id)));

  const handleSaveFamilyAid = (familyId, patch) => save(() => updateFamily(familyId, {
    category: patch.category,
    ...(patch.delegate ? { delegateId: patch.delegate.id } : {}),
    entitlements: patch.entitlements,
  }));

  const handleConfirmVisit = (familyId, visit) => save(() => visitFamily(familyId, visit));

  const monthLabel = AVAILABLE_MONTHS.find((m) => m.id === selectedMonth)?.label ?? AVAILABLE_MONTHS[0].label;

  return (
    <div
      dir="rtl"
      className="fam-saas -mx-[14px] -mb-3 min-h-[calc(100dvh-56px)] bg-[#F5F7FB] px-4 py-4 text-slate-900 md:-mx-[18px] md:px-7 md:py-5"
    >
      <div className="mx-auto flex max-w-[2400px] flex-col gap-6">
        <PageHeader
          families={families}
          selectedMonth={selectedMonth}
          onMonthChange={setSelectedMonth}
          onPrint={() => setPrintingList(filtered)}
          onAddFamily={() => setAddOpen(true)}
        />

        {(notice || error) && (
          <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700">
            {notice || `تعذّر تحميل العوائل: ${error}`}
          </p>
        )}

        <KpiCards
          families={families}
          loading={loading}
          onShowOverdue={() => updateFilters({ paymentStatus: 'overdue', sortBy: 'arrears_desc' })}
        />

        {/* Unified Desktop Card (Toolbar + Table + Pagination); Phone keeps its native mobile layout */}
        <div className="fam-unified-card space-y-3 md:space-y-0 md:overflow-hidden md:rounded-2xl md:border md:border-slate-200/80 md:bg-white md:shadow-[0_1px_2px_rgba(16,24,40,.04),0_6px_20px_rgba(16,24,40,.04)]">
          <div className="space-y-2.5 md:space-y-0">
            <FiltersToolbar
              filters={filters}
              onChange={updateFilters}
              categoryCounts={categoryCounts}
              delegateCounts={delegateCounts}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
            />
            {activeChips.length > 0 && (
              <div className="md:px-5 md:pb-3">
                <ActiveFilterChips
                  chips={activeChips}
                  onRemove={(key) => updateFilters({ [key]: key === 'query' ? '' : 'all' })}
                  onClearAll={clearAllFilters}
                />
              </div>
            )}
          </div>

          {/* Full-width Families List / Table */}
          <div>
            {!loading && filtered.length === 0 ? (
              <div className="md:p-6">
                {families.length === 0
                  ? <EmptyState title="لا توجد عوائل مسجّلة بعد" description="أضف أول عائلة من زر «إضافة عائلة»." />
                  : <EmptyState variant="no-results" onReset={clearAllFilters} />}
              </div>
            ) : (
            <>
            <div className="md:hidden">
              <FamilyMobileList
                onPhoto={(familyId, blob) => save(() => uploadFamilyPhoto(familyId, blob))}
                families={filtered}
                loading={loading}
                onOpenFullFile={handleOpenFullFile}
                onPay={setPayingFamily}
              />
            </div>
            <div className="hidden md:block">
            {viewMode === 'cards' ? (
              <div className="p-5">
                <FamiliesGrid
                  families={filtered}
                  selectedId={selectedFamily?.id ?? null}
                  loading={loading}
                  onSelect={handleSelectFamily}
                  onOpenFullFile={handleOpenFullFile}
                  onPay={setPayingFamily}
                  onRecordVisit={setVisitingFamily}
                  onPrint={(fam) => setPrintingList([fam])}
                />
              </div>
            ) : (
              <FamiliesTable
                families={filtered}
                selectedId={selectedFamily?.id ?? null}
                loading={loading}
                onSelect={handleSelectFamily}
                onOpenFullFile={handleOpenFullFile}
                onPay={setPayingFamily}
                onEditAid={setEditingAidFamily}
                onBulkPay={handleBulkPay}
                onBulkPrint={(list) => setPrintingList(list)}
              />
            )}
            </div>
            </>
            )}
          </div>
        </div>
      </div>

      {/* Interactive Modals */}
      <AddFamilyModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreate={handleCreateFamily}
      />
      <PaymentModal
        family={payingFamily}
        onClose={() => setPayingFamily(null)}
        onConfirm={handleConfirmPayment}
      />
      <EditAidModal
        family={editingAidFamily}
        onClose={() => setEditingAidFamily(null)}
        onSave={handleSaveFamilyAid}
      />
      <VisitModal
        family={visitingFamily}
        onClose={() => setVisitingFamily(null)}
        onConfirm={handleConfirmVisit}
      />

      {pendingMatch && (
        <MatchDialog
          headName={pendingMatch.family.headName}
          matches={pendingMatch.matches}
          onSame={(match) => void finishCreate(match.id)}
          onDifferent={() => void finishCreate(undefined)}
          onCancel={() => setPendingMatch(null)}
        />
      )}

      {/* A4 Print Portal */}
      {printingList && createPortal(
        <OfficialFamiliesPrintSheet families={printingList} monthLabel={monthLabel} />,
        document.body,
      )}
    </div>
  );
}

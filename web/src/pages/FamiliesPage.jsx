import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AVAILABLE_MONTHS,
  loadFamiliesStore,
  saveFamiliesStore,
} from '../data/families';
import { useFamiliesFilter } from '../hooks/useFamiliesFilter';
import { printWhenReady } from '../components/printWhenReady';
import { ActiveFilterChips } from '../components/families/ActiveFilterChips';
import { EmptyState } from '../components/families/EmptyState';
import { FamiliesGrid } from '../components/families/FamiliesGrid';
import { FamiliesTable } from '../components/families/FamiliesTable';
import {
  AddFamilyModal,
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
  const [families, setFamilies] = useState(() => loadFamiliesStore());
  const [selectedMonth, setSelectedMonth] = useState(AVAILABLE_MONTHS[0].id);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [viewMode, setViewMode] = useState('table');
  const [selectedId, setSelectedId] = useState(() => loadFamiliesStore()[0]?.id ?? null);
  // The families are read from this device synchronously, so there is nothing to wait for:
  // the page shows them at once (it used to hold empty boxes for 600 ms on every visit).
  const loading = false;

  const [addOpen, setAddOpen] = useState(false);
  const [payingFamily, setPayingFamily] = useState(null);
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

  const handleCreateFamily = (newFamily) => {
    const updated = [newFamily, ...families];
    setFamilies(updated);
    saveFamiliesStore(updated);
    setSelectedId(newFamily.id);
  };

  const handleConfirmPayment = (familyId, payment) => {
    const updated = families.map((fam) => {
      if (fam.id !== familyId) return fam;
      const due = totalEntitlement(fam);
      const nextPaid = fam.paidThisMonth + payment.amount;
      const nextArrears = Math.max(0, due - nextPaid);
      return {
        ...fam,
        paidThisMonth: nextPaid,
        arrears: nextArrears,
        arrearsMonths: nextArrears === 0 ? 0 : fam.arrearsMonths,
        payments: [payment, ...(fam.payments ?? [])],
      };
    });
    setFamilies(updated);
    saveFamiliesStore(updated);
  };

  const handleBulkPay = (targetList) => {
    const ids = new Set(targetList.map((f) => f.id));
    const updated = families.map((fam) => {
      if (!ids.has(fam.id) || fam.arrears <= 0) return fam;
      const payment = {
        date: '2026-11-15',
        amount: fam.arrears,
        type: 'راتب شهري',
        receivedBy: fam.headName,
        by: fam.delegate?.name ?? 'الصرف الجماعي',
      };
      return {
        ...fam,
        paidThisMonth: fam.paidThisMonth + fam.arrears,
        arrears: 0,
        arrearsMonths: 0,
        payments: [payment, ...(fam.payments ?? [])],
      };
    });
    setFamilies(updated);
    saveFamiliesStore(updated);
  };

  const handleConfirmVisit = (familyId, visit) => {
    const updated = families.map((fam) => (fam.id === familyId
      ? { ...fam, lastVisit: visit.date, visits: [visit, ...(fam.visits ?? [])] }
      : fam));
    setFamilies(updated);
    saveFamiliesStore(updated);
  };

  const monthLabel = AVAILABLE_MONTHS.find((m) => m.id === selectedMonth)?.label ?? AVAILABLE_MONTHS[0].label;

  return (
    <div
      dir="rtl"
      className="fam-saas -mx-[14px] -my-3 min-h-[calc(100dvh-56px)] bg-[#F5F7FB] px-4 py-6 text-slate-900 md:-mx-[18px] md:px-7"
    >
      <div className="mx-auto flex max-w-[1560px] flex-col gap-6">
        <PageHeader
          families={families}
          selectedMonth={selectedMonth}
          onMonthChange={setSelectedMonth}
          onPrint={() => setPrintingList(filtered)}
          onAddFamily={() => setAddOpen(true)}
        />

        <KpiCards
          families={families}
          loading={loading}
          onShowOverdue={() => updateFilters({ paymentStatus: 'overdue', sortBy: 'arrears_desc' })}
        />

        <div className="space-y-2.5">
          <FiltersToolbar
            filters={filters}
            onChange={updateFilters}
            categoryCounts={categoryCounts}
            delegateCounts={delegateCounts}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
          />
          <ActiveFilterChips
            chips={activeChips}
            onRemove={(key) => updateFilters({ [key]: key === 'query' ? '' : 'all' })}
            onClearAll={clearAllFilters}
          />
        </div>

        {/* Full-width Families List / Table */}
        <div>
          {!loading && filtered.length === 0 ? (
            <EmptyState variant="no-results" onReset={clearAllFilters} />
          ) : (
          <>
          <div className="md:hidden">
            <FamilyMobileList
              families={filtered}
              loading={loading}
              onOpenFullFile={handleOpenFullFile}
              onPay={setPayingFamily}
            />
          </div>
          <div className="hidden md:block">
          {viewMode === 'cards' ? (
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
          ) : (
            <FamiliesTable
              families={filtered}
              selectedId={selectedFamily?.id ?? null}
              loading={loading}
              onSelect={handleSelectFamily}
              onOpenFullFile={handleOpenFullFile}
              onPay={setPayingFamily}
              onBulkPay={handleBulkPay}
              onBulkPrint={(list) => setPrintingList(list)}
            />
          )}
          </div>
          </>
          )}
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
      <VisitModal
        family={visitingFamily}
        onClose={() => setVisitingFamily(null)}
        onConfirm={handleConfirmVisit}
      />

      {/* A4 Print Portal */}
      {printingList && createPortal(
        <OfficialFamiliesPrintSheet families={printingList} monthLabel={monthLabel} />,
        document.body,
      )}
    </div>
  );
}

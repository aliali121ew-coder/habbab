import { motion } from 'framer-motion';
import { FamilyCard } from './FamilyCard';

export function FamiliesGrid({
  families,
  selectedId,
  onSelect,
  onOpenFullFile,
  onPay,
  onRecordVisit,
  onPrint,
  loading = false,
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2" aria-busy="true">
        {[0, 1, 2, 3].map((idx) => (
          <div
            key={idx}
            className="h-80 animate-pulse rounded-2xl border border-slate-200/70 bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,.04),0_4px_16px_rgba(16,24,40,.04)]"
          >
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-full bg-slate-200" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-44 rounded bg-slate-200" />
                <div className="h-3 w-28 rounded bg-slate-100" />
              </div>
            </div>
            <div className="mt-5 h-12 w-full rounded-xl bg-slate-100" />
            <div className="mt-4 h-16 w-full rounded-xl bg-slate-100" />
            <div className="mt-6 h-8 w-full rounded-xl bg-slate-100" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <motion.div
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: 0 } }, // all cards fade in together, no queue
      }}
      initial="hidden"
      animate="show"
      className="grid grid-cols-1 gap-5 md:grid-cols-2"
    >
      {families.map((family) => (
        <FamilyCard
          key={family.id}
          family={family}
          selected={family.id === selectedId}
          onSelect={onSelect}
          onOpenFullFile={onOpenFullFile}
          onPay={onPay}
          onRecordVisit={onRecordVisit}
          onPrint={onPrint}
        />
      ))}
    </motion.div>
  );
}

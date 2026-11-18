import { useMemo, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, Building2, ChevronsUpDown, HandCoins, Receipt } from 'lucide-react';
import { formatNumber, MONTH_NAMES } from '../../format';
import { CATEGORY_BY_ID } from '../expenses/categories';
import type { ExpenseItem } from '../expenses/ExpensesPage';

interface Props {
  items: ExpenseItem[];
  currency: string;
}

type SortKey = 'beneficiary' | 'category' | 'spent_on' | 'amount';
type SortDir = 'asc' | 'desc';

const FOUNDATION_LABEL = 'صندوق المؤسسة';

// Entries without a person (or naming the foundation itself) go to the foundation's own fund.
const isFoundation = (name: string | null) => !name || name === 'المؤسسة' || name.startsWith('مؤسسة ');

const CATEGORY_TONES: Partial<Record<string, { bg: string; color: string }>> = {
  operation_aid: { bg: 'var(--fp-rose-soft)', color: 'var(--fp-rose)' },
  patient_aid: { bg: 'var(--fp-rose-soft)', color: 'var(--fp-rose)' },
  medicine: { bg: 'var(--fp-primary-soft)', color: 'var(--fp-primary)' },
  building_aid: { bg: 'var(--fp-amber-soft)', color: 'var(--fp-amber)' },
  food: { bg: 'var(--fp-emerald-soft)', color: 'var(--fp-emerald)' },
  cattle: { bg: 'var(--fp-emerald-soft)', color: 'var(--fp-emerald)' },
};
const DEFAULT_TONE = { bg: 'var(--fp-primary-soft)', color: 'var(--fp-primary)' };

const AVATAR_TONES = [
  { bg: 'var(--fp-primary-soft)', color: 'var(--fp-primary)' },
  { bg: 'var(--fp-emerald-soft)', color: 'var(--fp-emerald)' },
  { bg: 'var(--fp-amber-soft)', color: 'var(--fp-amber)' },
  { bg: 'var(--fp-rose-soft)', color: 'var(--fp-rose)' },
];

// Two initials and a steady colour per name: no guessing of age or gender from the name.
function Initials({ name }: { name: string | null }) {
  if (isFoundation(name)) {
    return (
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: 'var(--fp-muted-2)', color: 'var(--fp-ink-2)' }} aria-hidden>
        <Building2 size={18} />
      </span>
    );
  }
  const words = name!.trim().split(/\s+/);
  const letters = (words[0]?.[0] ?? '') + (words[1]?.[0] ?? '');
  const tone = AVATAR_TONES[[...name!].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % AVATAR_TONES.length];
  return (
    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold" style={{ backgroundColor: tone.bg, color: tone.color }} aria-hidden>
      {letters}
    </span>
  );
}

// «السبت 8 تشرين الثاني»: one heading per day on phones.
const dayLabel = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const weekday = new Intl.DateTimeFormat('ar-IQ', { weekday: 'long' }).format(new Date(y, m - 1, d));
  return `${weekday} ${d} ${MONTH_NAMES[m - 1]}`;
};

const shortDate = (iso: string) => iso.slice(0, 10).replaceAll('-', '/');

export function AidDisbursementsTable({ items, currency }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('spent_on');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir(key === 'spent_on' || key === 'amount' ? 'desc' : 'asc');
    }
  };

  const rows = useMemo(() => {
    const label = (item: ExpenseItem) => CATEGORY_BY_ID.get(item.category)?.label ?? item.category;
    const who = (item: ExpenseItem) => (isFoundation(item.beneficiary_name) ? FOUNDATION_LABEL : item.beneficiary_name!);
    const sorted = [...items].sort((a, b) => {
      const cmp = sortKey === 'spent_on' ? a.spent_on.localeCompare(b.spent_on) || a.id - b.id
        : sortKey === 'amount' ? a.amount - b.amount
          : sortKey === 'beneficiary' ? who(a).localeCompare(who(b), 'ar')
            : label(a).localeCompare(label(b), 'ar');
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted.slice(0, 8);
  }, [items, sortKey, sortDir]);

  // Phone list: always newest day first, entries kept in the chosen order inside each day.
  const byDay = useMemo(() => {
    const groups = new Map<string, ExpenseItem[]>();
    for (const item of [...rows].sort((a, b) => b.spent_on.localeCompare(a.spent_on))) {
      const day = item.spent_on.slice(0, 10);
      groups.set(day, [...(groups.get(day) ?? []), item]);
    }
    return [...groups.entries()];
  }, [rows]);

  const SortButton = ({ col, label, end = false }: { col: SortKey; label: string; end?: boolean }) => (
    <button
      type="button"
      onClick={() => toggleSort(col)}
      className={`inline-flex min-h-[36px] items-center gap-1 font-semibold transition hover:opacity-80 ${end ? 'flex-row-reverse' : ''}`}
      style={{ color: sortKey === col ? 'var(--fp-primary)' : 'inherit' }}
      aria-label={`ترتيب حسب ${label}`}
    >
      <span>{label}</span>
      {sortKey !== col ? <ChevronsUpDown size={13} className="opacity-50" aria-hidden /> : sortDir === 'asc' ? <ArrowUp size={13} aria-hidden /> : <ArrowDown size={13} aria-hidden />}
    </button>
  );

  return (
    <section aria-label="سجل المساعدات والصرفيات" className="fp-card flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b px-5 py-4" style={{ borderColor: 'var(--fp-border)' }}>
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: 'var(--fp-primary-soft)', color: 'var(--fp-primary)' }}
            aria-hidden
          >
            <HandCoins size={18} />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-bold" style={{ color: 'var(--fp-ink)' }}>آخر المساعدات</h2>
            <p className="text-xs" style={{ color: 'var(--fp-ink-3)' }}>أحدث ما صُرف هذا الشهر</p>
          </div>
        </div>
        <a
          href="#/expenses"
          className="inline-flex min-h-[44px] shrink-0 items-center gap-1 px-1 text-sm font-bold no-underline"
          style={{ color: 'var(--fp-primary)' }}
        >
          الكل <ArrowLeft size={15} aria-hidden />
        </a>
      </div>

      {rows.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm" style={{ color: 'var(--fp-ink-3)' }}>لا توجد مساعدات مسجلة هذا الشهر.</p>
      ) : (
        <>
          {/* Phone: entries grouped by day, so the date is said once; amounts line up in one column */}
          <div className="md:hidden">
            {byDay.map(([day, entries]) => (
              <section key={day} aria-label={dayLabel(day)}>
                <h3
                  className="flex items-center justify-between px-4 py-2 text-xs font-bold"
                  style={{ backgroundColor: 'var(--fp-muted)', color: 'var(--fp-ink-3)' }}
                >
                  <span>{dayLabel(day)}</span>
                  <span className="tabular-nums">
                    <bdi dir="ltr">{formatNumber(entries.reduce((sum, e) => sum + e.amount, 0))}</bdi> {currency}
                  </span>
                </h3>
                <ul>
                  {entries.map((item) => {
                    const cat = CATEGORY_BY_ID.get(item.category);
                    const CatIcon = cat?.icon ?? Receipt;
                    const tone = CATEGORY_TONES[item.category] ?? DEFAULT_TONE;
                    return (
                      <li key={item.id} className="flex items-center gap-3 border-t px-4 py-3" style={{ borderColor: 'var(--fp-border)' }}>
                        <Initials name={item.beneficiary_name} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold" style={{ color: 'var(--fp-ink)' }}>
                            {isFoundation(item.beneficiary_name) ? FOUNDATION_LABEL : item.beneficiary_name}
                          </p>
                          <span
                            className="mt-1 inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold"
                            style={{ backgroundColor: tone.bg, color: tone.color }}
                          >
                            <CatIcon size={12} className="shrink-0" aria-hidden />
                            <span className="truncate">{cat?.label ?? item.category}</span>
                          </span>
                        </div>
                        <div className="w-[96px] shrink-0 text-end">
                          <b className="block text-sm font-extrabold tabular-nums" style={{ color: 'var(--fp-ink)' }}>
                            <bdi dir="ltr">{formatNumber(item.amount)}</bdi>
                          </b>
                          <small className="block text-xs" style={{ color: 'var(--fp-ink-3)' }}>{currency}</small>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>

          {/* Tablet and desktop: the sortable table */}
          <div className="relative hidden w-0 min-w-full flex-1 overflow-x-auto md:block">
            <table className="w-full min-w-[640px] text-sm">
              <thead style={{ backgroundColor: 'var(--fp-muted)', color: 'var(--fp-ink-3)' }}>
                <tr className="border-b text-xs" style={{ borderColor: 'var(--fp-border)' }}>
                  <th className="px-5 py-1 text-start"><SortButton col="beneficiary" label="المستفيد" /></th>
                  <th className="px-4 py-1 text-start"><SortButton col="category" label="نوع المساعدة" /></th>
                  <th className="px-4 py-1 text-start font-semibold">التفاصيل</th>
                  <th className="px-4 py-1 text-start"><SortButton col="amount" label="المبلغ" /></th>
                  <th className="px-5 py-1 text-end"><SortButton col="spent_on" label="التاريخ" end /></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => {
                  const cat = CATEGORY_BY_ID.get(item.category);
                  const CatIcon = cat?.icon ?? Receipt;
                  const tone = CATEGORY_TONES[item.category] ?? DEFAULT_TONE;
                  return (
                    <tr key={item.id} className="fp-home-row border-b" style={{ borderColor: 'var(--fp-border)' }}>
                      <td className="whitespace-nowrap px-5 py-3">
                        <span className="flex items-center gap-3">
                          <Initials name={item.beneficiary_name} />
                          <span className="text-sm font-bold" style={{ color: 'var(--fp-ink)' }}>
                            {isFoundation(item.beneficiary_name) ? FOUNDATION_LABEL : item.beneficiary_name}
                          </span>
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold" style={{ backgroundColor: tone.bg, color: tone.color }}>
                          <CatIcon size={13} aria-hidden /> {cat?.label ?? item.category}
                        </span>
                      </td>
                      <td className="max-w-[260px] truncate px-4 py-3 text-xs" style={{ color: 'var(--fp-ink-2)' }} title={item.details ?? undefined}>
                        {item.details || '—'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-bold tabular-nums" style={{ color: 'var(--fp-ink)' }}>
                        <bdi dir="ltr">{formatNumber(item.amount)}</bdi> <small className="text-xs font-medium" style={{ color: 'var(--fp-ink-3)' }}>{currency}</small>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3 text-end text-xs tabular-nums" style={{ color: 'var(--fp-ink-2)' }}>
                        <bdi dir="ltr">{shortDate(item.spent_on)}</bdi>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

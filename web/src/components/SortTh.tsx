import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';

export type SortDir = 'asc' | 'desc';
export interface SortState<K extends string> { key: K; dir: SortDir }

// Clicking the sorted column flips its direction; another column starts in its natural order
// (newest / largest first for dates and amounts, A–Z for names).
export function nextSort<K extends string>(sort: SortState<K>, key: K, firstDir: SortDir): SortState<K> {
  return sort.key === key ? { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: firstDir };
}

// Compares two values for a sort: numbers by size, text in Arabic order.
export function compare(a: string | number, b: string | number, dir: SortDir): number {
  const result = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'ar');
  return dir === 'asc' ? result : -result;
}

interface Props<K extends string> {
  id: K;
  label: string;
  sort: SortState<K>;
  onSort: (key: K) => void;
  className?: string;
}

// A column heading that sorts its table: muted label with an up-down mark; the sorted column
// turns blue and shows its direction.
export function SortTh<K extends string>({ id, label, sort, onSort, className }: Props<K>) {
  const active = sort.key === id;
  const Icon = !active ? ChevronsUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th
      scope="col"
      className={['sort-th', active ? 'on' : '', className ?? ''].filter(Boolean).join(' ')}
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button type="button" onClick={() => onSort(id)}>
        {label}
        <Icon size={13} aria-hidden />
      </button>
    </th>
  );
}

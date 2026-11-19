import { useEffect, useState, type ReactNode } from 'react';
import { AlarmClock, CircleCheck, CircleX, Users } from 'lucide-react';
import { api, type Overview } from '../../api';
import { MONTH_NAMES, formatNumber } from '../../format';
import type { PayFilter } from './Register';

interface Props {
  overview: Overview | null;
  delegateId: number;
  year: number;
  /** The month the register's filters count up to; -1 for a year still ahead. */
  month: number;
  /** The card the list below is filtered by; null where there is no list (the delegate card). */
  filter: PayFilter | null;
  onPick: (filter: PayFilter) => void;
  /** More cards after the four, in the same style (e.g. patients and families). */
  children?: ReactNode;
}

interface Counts { alive: number; paid: number; unpaid: number; overdue: number }

export function Card({ tone, icon, label, value, note, active = false, onClick }: {
  tone: string; icon: ReactNode; label: string; value: number | null; note?: string; active?: boolean; onClick?: () => void;
}) {
  const body = (
    <>
      <span className="list-card-icon" aria-hidden>{icon}</span>
      <span className="list-card-label">{label}</span>
      <strong className="list-card-value">{value === null ? '—' : <bdi>{formatNumber(value)}</bdi>}</strong>
      {note && <small>{note}</small>}
    </>
  );
  // A card with nothing to open is plain text, not a button.
  return onClick
    ? <button type="button" className={`list-card ${tone}`} aria-pressed={active} onClick={onClick}>{body}</button>
    : <div className={`list-card ${tone}`}>{body}</div>;
}

// The full subscriber list's four figures, two by two. Each card filters the list below, and
// its figure is counted by the server with that filter's own rules, so the two always agree.
export function ListCards({ overview, delegateId, year, month, filter, onPick, children }: Props) {
  const [counts, setCounts] = useState<Counts | null>(null);

  useEffect(() => {
    if (month < 0) { setCounts({ alive: overview?.alive ?? 0, paid: 0, unpaid: 0, overdue: 0 }); return; }
    const controller = new AbortController();
    const query = new URLSearchParams({ year: String(year), delegate: String(delegateId), month: String(month) });
    api<Counts>(`/collections/pay-counts?${query}`, { signal: controller.signal })
      .then(setCounts)
      .catch(() => { /* the cards keep their dash; the list below still works */ });
    return () => controller.abort();
    // The overview reloads after every payment, so the counts follow it.
  }, [delegateId, year, month, overview]);

  // The living are counted with the list itself, so the card and the "الكل" rows agree.
  const alive = counts?.alive ?? overview?.alive ?? null;
  const total = alive !== null && overview ? alive + overview.deceased : null;
  const until = month >= 0 ? `حتى ${MONTH_NAMES[month]}` : undefined;

  return (
    <div className="list-cards" role="group" aria-label="أرقام المشتركين">
      <Card tone="all" icon={<Users size={18} />} label="المشتركين" value={total}
        note={alive !== null && overview ? `${formatNumber(alive)} أحياء · ${formatNumber(overview.deceased)} أموات` : undefined}
        active={filter === 'all'} onClick={() => onPick('all')} />
      <Card tone="paid" icon={<CircleCheck size={18} />} label="مسدد" value={counts?.paid ?? null}
        note={until} active={filter === 'paid'} onClick={() => onPick('paid')} />
      <Card tone="unpaid" icon={<CircleX size={18} />} label="غير مسدد" value={counts?.unpaid ?? null}
        note={until} active={filter === 'unpaid'} onClick={() => onPick('unpaid')} />
      <Card tone="late" icon={<AlarmClock size={18} />} label="المتأخرين" value={counts?.overdue ?? null}
        note="4 أشهر بلا تسديد" active={filter === 'overdue'} onClick={() => onPick('overdue')} />
      {children}
    </div>
  );
}

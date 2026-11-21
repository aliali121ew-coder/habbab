import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { formatIQD } from '../../utils/format';
import { BackToClose } from '../useBackToClose';

const MONTHS = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'];
// The week starts on Saturday, as in Iraq.
const WEEKDAYS = ['س', 'ح', 'ن', 'ث', 'ر', 'خ', 'ج'];
// Day names by Date.getDay() (Sunday first): short enough for the header button.
const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

const pad = (n) => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const todayIso = () => {
  const now = new Date();
  return iso(now.getFullYear(), now.getMonth(), now.getDate());
};

/** The button that replaces the print icon: today's weekday and date, like a desk calendar. */
export function CalendarButton({ onClick }) {
  const now = new Date();
  return (
    <button type="button" onClick={onClick} className="fam-cal-btn" aria-label={`تقويم الزيارات والمساعدات، اليوم ${now.getDate()} ${MONTHS[now.getMonth()]}`}>
      <span className="fam-cal-btn-month">{DAY_NAMES[now.getDay()]}</span>
      <span className="fam-cal-btn-day">{now.getDate()}</span>
    </button>
  );
}

/**
 * A month calendar of every family's visits and aid: a visit day is marked in one colour, an aid
 * day in another (a day with both shows both). Tapping a day lists what happened on it.
 */
export function FamiliesCalendar({ families, open, onClose }) {
  const now = new Date();
  const [view, setView] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [picked, setPicked] = useState(todayIso);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // date → { visits: [...], aids: [...] }, each entry carrying its family's name.
  const byDay = useMemo(() => {
    const map = new Map();
    const slot = (date) => {
      if (!map.has(date)) map.set(date, { visits: [], aids: [] });
      return map.get(date);
    };
    for (const family of families) {
      for (const visit of family.visits ?? []) slot(visit.date).visits.push({ ...visit, family });
      for (const payment of family.payments ?? []) slot(payment.date).aids.push({ ...payment, family });
    }
    return map;
  }, [families]);

  if (!open) return null;

  const first = new Date(view.y, view.m, 1);
  const lead = (first.getDay() + 1) % 7; // empty cells before the 1st, counting from Saturday
  const days = new Date(view.y, view.m + 1, 0).getDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const month = `${view.y}-${pad(view.m + 1)}`;
  const monthVisits = [...byDay.entries()].filter(([d]) => d.startsWith(month)).reduce((n, [, e]) => n + e.visits.length, 0);
  const monthAids = [...byDay.entries()].filter(([d]) => d.startsWith(month)).reduce((n, [, e]) => n + e.aids.length, 0);
  const shift = (delta) => setView(({ y, m }) => {
    const next = new Date(y, m + delta, 1);
    return { y: next.getFullYear(), m: next.getMonth() };
  });
  const today = todayIso();
  const day = byDay.get(picked);

  return createPortal(
    <div className="fam-cal-layer" role="presentation" onClick={onClose}>
      {/* The phone's back button closes the calendar rather than leaving the page. */}
      <BackToClose onClose={onClose} />
      <section className="fam-cal-sheet" role="dialog" aria-modal="true" aria-label="تقويم الزيارات والمساعدات" onClick={(event) => event.stopPropagation()}>
        <header className="fam-cal-head">
          <button type="button" className="fam-cal-nav" aria-label="الشهر السابق" onClick={() => shift(-1)}><ChevronRight aria-hidden /></button>
          <h2>{MONTHS[view.m]} <bdi>{view.y}</bdi></h2>
          <button type="button" className="fam-cal-nav" aria-label="الشهر التالي" onClick={() => shift(1)}><ChevronLeft aria-hidden /></button>
          <button type="button" className="fam-cal-close" aria-label="إغلاق" onClick={onClose}><X aria-hidden /></button>
        </header>

        <div className="fam-cal-legend">
          <span className="is-visit"><i aria-hidden />زيارات <bdi>{monthVisits}</bdi></span>
          <span className="is-aid"><i aria-hidden />مساعدات <bdi>{monthAids}</bdi></span>
        </div>

        <div className="fam-cal-grid" role="grid">
          {WEEKDAYS.map((w) => <span key={w} className="fam-cal-wd" aria-hidden>{w}</span>)}
          {cells.map((d, i) => {
            if (!d) return <span key={`e${i}`} />;
            const date = iso(view.y, view.m, d);
            const entry = byDay.get(date);
            const visit = Boolean(entry?.visits.length);
            const aid = Boolean(entry?.aids.length);
            const cls = ['fam-cal-day', visit && aid ? 'is-both' : visit ? 'is-visit' : aid ? 'is-aid' : '', date === today ? 'is-today' : '', date === picked ? 'is-picked' : ''].filter(Boolean).join(' ');
            return (
              <button key={date} type="button" className={cls} aria-pressed={date === picked} onClick={() => setPicked(date)}
                aria-label={`${d} ${MONTHS[view.m]}${visit ? `، ${entry.visits.length} زيارة` : ''}${aid ? `، ${entry.aids.length} مساعدة` : ''}`}>
                {d}
              </button>
            );
          })}
        </div>

        <div className="fam-cal-list">
          <h3><bdi>{picked.split('-').map(Number).join('/')}</bdi></h3>
          {!day ? <p className="fam-cal-empty">لا زيارات ولا مساعدات في هذا اليوم</p> : (
            <ul>
              {day.visits.map((v, i) => (
                <li key={`v${i}`} className="is-visit"><i aria-hidden /><div><strong>زيارة · {v.family.name}</strong><small>{v.delegateName}</small></div></li>
              ))}
              {day.aids.map((a, i) => (
                <li key={`a${i}`} className="is-aid"><i aria-hidden /><div><strong>{a.type} · {a.family.name}</strong><small>{formatIQD(a.amount)}</small></div></li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
}

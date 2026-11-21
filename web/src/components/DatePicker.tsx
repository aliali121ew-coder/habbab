import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { MONTH_NAMES, today } from '../format';

export interface DateRange { from: string; to: string }

interface Props {
  // «single» picks one day (from === to); «range» picks a first and a last day.
  mode: 'single' | 'range';
  value: DateRange;
  onChange: (value: DateRange) => void;
  label: string;
  // Days that hold records, drawn with a dot under the number.
  marked?: ReadonlySet<string>;
  // The «آخر 7 / 30 / 90 يوماً» shortcuts above the calendar (range mode only).
  presets?: boolean;
}

// The week as the foundation's calendars print it: Saturday first.
const WEEKDAYS = ['سبت', 'أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة'];
const PRESETS = [
  { days: 7, label: 'آخر 7 أيام' },
  { days: 30, label: 'آخر 30 يوماً' },
  { days: 90, label: 'آخر 90 يوماً' },
];

// Dates stay as YYYY-MM-DD strings and are counted in UTC, so a day never shifts with the clock.
const parse = (iso: string) => new Date(`${iso}T00:00:00Z`);
const toIso = (date: Date) => date.toISOString().slice(0, 10);
export const addDays = (iso: string, days: number) => {
  const date = parse(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return toIso(date);
};
export const monthRange = (year: number, month: number): DateRange => ({
  from: toIso(new Date(Date.UTC(year, month, 1))),
  to: toIso(new Date(Date.UTC(year, month + 1, 0))),
});
export const slashDate = (iso: string) => iso.replaceAll('-', '/');

// A whole calendar month, as the sheets name their periods.
export function wholeMonth({ from, to }: DateRange): { year: number; month: number } | null {
  const start = parse(from);
  const whole = monthRange(start.getUTCFullYear(), start.getUTCMonth());
  return whole.from === from && whole.to === to ? { year: start.getUTCFullYear(), month: start.getUTCMonth() } : null;
}

// «تشرين الثاني 2026» for a whole month, «2026/11/07» for a day, else «2026/11/01 – 2026/11/07».
export function periodLabel(range: DateRange): string {
  const month = wholeMonth(range);
  if (month) return `${MONTH_NAMES[month.month]} ${month.year}`;
  if (range.from === range.to) return slashDate(range.from);
  return `${slashDate(range.from)} – ${slashDate(range.to)}`;
}

// A date field that opens a month calendar. In range mode the first tap starts the period and the
// second ends it (either order); the shortcuts and «هذا الشهر» apply at once.
export function DatePicker({ mode, value, onChange, label, marked, presets = false }: Props) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => monthOf(value.to));
  const [start, setStart] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const now = today();

  useLayoutEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const popWidth = popRef.current?.offsetWidth || 340;
      const maxLeft = Math.max(12, window.innerWidth - popWidth - 12);
      // In RTL, align the popover's left edge with the trigger's left edge, clamped inside the viewport.
      const left = Math.min(maxLeft, Math.max(12, rect.left));
      const top = rect.bottom + 10;
      setPos({ top, left });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !popRef.current?.contains(target)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = () => {
    setView(monthOf(value.to));
    setStart(null);
    setHover(null);
    setOpen((current) => !current);
  };
  const apply = (next: DateRange) => {
    onChange(next);
    setOpen(false);
  };
  const pick = (day: string) => {
    if (mode === 'single') return apply({ from: day, to: day });
    if (!start) return setStart(day);
    return apply(day < start ? { from: day, to: start } : { from: start, to: day });
  };
  const step = (months: number) => setView(({ year, month }) => {
    const date = new Date(Date.UTC(year, month + months, 1));
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() };
  });

  // Six weeks from the Saturday on or before the 1st, so every month has the same height.
  const days = useMemo(() => {
    const first = new Date(Date.UTC(view.year, view.month, 1));
    const lead = (first.getUTCDay() + 1) % 7;
    const origin = addDays(toIso(first), -lead);
    return Array.from({ length: 42 }, (_, index) => addDays(origin, index));
  }, [view]);

  // While a period is half chosen, the shading follows the pointer from its first day.
  const shown: DateRange = start
    ? (hover && hover < start ? { from: hover, to: start } : { from: start, to: hover && hover > start ? hover : start })
    : value;
  const viewPrefix = `${view.year}-${String(view.month + 1).padStart(2, '0')}`;

  return (
    <div className="datepicker" ref={rootRef}>
      {/* The field reads «التاريخ»; the chosen period shows in the page's headings and on hover. */}
      <button
        type="button"
        className="dp-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${label}: ${periodLabel(value)}`}
        title={periodLabel(value)}
        onClick={toggle}
      >
        <CalendarDays size={18} strokeWidth={1.9} aria-hidden className="dp-icon" />
        <span>التاريخ</span>
      </button>

      {open && createPortal(
        <div
          ref={popRef}
          className="dp-pop"
          role="dialog"
          aria-label={label}
          style={pos ? { top: `${pos.top}px`, left: `${pos.left}px` } : undefined}
        >
          {presets && mode === 'range' && (
            <div className="dp-presets">
              {PRESETS.map((preset) => (
                <button key={preset.days} type="button" onClick={() => apply({ from: addDays(now, 1 - preset.days), to: now })}>
                  {preset.label}
                </button>
              ))}
            </div>
          )}

          <header className="dp-head">
            <button type="button" aria-label="الشهر السابق" onClick={() => step(-1)}><ChevronRight size={18} aria-hidden /></button>
            <strong aria-live="polite">{MONTH_NAMES[view.month]} <bdi>{view.year}</bdi></strong>
            <button type="button" aria-label="الشهر التالي" onClick={() => step(1)}><ChevronLeft size={18} aria-hidden /></button>
          </header>

          <div className="dp-grid" role="grid" aria-label={`${MONTH_NAMES[view.month]} ${view.year}`} onPointerLeave={() => setHover(null)}>
            {WEEKDAYS.map((name) => <span key={name} className="dp-weekday" role="columnheader">{name}</span>)}
            {days.map((day) => {
              const edge = day === shown.from || day === shown.to;
              const classes = ['dp-day'];
              if (!day.startsWith(viewPrefix)) classes.push('outside');
              if (day > shown.from && day < shown.to) classes.push('in-range');
              if (edge) classes.push('edge');
              if (day === shown.from && shown.from !== shown.to) classes.push('first');
              if (day === shown.to && shown.from !== shown.to) classes.push('last');
              if (day === now) classes.push('today');
              return (
                <button
                  key={day}
                  type="button"
                  role="gridcell"
                  aria-selected={edge}
                  aria-label={slashDate(day)}
                  className={classes.join(' ')}
                  onClick={() => pick(day)}
                  onPointerEnter={() => setHover(day)}
                >
                  <span><bdi>{Number(day.slice(8))}</bdi></span>
                  {marked?.has(day) && <i className="dp-dot" aria-hidden />}
                </button>
              );
            })}
          </div>

          <footer className="dp-foot">
            <p>{start ? 'اختر آخر يوم في المدة' : mode === 'range' ? 'اضغط يوم البداية ثم يوم النهاية' : 'اضغط اليوم المطلوب'}</p>
            <button
              type="button"
              className="dp-now"
              onClick={() => apply(mode === 'range' ? monthRange(Number(now.slice(0, 4)), Number(now.slice(5, 7)) - 1) : { from: now, to: now })}
            >
              {mode === 'range' ? 'هذا الشهر' : 'اليوم'}
            </button>
          </footer>
        </div>,
        document.body,
      )}
    </div>
  );
}

function monthOf(iso: string) {
  const date = parse(iso);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() };
}

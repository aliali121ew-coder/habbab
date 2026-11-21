import { useState, useRef, useEffect } from 'react';
import { Calendar, ChevronDown, ChevronLeft, HeartHandshake, Plus, Printer } from 'lucide-react';
import { AVAILABLE_MONTHS } from '../../data/families';
import { CalendarButton, FamiliesCalendar } from './FamiliesCalendar';

export function PageHeader({ families = [], selectedMonth, onMonthChange, onPrint, onAddFamily }) {
  const [monthMenuOpen, setMonthMenuOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const menuRef = useRef(null);
  const desktopMenuRef = useRef(null);

  useEffect(() => {
    if (!monthMenuOpen) return undefined;
    const onPointer = (e) => {
      if (!menuRef.current?.contains(e.target) && !desktopMenuRef.current?.contains(e.target)) setMonthMenuOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setMonthMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [monthMenuOpen]);

  const activeMonth = AVAILABLE_MONTHS.find((m) => m.id === selectedMonth) ?? AVAILABLE_MONTHS[0];

  const monthMenu = (side) => (
    <div
      role="menu"
      aria-label="اختر الشهر"
      className={`absolute ${side} z-30 mt-1.5 w-52 rounded-2xl border border-slate-200/80 bg-white p-1.5 shadow-lg`}
    >
      {AVAILABLE_MONTHS.map((m) => (
        <button
          key={m.id}
          type="button"
          role="menuitemradio"
          aria-checked={m.id === selectedMonth}
          onClick={() => {
            onMonthChange(m.id);
            setMonthMenuOpen(false);
          }}
          className={`flex min-h-[44px] w-full items-center justify-between rounded-xl px-3 text-sm font-medium transition md:min-h-0 md:py-2 md:text-xs ${
            m.id === selectedMonth ? 'bg-blue-600/10 font-semibold text-blue-700' : 'text-slate-700 hover:bg-slate-50'
          }`}
        >
          <span>{m.label}</span>
          {m.id === selectedMonth && <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />}
        </button>
      ))}
    </div>
  );

  return (
    <>
    {/* Phone: one compact row (title + month under it, today's date for the calendar), then the add button */}
    <header className="md:hidden" ref={menuRef}>
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-bl from-blue-600 to-indigo-600 text-white shadow-[0_6px_16px_-6px_rgba(37,99,235,0.65)]">
          <HeartHandshake className="h-6 w-6" aria-hidden />
        </div>
        <div className="relative min-w-0 flex-1">
          <h1 className="text-[22px] font-extrabold leading-tight text-slate-900">العوائل المتعففة</h1>
          <button
            type="button"
            onClick={() => setMonthMenuOpen((prev) => !prev)}
            aria-expanded={monthMenuOpen}
            aria-haspopup="menu"
            aria-label={`الشهر: ${activeMonth.label}`}
            className="-ms-1 mt-0.5 inline-flex min-h-[32px] items-center gap-1 rounded-lg px-1 text-[13px] font-semibold text-blue-600"
          >
            <Calendar className="h-4 w-4" aria-hidden />
            <span>{activeMonth.label}</span>
            <ChevronDown className={`h-4 w-4 transition ${monthMenuOpen ? 'rotate-180' : ''}`} aria-hidden />
          </button>
          {monthMenuOpen && monthMenu('start-0')}
        </div>
        {/* Today's date in place of the print icon: it opens the visits and aid calendar. */}
        <CalendarButton onClick={() => setCalendarOpen(true)} />
      </div>

      {/* The add button sits at the top with the month (it used to float over the list). */}
      <button
        type="button"
        onClick={onAddFamily}
        className="fam-add-top mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-l from-blue-600 to-indigo-600 text-sm font-bold text-white shadow-[0_10px_22px_-10px_rgba(37,99,235,0.7)] active:scale-[.98]"
      >
        <Plus className="h-5 w-5" aria-hidden />
        <span>إضافة عائلة</span>
      </button>
      <FamiliesCalendar families={families} open={calendarOpen} onClose={() => setCalendarOpen(false)} />
    </header>

    <header className="hidden flex-col gap-4 md:flex md:flex-row md:items-center md:justify-between">
      <div>
        <nav aria-label="مسار التنقل" className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-500">
          <a href="#/" className="transition hover:text-blue-600">الرئيسية</a>
          <ChevronLeft className="h-3.5 w-3.5 text-slate-400" aria-hidden />
          <span className="font-semibold text-slate-700">العوائل المتعففة</span>
        </nav>

        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-bl from-blue-600 to-indigo-600 text-white shadow-[0_6px_16px_-6px_rgba(37,99,235,0.65)]">
            <HeartHandshake className="h-6 w-6" aria-hidden />
          </div>
          <div>
            <h1 id="families-page-heading" tabIndex={-1} className="text-2xl font-bold tracking-tight text-slate-900 focus:outline-none">
              العوائل المتعففة
            </h1>
            <p className="mt-0.5 text-xs text-slate-500 md:text-sm">
              سجل العوائل المكفولة ومستحقاتها الشهرية والمندوب المسؤول عنها
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative" ref={desktopMenuRef}>
          <button
            type="button"
            onClick={() => setMonthMenuOpen((prev) => !prev)}
            aria-expanded={monthMenuOpen}
            aria-haspopup="menu"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200/80 bg-white px-3.5 text-xs font-semibold text-slate-700 shadow-xs transition hover:border-slate-300 hover:bg-slate-50"
          >
            <Calendar className="h-4 w-4 text-blue-600" aria-hidden />
            <span>{activeMonth.label}</span>
            <ChevronDown className="h-3.5 w-3.5 text-slate-400" aria-hidden />
          </button>

          {monthMenuOpen && monthMenu('start-0')}
        </div>

        <button
          type="button"
          onClick={onPrint}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200/80 bg-white px-4 text-xs font-semibold text-slate-700 shadow-xs transition hover:border-slate-300 hover:bg-slate-50"
        >
          <Printer className="h-4 w-4 text-slate-500" aria-hidden />
          <span>طباعة السجل</span>
        </button>

        <button
          type="button"
          onClick={onAddFamily}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-l from-blue-600 to-indigo-600 px-4 text-xs font-semibold text-white shadow-[0_6px_16px_-6px_rgba(37,99,235,0.65)] transition hover:brightness-105"
        >
          <Plus className="h-4 w-4" aria-hidden />
          <span>إضافة عائلة</span>
        </button>
      </div>
    </header>
    </>
  );
}

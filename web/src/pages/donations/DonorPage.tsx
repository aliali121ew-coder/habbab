import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ArrowRight, ArrowUpLeft, Banknote, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Gift, Hash, MessageCircle, Package, Phone, Plus, Receipt, Trophy, TrendingDown, TrendingUp, UserRound,
} from 'lucide-react';
import { api, type Me } from '../../api';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import { StateMessage } from '../../components/StateMessage';
import { MONTH_NAMES, formatCompact, formatNumber, formatPercent } from '../../format';
import { DonationDialog, type Donation } from '../aid/DonationDialog';

interface File {
  name: string;
  year: number;
  items: Donation[];
  year_cash: number;
  donors_count: number;
  rank: number | null;
}

const now = new Date();
const THIS_YEAR = now.getUTCFullYear();
const THIS_MONTH = now.getUTCMonth();
const DAYS = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];
const showDate = (iso: string) => iso.slice(0, 10).replace(/-/g, '/');
const PURPOSE_TONES = ['var(--dp-violet)', 'var(--dp-night)', 'var(--dp-lilac)', '#f4b740', '#34d399', '#f472b6'];

// One donor's file — laid out after the approved dashboard picture: a welcome title with figure
// pills, the donor card, the year's giving bars, a twelve-month ring, the purposes split, the dark
// list of gifts, a calendar of the month's gifts, and folding details.
export function DonorPage({ me, name }: { me: Me; name: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState<{ donation: Donation | null } | null>(null);
  const [calendar, setCalendar] = useState<{ year: number; month: number } | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      setFile(await api<File>(`/donations/donor?name=${encodeURIComponent(name)}&year=${THIS_YEAR}`));
    } catch (failure) {
      setError((failure as Error).message);
    }
  }, [name]);
  useEffect(() => { void load(); }, [load]);

  const data = useMemo(() => {
    if (!file) return null;
    const items = file.items;
    const ofYear = (year: number) => items.filter((item) => Number(item.received_on.slice(0, 4)) === year);
    const thisYear = ofYear(THIS_YEAR);
    const lastYear = ofYear(THIS_YEAR - 1);
    const cash = (list: Donation[]) => list.filter((item) => item.kind === 'cash').reduce((sum, item) => sum + (item.amount ?? 0), 0);
    const months = Array<number>(12).fill(0);
    thisYear.forEach((item) => { if (item.kind === 'cash') months[Number(item.received_on.slice(5, 7)) - 1] += item.amount ?? 0; });
    const counts = Array<number>(12).fill(0);
    thisYear.forEach((item) => { counts[Number(item.received_on.slice(5, 7)) - 1] += 1; });
    // Months with any gift in the last twelve months (this month included).
    const recent = new Set<string>();
    items.forEach((item) => recent.add(item.received_on.slice(0, 7)));
    const lastTwelve = Array.from({ length: 12 }, (_, back) => {
      const d = new Date(Date.UTC(THIS_YEAR, THIS_MONTH - back, 1));
      return recent.has(d.toISOString().slice(0, 7));
    });
    const purposes = new Map<string, number>();
    items.forEach((item) => purposes.set(item.purpose ?? 'عامة', (purposes.get(item.purpose ?? 'عامة') ?? 0) + 1));
    const goods = new Map<string, { qty: number; unit: string | null; times: number }>();
    items.filter((item) => item.kind === 'in_kind').forEach((item) => {
      const row = goods.get(item.item ?? '') ?? { qty: 0, unit: item.unit, times: 0 };
      row.qty += item.quantity ?? 0;
      row.times += 1;
      goods.set(item.item ?? '', row);
    });
    const first = items[items.length - 1];
    const latest = items[0];
    const cashCount = items.filter((item) => item.kind === 'cash').length;
    const elapsed = THIS_MONTH + 1;
    const activeThisYear = months.filter((_, at) => counts[at] > 0).length;
    return {
      totalCash: cash(items),
      yearCash: cash(thisYear),
      lastYearCash: cash(lastYear),
      yearCount: thisYear.length,
      months,
      counts,
      lastTwelve,
      purposes: [...purposes].sort((a, b) => b[1] - a[1]),
      goods: [...goods].sort((a, b) => b[1].times - a[1].times),
      first,
      latest,
      share: file.year_cash > 0 ? (cash(thisYear) / file.year_cash) * 100 : 0,
      cashShare: items.length ? (cashCount / items.length) * 100 : 0,
      kindShare: items.length ? ((items.length - cashCount) / items.length) * 100 : 0,
      regularity: (activeThisYear / elapsed) * 100,
      type: latest.donor_type,
      phone: items.find((item) => item.donor_phone)?.donor_phone ?? null,
      notes: items.filter((item) => item.note).slice(0, 6),
      recorders: [...new Set(items.map((item) => item.created_by_name).filter(Boolean))] as string[],
      receipts: items.filter((item) => item.receipt_no).length,
    };
  }, [file]);

  useEffect(() => {
    if (data && !calendar) {
      setCalendar({ year: Number(data.latest.received_on.slice(0, 4)), month: Number(data.latest.received_on.slice(5, 7)) - 1 });
    }
  }, [data, calendar]);

  const change = data && data.lastYearCash > 0 ? ((data.yearCash - data.lastYearCash) / data.lastYearCash) * 100 : null;

  return (
    <div className="dp">
      <div className="dp-top">
        <Breadcrumbs items={[{ label: 'التبرعات', href: '#/soon/donations' }, { label: name }]} />
        <a className="dp-back" href="#/soon/donations"><ArrowRight size={16} aria-hidden /> جدار العطاء</a>
      </div>

      {error && !file && <StateMessage kind="error" title="تعذّر فتح ملف المتبرع" hint={error} onRetry={load} />}
      {!file && !error && <div className="dp-board" aria-busy="true"><div className="dp-card skeleton dp-skel" /></div>}

      {file && data && (
        <div className="dp-board">
          {/* ── Welcome row ───────────────────────────── */}
          <header className="dp-welcome">
            <div className="dp-welcome-main">
              <h1>ملف العطاء، <span>{file.name}</span></h1>
              <ul className="dp-pills" aria-label="مؤشرات المتبرع">
                <li className="w-share"><small>حصته من تبرعات {THIS_YEAR}</small><span className="dp-pill night"><bdi>{formatPercent(data.share)}</bdi></span></li>
                <li className="w-cash"><small>تبرعات مالية</small><span className="dp-pill violet"><bdi>{formatPercent(data.cashShare)}</bdi></span></li>
                <li className="w-steady">
                  <small>انتظام العطاء في {THIS_YEAR}</small>
                  <span className="dp-pill striped" style={{ '--fill': `${Math.max(data.regularity, 8)}%` } as React.CSSProperties}><bdi>{formatPercent(data.regularity)}</bdi></span>
                </li>
                <li className="w-kind"><small>مساعدات عينية</small><span className="dp-pill outline"><bdi>{formatPercent(data.kindShare)}</bdi></span></li>
              </ul>
            </div>
            <dl className="dp-stats">
              <div><span className="dp-stat-icon" aria-hidden><Banknote size={18} /></span><dd><bdi>{formatNumber(data.totalCash)}</bdi></dd><dt>مجموع عطائه ({me.currency})</dt></div>
              <div><span className="dp-stat-icon" aria-hidden><Gift size={18} /></span><dd><bdi>{formatNumber(file.items.length)}</bdi></dd><dt>تبرع</dt></div>
              <div><span className="dp-stat-icon" aria-hidden><Trophy size={18} /></span><dd>{file.rank ? <bdi>#{file.rank}</bdi> : '—'}</dd><dt>ترتيبه من <bdi>{formatNumber(file.donors_count)}</bdi></dt></div>
            </dl>
          </header>

          {/* ── Donor card ───────────────────────────── */}
          <section className="dp-card dp-person" aria-label="بطاقة المتبرع">
            <span className="dp-person-glow" aria-hidden />
            <span className="dp-initial" aria-hidden>{file.name.trim().charAt(0)}</span>
            <div className="dp-person-foot">
              <div>
                <b>{file.name}</b>
                <small>{data.type === 'internal' ? 'متبرع من داخل المؤسسة' : 'متبرع من خارج المؤسسة'}</small>
              </div>
              <span className="dp-glass-badge"><b><bdi>{formatNumber(data.yearCash)}</bdi></b><small>عطاء {THIS_YEAR}</small></span>
            </div>
          </section>

          {/* ── Giving bars ───────────────────────────── */}
          <section className="dp-card dp-bars" aria-labelledby="dp-bars-title">
            <header className="dp-card-head">
              <h2 id="dp-bars-title">تقدّم العطاء</h2>
              <a href="#/soon/donations" className="dp-corner" aria-label="جدار العطاء"><ArrowUpLeft size={16} aria-hidden /></a>
            </header>
            <p className="dp-big"><bdi>{formatNumber(data.yearCount)}</bdi> <span>تبرعات في {THIS_YEAR}</span></p>
            <p className={`dp-trend${change !== null && change < 0 ? ' down' : ''}`}>
              {change === null ? 'أول عام له في السجل' : <>{change >= 0 ? <TrendingUp size={14} aria-hidden /> : <TrendingDown size={14} aria-hidden />} <bdi>{formatPercent(Math.abs(change))}</bdi> عن {THIS_YEAR - 1}</>}
            </p>
            <MiniBars values={data.months} upTo={THIS_MONTH} currency={me.currency} />
          </section>

          {/* ── Twelve-month ring ───────────────────────────── */}
          <section className="dp-card dp-ring-card" aria-labelledby="dp-ring-title">
            <header className="dp-card-head">
              <h2 id="dp-ring-title">نبض آخر 12 شهراً</h2>
              <span className="dp-corner" aria-hidden><CalendarDays size={16} /></span>
            </header>
            <Ring filled={data.lastTwelve} />
            <div className="dp-ring-actions">
              <button type="button" className="dp-round" onClick={() => setDialog({ donation: null })} aria-label="تسجيل تبرع جديد"><Plus size={18} aria-hidden /></button>
              {data.phone && <a className="dp-round" href={`tel:${data.phone}`} aria-label={`اتصال بـ ${file.name}`}><Phone size={17} aria-hidden /></a>}
              {data.phone && <a className="dp-round dark" href={`https://wa.me/${data.phone.replace(/\D/g, '').replace(/^0/, '964')}`} target="_blank" rel="noreferrer" aria-label={`واتساب ${file.name}`}><MessageCircle size={17} aria-hidden /></a>}
            </div>
          </section>

          {/* ── Purposes split ───────────────────────────── */}
          <section className="dp-card dp-split-card" aria-labelledby="dp-split-title">
            <header className="dp-card-head">
              <h2 id="dp-split-title">لأين يذهب عطاؤه</h2>
              <b className="dp-split-top"><bdi>{formatPercent((data.purposes[0]?.[1] ?? 0) / file.items.length * 100)}</bdi></b>
            </header>
            <div className="dp-segments">
              {data.purposes.slice(0, 4).map(([purpose, count], at) => (
                <div key={purpose} style={{ flexGrow: count }}>
                  <small><bdi>{formatPercent((count / file.items.length) * 100)}</bdi></small>
                  <span style={{ background: PURPOSE_TONES[at] }}>{at === 0 ? purpose : ''}</span>
                </div>
              ))}
            </div>
            <ul className="dp-split-legend">
              {data.purposes.slice(0, 4).map(([purpose], at) => <li key={purpose}><i style={{ background: PURPOSE_TONES[at] }} aria-hidden />{purpose}</li>)}
            </ul>
          </section>

          {/* ── Dark list of gifts ───────────────────────────── */}
          <section className="dp-card dp-tasks" aria-labelledby="dp-tasks-title">
            <header className="dp-card-head">
              <h2 id="dp-tasks-title">سجل العطاء</h2>
              <b title="تبرعات موثّقة بوصل من مجموع التبرعات"><bdi>{data.receipts}/{file.items.length}</bdi></b>
            </header>
            <ul>
              {file.items.slice(0, 7).map((item) => (
                <li key={item.id}>
                  <button type="button" onClick={() => setDialog({ donation: item })}>
                    <span className="dp-task-icon" aria-hidden>{item.kind === 'cash' ? <Banknote size={16} /> : <Package size={16} />}</span>
                    <span className="dp-task-text">
                      <b>{item.kind === 'cash' ? <><bdi>{formatNumber(item.amount ?? 0)}</bdi> {me.currency}</> : <>{item.item}{item.quantity ? <> · <bdi>{formatNumber(item.quantity)}</bdi> {item.unit}</> : null}</>}</b>
                      <small><bdi>{showDate(item.received_on)}</bdi>{item.purpose ? ` · ${item.purpose}` : ''}</small>
                    </span>
                    <span className={`dp-check${item.receipt_no ? ' on' : ''}`} title={item.receipt_no ? `وصل ${item.receipt_no}` : 'بلا وصل'}>{item.receipt_no && <Check size={13} strokeWidth={3} aria-hidden />}</span>
                  </button>
                </li>
              ))}
            </ul>
            {file.items.length > 7 && <p className="dp-tasks-more">{file.items.length - 7 === 1 ? 'وتبرع واحد أقدم' : <>و<bdi>{formatNumber(file.items.length - 7)}</bdi> تبرعات أقدم</>}</p>}
          </section>

          {/* ── Folding details ───────────────────────────── */}
          <section className="dp-card dp-fold" aria-label="تفاصيل المتبرع">
            <Fold title="بيانات المتبرع" open>
              <ul className="dp-facts">
                <li><UserRound size={15} aria-hidden />{data.type === 'internal' ? 'من داخل المؤسسة' : 'من خارج المؤسسة'}</li>
                {data.phone && <li><Phone size={15} aria-hidden /><bdi dir="ltr">{data.phone}</bdi></li>}
                <li><CalendarDays size={15} aria-hidden />أول تبرع <bdi>{showDate(data.first.received_on)}</bdi></li>
                <li><Hash size={15} aria-hidden />آخر تبرع <bdi>{showDate(data.latest.received_on)}</bdi></li>
              </ul>
            </Fold>
            <Fold title="ما قدّمه من مواد">
              {data.goods.length === 0 ? <p className="dp-muted">لم يقدّم مواد عينية.</p> : (
                <ul className="dp-goods">
                  {data.goods.map(([item, row]) => (
                    <li key={item}><Package size={15} aria-hidden /><span>{item}</span><bdi>{row.qty ? `${formatNumber(row.qty)} ${row.unit ?? ''}` : `${formatNumber(row.times)} مرة`}</bdi></li>
                  ))}
                </ul>
              )}
            </Fold>
            <Fold title="ملاحظات">
              {data.notes.length === 0 ? <p className="dp-muted">لا ملاحظات.</p> : (
                <ul className="dp-notes">{data.notes.map((item) => <li key={item.id}><small><bdi>{showDate(item.received_on)}</bdi></small>{item.note}</li>)}</ul>
              )}
            </Fold>
            <Fold title="من سجّل تبرعاته">
              {data.recorders.length === 0 ? <p className="dp-muted">—</p> : <ul className="dp-facts">{data.recorders.map((who) => <li key={who}><Receipt size={15} aria-hidden />{who}</li>)}</ul>}
            </Fold>
          </section>

          {/* ── Calendar ───────────────────────────── */}
          {calendar && <Calendar items={file.items} at={calendar} onMove={setCalendar} currency={me.currency} onOpen={(donation) => setDialog({ donation })} />}
        </div>
      )}

      {dialog && file && (
        <DonationDialog
          donation={dialog.donation ?? null}
          donors={[file.name]}
          currency={me.currency}
          onClose={() => setDialog(null)}
          onSaved={() => { setDialog(null); void load(); }}
        />
      )}
    </div>
  );
}

function Fold({ title, open = false, children }: { title: string; open?: boolean; children: ReactNode }) {
  return (
    <details className="dp-fold-item" open={open}>
      <summary>{title}<ChevronDown size={18} aria-hidden /></summary>
      <div className="dp-fold-body">{children}</div>
    </details>
  );
}

// The year's cash as thin rounded bars, January on the right; the highest month carries its tag.
function MiniBars({ values, upTo, currency }: { values: number[]; upTo: number; currency: string }) {
  const max = Math.max(...values, 1);
  const peak = values.indexOf(Math.max(...values));
  const ticks = [1, 0.66, 0.33].map((part) => Math.round(max * part));
  return (
    <div className="dp-minibars">
      <div className="dp-axis" aria-hidden>{ticks.map((tick) => <span key={tick}>{formatNumber(tick)}</span>)}<span>0</span></div>
      <ol>
        {values.map((value, at) => (
          <li key={at} className={`${at === peak && value > 0 ? 'is-peak' : ''}${at > upTo ? ' is-future' : ''}`} title={`${MONTH_NAMES[at]}: ${formatNumber(value)} ${currency}`}>
            {at === peak && value > 0 && <span className="dp-tag"><bdi>{formatNumber(value)}</bdi></span>}
            <i style={{ blockSize: `${value > 0 ? Math.max((value / max) * 100, 6) : 4}%` }} />
            <small>{MONTH_NAMES[at].slice(0, 1)}</small>
          </li>
        ))}
      </ol>
    </div>
  );
}

// Twelve ticks around a dial (the last twelve months, this month at the top); months with a gift
// are lit, and an arc shows how much of the year was given in.
function Ring({ filled }: { filled: boolean[] }) {
  const count = filled.filter(Boolean).length;
  const R = 70;
  const C = 2 * Math.PI * R;
  return (
    <div className="dp-ring">
      <svg viewBox="0 0 200 200" aria-hidden>
        {Array.from({ length: 60 }, (_, at) => {
          const angle = (at / 60) * Math.PI * 2 - Math.PI / 2;
          const inner = 84;
          const outer = at % 5 === 0 ? 92 : 89;
          const month = Math.floor(at / 5);
          return (
            <line
              key={at}
              x1={100 + Math.cos(angle) * inner}
              y1={100 + Math.sin(angle) * inner}
              x2={100 + Math.cos(angle) * outer}
              y2={100 + Math.sin(angle) * outer}
              className={filled[month] ? 'on' : undefined}
            />
          );
        })}
        <circle cx="100" cy="100" r={R} className="dp-ring-track" />
        <circle cx="100" cy="100" r={R} className="dp-ring-arc" style={{ strokeDasharray: `${(count / 12) * C} ${C}`, ['--len' as string]: C }} />
      </svg>
      <div className="dp-ring-centre">
        <b><bdi>{count}/12</bdi></b>
        <small>شهراً فيه عطاء</small>
      </div>
    </div>
  );
}

// A month of the donor's gifts: seven day columns (Saturday first), each gift sitting on its day.
function Calendar({ items, at, onMove, currency, onOpen }: {
  items: Donation[];
  at: { year: number; month: number };
  onMove: (next: { year: number; month: number }) => void;
  currency: string;
  onOpen: (donation: Donation) => void;
}) {
  const first = new Date(Date.UTC(at.year, at.month, 1));
  const days = new Date(Date.UTC(at.year, at.month + 1, 0)).getUTCDate();
  // getUTCDay: Sunday 0 … Saturday 6 → Saturday-first column.
  const offset = (first.getUTCDay() + 1) % 7;
  const key = `${at.year}-${String(at.month + 1).padStart(2, '0')}`;
  const byDay = new Map<number, Donation[]>();
  items.filter((item) => item.received_on.startsWith(key)).forEach((item) => {
    const day = Number(item.received_on.slice(8, 10));
    byDay.set(day, [...(byDay.get(day) ?? []), item]);
  });
  const step = (delta: number) => {
    const d = new Date(Date.UTC(at.year, at.month + delta, 1));
    onMove({ year: d.getUTCFullYear(), month: d.getUTCMonth() });
  };
  const prev = new Date(Date.UTC(at.year, at.month - 1, 1));
  const next = new Date(Date.UTC(at.year, at.month + 1, 1));
  const today = new Date().toISOString().slice(0, 10);
  const cells = Array.from({ length: Math.ceil((offset + days) / 7) * 7 }, (_, cell) => cell - offset + 1);
  return (
    <section className="dp-card dp-cal" aria-labelledby="dp-cal-title">
      <header className="dp-cal-head">
        <button type="button" onClick={() => step(-1)} aria-label={`الشهر السابق: ${MONTH_NAMES[prev.getUTCMonth()]}`}><ChevronRight size={15} aria-hidden /> <span>{MONTH_NAMES[prev.getUTCMonth()]}</span></button>
        <h2 id="dp-cal-title">{MONTH_NAMES[at.month]} <bdi>{at.year}</bdi></h2>
        <button type="button" onClick={() => step(1)} aria-label={`الشهر التالي: ${MONTH_NAMES[next.getUTCMonth()]}`}><span>{MONTH_NAMES[next.getUTCMonth()]}</span> <ChevronLeft size={15} aria-hidden /></button>
      </header>
      <div className="dp-cal-grid">
        {DAYS.map((day) => <span key={day} className="dp-cal-day">{day}</span>)}
        {cells.map((day, cell) => {
          const inMonth = day >= 1 && day <= days;
          const iso = inMonth ? `${key}-${String(day).padStart(2, '0')}` : '';
          const gifts = inMonth ? byDay.get(day) ?? [] : [];
          return (
            <div key={cell} className={`dp-cal-cell${inMonth ? '' : ' out'}${iso === today ? ' today' : ''}${gifts.length ? ' has' : ''}`}>
              {inMonth && <span className="dp-cal-num"><bdi>{day}</bdi></span>}
              {gifts.slice(0, 2).map((gift, index) => (
                <button key={gift.id} type="button" className={`dp-event ${gift.kind} t${index % 2}`} onClick={() => onOpen(gift)}>
                  <b>{gift.kind === 'cash' ? <><bdi className="dp-full">{formatNumber(gift.amount ?? 0)}</bdi><bdi className="dp-short">{formatCompact(gift.amount ?? 0)}</bdi></> : gift.item}</b>
                  <small>{gift.kind === 'cash' ? currency : gift.quantity ? `${formatNumber(gift.quantity)} ${gift.unit ?? ''}` : 'عيني'}</small>
                </button>
              ))}
              {gifts.length > 2 && <span className="dp-more">+<bdi>{gifts.length - 2}</bdi></span>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

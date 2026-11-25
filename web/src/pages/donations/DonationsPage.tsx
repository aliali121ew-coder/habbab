import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  Banknote, ChevronLeft, ChevronRight, Crown, Flame, Gift, HandHeart, Heart, Medal, Package, Plus, Search, Sparkles, TrendingDown, TrendingUp, Users,
} from 'lucide-react';
import { api, type Me } from '../../api';
import { StateMessage } from '../../components/StateMessage';
import { MONTH_NAMES, formatNumber, formatPercent } from '../../format';
import { donorHref } from '../../route';
import { DonationDialog, type Donation } from '../aid/DonationDialog';
import { DonationsDesktop } from './DonationsDesktop';

interface Sheet { year: number; items: Donation[]; previous_december_cash: number }

const now = new Date();
const THIS_YEAR = now.getUTCFullYear();
const THIS_MONTH = now.getUTCMonth();
const monthOf = (item: Donation) => Number(item.received_on.slice(5, 7)) - 1;
// The short month names used on Iraqi calendars, for the chart's axis.
const SHORT_MONTHS = ['ك٢', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'ت١', 'ت٢', 'ك١'];
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// The purposes' ribbon colours, in a fixed order so a purpose keeps its colour.
const PURPOSE_TONES = ['#2563eb', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#14b8a6', '#64748b'];

// A number that rolls up to its value when it first shows, and glides to any new value.
function useCountUp(value: number, duration = 1400) {
  const [shown, setShown] = useState(reduceMotion() ? value : 0);
  const from = useRef(0);
  useEffect(() => {
    if (reduceMotion()) { setShown(value); return undefined; }
    const start = performance.now();
    const begin = from.current;
    let frame = 0;
    const tick = (time: number) => {
      const t = Math.min((time - start) / duration, 1);
      const eased = 1 - (1 - t) ** 4;
      setShown(Math.round(begin + (value - begin) * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
      else from.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);
  return shown;
}

function Counter({ value, className }: { value: number; className?: string }) {
  const shown = useCountUp(value);
  return <bdi className={className}>{formatNumber(shown)}</bdi>;
}

// «X days ago» in plain words.
function ago(iso: string) {
  const days = Math.floor((Date.now() - Date.parse(`${iso}T12:00:00Z`)) / 86_400_000);
  if (days <= 0) return 'اليوم';
  if (days === 1) return 'أمس';
  if (days === 2) return 'قبل يومين';
  if (days < 11) return `قبل ${days} أيام`;
  if (days < 30) return `قبل ${days} يوماً`;
  const months = Math.floor(days / 30);
  if (months === 1) return 'قبل شهر';
  if (months === 2) return 'قبل شهرين';
  return months < 11 ? `قبل ${months} أشهر` : `قبل ${months} شهراً`;
}

type Wall = 'all' | 'cash' | 'in_kind';

// التبرعات — «جدار العطاء». A page of its own kind: a living hero with the year's giving rolling up,
// the honour board's podium, the year's pulse, where the money goes, what goods came in, who gives
// (from inside the foundation or outside), and a wall of every gift. Reads the same donors'
// register as the «المساعدات» page.
export function DonationsPage({ me }: { me: Me }) {
  const [year, setYear] = useState(THIS_YEAR);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [error, setError] = useState('');
  const [wall, setWall] = useState<Wall>('all');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(18);
  const [dialog, setDialog] = useState<{ donation: Donation | null } | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      setSheet(await api<Sheet>(`/donations?year=${year}`));
    } catch (failure) {
      setError((failure as Error).message);
    }
  }, [year]);
  useEffect(() => { setSheet(null); void load(); }, [load]);

  const focus = year === THIS_YEAR ? THIS_MONTH : 11;
  const data = useMemo(() => {
    if (!sheet) return null;
    const cash = Array<number>(12).fill(0);
    const donors = new Map<string, { cash: number; gifts: number; type: Donation['donor_type'] }>();
    const purposes = new Map<string, number>();
    const goods = new Map<string, { count: number; qty: number; unit: string | null }>();
    let inKind = 0;
    sheet.items.forEach((item) => {
      const donor = donors.get(item.donor_name) ?? { cash: 0, gifts: 0, type: item.donor_type };
      donor.gifts += 1;
      if (item.kind === 'cash') {
        cash[monthOf(item)] += item.amount ?? 0;
        donor.cash += item.amount ?? 0;
        const purpose = item.purpose ?? 'عامة';
        purposes.set(purpose, (purposes.get(purpose) ?? 0) + (item.amount ?? 0));
      } else {
        inKind += 1;
        const key = item.item ?? 'مواد';
        const entry = goods.get(key) ?? { count: 0, qty: 0, unit: item.unit };
        entry.count += 1;
        entry.qty += item.quantity ?? 0;
        goods.set(key, entry);
      }
      donors.set(item.donor_name, donor);
    });
    const total = cash.reduce((s, v) => s + v, 0);
    const board = [...donors].map(([name, row]) => ({ name, ...row })).sort((a, b) => b.cash - a.cash || b.gifts - a.gifts);
    const internal = board.filter((row) => row.type === 'internal');
    const prev = focus > 0 ? cash[focus - 1] : sheet.previous_december_cash;
    const peak = cash.indexOf(Math.max(...cash));
    // Days in a row (up to today) with at least one gift — the «streak».
    const days = new Set(sheet.items.map((item) => item.received_on));
    let streak = 0;
    for (let d = new Date(); streak < 400; d.setUTCDate(d.getUTCDate() - 1)) {
      if (!days.has(d.toISOString().slice(0, 10))) break;
      streak += 1;
    }
    return {
      cash, total, board, internal, inKind, prev, peak, streak,
      purposes: [...purposes].sort((a, b) => b[1] - a[1]),
      goods: [...goods].sort((a, b) => b[1].count - a[1].count),
      internalCash: internal.reduce((s, row) => s + row.cash, 0),
    };
  }, [sheet, focus]);

  const wallItems = useMemo(() => {
    if (!sheet) return [];
    const needle = query.trim();
    return sheet.items
      .filter((item) => wall === 'all' || item.kind === wall)
      .filter((item) => !needle || [item.donor_name, item.item, item.purpose, item.note].some((value) => value?.includes(needle)));
  }, [sheet, wall, query]);
  useEffect(() => { setLimit(18); }, [wall, query, year]);

  const monthChange = data && data.prev > 0 ? ((data.cash[focus] - data.prev) / data.prev) * 100 : null;
  const donorNames = useMemo(() => [...new Set(sheet?.items.map((item) => item.donor_name) ?? [])], [sheet]);
  const desktop = useDesktop();
  const dialogNode = dialog && (
    <DonationDialog
      donation={dialog.donation}
      donors={donorNames}
      currency={me.currency}
      onClose={() => setDialog(null)}
      onSaved={() => { setDialog(null); void load(); }}
    />
  );

  // On a computer the page takes the approved finance-dashboard layout; the phone keeps the wall.
  if (desktop) {
    return (
      <>
        {error && !sheet && <StateMessage kind="error" title="تعذّر تحميل التبرعات" hint={error} onRetry={load} />}
        {!sheet && !error && <div className="dd" aria-busy="true"><div className="dd-card skeleton dd-skel" /></div>}
        {sheet && (
          <DonationsDesktop
            items={sheet.items}
            previousDecemberCash={sheet.previous_december_cash}
            year={year}
            onYear={setYear}
            currency={me.currency}
            onAdd={() => setDialog({ donation: null })}
            onOpen={(donation) => setDialog({ donation })}
          />
        )}
        {dialogNode}
      </>
    );
  }

  return (
    <div className="dn">
      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="dn-hero" aria-labelledby="dn-title">
        <div className="dn-hero-sky" aria-hidden>
          <i className="dn-blob a" /><i className="dn-blob b" /><i className="dn-blob c" />
          {Array.from({ length: 14 }, (_, at) => <i key={at} className="dn-spark" style={{ '--x': `${(at * 37) % 100}%`, '--d': `${(at % 7) * 0.9}s`, '--s': `${0.6 + (at % 4) * 0.25}` } as React.CSSProperties} />)}
        </div>
        <div className="dn-hero-top">
          <span className="dn-eyebrow"><HandHeart size={15} aria-hidden /> التبرعات</span>
          <div className="dn-year" role="group" aria-label="السنة">
            <button type="button" aria-label="السنة السابقة" onClick={() => setYear(year - 1)}><ChevronRight size={16} aria-hidden /></button>
            <strong><bdi>{year}</bdi></strong>
            <button type="button" aria-label="السنة التالية" disabled={year >= THIS_YEAR} onClick={() => setYear(year + 1)}><ChevronLeft size={16} aria-hidden /></button>
          </div>
        </div>
        <h1 id="dn-title">جدار العطاء</h1>
        <p className="dn-lead">كل ما وصل المؤسسة من خير في <bdi>{year}</bdi> — من داخلها ومن خارجها</p>
        <div className="dn-total">
          {data ? <Counter value={data.total} className="dn-total-num" /> : <span className="dn-total-num dn-ghost">—</span>}
          <span className="dn-total-unit">{me.currency}</span>
        </div>
        <div className="dn-chips">
          <span><Users size={15} aria-hidden /> {data ? <Counter value={data.board.length} /> : '—'} متبرع</span>
          <span><Gift size={15} aria-hidden /> {sheet ? <Counter value={sheet.items.length} /> : '—'} تبرع</span>
          <span><Package size={15} aria-hidden /> {data ? <Counter value={data.inKind} /> : '—'} مساعدة عينية</span>
          {data && data.streak > 1 && <span className="hot"><Flame size={15} aria-hidden /> <bdi>{data.streak}</bdi> أيام متتالية من العطاء</span>}
        </div>
        <div className="dn-hero-foot">
          <div className="dn-month">
            <small>{MONTH_NAMES[focus]}</small>
            <b>{data ? <Counter value={data.cash[focus]} /> : '—'} <em>{me.currency}</em></b>
            {monthChange !== null && (
              <span className={monthChange >= 0 ? 'up' : 'down'}>
                {monthChange >= 0 ? <TrendingUp size={14} aria-hidden /> : <TrendingDown size={14} aria-hidden />}
                <bdi>{formatPercent(Math.abs(monthChange))}</bdi> عن {MONTH_NAMES[focus === 0 ? 11 : focus - 1]}
              </span>
            )}
          </div>
          <button type="button" className="dn-cta" onClick={() => setDialog({ donation: null })} disabled={!sheet}>
            <Plus size={18} aria-hidden /> سجّل تبرعاً
          </button>
        </div>
      </section>

      {error && !sheet && <StateMessage kind="error" title="تعذّر تحميل التبرعات" hint={error} onRetry={load} />}
      {!sheet && !error && <div className="dn-grid" aria-busy="true">{[0, 1, 2].map((key) => <div key={key} className="dn-card skeleton dn-skel" />)}</div>}

      {sheet && data && sheet.items.length === 0 && (
        <section className="dn-empty">
          <span aria-hidden><Heart size={34} /></span>
          <h2>الجدار ينتظر أول تبرع في <bdi>{year}</bdi></h2>
          <p>سجّل التبرعات المالية والعينية، وسيمتلئ هذا الجدار بأسماء المتبرعين ولوحة الشرف ونبض العطاء.</p>
          <button type="button" className="dn-cta" onClick={() => setDialog({ donation: null })}><Plus size={18} aria-hidden /> سجّل أول تبرع</button>
        </section>
      )}

      {sheet && data && sheet.items.length > 0 && (
        <>
          <div className="dn-grid">
            {/* ── Honour board ─────────────────────────────── */}
            <section className="dn-card dn-honour" aria-labelledby="dn-honour-title">
              <header className="dn-card-head">
                <h2 id="dn-honour-title"><Crown size={18} aria-hidden /> لوحة الشرف</h2>
                <small>أكثر المتبرعين بالمال في <bdi>{year}</bdi></small>
              </header>
              <ol className="dn-podium">
                {[1, 0, 2].map((rank) => {
                  const row = data.board[rank];
                  if (!row) return <li key={rank} className={`dn-step r${rank + 1} empty`} aria-hidden />;
                  return (
                    <li key={rank} className={`dn-step r${rank + 1}`} style={{ '--i': rank } as React.CSSProperties}>
                      <span className="dn-medal" aria-hidden>{rank === 0 ? <Crown size={16} /> : <Medal size={15} />}</span>
                      <a className="dn-step-link" href={donorHref(row.name)} aria-label={`ملف ${row.name}`}>
                        <span className={`dn-avatar ${row.type}`} aria-hidden>{row.name.trim().charAt(0)}</span>
                      </a>
                      <a className="dn-step-name" href={donorHref(row.name)}>{row.name}</a>
                      <span className="dn-step-amount"><bdi>{formatNumber(row.cash)}</bdi></span>
                      <span className="dn-block"><bdi>{rank + 1}</bdi></span>
                    </li>
                  );
                })}
              </ol>
              {data.board.length > 3 && (
                <ol className="dn-ranks" start={4}>
                  {data.board.slice(3, 8).map((row, at) => (
                    <li key={row.name}>
                      <span className="dn-rank-no"><bdi>{at + 4}</bdi></span>
                      <a className="dn-rank-name" href={donorHref(row.name)}>{row.name}</a>
                      <span className="dn-rank-bar"><i style={{ inlineSize: `${(row.cash / Math.max(data.board[0].cash, 1)) * 100}%` }} /></span>
                      <bdi className="dn-rank-amount">{formatNumber(row.cash)}</bdi>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            {/* ── Pulse ─────────────────────────────── */}
            <section className="dn-card dn-pulse" aria-labelledby="dn-pulse-title">
              <header className="dn-card-head">
                <h2 id="dn-pulse-title"><Sparkles size={18} aria-hidden /> نبض العطاء</h2>
                <small>{data.total ? <>أعلى شهر: <b>{MONTH_NAMES[data.peak]}</b></> : 'لا تبرعات مالية بعد'}</small>
              </header>
              <Pulse values={data.cash} upTo={focus} currency={me.currency} />
            </section>

            {/* ── Where the money goes ─────────────────────────────── */}
            <section className="dn-card dn-purpose" aria-labelledby="dn-purpose-title">
              <header className="dn-card-head">
                <h2 id="dn-purpose-title"><Banknote size={18} aria-hidden /> لأين يذهب المال</h2>
                <small>التبرعات المالية حسب الغرض</small>
              </header>
              {data.purposes.length === 0 ? <p className="dn-muted">لا تبرعات مالية بعد.</p> : (
                <>
                  <div className="dn-ribbon" role="img" aria-label="توزيع التبرعات المالية حسب الغرض">
                    {data.purposes.map(([name, amount], at) => (
                      <i key={name} style={{ flexGrow: amount, background: PURPOSE_TONES[at % PURPOSE_TONES.length], animationDelay: `${at * 90}ms` }} title={`${name}: ${formatNumber(amount)}`} />
                    ))}
                  </div>
                  <ul className="dn-legend">
                    {data.purposes.map(([name, amount], at) => (
                      <li key={name}>
                        <i style={{ background: PURPOSE_TONES[at % PURPOSE_TONES.length] }} aria-hidden />
                        <span>{name}</span>
                        <bdi>{formatPercent((amount / Math.max(data.total, 1)) * 100)}</bdi>
                        <b><bdi>{formatNumber(amount)}</bdi></b>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>

            {/* ── Goods ─────────────────────────────── */}
            <section className="dn-card dn-goods" aria-labelledby="dn-goods-title">
              <header className="dn-card-head">
                <h2 id="dn-goods-title"><Package size={18} aria-hidden /> ما وصل من مواد</h2>
                <small><bdi>{formatNumber(data.inKind)}</bdi> مساعدة عينية</small>
              </header>
              {data.goods.length === 0 ? <p className="dn-muted">لا مساعدات عينية بعد.</p> : (
                <div className="dn-cloud">
                  {data.goods.map(([name, entry], at) => {
                    const max = data.goods[0][1].count;
                    return (
                      <span key={name} className="dn-word" style={{ '--w': 0.85 + (entry.count / max) * 0.7, animationDelay: `${at * 70}ms` } as React.CSSProperties}>
                        {name}
                        {entry.qty > 0 && <small><bdi>{formatNumber(entry.qty)}</bdi> {entry.unit}</small>}
                      </span>
                    );
                  })}
                </div>
              )}
            </section>

            {/* ── Who gives ─────────────────────────────── */}
            <section className="dn-card dn-who" aria-labelledby="dn-who-title">
              <header className="dn-card-head">
                <h2 id="dn-who-title"><Users size={18} aria-hidden /> من يعطي</h2>
                <small>المتبرعون من داخل المؤسسة وخارجها</small>
              </header>
              <div className="dn-split">
                <div className="in" style={{ flexGrow: Math.max(data.internal.length, 0.0001) }}>
                  <b><bdi>{formatNumber(data.internal.length)}</bdi></b><span>من الداخل</span>
                </div>
                <div className="out" style={{ flexGrow: Math.max(data.board.length - data.internal.length, 0.0001) }}>
                  <b><bdi>{formatNumber(data.board.length - data.internal.length)}</bdi></b><span>من الخارج</span>
                </div>
              </div>
              <dl className="dn-who-facts">
                <div><dt>مال من الداخل</dt><dd><bdi>{formatNumber(data.internalCash)}</bdi></dd></div>
                <div><dt>مال من الخارج</dt><dd><bdi>{formatNumber(data.total - data.internalCash)}</bdi></dd></div>
                <div><dt>متوسط التبرع</dt><dd><bdi>{formatNumber(Math.round(data.total / Math.max(sheet.items.filter((item) => item.kind === 'cash').length, 1)))}</bdi></dd></div>
              </dl>
            </section>
          </div>

          {/* ── The wall ─────────────────────────────── */}
          <section className="dn-wall" aria-labelledby="dn-wall-title">
            <header className="dn-wall-head">
              <div>
                <h2 id="dn-wall-title"><Heart size={20} aria-hidden /> جدار التبرعات</h2>
                <p><bdi>{formatNumber(wallItems.length)}</bdi> تبرع · الأحدث أولاً · اضغط على أي تبرع لتعديله</p>
              </div>
              <div className="dn-wall-tools">
                <label className="dn-search">
                  <Search size={16} aria-hidden />
                  <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث عن متبرع أو مادة" aria-label="بحث" />
                </label>
                <div className="dn-pills" role="group" aria-label="نوع التبرع">
                  {([['all', 'الكل'], ['cash', 'مالية'], ['in_kind', 'عينية']] as const).map(([id, label]) => (
                    <button key={id} type="button" aria-pressed={wall === id} onClick={() => setWall(id)}>{label}</button>
                  ))}
                </div>
              </div>
            </header>
            {wallItems.length === 0 ? <p className="dn-muted">لا تبرعات تطابق البحث.</p> : (
              <ul className="dn-bricks">
                {wallItems.slice(0, limit).map((item, at) => (
                  <li key={item.id} style={{ animationDelay: `${Math.min(at, 12) * 45}ms` }}>
                    <button type="button" className={`dn-brick ${item.kind}`} onClick={() => setDialog({ donation: item })}>
                      <span className="dn-brick-top">
                        <span className={`dn-avatar ${item.donor_type}`} aria-hidden>{item.donor_name.trim().charAt(0)}</span>
                        <span className="dn-brick-who">
                          <b>{item.donor_name}</b>
                          <small>{item.donor_type === 'internal' ? 'من داخل المؤسسة' : 'من خارج المؤسسة'} · {ago(item.received_on)}</small>
                        </span>
                        <span className="dn-brick-kind" aria-hidden>{item.kind === 'cash' ? <Banknote size={16} /> : <Package size={16} />}</span>
                      </span>
                      {item.kind === 'cash'
                        ? <span className="dn-brick-amount"><bdi>{formatNumber(item.amount ?? 0)}</bdi> <small>{me.currency}</small></span>
                        : (
                          <span className="dn-brick-item">
                            {item.item}
                            {item.quantity ? <small><bdi>{formatNumber(item.quantity)}</bdi> {item.unit}</small> : null}
                            {item.amount ? <em>قيمتها نحو <bdi>{formatNumber(item.amount)}</bdi></em> : null}
                          </span>
                        )}
                      <span className="dn-brick-foot">
                        {item.purpose && <span className="dn-tag">{item.purpose}</span>}
                        {item.note && <span className="dn-note">{item.note}</span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {wallItems.length > limit && (
              <button type="button" className="dn-more" onClick={() => setLimit(limit + 18)}>عرض المزيد · <bdi>{formatNumber(wallItems.length - limit)}</bdi> تبرع آخر</button>
            )}
          </section>
        </>
      )}

      {dialogNode}
    </div>
  );
}

const desktopQuery = '(min-width: 1024px)';
const subscribeDesktop = (listener: () => void) => {
  const media = window.matchMedia(desktopQuery);
  media.addEventListener('change', listener);
  // Some browsers (and device emulation) skip the media event on resize; the resize event covers it.
  window.addEventListener('resize', listener);
  return () => {
    media.removeEventListener('change', listener);
    window.removeEventListener('resize', listener);
  };
};
const useDesktop = () => useSyncExternalStore(subscribeDesktop, () => window.matchMedia(desktopQuery).matches);

// The year's cash as one smooth glowing line that draws itself in, January on the right.
function Pulse({ values, upTo, currency }: { values: number[]; upTo: number; currency: string }) {
  const [active, setActive] = useState<number | null>(null);
  const W = 600;
  const H = 210;
  const top = 18;
  const base = H - 30;
  const shown = values.slice(0, upTo + 1);
  const max = Math.max(...shown, 1);
  const x = (at: number) => W - 20 - (at / 11) * (W - 40);
  const y = (value: number) => base - (value / max) * (base - top);
  const pts = shown.map((value, at) => [x(at), y(value)] as const);
  // Smooth curve (monotone) so empty months stay on the floor.
  let d = '';
  if (pts.length) {
    const slopes = pts.slice(0, -1).map(([x0, y0], i) => (pts[i + 1][1] - y0) / (pts[i + 1][0] - x0));
    const tan = pts.map((_, i) => (i === 0 ? slopes[0] ?? 0 : i === pts.length - 1 ? slopes[i - 1] : slopes[i - 1] * slopes[i] <= 0 ? 0 : (slopes[i - 1] + slopes[i]) / 2));
    d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i += 1) {
      const h = (pts[i + 1][0] - pts[i][0]) / 3;
      d += ` C${pts[i][0] + h},${pts[i][1] + tan[i] * h} ${pts[i + 1][0] - h},${pts[i + 1][1] - tan[i + 1] * h} ${pts[i + 1][0]},${pts[i + 1][1]}`;
    }
  }
  const last = pts.length - 1;
  return (
    <div className="dn-pulse-wrap" onPointerLeave={() => setActive(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="التبرعات المالية شهراً بشهر">
        <defs>
          <linearGradient id="dn-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--dn-a)" stopOpacity=".45" />
            <stop offset="100%" stopColor="var(--dn-a)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="dn-stroke" x1="1" x2="0" y1="0" y2="0">
            <stop offset="0%" stopColor="var(--dn-a)" />
            <stop offset="100%" stopColor="var(--dn-gold)" />
          </linearGradient>
          <filter id="dn-glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="5" /></filter>
        </defs>
        {[top, (top + base) / 2, base].map((at) => <line key={at} x1="10" x2={W - 10} y1={at} y2={at} className="dn-grid-line" />)}
        {last > 0 && <path className="dn-area" d={`${d} L${x(last)},${base} L${x(0)},${base} Z`} fill="url(#dn-fill)" />}
        {last > 0 && <path className="dn-glow" d={d} filter="url(#dn-glow)" />}
        {last > 0 && <path className="dn-line" d={d} pathLength={1} />}
        {pts.map(([px, py], at) => (
          <g key={at} className={`dn-dot${at === last ? ' is-last' : ''}${active === at ? ' on' : ''}`}>
            <circle cx={px} cy={py} r={at === last ? 6 : 4} />
            <rect x={px - 24} y="0" width="48" height={H} onPointerEnter={() => setActive(at)} />
          </g>
        ))}
        {MONTH_NAMES.map((name, at) => (
          <text key={name} x={x(at)} y={H - 8} className={`dn-axis${at > upTo ? ' future' : ''}`} textAnchor="middle">{SHORT_MONTHS[at]}</text>
        ))}
      </svg>
      {active !== null && (
        <div className="dn-pulse-tip" style={{ left: `${(x(active) / W) * 100}%`, top: `${(y(shown[active]) / H) * 100}%` }}>
          <small>{MONTH_NAMES[active]}</small>
          <b><bdi>{formatNumber(shown[active])}</bdi> {currency}</b>
        </div>
      )}
    </div>
  );
}

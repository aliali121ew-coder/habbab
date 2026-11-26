import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays, HandCoins, HandHeart, HeartHandshake, HeartPulse, Receipt, Search, UserRound, Users, type LucideIcon,
} from 'lucide-react';
import { api, type Me } from '../../api';
import { DatePicker, monthRange, periodLabel, type DateRange } from '../../components/DatePicker';
import { StateMessage } from '../../components/StateMessage';
import { formatNumber } from '../../format';
import { familyHref } from '../../route';
import { CATEGORY_BY_ID, type ExpenseCategory } from '../expenses/categories';
import '../../styles/pages/aid.css';

type Source = 'families' | 'patients' | 'expenses' | 'subscribers' | 'requests';
interface AidItem {
  source: Source;
  id: number;
  date: string;
  person: string;
  what: string;
  amount: number | null;
  detail: string | null;
  ref: number | null;
}

// Where each aid was recorded: its name here, its picture, a quiet colour (deep, light) in the app's
// green family, and the page it opens.
const SOURCES: { id: Source; label: string; icon: LucideIcon; tone: [string, string]; href: (item: AidItem) => string | null }[] = [
  { id: 'families', label: 'العوائل المتعففة', icon: HeartHandshake, tone: ['#2f7d62', '#5fa58a'], href: (item) => (item.ref ? familyHref(item.ref) : '#/families') },
  { id: 'patients', label: 'المرضى', icon: HeartPulse, tone: ['#b0546a', '#d08a9a'], href: (item) => (item.ref ? `#/patients/${item.ref}` : '#/patients') },
  { id: 'expenses', label: 'الحركات المالية', icon: Receipt, tone: ['#146c43', '#3f9a6e'], href: () => '#/expenses' },
  { id: 'subscribers', label: 'المشتركون', icon: Users, tone: ['#3d6aa8', '#7896c4'], href: () => null },
  { id: 'requests', label: 'طلبات المساعدة', icon: HandHeart, tone: ['#6b5a9e', '#9a8cc4'], href: () => '#/soon/requests' },
];
const SOURCE = new Map(SOURCES.map((source) => [source.id, source]));

const today = new Date();
const showDate = (iso: string) => iso.slice(0, 10).replace(/-/g, '/');
const whatOf = (item: AidItem) => (item.source === 'expenses' ? CATEGORY_BY_ID.get(item.what as ExpenseCategory)?.label ?? item.what : item.what);
const toneStyle = (tone: [string, string]) => ({ ['--tone' as string]: tone[0], ['--tone-2' as string]: tone[1] });

// سجل المساعدات: everything the foundation gave to people, gathered from the pages that record it —
// the needy families' payments, the patients' aid, the money ledger's aid entries, aid to subscribers
// and delivered help requests. Nothing is added here (each page records its own aid); this page reads
// them all for the chosen dates: totals, the share of each page, and every aid in detail.
export function AidPage({ me }: { me: Me }) {
  const [range, setRange] = useState<DateRange>(() => monthRange(today.getFullYear(), today.getMonth()));
  const [items, setItems] = useState<AidItem[] | null>(null);
  const [error, setError] = useState('');
  const [source, setSource] = useState<Source | 'all'>('all');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(40);

  const load = useCallback(async () => {
    setError('');
    try {
      setItems((await api<{ items: AidItem[] }>(`/aid/register?from=${range.from}&to=${range.to}`)).items);
    } catch (failure) {
      setError((failure as Error).message);
    }
  }, [range]);
  useEffect(() => { setItems(null); setLimit(40); void load(); }, [load]);

  const label = periodLabel(range);
  const figures = useMemo(() => {
    const list = items ?? [];
    const bySource = new Map<Source, { count: number; amount: number }>();
    list.forEach((item) => {
      const row = bySource.get(item.source) ?? { count: 0, amount: 0 };
      row.count += 1;
      row.amount += item.amount ?? 0;
      bySource.set(item.source, row);
    });
    return {
      amount: list.reduce((total, item) => total + (item.amount ?? 0), 0),
      count: list.length,
      people: new Set(list.map((item) => item.person.trim()).filter(Boolean)).size,
      bySource,
      days: new Set(list.map((item) => item.date.slice(0, 10))) as ReadonlySet<string>,
    };
  }, [items]);

  const rows = useMemo(() => {
    const needle = query.trim();
    return (items ?? [])
      .filter((item) => source === 'all' || item.source === source)
      .filter((item) => !needle || [item.person, whatOf(item), item.detail ?? ''].some((text) => text.includes(needle)));
  }, [items, source, query]);

  return (
    <div className="dd ar">
      <header className="dd-head">
        <div>
          <h1>سجل المساعدات</h1>
          <p>كل ما قدّمته المؤسسة للمستفيدين · {label}</p>
        </div>
        <div className="dd-head-tools ar-tools">
          <DatePicker mode="range" presets label="مدة المساعدات" value={range} onChange={setRange} marked={figures.days} />
        </div>
      </header>

      {error && !items && <StateMessage kind="error" title="تعذّر تحميل المساعدات" hint={error} onRetry={load} />}
      {!items && !error && <div className="dd-card skeleton dd-skel" aria-busy="true" />}

      {items && (
        <>
          <section className="dd-cards" aria-label="خلاصة المساعدات">
            <article className="dd-card dd-card-hero">
              <header>
                <span className="dd-tile" aria-hidden><HandCoins size={20} /></span>
                <div><h2>مجموع المساعدات</h2><small>ما قدّمته المؤسسة في {label}</small></div>
              </header>
              <p className="dd-amount"><bdi>{formatNumber(figures.amount)}</bdi> <small>{me.currency}</small></p>
            </article>
            <article className="dd-card">
              <header>
                <span className="dd-tile" aria-hidden><HandHeart size={20} /></span>
                <div><h2>عدد المساعدات</h2><small>من كل الصفحات</small></div>
              </header>
              <p className="dd-amount"><bdi>{formatNumber(figures.count)}</bdi> <small>مساعدة</small></p>
            </article>
            <article className="dd-card">
              <header>
                <span className="dd-tile" aria-hidden><UserRound size={20} /></span>
                <div><h2>المستفيدون</h2><small>أشخاص وعوائل</small></div>
              </header>
              <p className="dd-amount"><bdi>{formatNumber(figures.people)}</bdi> <small>مستفيد</small></p>
            </article>
          </section>

          <section className="ar-sources" aria-label="المساعدات حسب الصفحة">
            <button type="button" className="ar-source" aria-pressed={source === 'all'} onClick={() => setSource('all')} style={toneStyle(['#475569', '#7b8794'])}>
              <span className="ar-source-tile" aria-hidden><HandCoins size={18} /></span>
              <span className="ar-source-text"><b>الكل</b><small><bdi>{formatNumber(figures.count)}</bdi> مساعدة</small></span>
            </button>
            {SOURCES.map((meta) => {
              const row = figures.bySource.get(meta.id);
              const Icon = meta.icon;
              return (
                <button key={meta.id} type="button" className="ar-source" aria-pressed={source === meta.id} onClick={() => setSource(source === meta.id ? 'all' : meta.id)} style={toneStyle(meta.tone)}>
                  <span className="ar-source-tile" aria-hidden><Icon size={18} /></span>
                  <span className="ar-source-text">
                    <b>{meta.label}</b>
                    <small><bdi>{formatNumber(row?.count ?? 0)}</bdi> · <bdi>{formatNumber(row?.amount ?? 0)}</bdi> {me.currency}</small>
                  </span>
                </button>
              );
            })}
          </section>

          <section className="dd-card dd-table-card" aria-labelledby="ar-table-title">
            <header className="dd-section-head">
              <div>
                <h2 id="ar-table-title">{source === 'all' ? 'كل المساعدات' : SOURCE.get(source)?.label}</h2>
                <small>{label} · <bdi>{formatNumber(rows.length)}</bdi> مساعدة</small>
              </div>
              <div className="dd-table-tools ar-table-tools">
                <label className="dd-search">
                  <Search size={16} aria-hidden />
                  <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث بالاسم أو المساعدة" aria-label="بحث في المساعدات" />
                </label>
              </div>
            </header>

            {rows.length === 0 ? (
              <p className="dd-empty">{items.length ? 'لا مساعدات تطابق الاختيار.' : `لا مساعدات مسجّلة في ${label}.`}</p>
            ) : (
              <>
                <table className="dd-table ar-table">
                  <thead>
                    <tr>
                      <th scope="col">المستفيد</th>
                      <th scope="col">المساعدة</th>
                      <th scope="col">الصفحة</th>
                      <th scope="col">المبلغ</th>
                      <th scope="col">التاريخ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, limit).map((item) => {
                      const meta = SOURCE.get(item.source)!;
                      const href = meta.href(item);
                      const Icon = meta.icon;
                      return (
                        <tr key={`${item.source}-${item.id}`}>
                          <td>
                            {href
                              ? <a className="ar-person" href={href}>{item.person || '—'}</a>
                              : <span className="ar-person">{item.person || '—'}</span>}
                          </td>
                          <td><span className="ar-what">{whatOf(item)}</span>{item.detail && <small className="ar-detail">{item.detail}</small>}</td>
                          <td><span className="ar-chip" style={toneStyle(meta.tone)}><Icon size={13} aria-hidden />{meta.label}</span></td>
                          <td className="dd-money">{item.amount ? <><bdi>{formatNumber(item.amount)}</bdi> <small>{me.currency}</small></> : '—'}</td>
                          <td><bdi>{showDate(item.date)}</bdi></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                <ul className="dd-mlist ar-list">
                  {rows.slice(0, limit).map((item) => {
                    const meta = SOURCE.get(item.source)!;
                    const href = meta.href(item);
                    const Icon = meta.icon;
                    const body = (
                      <>
                        <span className="ar-item-tile" aria-hidden style={toneStyle(meta.tone)}><Icon size={20} /></span>
                        <span className="ar-item-main">
                          <b>{item.person || whatOf(item)}</b>
                          <small>{item.person ? whatOf(item) : item.detail ?? meta.label}</small>
                          <small className="ar-item-date"><CalendarDays size={12} aria-hidden /> <bdi>{showDate(item.date)}</bdi></small>
                        </span>
                        <span className="ar-item-value">
                          <b>{item.amount ? <><bdi>{formatNumber(item.amount)}</bdi> <small>{me.currency}</small></> : 'تم التسليم'}</b>
                        </span>
                      </>
                    );
                    return (
                      <li key={`${item.source}-${item.id}`} className="ar-item" style={toneStyle(meta.tone)}>
                        {href ? <a href={href} className="ar-item-link">{body}</a> : <div className="ar-item-link">{body}</div>}
                        <span className="ar-item-source">{meta.label}</span>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
            {rows.length > limit && <button type="button" className="dd-load" onClick={() => setLimit(limit + 40)}>عرض المزيد · <bdi>{formatNumber(rows.length - limit)}</bdi></button>}
          </section>
        </>
      )}
    </div>
  );
}

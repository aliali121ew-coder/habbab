import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Building2, CalendarDays, Globe2, Gift, MapPin, Phone, Search, Users } from 'lucide-react';
import { api, type Me } from '../../api';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import { StateMessage } from '../../components/StateMessage';
import { formatNumber } from '../../format';
import { donorHref } from '../../route';

interface DonorRow {
  name: string;
  gifts: number;
  cash: number;
  goods: number;
  first_on: string;
  last_on: string;
  phone: string | null;
  address: string | null;
  type: 'internal' | 'external';
  photo_url: string | null;
}

type Who = 'all' | 'internal' | 'external';
type Sort = 'cash' | 'recent' | 'name';
const showDate = (iso: string) => iso.slice(0, 10).replace(/-/g, '/');

// سجل المتبرعين: every donor in the register as a card — photo, name, from inside or outside the
// foundation, how to reach them, what they gave in all and when last — each opening the donor's file.
export function DonorsPage({ me }: { me: Me }) {
  const [donors, setDonors] = useState<DonorRow[] | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [who, setWho] = useState<Who>('all');
  const [sort, setSort] = useState<Sort>('cash');

  const load = useCallback(async () => {
    setError('');
    try {
      setDonors((await api<{ donors: DonorRow[] }>('/donations/donors')).donors);
    } catch (failure) {
      setError((failure as Error).message);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const rows = useMemo(() => {
    if (!donors) return [];
    const needle = query.trim();
    const list = donors
      .filter((row) => who === 'all' || row.type === who)
      .filter((row) => !needle || [row.name, row.phone, row.address].some((value) => value?.includes(needle)));
    return [...list].sort((a, b) => (sort === 'cash' ? b.cash - a.cash || b.gifts - a.gifts
      : sort === 'recent' ? b.last_on.localeCompare(a.last_on)
        : a.name.localeCompare(b.name, 'ar')));
  }, [donors, query, who, sort]);

  const counts = donors ? {
    all: donors.length,
    internal: donors.filter((row) => row.type === 'internal').length,
    external: donors.filter((row) => row.type === 'external').length,
    cash: donors.reduce((s, row) => s + row.cash, 0),
  } : null;

  return (
    <div className="dd dr">
      <header className="dd-head">
        <div>
          <Breadcrumbs items={[{ label: 'التبرعات', href: '#/soon/donations' }, { label: 'سجل المتبرعين' }]} />
          <h1>سجل المتبرعين</h1>
          <p>{counts ? <><bdi>{formatNumber(counts.all)}</bdi> متبرع · <bdi>{formatNumber(counts.cash)}</bdi> {me.currency} مجموع عطائهم</> : '…'}</p>
        </div>
        <div className="dd-head-tools">
          <a className="dd-ghost" href="#/soon/donations"><ArrowRight size={16} aria-hidden /> التبرعات</a>
        </div>
      </header>

      <div className="dr-tools">
        <label className="dd-search dr-search">
          <Search size={16} aria-hidden />
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث بالاسم أو الهاتف أو العنوان" aria-label="بحث في المتبرعين" />
        </label>
        <div className="dd-toggle dr-filter" role="group" aria-label="صفة المتبرع">
          <button type="button" aria-pressed={who === 'all'} onClick={() => setWho('all')}><Users size={15} aria-hidden /> الكل {counts && <bdi>{counts.all}</bdi>}</button>
          <button type="button" aria-pressed={who === 'internal'} onClick={() => setWho('internal')}><Building2 size={15} aria-hidden /> من الداخل {counts && <bdi>{counts.internal}</bdi>}</button>
          <button type="button" aria-pressed={who === 'external'} onClick={() => setWho('external')}><Globe2 size={15} aria-hidden /> من الخارج {counts && <bdi>{counts.external}</bdi>}</button>
        </div>
        <label className="dd-filter">
          <span className="sr-only">الترتيب</span>
          <select value={sort} onChange={(event) => setSort(event.target.value as Sort)} aria-label="الترتيب">
            <option value="cash">الأكثر عطاءً</option>
            <option value="recent">الأحدث تبرعاً</option>
            <option value="name">الاسم</option>
          </select>
        </label>
      </div>

      {error && !donors && <StateMessage kind="error" title="تعذّر تحميل المتبرعين" hint={error} onRetry={load} />}
      {!donors && !error && <div className="dr-grid" aria-busy="true">{[0, 1, 2, 3, 4, 5].map((key) => <div key={key} className="dd-card skeleton dr-skel" />)}</div>}
      {donors && donors.length === 0 && (
        <div className="dd-card dr-empty"><Gift size={28} aria-hidden /><b>لا متبرعين بعد</b><p>سجّل أول تبرع من صفحة التبرعات وسيظهر صاحبه هنا.</p></div>
      )}
      {donors && donors.length > 0 && rows.length === 0 && <p className="dd-empty">لا متبرعين يطابقون البحث.</p>}

      {rows.length > 0 && (
        <ul className="dr-grid">
          {rows.map((row) => (
            <li key={row.name}>
              <a className="dd-card dr-card" href={donorHref(row.name)}>
                <span className="dr-top">
                  {row.photo_url
                    ? <img className="dr-photo" src={row.photo_url} alt="" loading="lazy" />
                    : <span className={`dr-photo dr-initial ${row.type}`} aria-hidden>{row.name.trim().charAt(0)}</span>}
                  <span className="dr-who">
                    <b>{row.name}</b>
                    <span className={`dr-badge ${row.type}`}>{row.type === 'internal' ? 'من داخل المؤسسة' : 'من خارج المؤسسة'}</span>
                  </span>
                </span>
                <span className="dr-contact">
                  <span><Phone size={14} aria-hidden />{row.phone ? <bdi dir="ltr">{row.phone}</bdi> : <em>لا هاتف</em>}</span>
                  <span><MapPin size={14} aria-hidden />{row.address ?? <em>لا عنوان</em>}</span>
                </span>
                <span className="dr-stats">
                  <span><small>مجموع عطائه</small><b><bdi>{formatNumber(row.cash)}</bdi></b></span>
                  <span><small>التبرعات</small><b><bdi>{formatNumber(row.gifts)}</bdi></b></span>
                  <span><small><CalendarDays size={12} aria-hidden /> آخر تبرع</small><b><bdi>{showDate(row.last_on)}</bdi></b></span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

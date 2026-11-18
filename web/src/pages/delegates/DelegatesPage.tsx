import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ChevronLeft, EllipsisVertical, IdCard, Search, Trash2, TrendingDown, TrendingUp, UserCheck, UserMinus, UserPlus, Users } from 'lucide-react';
import { api, type DelegateSummary, type Me, type Overview } from '../../api';
import { Modal } from '../../components/Modal';
import { StateMessage } from '../../components/StateMessage';
import { MONTH_NAMES, formatNumber, formatPercent, initialOf, monthIndex } from '../../format';
import { registerHref } from '../../route';
import { Donut } from '../subscribers/StatCards';
import { AddDelegateDialog } from './AddDelegateDialog';
import { DelegateProfileDrawer } from './DelegateProfileDrawer';
import { PhoneAddButton, PhoneDelegateCard, PhoneShowMore, PhoneSummary, PhoneToolbar, type DelegateSort } from './PhoneDelegates';

interface CardProps {
  person: DelegateSummary;
  onProfile: (person: DelegateSummary) => void;
  onDelete: (person: DelegateSummary) => void;
}

// The card's ⋮ menu. It sits above the card-wide register link, so its clicks stay its own.
function CardMenu({ person, onProfile, onDelete }: { person: DelegateSummary; onProfile: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const outside = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);

  const pick = (action: () => void) => () => { setOpen(false); action(); };
  return (
    <div className="dcard-menu" ref={ref}>
      <button type="button" className="dcard-menu-btn" aria-label={`خيارات ${person.full_name}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <EllipsisVertical size={18} aria-hidden />
      </button>
      {open && (
        <div className="dcard-menu-list" role="menu">
          <button type="button" role="menuitem" onClick={pick(onProfile)}><IdCard size={16} aria-hidden /> الملف الشخصي</button>
          <button type="button" role="menuitem" className="danger" onClick={pick(onDelete)}><Trash2 size={16} aria-hidden /> حذف</button>
        </div>
      )}
    </div>
  );
}

function DelegateCard({ person, onProfile, onDelete }: CardProps) {
  return (
    <article className="dcard">
      <div className="dcard-head">
        <div className="dcard-media">
          {person.avatar_url
            ? <img src={person.avatar_url} alt={`صورة ${person.full_name}`} />
            : <span className="dcard-initial" aria-hidden>{initialOf(person.full_name)}</span>}
        </div>
        <div className="dcard-info">
          <h2>{person.full_name}</h2>
          <p className="dcard-sub"><Users size={14} aria-hidden /> <bdi>{formatNumber(person.alive)}</bdi> مشترك</p>
        </div>
        <span className="dcard-go" aria-hidden><ChevronLeft size={18} /></span>
        <CardMenu person={person} onProfile={() => onProfile(person)} onDelete={() => onDelete(person)} />
      </div>
      {/* Under a divider, like the reference card's second line: this month's payments. */}
      <p className="dcard-foot">
        {person.alive
          ? <>سدّد <bdi>{formatNumber(person.paid_count)}</bdi> من <bdi>{formatNumber(person.alive)}</bdi> هذا الشهر</>
          : 'لا مشتركين بعد'}
      </p>

      {/* Its ::after covers the card, so a click anywhere opens the register. */}
      <a className="dcard-open" href={registerHref(person.id)} aria-label={`فتح سجل ${person.full_name}`} />
    </article>
  );
}

function Summary({ overview, currency }: { overview: Overview; currency: string }) {
  const index = monthIndex(overview.focus);
  const month = overview.months[index] ?? overview.months[0];
  const previous = index > 0 ? overview.months[index - 1] : null;
  const totalSubscribers = overview.alive + overview.deceased;
  const rate = overview.alive ? (month.paid_count / overview.alive) * 100 : 0;
  const prevRate = previous && overview.alive ? (previous.paid_count / overview.alive) * 100 : null;
  const change = previous && previous.paid_amount
    ? ((month.paid_amount - previous.paid_amount) / previous.paid_amount) * 100
    : null;
  const isPositive = change === null || change >= 0;

  return (
    <aside className="people-side" aria-label="ملخص التحصيل">
      <div className="people-hero">
        <Donut percent={rate} />
        <div className="people-hero-meta">
          <h2>تحصيل {MONTH_NAMES[index]} <bdi>{overview.year}</bdi></h2>
          <p className="people-total"><bdi>{formatNumber(month.paid_amount)}</bdi> <small>{currency}</small></p>
          <span className="people-hero-sub">
            <bdi>{formatNumber(month.paid_count)}</bdi> من <bdi>{formatNumber(overview.alive)}</bdi> مسدد
          </span>
        </div>
      </div>

      <dl className="people-tiles">
        <div className="people-tile">
          <div className="tile-head">
            <dt>عدد المندوبين</dt>
            <span className="tile-icon brand" aria-hidden><UserCheck size={17} /></span>
          </div>
          <dd className="tile-value"><bdi>{formatNumber(overview.delegates.length)}</bdi></dd>
          <span className="tile-foot">مندوب معتمد في النظام</span>
        </div>

        <div className="people-tile">
          <div className="tile-head">
            <dt>المشتركون الأحياء</dt>
            <span className="tile-icon paid" aria-hidden><Users size={17} /></span>
          </div>
          <dd className="tile-value"><bdi>{formatNumber(overview.alive)}</bdi></dd>
          <span className="tile-foot">
            <bdi>{totalSubscribers ? formatPercent((overview.alive / totalSubscribers) * 100) : '0%'}</bdi> من إجمالي المشتركين
          </span>
        </div>

        <div className="people-tile">
          <div className="tile-head">
            <dt>المشتركون الأموات</dt>
            <span className="tile-icon muted" aria-hidden><UserMinus size={17} /></span>
          </div>
          <dd className="tile-value"><bdi>{formatNumber(overview.deceased)}</bdi></dd>
          <span className="tile-foot">من أصل <bdi>{formatNumber(totalSubscribers)}</bdi> مشترك كلي</span>
        </div>

        <div className="people-tile">
          <div className="tile-head">
            <dt>النسبة الشهرية</dt>
            <span className="tile-icon gold" aria-hidden><Activity size={17} /></span>
          </div>
          <dd className="tile-value tile-value-row">
            <bdi>{formatPercent(rate)}</bdi>
            {change !== null && (
              <span className={`tile-trend ${isPositive ? 'up' : 'down'}`}>
                {isPositive ? <TrendingUp size={13} aria-hidden /> : <TrendingDown size={13} aria-hidden />}
                <bdi dir="ltr">{change > 0 ? '+' : ''}{change.toFixed(1)}%</bdi>
              </span>
            )}
          </dd>
          <span className="tile-foot">
            {prevRate !== null
              ? <>الشهر السابق: <bdi>{formatPercent(prevRate)}</bdi> ({MONTH_NAMES[index - 1]})</>
              : 'أول شهر في السنة الحالية'}
          </span>
        </div>
      </dl>
    </aside>
  );
}

export function DelegatesPage({ me }: { me: Me }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<DelegateSort>('default');
  const [showAll, setShowAll] = useState(false);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 768px)').matches : false,
  );
  const [adding, setAdding] = useState(false);
  const [profileId, setProfileId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<DelegateSummary | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setOverview(await api<Overview>(`/collections/overview?year=${new Date().getUTCFullYear()}`));
    } catch (failure) {
      setError((failure as Error).message);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const people = useMemo(() => {
    const q = query.trim();
    const list = (overview?.delegates ?? []).filter((person) => person.full_name.includes(q));
    if (sort === 'default') return list;
    const rateOf = (d: DelegateSummary) => (d.alive ? d.paid_count / d.alive : 0);
    return [...list].sort((a, b) => {
      if (sort === 'alive-desc') return b.alive - a.alive;
      // Most behind (four months unpaid), most paid this month, most still unpaid this month.
      if (sort === 'late-desc') return (b.late ?? 0) - (a.late ?? 0) || rateOf(a) - rateOf(b);
      if (sort === 'paid-desc') return b.paid_count - a.paid_count || rateOf(b) - rateOf(a);
      if (sort === 'unpaid-desc') return (b.alive - b.paid_count) - (a.alive - a.paid_count) || rateOf(a) - rateOf(b);
      return 0;
    });
  }, [overview, query, sort]);

  const visiblePeople = useMemo(
    () => (!isMobile || query.trim() || showAll ? people : people.slice(0, 7)),
    [isMobile, people, query, showAll],
  );

  return (
    <>
      {error && !overview && <StateMessage kind="error" title="تعذّر تحميل المندوبين" hint={error} onRetry={load} />}

      {!error && !overview && (
        <div className="people-grid" aria-busy="true">{[0, 1, 2].map((key) => <div key={key} className="dcard skeleton" />)}</div>
      )}

      {overview && (
        <div className="people">
          {isMobile ? <PhoneSummary overview={overview} currency={me.currency} /> : (
            // Desktop: one parent card holds the month's summary and the list's title and tools.
            <section className="people-parent" aria-label="ملخص المندوبين وأدوات القائمة">
              <Summary overview={overview} currency={me.currency} />
            <div className="people-toolbar">
              <h2 className="people-title">سجل المندوبين</h2>
              <label className="search">
                <Search size={18} aria-hidden />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="بحث باسم المندوب"
                  aria-label="بحث باسم المندوب"
                  autoComplete="off"
                />
              </label>
              <select
                className="people-sort"
                value={sort}
                onChange={(event) => setSort(event.target.value as DelegateSort)}
                aria-label="ترتيب المندوبين"
              >
                <option value="default">الترتيب الافتراضي</option>
                <option value="alive-desc">الأكثر مشتركين</option>
                <option value="late-desc">المتأخرين</option>
                <option value="paid-desc">المسددين</option>
                <option value="unpaid-desc">غير المسددين</option>
              </select>
              {me.role === 'admin' && (
                <button type="button" className="btn primary people-add-btn" onClick={() => setAdding(true)}>
                  <UserPlus size={18} aria-hidden />
                  <span>إضافة مندوب</span>
                </button>
              )}
            </div>
            </section>
          )}
          <section className="people-main" aria-label="قائمة المندوبين">
            {isMobile && <PhoneToolbar query={query} onQuery={setQuery} sort={sort} onSort={setSort} />}
            {people.length > 0
              ? (
                <>
                  {isMobile ? (
                    <div className="pd-list">
                      {visiblePeople.map((person) => (
                        <PhoneDelegateCard
                          key={person.id}
                          person={person}
                          currency={me.currency}
                          menu={<CardMenu person={person} onProfile={() => setProfileId(person.id)} onDelete={() => { setDeleteError(''); setDeleting(person); }} />}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="people-grid">
                      {visiblePeople.map((person) => <DelegateCard key={person.id} person={person} onProfile={(picked) => setProfileId(picked.id)} onDelete={(picked) => { setDeleteError(''); setDeleting(picked); }} />)}
                    </div>
                  )}
                  {isMobile && !query.trim() && people.length > 7 && (
                    <PhoneShowMore open={showAll} hidden={people.length - 7} onToggle={() => setShowAll((prev) => !prev)} />
                  )}
                </>
              )
              : <StateMessage kind="empty" title="لا يوجد مندوبون" hint={query ? 'جرّب بحثاً آخر' : undefined} />}
          </section>
        </div>
      )}

      {isMobile && overview && me.role === 'admin' && <PhoneAddButton onClick={() => setAdding(true)} />}

      {adding && me.role === 'admin' && (
        <AddDelegateDialog
          onClose={() => setAdding(false)}
          onCreated={() => {
            setAdding(false);
            void load();
          }}
        />
      )}

      {profileId !== null && <DelegateProfileDrawer delegateId={profileId} onClose={() => setProfileId(null)} onChanged={load} />}

      {deleting && (
        <Modal title="حذف المندوب" onClose={() => setDeleting(null)}>
          <p>
            سيُعطَّل حساب <b>{deleting.full_name}</b> فلا يستطيع الدخول، ويختفي من قائمة المندوبين.
            يبقى مشتركوه (<bdi>{formatNumber(deleting.alive)}</bdi> حياً) ودفعاتهم في السجل العام، ويمكن إعادة تفعيله من صفحة المستخدمين.
          </p>
          {deleteError && <p className="form-error" role="alert">{deleteError}</p>}
          <div className="modal-actions">
            <button type="button" className="btn" onClick={() => setDeleting(null)}>إلغاء</button>
            <button
              type="button"
              className="btn danger"
              disabled={deleteBusy}
              onClick={async () => {
                setDeleteBusy(true);
                setDeleteError('');
                try {
                  await api(`/collections/delegates/${deleting.id}`, { method: 'DELETE' });
                  setDeleting(null);
                  void load();
                } catch (failure) {
                  setDeleteError((failure as Error).message);
                } finally {
                  setDeleteBusy(false);
                }
              }}
            >
              <Trash2 size={16} aria-hidden /> {deleteBusy ? 'جارٍ الحذف…' : 'حذف المندوب'}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

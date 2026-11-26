import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  Archive, Building2, Check, ChevronLeft, ChevronUp, HeartHandshake, KeyRound, MapPinned, HeartPulse, LayoutDashboard, LogOut, Menu, Moon, Palette as PaletteIcon, Receipt, Sun, User, Users, UsersRound, X, type LucideIcon,
} from 'lucide-react';
import { api, type Feature, type Me, type Role } from '../api';
import { hasFeature, SOON_FEATURE } from '../features';
import { NotificationBell } from './NotificationBell';
import { BottomNav } from './BottomNav';
import { InstallBanner } from './InstallBanner';
import { useBranding } from '../branding';
import { initialOf } from '../format';
import { useRoute } from '../route';
import { SOON_PAGES } from '../soonPages';
import { Breadcrumbs, type Crumb } from './Breadcrumbs';
import { useTheme, type Palette } from '../theme';
import { queuedPayments } from '../paymentQueue';
import { clearLocalRecords } from '../localRecords';
import drawerBgUrl from '../assets/drawer-bg.webp';
import drawerFrameUrl from '../assets/drawer-frame.webp';
import drawerLogoUrl from '../assets/drawer-logo.webp';

interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  href: string;
  roles: Role[];
  group: 'main' | 'records' | 'admin';
  /** Shown only when the foundation has this feature switched on. */
  feature?: Feature;
}

const NAV: NavItem[] = [
  { id: 'home', label: 'الرئيسية', icon: LayoutDashboard, href: '#/', roles: ['admin'], group: 'main' },
  { id: 'delegates', label: 'المندوبون', icon: UsersRound, href: '#/delegates', roles: ['admin'], group: 'main', feature: 'subscribers' },
  // A delegate's own register; the manager reaches each delegate's register from the delegates page.
  { id: 'subscribers', label: 'سجل المشتركين', icon: Users, href: '#/', roles: ['delegate'], group: 'main', feature: 'subscribers' },
  // The manager: every family; a delegate: their own families only (the server sends only those).
  { id: 'families', label: 'العوائل المتعففة', icon: HeartHandshake, href: '#/families', roles: ['admin', 'delegate'], group: 'main', feature: 'families' },
  { id: 'expenses', label: 'الحركات المالية', icon: Receipt, href: '#/expenses', roles: ['admin', 'accountant'], group: 'records', feature: 'expenses' },
  { id: 'boxes', label: 'صناديق الصدقات', icon: Archive, href: '#/boxes', roles: ['admin', 'accountant'], group: 'records', feature: 'expenses' },
  // A delegate sees the patients they follow (through their families, or given to them).
  { id: 'patients', label: 'المرضى', icon: HeartPulse, href: '#/patients', roles: ['admin', 'health', 'delegate'], group: 'records', feature: 'patients' },
  // A delegate's requests on the map, with the road route to each.
  { id: 'soon:requests', label: 'خريطة طلباتي', icon: MapPinned, href: '#/soon/requests', roles: ['delegate'], group: 'main', feature: 'requests' },
];

// Sections still to be programmed sit in the same menu and open a «قيد التطوير» page.
NAV.push(...SOON_PAGES.map((p) => ({
  id: `soon:${p.slug}`, label: p.label, icon: p.icon, href: `#/soon/${p.slug}`, roles: ['admin'] as Role[], group: p.group, feature: SOON_FEATURE[p.slug],
})));

const GROUPS: { id: NavItem['group']; label: string }[] = [
  { id: 'main', label: 'القائمة الرئيسية' },
  { id: 'records', label: 'السجلات والصرف' },
  { id: 'admin', label: 'الإدارة والتقارير' },
];

const ROLE_LABELS: Record<Role, string> = { admin: 'مدير عام', accountant: 'محاسب', delegate: 'مندوب', health: 'مسؤول صحي' };

interface Props {
  me: Me;
  onSignedOut: () => void;
  children: ReactNode;
}

const PALETTES: { id: Palette; label: string }[] = [
  { id: 'official', label: 'الأبيض المؤسسي' },
  { id: 'blue', label: 'الأزرق' },
  { id: 'violet', label: 'البنفسجي الحديث' },
];

// The palette picker as one icon: a click opens the palettes, a pick closes it.
function ThemeMenu({ palette, onPick }: { palette: Palette; onPick: (palette: Palette) => void }) {
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
  return (
    <div className="theme-menu" ref={ref}>
      <button type="button" className="icon-btn theme-btn" aria-label="اختيار الثيم" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <PaletteIcon size={20} aria-hidden />
      </button>
      {open && (
        <div className="theme-menu-list" role="menu" aria-label="الثيمات">
          {PALETTES.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitemradio"
              aria-checked={palette === item.id}
              className={palette === item.id ? 'active' : undefined}
              onClick={() => { onPick(item.id); setOpen(false); }}
            >
              <span className={`swatch swatch-${item.id}`} aria-hidden />
              <span>{item.label}</span>
              {palette === item.id && <Check size={16} aria-hidden />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Phone top bar: a greeting for the time of day and today's date, filling the space between
// the menu button and the account card.
// Path for the pages that don't draw their own (the registers and expenses pages do).
// A main page (reached from the menu) shows no path; an inner page shows the section it sits in.
function crumbsFor(route: ReturnType<typeof useRoute>): Crumb[] | null {
  if (route === 'delegates') return [{ label: 'المندوبون' }];
  if (route === 'families') return [{ label: 'العوائل المتعففة' }];
  if (route === 'family-detail') return [{ label: 'العوائل المتعففة', href: '#/families' }, { label: 'ملف العائلة' }];
  if (route === 'patients') return [{ label: 'المرضى' }];
  if (route === 'patient-detail') return [{ label: 'المرضى', href: '#/patients' }, { label: 'ملف المريض' }];
  if (route === 'system') return [{ label: 'إدارة النظام' }];
  if (typeof route === 'string' && route.startsWith('soon:')) {
    const page = SOON_PAGES.find((p) => p.slug === route.slice(5));
    return [{ label: page?.label ?? 'قسم جديد' }];
  }
  return null;
}

// The system admin moves between foundations; the whole app reloads in the new one, so no page
// keeps the previous foundation's figures or offline copies.
export async function enterFoundation(foundationId: number) {
  await api('/system/enter', { method: 'POST', body: { foundation_id: foundationId } });
  await clearLocalRecords();
  location.hash = '#/';
  location.reload();
}

/** The page's name for the phone's top bar. */
function pageTitle(route: ReturnType<typeof useRoute>, me: Me): string {
  const crumbs = crumbsFor(route);
  if (crumbs) return crumbs[crumbs.length - 1].label;
  if (typeof route === 'number' || (typeof route === 'string' && route.startsWith('list:'))) return 'سجل المشتركين';
  if (route === 'expenses' || route === 'expenses-ledger') return 'الحركات المالية';
  if (route === 'boxes' || route === 'box-detail') return 'صناديق الصدقات';
  if (typeof route === 'string' && route.startsWith('donor:')) return 'ملف المتبرع';
  if (route === 'donors') return 'سجل المتبرعين';
  if (me.role === 'delegate') return 'سجل المشتركين';
  if (me.role === 'accountant') return 'الحركات المالية';
  if (me.role === 'health') return 'المرضى';
  return 'الرئيسية';
}

const greeting = () => (new Date().getHours() < 12 ? 'صباح الخير' : 'مساء الخير');
const todayLabel = () => new Intl.DateTimeFormat('ar-IQ-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
const shortBrandName = (name?: string) => {
  const clean = (name ?? '').trim();
  if (!clean) return 'مؤسسة أحباب الحسين';
  const words = clean.split(/\s+/);
  return words.length > 3 ? words.slice(0, 3).join(' ') : clean;
};

function PasswordModal({ name, onClose }: { name: string; onClose: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    if (next.length < 10) return setError('كلمة المرور الجديدة يجب ألا تقل عن 10 أحرف');
    if (next !== confirm) return setError('كلمتا المرور الجديدتان غير متطابقتين');
    setBusy(true);
    setError('');
    try {
      await api('/auth/change-password', { method: 'POST', body: { current, next } });
      setSaved(true);
      setTimeout(onClose, 900);
    } catch (failure) {
      setError((failure as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="pw-backdrop" onClick={() => { if (!busy) onClose(); }}>
      <form className="pw-modal" role="dialog" aria-modal="true" aria-label="تغيير كلمة المرور" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="pw-head">
          <h2><KeyRound size={18} aria-hidden /> تغيير كلمة المرور</h2>
          <button type="button" className="icon-btn" aria-label="إغلاق" disabled={busy} onClick={onClose}><X size={18} /></button>
        </div>
        <input type="text" name="username" autoComplete="username" value={name} readOnly hidden />
        <label className="field">
          <span>كلمة المرور الحالية</span>
          <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" dir="ltr" required />
        </label>
        <label className="field">
          <span>كلمة المرور الجديدة (10 أحرف على الأقل)</span>
          <input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" minLength={10} dir="ltr" required />
        </label>
        <label className="field">
          <span>تأكيد كلمة المرور الجديدة</span>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" minLength={10} dir="ltr" required />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        {saved && <p className="pw-ok" role="status">تم تغيير كلمة المرور بنجاح</p>}
        <div className="pw-actions">
          <button type="button" className="btn" disabled={busy} onClick={onClose}>إلغاء</button>
          <button type="submit" className="btn primary" disabled={busy || saved}>{busy ? 'جارٍ الحفظ…' : 'حفظ'}</button>
        </div>
      </form>
    </div>
  );
}

export function Shell({ me, onSignedOut, children }: Props) {
  const [open, setOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const topbarRef = useRef<HTMLElement>(null);
  const { theme, toggle, palette, setPalette } = useTheme();
  const route = useRoute();
  const brand = useBranding();

  // Scrubbed directly by finger/scroll delta (matches BottomNav): fades 100% -> 0% on scroll down,
  // and gradually reveals 10% -> 100% on scroll up in lockstep with hand motion.
  useEffect(() => {
    const el = topbarRef.current;
    if (!el) return;
    if (open) {
      el.style.setProperty('--tb-hide', '0');
      el.classList.remove('is-gone');
      return;
    }
    const RANGE = 110;
    let progress = 0;
    let lastY = Math.max(0, window.scrollY);
    let raf = 0;

    const apply = () => {
      raf = 0;
      el.style.setProperty('--tb-hide', progress.toFixed(3));
      el.classList.toggle('is-gone', progress >= 0.96);
    };
    apply();

    const onScroll = () => {
      const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const y = Math.min(maxY, Math.max(0, window.scrollY));
      const delta = y - lastY;
      lastY = y;
      if (y <= 16) {
        progress = 0;
      } else if (delta !== 0) {
        progress = Math.min(1, Math.max(0, progress + delta / RANGE));
      }
      if (!raf) raf = window.requestAnimationFrame(apply);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [route, open]);

  useEffect(() => {
    if (!accountOpen) return undefined;
    const outside = (e: PointerEvent) => { if (!accountRef.current?.contains(e.target as Node)) setAccountOpen(false); };
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') setAccountOpen(false); };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [accountOpen]);

  useEffect(() => { if (!open) setAccountOpen(false); }, [open]);

  const signOut = async () => {
    // Payments recorded offline are kept on this device through sign-out (they are money already
    // taken); say so before leaving, so nobody assumes they were sent.
    const waiting = queuedPayments(me.id).length;
    if (waiting && !window.confirm(`لديك ${waiting} ${waiting === 1 ? 'تسديد لم يُرسل' : 'تسديدات لم تُرسل'} بعد.
ستبقى محفوظة على هذا الجهاز وتُرسل عند دخولك بنفس الحساب مع وجود اتصال.

هل تريد تسجيل الخروج؟`)) return;
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    onSignedOut();
  };

  return (
    <div className="shell">
      {/* Desktop: the side menu hides off-screen; this tab at the edge brings it out on hover. */}
      <div className="rail-handle" aria-hidden><ChevronLeft size={16} /></div>
      <aside className={`rail${open ? ' open' : ''}`}>
        {/* Phone drawer header: Islamic arch backdrop, soft gold frame behind circular logo + short name */}
        <div className="drawer-head" style={{ backgroundImage: `linear-gradient(180deg, rgb(7 22 48 / 12%) 0%, rgb(7 22 48 / 45%) 100%), url(${drawerBgUrl})` }}>
          <button type="button" className="drawer-close" aria-label="إغلاق القائمة" onClick={() => setOpen(false)}>
            <X size={19} aria-hidden />
          </button>
          <div className="drawer-crest" aria-hidden>
            <img className="drawer-crest-frame" src={drawerFrameUrl} alt="" />
            <span className="drawer-mark">
              <img src={drawerLogoUrl} alt="" />
            </span>
          </div>
          <strong className="drawer-title">{shortBrandName(brand.name)}</strong>
        </div>
        <div className="rail-brand">
          <div className="rail-crest" aria-hidden>
            <img className="rail-crest-frame" src={drawerFrameUrl} alt="" />
            <span className="rail-crest-mark">
              <img src={drawerLogoUrl} alt="" />
            </span>
          </div>
          <span className="rail-name">
            <strong>سجلات الخير</strong>
            <small>المشتركون والمساعدات</small>
          </span>
          <button type="button" className="icon-btn rail-close" aria-label="إغلاق القائمة" onClick={() => setOpen(false)}>
            <X size={20} aria-hidden />
          </button>
        </div>
        {/* Islamic ornament divider: two fading lines meeting at an eight-point star. */}
        <div className="rail-ornament" aria-hidden>
          <span />
          <svg width="22" height="22" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
            <rect x="9" y="9" width="14" height="14" />
            <rect x="9" y="9" width="14" height="14" transform="rotate(45 16 16)" />
            <circle cx="16" cy="16" r="2.4" fill="currentColor" stroke="none" />
          </svg>
          <span />
        </div>
        <nav className="rail-nav" aria-label="القائمة الرئيسية">
          {GROUPS.map((group) => {
            const items = NAV.filter((item) => item.group === group.id && item.roles.includes(me.role) && hasFeature(me, item.feature));
            if (items.length === 0) return null;
            return (
              <div key={group.id} className="rail-group">
                <div className="rail-section">{group.label}</div>
          {items.map((item) => {
            const onFamilies = route === 'families' || route === 'family-detail';
            const onExpenses = route === 'expenses' || route === 'expenses-ledger';
            const onBoxes = route === 'boxes' || route === 'box-detail';
            const onPatients = route === 'patients' || route === 'patient-detail';
            const isActive = item.id.startsWith('soon:')
              ? route === item.id || (item.id === 'soon:donations' && typeof route === 'string' && (route === 'donors' || route.startsWith('donor:')))
              : item.id === 'home'
              ? route === 'home'
              : item.id === 'families'
              ? onFamilies
              : item.id === 'boxes'
              ? onBoxes
              : item.id === 'expenses'
                ? onExpenses || (me.role === 'accountant' && !onFamilies && !onBoxes)
                : item.id === 'patients'
                  ? onPatients || (me.role === 'health' && !onFamilies)
                  : item.id === 'subscribers'
                    ? me.role === 'delegate' && !onFamilies
                    : route === 'delegates' || typeof route === 'number' || (typeof route === 'string' && route.startsWith('list:'));
            return (
              <a
                key={item.id}
                href={item.href}
                title={item.label}
                className={isActive ? 'active' : undefined}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => setOpen(false)}
              >
                <span className="rail-nav-icon" aria-hidden><item.icon size={18} /></span>
                <span>{item.label}</span>
              </a>
            );
          })}
              </div>
            );
          })}
        </nav>
        <div className="rail-foot" ref={accountRef}>
          {accountOpen && (
            <div className="rail-account-pop" role="menu" aria-label="خيارات الحساب">
              <div className="rail-pop-swatches" role="group" aria-label="ألوان الثيم">
                {PALETTES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-label={item.label}
                    title={item.label}
                    aria-pressed={palette === item.id}
                    className={`rail-pop-swatch swatch-${item.id}${palette === item.id ? ' active' : ''}`}
                    onClick={() => setPalette(item.id)}
                  >
                    {palette === item.id && <Check size={14} aria-hidden />}
                  </button>
                ))}
              </div>
              <button type="button" role="menuitem" className="rail-pop-item" onClick={() => { setAccountOpen(false); setOpen(false); setPwOpen(true); }}>
                <KeyRound size={17} aria-hidden />
                <span>تغيير كلمة المرور</span>
              </button>
              <button type="button" role="menuitem" className="rail-pop-item rail-pop-out" onClick={() => { setAccountOpen(false); void signOut(); }}>
                <LogOut size={17} aria-hidden />
                <span>تسجيل الخروج</span>
              </button>
            </div>
          )}
          <button
            type="button"
            className={`rail-account-btn${accountOpen ? ' open' : ''}`}
            aria-haspopup="menu"
            aria-expanded={accountOpen}
            onClick={() => setAccountOpen((v) => !v)}
          >
            <span className="rail-user-avatar" aria-hidden>{initialOf(me.full_name) || <User size={18} />}</span>
            <span className="rail-user-info">
              <strong>{me.full_name}</strong>
              <small>{ROLE_LABELS[me.role]}</small>
            </span>
            <span className="rail-account-ic" aria-hidden>
              <ChevronUp size={17} />
            </span>
          </button>
        </div>
      </aside>
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      {pwOpen && <PasswordModal name={me.full_name} onClose={() => setPwOpen(false)} />}

      <div className="stage">
        <InstallBanner />
        <header ref={topbarRef} className="topbar">
          <button type="button" className="icon-btn menu-btn" aria-label="فتح القائمة" onClick={() => setOpen(true)}>
            <Menu size={22} aria-hidden />
          </button>
          <div className="topbar-who">
            <strong>{me.full_name}</strong>
            <small>{ROLE_LABELS[me.role]}</small>
          </div>
          <div className="topbar-greet" aria-hidden>
            <strong>{greeting()}</strong>
            <small>{todayLabel()}</small>
          </div>
          {/* Phones: the page's name in the top bar (as in the reference). */}
          <h1 className="topbar-title">{pageTitle(route, me)}</h1>
          {/* On phones: one small card with the account icon, the palette and light/dark.
              On desktop the wrapper is display: contents, so the bar is laid out as before. */}
          <div className="topbar-card">
            <button
              type="button"
              className="topbar-avatar"
              aria-label={`الحساب: ${me.full_name}، ${ROLE_LABELS[me.role]}`}
              title={`${me.full_name} — ${ROLE_LABELS[me.role]}`}
              onClick={() => setOpen(true)}
            >
              {initialOf(me.full_name)}
            </button>
            {hasFeature(me, 'requests') && (me.role === 'admin' || me.role === 'delegate') && <NotificationBell />}
            <ThemeMenu palette={palette} onPick={setPalette} />
            <button
              type="button"
              className="icon-btn theme-btn"
              aria-label={theme === 'dark' ? 'تفعيل الوضع النهاري' : 'تفعيل الوضع الليلي'}
              onClick={toggle}
            >
              {theme === 'dark' ? <Sun size={20} aria-hidden /> : <Moon size={20} aria-hidden />}
            </button>
          </div>
        </header>
        <main className="page">
          {me.is_system && me.foundation_id !== me.home_foundation_id && (
            <div className="sys-visit" role="status">
              <Building2 size={16} aria-hidden />
              <span>أنت داخل <b>{me.foundation_name}</b>{me.foundation_status === 'suspended' ? ' (موقوفة)' : ''}</span>
              <button type="button" onClick={() => void enterFoundation(me.home_foundation_id)}>العودة إلى مؤسستي</button>
            </div>
          )}
          {me.role === 'admin' && (crumbsFor(route)?.length ?? 0) > 1 && <div className="shell-crumbs" data-route={route}><Breadcrumbs items={crumbsFor(route)!} /></div>}
          {children}
        </main>
        <BottomNav me={me} route={route} />
      </div>
    </div>
  );
}

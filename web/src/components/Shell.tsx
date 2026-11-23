import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Building2, Check, ChevronLeft, Crown, HeartHandshake, HeartPulse, LayoutDashboard, LogOut, Menu, Moon, Palette as PaletteIcon, Receipt, Sun, Users, UsersRound, X, type LucideIcon,
} from 'lucide-react';
import { api, type Feature, type Me, type Role } from '../api';
import { hasFeature, SOON_FEATURE } from '../features';
import { initialOf } from '../format';
import { useRoute } from '../route';
import { SOON_PAGES } from '../soonPages';
import { Breadcrumbs, type Crumb } from './Breadcrumbs';
import { useTheme, type Palette } from '../theme';
import { queuedPayments } from '../paymentQueue';
import { clearLocalRecords } from '../localRecords';

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
  { id: 'families', label: 'العوائل المتعففة', icon: HeartHandshake, href: '#/families', roles: ['admin'], group: 'main', feature: 'families' },
  { id: 'expenses', label: 'الحركات المالية', icon: Receipt, href: '#/expenses', roles: ['admin', 'accountant'], group: 'records', feature: 'expenses' },
  { id: 'patients', label: 'المرضى', icon: HeartPulse, href: '#/patients', roles: ['admin', 'health'], group: 'records', feature: 'patients' },
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

function Khatam({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden>
      <rect x="7" y="7" width="18" height="18" />
      <rect x="7" y="7" width="18" height="18" transform="rotate(45 16 16)" />
      <circle cx="16" cy="16" r="3.2" />
    </svg>
  );
}

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
const HOME: Crumb = { label: 'الرئيسية', href: '#/' };
function crumbsFor(route: ReturnType<typeof useRoute>): Crumb[] | null {
  if (route === 'delegates') return [HOME, { label: 'المندوبون' }];
  if (route === 'families') return [HOME, { label: 'العوائل المتعففة' }];
  if (route === 'family-detail') return [HOME, { label: 'العوائل المتعففة', href: '#/families' }, { label: 'ملف العائلة' }];
  if (route === 'patients') return [HOME, { label: 'المرضى' }];
  if (route === 'patient-detail') return [HOME, { label: 'المرضى', href: '#/patients' }, { label: 'ملف المريض' }];
  if (typeof route === 'string' && route.startsWith('soon:')) {
    const page = SOON_PAGES.find((p) => p.slug === route.slice(5));
    return [HOME, { label: page?.label ?? 'قسم جديد' }];
  }
  return null;
}

// The system admin moves between foundations; the whole app reloads in the new one, so no page
// keeps the previous foundation's figures or offline copies.
export async function enterFoundation(foundationId: number) {
  await api('/system/enter', { method: 'POST', body: { foundation_id: foundationId } });
  clearLocalRecords();
  location.hash = '#/';
  location.reload();
}

const greeting = () => (new Date().getHours() < 12 ? 'صباح الخير' : 'مساء الخير');
const todayLabel = () => new Intl.DateTimeFormat('ar-IQ-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

export function Shell({ me, onSignedOut, children }: Props) {
  const [open, setOpen] = useState(false);
  const { theme, toggle, palette, setPalette } = useTheme();
  const route = useRoute();

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
        {/* Phone drawer header: brand and the signed-in user (hidden on desktop) */}
        <div className="drawer-head">
          <button type="button" className="drawer-close" aria-label="إغلاق القائمة" onClick={() => setOpen(false)}>
            <X size={20} aria-hidden />
          </button>
          <span className="drawer-mark" aria-hidden><Khatam size={30} /></span>
          <strong className="drawer-title">سجلات الخير</strong>
          <small className="drawer-sub">إدارة المشتركين والمساعدات الخيرية</small>
          <div className="drawer-user">
            <span className="drawer-user-avatar" aria-hidden>{initialOf(me.full_name)}</span>
            <span className="drawer-user-info">
              <strong>{me.full_name}</strong>
              <small>{ROLE_LABELS[me.role]}</small>
            </span>
            {me.role === 'admin' && <span className="drawer-user-badge" aria-hidden><Crown size={16} /></span>}
          </div>
        </div>
        <div className="rail-brand">
          <span className="rail-mark rail-logo"><img src="/logo.jpg" alt="" /></span>
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
          {me.is_system && (
            <div className="rail-group">
              <div className="rail-section">مدير النظام</div>
              <a
                href="#/system"
                title="المؤسسات"
                className={route === 'system' ? 'active' : undefined}
                aria-current={route === 'system' ? 'page' : undefined}
                onClick={() => setOpen(false)}
              >
                <span className="rail-nav-icon" aria-hidden><Building2 size={18} /></span>
                <span>المؤسسات</span>
              </a>
            </div>
          )}
          {GROUPS.map((group) => {
            const items = NAV.filter((item) => item.group === group.id && item.roles.includes(me.role) && hasFeature(me, item.feature));
            if (items.length === 0) return null;
            return (
              <div key={group.id} className="rail-group">
                <div className="rail-section">{group.label}</div>
          {items.map((item) => {
            const onFamilies = route === 'families' || route === 'family-detail';
            const onExpenses = route === 'expenses' || route === 'expenses-ledger';
            const onPatients = route === 'patients' || route === 'patient-detail';
            const isActive = item.id.startsWith('soon:')
              ? route === item.id
              : item.id === 'home'
              ? route === 'home'
              : item.id === 'families'
              ? onFamilies
              : item.id === 'expenses'
                ? onExpenses || (me.role === 'accountant' && !onFamilies)
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
        <div className="rail-foot">
          <div className="rail-user">
            <span className="rail-user-avatar" aria-hidden>{initialOf(me.full_name)}</span>
            <div className="rail-user-info">
              <strong>{me.full_name}</strong>
              <small>{ROLE_LABELS[me.role]}</small>
            </div>
          </div>
          <div className="rail-actions">
            <button type="button" className="rail-theme" onClick={toggle}>
              {theme === 'dark' ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
              <span>{theme === 'dark' ? 'الوضع النهاري' : 'الوضع الليلي'}</span>
            </button>
            <button type="button" className="rail-signout" onClick={signOut}>
              <LogOut size={18} aria-hidden />
              <span>تسجيل الخروج</span>
            </button>
          </div>
        </div>
      </aside>
      {open && <div className="scrim" onClick={() => setOpen(false)} />}

      <div className="stage">
        <header className="topbar">
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
          {me.role === 'admin' && crumbsFor(route) && <div className="shell-crumbs" data-route={route}><Breadcrumbs items={crumbsFor(route)!} /></div>}
          {children}
        </main>
      </div>
    </div>
  );
}

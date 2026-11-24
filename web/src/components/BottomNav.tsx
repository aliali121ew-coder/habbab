import type { ReactElement } from 'react';
import { HandHeart, HeartPulse, MapPinned } from 'lucide-react';
import type { Feature, Me } from '../api';
import { hasFeature } from '../features';
import type { useRoute } from '../route';

/* The phone's bottom bar, after the reference: four pages with solid icons (house, mosque,
   family, bars) and, in the middle, a round «طلب» button with the helping-hand icon that opens
   a new help request. The pages follow the user's role and the foundation's features. */

type Route = ReturnType<typeof useRoute>;
type IconProps = { size?: number };

// Solid icons drawn to match the reference.
const HouseIcon = ({ size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M11.3 2.6a1.1 1.1 0 0 1 1.4 0l8.6 7.2c.7.6.3 1.7-.6 1.7H19.5V20a1.5 1.5 0 0 1-1.5 1.5h-3.5v-5.2a1 1 0 0 0-1-1h-3a1 1 0 0 0-1 1v5.2H6A1.5 1.5 0 0 1 4.5 20v-8.5H3.3c-.9 0-1.3-1.1-.6-1.7l8.6-7.2Z" />
  </svg>
);
const MosqueIcon = ({ size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M12 2.5c.3 0 .5.2.5.5v1.1C15.4 4.9 17.5 7 17.5 9.5H6.5c0-2.5 2.1-4.6 5-5.4V3c0-.3.2-.5.5-.5Z" />
    <path d="M2.5 7.5c.3 0 .5.2.5.5v1h.5c.3 0 .5.2.5.5V21H1.5V9.5c0-.3.2-.5.5-.5H2V8c0-.3.2-.5.5-.5Zm19 0c.3 0 .5.2.5.5v1h.5c.3 0 .5.2.5.5V21h-2.5V9.5c0-.3.2-.5.5-.5h.5V8c0-.3.2-.5.5-.5Z" />
    <path d="M5.5 11h13v10h-4.5v-3.5a2 2 0 0 0-4 0V21H5.5V11Z" />
  </svg>
);
const FamilyIcon = ({ size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <circle cx="6.5" cy="4.5" r="2.3" />
    <circle cx="17.5" cy="4.5" r="2.3" />
    <circle cx="12" cy="10.2" r="1.8" />
    <path d="M4.2 8h4.6c1 0 1.8.8 1.8 1.8V14H9.4v7.5H6.9V17H6.1v4.5H3.6V14H2.4V9.8C2.4 8.8 3.2 8 4.2 8Z" />
    <path d="M15.2 8h4.6c1 0 1.8.8 1.8 1.8V14h-1.2v7.5h-2.5V17h-.8v4.5h-2.5V14h-1.2V9.8c0-1 .8-1.8 1.8-1.8Z" />
    <path d="M10.7 12.6h2.6c.7 0 1.2.5 1.2 1.2v3.3h-.8v4.4h-1.2v-3h-1v3h-1.2v-4.4h-.8v-3.3c0-.7.5-1.2 1.2-1.2Z" />
  </svg>
);
const BarsIcon = ({ size = 24 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <rect x="3.5" y="11" width="4" height="9.5" rx="2" />
    <rect x="10" y="3.5" width="4" height="17" rx="2" />
    <rect x="16.5" y="14" width="4" height="6.5" rx="2" />
  </svg>
);
const PatientsIcon = ({ size = 24 }: IconProps) => <HeartPulse size={size} strokeWidth={2.4} />;
const MapIcon = ({ size = 24 }: IconProps) => <MapPinned size={size} strokeWidth={2.4} />;

interface Item { label: string; href: string; icon: (p: IconProps) => ReactElement; feature?: Feature; active: (r: Route) => boolean }

const home: Item = { label: 'الرئيسية', href: '#/', icon: HouseIcon, active: (r) => r === 'home' };
const worship: Item = { label: 'العبادات', href: '#/soon/worship', icon: MosqueIcon, feature: 'worship', active: (r) => r === 'soon:worship' };
const families: Item = { label: 'العوائل', href: '#/families', icon: FamilyIcon, feature: 'families', active: (r) => r === 'families' || r === 'family-detail' };
const reports: Item = { label: 'التقارير', href: '#/soon/reports', icon: BarsIcon, feature: 'reports', active: (r) => r === 'soon:reports' };
const patients: Item = { label: 'المرضى', href: '#/patients', icon: PatientsIcon, feature: 'patients', active: (r) => r === 'patients' || r === 'patient-detail' };
const myMap: Item = { label: 'خريطتي', href: '#/soon/requests', icon: MapIcon, feature: 'requests', active: (r) => r === 'soon:requests' };

const ITEMS: Partial<Record<Me['role'], Item[]>> = {
  // As in the reference: home, worship | «طلب» | families, reports.
  admin: [home, worship, families, reports],
  delegate: [{ ...home, active: (r) => r === 'home' || typeof r === 'number' || (typeof r === 'string' && r.startsWith('list:')) }, families, patients, myMap],
};

/** Opens the requests page on a new request (RequestsPage picks the flag up). */
export function startNewRequest() {
  try { sessionStorage.setItem('ahbab:new-request', '1'); } catch { /* storage blocked */ }
  if (location.hash === '#/soon/requests') window.dispatchEvent(new Event('ahbab:new-request'));
  else location.hash = '#/soon/requests';
}

export function BottomNav({ me, route }: { me: Me; route: Route }) {
  const items = (ITEMS[me.role] ?? []).filter((i) => hasFeature(me, i.feature));
  if (items.length < 2) return null;
  const canRequest = hasFeature(me, 'requests');
  const half = Math.ceil(items.length / 2);
  const link = (i: Item) => {
    const on = i.active(route);
    const Icon = i.icon;
    return (
      <a key={i.label} href={i.href} className={`bn-item${on ? ' on' : ''}`} aria-current={on ? 'page' : undefined}>
        <span className="bn-ic"><Icon size={24} /></span>
        <span className="bn-label">{i.label}</span>
      </a>
    );
  };
  return (
    <nav className="bottom-nav" aria-label="التنقل السريع">
      {items.slice(0, half).map(link)}
      {canRequest && (
        <button type="button" className="bn-main" onClick={startNewRequest} aria-label="طلب مساعدة جديد">
          <span className="bn-main-ic"><HandHeart size={28} strokeWidth={2.2} aria-hidden /></span>
          <span className="bn-label">طلب</span>
        </button>
      )}
      {items.slice(half).map(link)}
    </nav>
  );
}

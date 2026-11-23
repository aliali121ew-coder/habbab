import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from './api';

/** The signed-in foundation's letterhead: printed sheets, the menu logo and messages use it. */
export interface Branding {
  name: string;
  address: string | null;
  /** The short place printed under the stamp. */
  stamp_place: string | null;
  phones: string[];
  /** The names printed above the accountant's and the manager's signatures. */
  accountant_name: string | null;
  manager_name: string | null;
  /** Image addresses, or null when the foundation has none (the sheet then leaves the spot empty). */
  logo: string | null;
  stamp: string | null;
  signature: string | null;
  signature2: string | null;
  /** Re-reads the letterhead after the settings page changes it. */
  reload: () => Promise<void>;
}

const BrandingContext = createContext<Branding | null>(null);

// The PDF builders (statementPdf, registerPdf) render sheets in a separate React root, outside
// the provider; they wrap them in <BrandingSnapshot> with the letterhead last loaded here.
let latest: Branding | null = null;
export function BrandingSnapshot({ children }: { children: ReactNode }) {
  if (!latest) throw new Error('Letterhead not loaded yet');
  return <BrandingContext.Provider value={latest}>{children}</BrandingContext.Provider>;
}

// Until /api/branding answers, only the name is known (from /auth/me), so nothing of another
// foundation can show for a moment.
export function BrandingProvider({ name, foundationId, children }: { name: string; foundationId: number; children: ReactNode }) {
  const [data, setData] = useState<Omit<Branding, 'reload'>>({
    name, address: null, stamp_place: null, phones: [], accountant_name: null, manager_name: null, logo: null, stamp: null, signature: null, signature2: null,
  });
  const reload = useCallback(async () => {
    try {
      setData(await api<Omit<Branding, 'reload'>>('/branding'));
    } catch {
      // Offline: the name from the session stays; images return with the connection.
    }
  }, []);
  useEffect(() => { void reload(); }, [reload, foundationId]);
  const value = useMemo(() => ({ ...data, reload }), [data, reload]);
  latest = value;
  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useBranding(): Branding {
  const value = useContext(BrandingContext);
  if (!value) throw new Error('useBranding outside BrandingProvider');
  return value;
}

/** The phones as one printed line: «07808337805 - 0760107408». */
export const phonesLine = (phones: string[]) => phones.join(' - ');

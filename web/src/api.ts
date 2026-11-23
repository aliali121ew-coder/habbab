export type Role = 'admin' | 'accountant' | 'delegate' | 'health';

export interface Me {
  id: number;
  full_name: string;
  role: Role;
  must_change_password: boolean;
  currency: string;
}

export interface MonthTotal {
  period: string;
  paid_count: number;
  paid_amount: number;
}

export interface DelegateSummary {
  id: number;
  full_name: string;
  avatar_url: string | null;
  alive: number;
  paid_count: number;
  paid_amount: number;
  /** Living subscribers with no payment in the last four months. */
  late: number;
}

export interface Overview {
  year: number;
  focus: string;
  alive: number;
  deceased: number;
  patients: number;
  months: MonthTotal[];
  delegate: { id: number; full_name: string; phone: string | null; address: string | null; avatar_url: string | null } | null;
  /** Empty when fetched with `delegates=0`; use delegate_count for the number. */
  delegates: DelegateSummary[];
  /** Active delegates (0 for a delegate's own view). */
  delegate_count: number;
}

export interface DelegateProfile {
  id: number;
  username: string;
  full_name: string;
  phone: string | null;
  address: string | null;
  birth_date: string | null;
  joined_year: number;
  created_at: string;
  alive: number;
  deceased: number;
  avatar_url: string | null;
}

export interface PrintRow {
  id: number;
  full_name: string;
  /** The delegate's area this subscriber belongs to, when the delegate covers several. */
  area?: string | null;
  monthly_fee: number;
  paid_mask: number;
  paid_total: number;
  last_paid: string | null;
}

export interface GridRow {
  id: number;
  full_name: string;
  phone: string | null;
  status: 'alive' | 'deceased';
  delegate_id: number | null;
  family_size?: number;
  monthly_fee: number;
  paid_mask: number;
  last_paid_date?: string | null;
}

export interface SubscriberPayment {
  period: string;
  amount: number;
  tx_date: string;
}

export interface SubscriberDetail {
  id: number;
  full_name: string;
  phone: string | null;
  status: 'alive' | 'deceased';
  death_date: string | null;
  delegate_id: number | null;
  delegate_name: string | null;
  family_size: number;
  monthly_fee: number;
  address: string | null;
  notes: string | null;
  created_at: string;
  payments: SubscriberPayment[];
}

export interface Page<T> {
  items: T[];
  next: number | null;
}

export class ApiError extends Error {
  /** The whole error body, for responses that carry more than a message. */
  constructor(public status: number, message: string, public data: Record<string, unknown> | null = null) {
    super(message);
  }
}

let onSessionLost = () => {};
export const setSessionLostHandler = (handler: () => void) => { onSessionLost = handler; };

interface Options {
  method?: string;
  body?: unknown;
  form?: FormData;
  signal?: AbortSignal;
}

// Recent answers, so going back to a page just seen is instant instead of loading again. Short
// lived, and emptied by every write (a payment, an edit) so no figure is shown out of date
// after a change made on this device.
const RECENT_MS = 30_000;
const recent = new Map<string, { at: number; data: unknown }>();
export const forgetRecent = () => recent.clear();

/** Whether the last data came from the copy saved on this device (no connection). */
export let showingSavedCopy = false;
const setSavedCopy = (value: boolean) => {
  if (showingSavedCopy === value) return;
  showingSavedCopy = value;
  window.dispatchEvent(new CustomEvent('ahbab:saved-copy', { detail: value }));
};

export async function api<T>(path: string, { method = 'GET', body, form, signal }: Options = {}): Promise<T> {
  if (method === 'GET') {
    const hit = recent.get(path);
    if (hit && Date.now() - hit.at < RECENT_MS) return hit.data as T;
  }
  const headers: Record<string, string> = {};
  if (method !== 'GET') headers['x-app'] = '1';
  if (body !== undefined) headers['content-type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      signal,
      credentials: 'same-origin',
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new ApiError(0, method === 'GET'
      ? 'تعذّر الاتصال بالخادم، تحقق من الإنترنت'
      : 'لا يوجد اتصال بالإنترنت، لم يُحفظ التغيير. أعد المحاولة عند عودة الاتصال');
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && path !== '/auth/login') onSessionLost();
    throw new ApiError(response.status, data?.error ?? 'حدث خطأ غير متوقع', data);
  }
  if (method === 'GET') {
    // A saved copy (offline) is shown but not kept as "recent", so the next visit asks again.
    const saved = response.headers.get('x-offline-copy') === '1';
    setSavedCopy(saved);
    if (!saved) recent.set(path, { at: Date.now(), data });
  } else {
    recent.clear();
  }
  return data as T;
}

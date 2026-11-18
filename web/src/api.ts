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
  delegates: DelegateSummary[];
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
  constructor(public status: number, message: string) {
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

export async function api<T>(path: string, { method = 'GET', body, form, signal }: Options = {}): Promise<T> {
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
    throw new ApiError(0, 'تعذّر الاتصال بالخادم، تحقق من الإنترنت');
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && path !== '/auth/login') onSessionLost();
    throw new ApiError(response.status, data?.error ?? 'حدث خطأ غير متوقع');
  }
  return data as T;
}

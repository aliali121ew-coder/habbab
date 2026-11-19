import { api, ApiError, forgetRecent } from './api';

// Payments recorded without a connection. They are kept on this device and sent, one by one,
// as soon as the connection is back. The rules, because this is money:
// - One entry per subscriber and month: recording it again replaces it, never doubles it. The
//   server also refuses a second payment for the same month, so a resend can never double it.
// - An entry is sent only under the account that recorded it.
// - Nothing is dropped silently: a refused payment moves to a "not sent" list with the reason,
//   and stays there until someone dismisses it.
// The storage key does not start with "ahbab:", so the sign-out cleanup keeps it: a payment
// already taken in cash must not vanish because someone signed out before it was sent.

export interface QueuedPayment {
  key: string; // `${userId}:${subscriberId}:${period}`
  userId: number;
  subscriberId: number;
  name: string;
  period: string; // YYYY-MM, the month paid for
  amount: number;
  txDate: string; // YYYY-MM-DD, the day the money was received
  queuedAt: string;
}

export interface UnsentPayment extends QueuedPayment {
  reason: string;
  /** "info" when the month was already paid on the server: nothing is lost, but worth knowing. */
  kind: 'error' | 'info';
}

const QUEUE_KEY = 'ahbab-sync-queue:v1';
const UNSENT_KEY = 'ahbab-sync-unsent:v1';
const EVENT = 'ahbab:queue';

const read = <T>(key: string): T[] => {
  try { return JSON.parse(localStorage.getItem(key) ?? '[]') as T[]; } catch { return []; }
};
const write = (key: string, items: unknown[]) => {
  try { localStorage.setItem(key, JSON.stringify(items)); } catch { /* storage full or blocked */ }
  window.dispatchEvent(new CustomEvent(EVENT));
};

export const queuedPayments = (userId?: number) =>
  read<QueuedPayment>(QUEUE_KEY).filter((item) => userId === undefined || item.userId === userId);
export const unsentPayments = (userId?: number) =>
  read<UnsentPayment>(UNSENT_KEY).filter((item) => userId === undefined || item.userId === userId);
export const onQueueChange = (listener: () => void) => {
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
};

export function queuePayment(entry: Omit<QueuedPayment, 'key' | 'queuedAt'>) {
  const key = `${entry.userId}:${entry.subscriberId}:${entry.period}`;
  const others = read<QueuedPayment>(QUEUE_KEY).filter((item) => item.key !== key);
  write(QUEUE_KEY, [...others, { ...entry, key, queuedAt: new Date().toISOString() }]);
}

export function dismissUnsent(key: string) {
  write(UNSENT_KEY, read<UnsentPayment>(UNSENT_KEY).filter((item) => item.key !== key));
}

let syncing = false;

/** Sends this user's waiting payments. Stops at the first network failure (still offline). */
export async function syncPayments(userId: number): Promise<{ sent: number }> {
  if (syncing) return { sent: 0 };
  syncing = true;
  let sent = 0;
  try {
    for (const item of queuedPayments(userId)) {
      try {
        await api('/collections/pay', {
          method: 'POST',
          body: { subscriber_id: item.subscriberId, period: item.period, amount: item.amount, tx_date: item.txDate },
        });
        sent += 1;
        removeQueued(item.key);
      } catch (failure) {
        if (!(failure instanceof ApiError) || failure.status === 0 || failure.status === 401 || failure.status >= 500) {
          break; // offline, signed out or a server hiccup: keep everything and try again later
        }
        const alreadyPaid = failure.data?.code === 'already_paid';
        removeQueued(item.key);
        write(UNSENT_KEY, [
          ...read<UnsentPayment>(UNSENT_KEY).filter((other) => other.key !== item.key),
          {
            ...item,
            kind: alreadyPaid ? 'info' : 'error',
            reason: alreadyPaid ? 'كان هذا الشهر مسدداً على الخادم مسبقاً، فلم يُسجَّل مرة ثانية' : failure.message,
          },
        ]);
      }
    }
  } finally {
    syncing = false;
    if (sent) forgetRecent();
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { sent } }));
  }
  return { sent };
}

function removeQueued(key: string) {
  write(QUEUE_KEY, read<QueuedPayment>(QUEUE_KEY).filter((item) => item.key !== key));
}

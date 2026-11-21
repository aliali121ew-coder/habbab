import { useEffect, useState } from 'react';
import { CheckCircle2, CloudUpload, Info, TriangleAlert, X } from 'lucide-react';
import { MONTH_NAMES, formatNumber } from '../format';
import { dismissUnsent, queuedPayments, syncPayments, unsentPayments } from '../paymentQueue';

const monthLabel = (period: string) => `${MONTH_NAMES[Number(period.slice(5, 7)) - 1]} ${period.slice(0, 4)}`;

// Everything about working without a connection, in one place at the top of the page:
// - offline, or showing the copy saved on this device;
// - payments recorded offline and waiting to be sent (with a "send now" button);
// - a short confirmation once they have gone out;
// - payments the server refused, each with its reason, until dismissed.
export function OfflineBar({ userId, currency }: { userId: number; currency: string }) {
  const [offline, setOffline] = useState(() => !navigator.onLine);
  const [waiting, setWaiting] = useState(() => queuedPayments(userId));
  const [unsent, setUnsent] = useState(() => unsentPayments(userId));
  const [justSent, setJustSent] = useState(0);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  useEffect(() => {
    const refresh = (event?: Event) => {
      setWaiting(queuedPayments(userId));
      setUnsent(unsentPayments(userId));
      const sent = (event as CustomEvent<{ sent?: number }> | undefined)?.detail?.sent;
      if (sent) setJustSent(sent);
    };
    window.addEventListener('ahbab:queue', refresh);
    return () => window.removeEventListener('ahbab:queue', refresh);
  }, [userId]);

  // The confirmation fades after a few seconds; the rest stays while it is true.
  useEffect(() => {
    if (!justSent) return;
    const timer = window.setTimeout(() => setJustSent(0), 6000);
    return () => window.clearTimeout(timer);
  }, [justSent]);

  const sendNow = async () => {
    setSending(true);
    await syncPayments(userId).catch(() => undefined);
    setSending(false);
  };

  if (!waiting.length && !unsent.length && !justSent) return null;
  return (
    <div className="offline-stack" aria-live="polite">
      {waiting.length > 0 && (
        <div className="offline-bar sync-waiting" role="status">
          <CloudUpload size={16} aria-hidden />
          <span><bdi>{formatNumber(waiting.length)}</bdi> {waiting.length === 1 ? 'تسديد محفوظ' : 'تسديدات محفوظة'} على الجهاز بانتظار الإرسال</span>
          {!offline && (
            <button type="button" className="sync-now" disabled={sending} onClick={sendNow}>{sending ? 'جارٍ الإرسال…' : 'إرسال الآن'}</button>
          )}
        </div>
      )}

      {justSent > 0 && (
        <div className="offline-bar sync-done" role="status">
          <CheckCircle2 size={16} aria-hidden />
          <span>أُرسل <bdi>{formatNumber(justSent)}</bdi> {justSent === 1 ? 'تسديد' : 'تسديدات'} سُجّلت بدون اتصال</span>
        </div>
      )}

      {unsent.length > 0 && (
        <div className="offline-bar sync-failed" role="alert">
          <TriangleAlert size={16} aria-hidden />
          <div className="sync-failed-body">
            <strong>تسديدات سُجّلت بدون اتصال ولم تُعتمد:</strong>
            <ul>
              {unsent.map((item) => (
                <li key={item.key} className={item.kind === 'info' ? 'is-info' : undefined}>
                  {item.kind === 'info' ? <Info size={14} aria-hidden /> : null}
                  <span>
                    <b>{item.name}</b> — {monthLabel(item.period)} — <bdi>{formatNumber(item.amount)}</bdi> {currency}
                    <small>{item.reason}</small>
                  </span>
                  <button type="button" aria-label={`إخفاء تسديد ${item.name}`} onClick={() => dismissUnsent(item.key)}><X size={14} aria-hidden /></button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

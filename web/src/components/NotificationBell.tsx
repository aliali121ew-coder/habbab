import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, MapPinned, PackageCheck } from 'lucide-react';
import { api, forgetRecent } from '../api';

/* The bell in the top bar: messages for this user (a request given to a delegate, help delivered).
   It asks the server every 30 seconds while the app is open and at once when the phone comes back
   to the app, so a delegate hears about a delivery within moments. Opening it marks all as read. */

interface Item { id: number; kind: string; title: string; body: string; link: string | null; read: boolean; createdAt: string }

const ago = (iso: string) => {
  const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (min < 1) return 'الآن';
  if (min < 60) return `قبل ${min} د`;
  const h = Math.round(min / 60);
  return h < 24 ? `قبل ${h} س` : new Date(iso).toLocaleDateString('ar-IQ-u-nu-latn', { day: 'numeric', month: 'long' });
};

export function NotificationBell() {
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [flash, setFlash] = useState<Item | null>(null);
  const lastSeen = useRef<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      forgetRecent(); // the app keeps GET answers for 30 s; the bell needs the fresh list
      const data = await api<{ unread: number; items: Item[] }>('/notifications');
      setItems(data.items);
      setUnread(data.unread);
      const newest = data.items[0];
      // A new message since the last look shows for a few seconds at the top.
      if (newest && lastSeen.current !== null && newest.id > lastSeen.current && !newest.read) {
        setFlash(newest);
        window.setTimeout(() => setFlash(null), 6000);
        window.dispatchEvent(new CustomEvent('ahbab:notification', { detail: newest.kind }));
      }
      if (newest) lastSeen.current = Math.max(lastSeen.current ?? 0, newest.id);
      else lastSeen.current ??= 0;
    } catch { /* offline: try again on the next tick */ }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 30_000);
    const back = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', back);
    window.addEventListener('online', back);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', back); window.removeEventListener('online', back); };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { const t = e.target as Node;
      if (!box.current?.contains(t) && !panel.current?.contains(t)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread) {
      setUnread(0);
      setItems((list) => list.map((i) => ({ ...i, read: true })));
      void api('/notifications/read', { method: 'POST' }).catch(() => undefined);
    }
  }

  const Icon = (kind: string) => (kind === 'request_delivered' ? PackageCheck : MapPinned);

  return (
    <div className="nb" ref={box}>
      <button type="button" className="icon-btn nb-btn" aria-label={unread ? `الإشعارات، ${unread} جديدة` : 'الإشعارات'} onClick={toggle}>
        <Bell size={20} aria-hidden />
        {unread > 0 && <span className="nb-dot">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && createPortal(
        <div className="nb-panel" role="dialog" aria-label="الإشعارات" dir="rtl" ref={panel}>
          <strong className="nb-title">الإشعارات</strong>
          {items.length === 0 ? <p className="nb-empty">لا توجد إشعارات</p> : (
            <ul>
              {items.map((i) => {
                const I = Icon(i.kind);
                return (
                  <li key={i.id} className={i.read ? '' : 'new'}>
                    <a href={i.link ?? '#/'} onClick={() => setOpen(false)}>
                      <span className={`nb-ic ${i.kind}`}><I size={18} /></span>
                      <span className="nb-text"><b>{i.title}</b><small>{i.body}</small></span>
                      <time>{ago(i.createdAt)}</time>
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </div>,
        document.body,
      )}

      {flash && !open && createPortal(
        <a className="nb-flash" dir="rtl" href={flash.link ?? '#/'} role="status" onClick={() => setFlash(null)}>
          <span className={`nb-ic ${flash.kind}`}>{(() => { const I = Icon(flash.kind); return <I size={18} />; })()}</span>
          <span className="nb-text"><b>{flash.title}</b><small>{flash.body}</small></span>
        </a>,
        document.body,
      )}
    </div>
  );
}

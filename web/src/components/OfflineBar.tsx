import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { showingSavedCopy } from '../api';

// Says plainly when the app is working without a connection: what is on screen is the last copy
// saved on this device, and changes cannot be saved until the connection is back.
export function OfflineBar() {
  const [offline, setOffline] = useState(() => !navigator.onLine);
  const [saved, setSaved] = useState(showingSavedCopy);

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    const copy = (event: Event) => setSaved((event as CustomEvent<boolean>).detail);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    window.addEventListener('ahbab:saved-copy', copy);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      window.removeEventListener('ahbab:saved-copy', copy);
    };
  }, []);

  if (!offline && !saved) return null;
  return (
    <div className="offline-bar" role="status">
      <WifiOff size={16} aria-hidden />
      <span>بدون اتصال — تُعرض آخر بيانات محفوظة على الجهاز، ولا تُحفظ التغييرات حتى يعود الاتصال</span>
    </div>
  );
}

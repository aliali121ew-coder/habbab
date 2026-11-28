import { useEffect, useState } from 'react';
import { Check, Download, Share } from 'lucide-react';
import drawerLogoUrl from '../assets/drawer-logo.webp';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const isStandalone = () =>
  typeof window !== 'undefined'
  && (window.matchMedia('(display-mode: standalone)').matches
    || (navigator as { standalone?: boolean }).standalone === true);

const isIOS = () =>
  typeof navigator !== 'undefined'
  && (/iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

// Capture the native install prompt early (even before React mounts or across route transitions).
let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (ev) => {
    ev.preventDefault();
    deferredPrompt = ev as BeforeInstallPromptEvent;
    listeners.forEach((fn) => fn());
  });
}

/**
 * Top drop-down install card with blurred backdrop on phone browsers (hidden on desktop and
 * hidden once opened as an installed standalone app). Stays visible until the user clicks the
 * install button.
 */
export function InstallBanner() {
  const [installed, setInstalled] = useState(isStandalone);
  const [dismissedAfterAction, setDismissedAfterAction] = useState(false);
  const [hasPrompt, setHasPrompt] = useState(Boolean(deferredPrompt));
  const [showSteps, setShowSteps] = useState(false);

  useEffect(() => {
    const sync = () => setHasPrompt(Boolean(deferredPrompt));
    listeners.add(sync);
    const onInstalled = () => { deferredPrompt = null; setInstalled(true); setShowSteps(false); };
    const mq = window.matchMedia('(display-mode: standalone)');
    const onMode = () => setInstalled(isStandalone());
    window.addEventListener('appinstalled', onInstalled);
    mq.addEventListener?.('change', onMode);
    return () => {
      listeners.delete(sync);
      window.removeEventListener('appinstalled', onInstalled);
      mq.removeEventListener?.('change', onMode);
    };
  }, []);

  const ios = isIOS();

  // Android/Chrome supports native PWA install directly via beforeinstallprompt (no manual steps).
  // iOS Safari has no native prompt, so it shows the same drop-down card followed by Safari steps.
  if (installed || dismissedAfterAction || (!ios && !hasPrompt)) return null;

  async function installNow() {
    if (ios) {
      setShowSteps(true);
      return;
    }
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          deferredPrompt = null;
          setInstalled(true);
        } else {
          setDismissedAfterAction(true);
        }
        return;
      } catch {
        setDismissedAfterAction(true);
        return;
      }
    }
    setDismissedAfterAction(true);
  }

  return (
    <div className="install-overlay" role="dialog" aria-modal="true" aria-label="تثبيت التطبيق على الهاتف">
      <div className="install-sheet">
        <span className="install-sheet-logo" aria-hidden>
          <img src={drawerLogoUrl} alt="" />
        </span>

        {!showSteps ? (
          <>
            <strong className="install-sheet-title">ثبّت تطبيق مؤسسة أحباب الحسين</strong>
            <p className="install-sheet-desc">
              ثبّت التطبيق على شاشة هاتفك الرئيسية لتجربة أسرع والعمل بدون إنترنت
            </p>
            <button type="button" className="install-sheet-btn" onClick={() => void installNow()}>
              <Download size={18} aria-hidden />
              <span>{ios ? 'تثبيت التطبيق' : 'تثبيت التطبيق الآن'}</span>
            </button>
          </>
        ) : (
          <>
            <strong className="install-sheet-title">خطوات التثبيت على هاتفك</strong>
            <small className="install-sheet-sub">على أجهزة آيفون (Safari)</small>
            <ol className="install-guide-steps">
              <li>اضغط على زر <b>المشاركة</b> <Share size={15} className="install-inline-ic" /> أسفل المتصفح.</li>
              <li>اختر <b>«إضافة إلى الشاشة الرئيسية»</b> (Add to Home Screen).</li>
              <li>اضغط <b>«إضافة»</b> في الأعلى ليظهر التطبيق بأيقونة المؤسسة.</li>
            </ol>
            <button type="button" className="install-sheet-btn" onClick={() => setDismissedAfterAction(true)}>
              <Check size={18} aria-hidden />
              <span>تم، متابعة</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}

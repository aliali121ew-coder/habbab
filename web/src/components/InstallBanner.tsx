import { useEffect, useState } from 'react';
import { Download, MoreVertical, Share, Smartphone, X } from 'lucide-react';
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
 * Persistent top banner on phone browsers (hidden once installed as a standalone app and hidden
 * on desktop) urging the user to install the foundation's app on their home screen.
 */
export function InstallBanner() {
  const [installed, setInstalled] = useState(isStandalone);
  const [hasPrompt, setHasPrompt] = useState(Boolean(deferredPrompt));
  const [guide, setGuide] = useState(false);

  useEffect(() => {
    const sync = () => setHasPrompt(Boolean(deferredPrompt));
    listeners.add(sync);
    const onInstalled = () => { deferredPrompt = null; setInstalled(true); setGuide(false); };
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

  if (installed) return null;

  async function installNow() {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          deferredPrompt = null;
          setInstalled(true);
        }
        return;
      } catch {
        // Fall through to manual guide if the browser rejected the prompt.
      }
    }
    setGuide(true);
  }

  const ios = isIOS();

  return (
    <>
      <div className="install-bar" role="region" aria-label="تثبيت التطبيق على الهاتف">
        <span className="install-bar-logo" aria-hidden>
          <img src={drawerLogoUrl} alt="" />
        </span>
        <div className="install-bar-text">
          <strong>ثبّت التطبيق على هاتفك</strong>
          <small>للعمل بسرعة وبدون إنترنت</small>
        </div>
        <button type="button" className="install-bar-btn" onClick={() => void installNow()}>
          <Download size={15} aria-hidden />
          <span>{hasPrompt ? 'تثبيت الآن' : 'تثبيت'}</span>
        </button>
      </div>

      {guide && (
        <div className="install-guide-scrim" role="dialog" aria-modal="true" aria-label="طريقة تثبيت التطبيق" onClick={() => setGuide(false)}>
          <div className="install-guide" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="install-guide-x" onClick={() => setGuide(false)} aria-label="إغلاق">
              <X size={18} />
            </button>
            <div className="install-guide-head">
              <span className="install-guide-ic" aria-hidden><Smartphone size={22} /></span>
              <div>
                <strong>تثبيت تطبيق المؤسسة</strong>
                <small>{ios ? 'على أجهزة آيفون (Safari)' : 'على أجهزة أندرويد (Chrome)'}</small>
              </div>
            </div>
            {ios ? (
              <ol className="install-guide-steps">
                <li>اضغط على زر <b>المشاركة</b> <Share size={15} className="install-inline-ic" /> أسفل المتصفح.</li>
                <li>اختر <b>«إضافة إلى الشاشة الرئيسية»</b> (Add to Home Screen).</li>
                <li>اضغط <b>«إضافة»</b> في الأعلى ليظهر التطبيق بأيقونة المؤسسة على شاشتك.</li>
              </ol>
            ) : (
              <ol className="install-guide-steps">
                <li>اضغط على قائمة المتصفح <MoreVertical size={15} className="install-inline-ic" /> في الأعلى.</li>
                <li>اختر <b>«تثبيت التطبيق»</b> أو <b>«إضافة إلى الشاشة الرئيسية»</b>.</li>
                <li>اضغط <b>«تثبيت»</b> وسيفتح التطبيق مباشرة كبرنامج رسمي على هاتفك.</li>
              </ol>
            )}
            <button type="button" className="install-guide-ok" onClick={() => setGuide(false)}>فهمت</button>
          </div>
        </div>
      )}
    </>
  );
}

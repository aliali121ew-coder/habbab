import { forgetRecent } from './api';
import { clearFamiliesCache } from './data/families';
import { clearPatientsCache } from './data/patients';
import { clearDelegatesCache } from './components/families/DelegateChip';

// Families and patient records (and their photos) live only in this browser until those
// modules get a server API. Every such key starts with this prefix; preferences such as
// the theme or paper size do not, so they survive signing out.
const RECORD_PREFIX = 'ahbab:';
// The data the service worker saved for offline use (see public/sw.js).
const OFFLINE_DATA_CACHE = 'api-v1';

/** Removes every locally stored record so the next person on this device cannot read it. */
export async function clearLocalRecords(): Promise<void> {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(RECORD_PREFIX)) localStorage.removeItem(key);
    }
  } catch {
    // Storage blocked: nothing was saved in the first place.
  }
  forgetRecent();
  clearFamiliesCache();
  clearPatientsCache();
  clearDelegatesCache();
  // Tell the service worker to bump its cache epoch so in-flight responses cannot repopulate cache.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.controller?.postMessage({ type: 'CLEAR_CACHE' });
  }
  // The offline copy of subscribers, delegates and photos goes too.
  if ('caches' in window) await caches.delete(OFFLINE_DATA_CACHE).catch(() => undefined);
}

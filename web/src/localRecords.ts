import { forgetRecent } from './api';

// Families and patient records (and their photos) live only in this browser until those
// modules get a server API. Every such key starts with this prefix; preferences such as
// the theme or paper size do not, so they survive signing out.
const RECORD_PREFIX = 'ahbab:';
// The data the service worker saved for offline use (see public/sw.js).
const OFFLINE_DATA_CACHE = 'api-v1';

/** Removes every locally stored record so the next person on this device cannot read it. */
export function clearLocalRecords(): void {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(RECORD_PREFIX)) localStorage.removeItem(key);
    }
  } catch {
    // Storage blocked: nothing was saved in the first place.
  }
  forgetRecent();
  // The offline copy of subscribers, delegates and photos goes too.
  if ('caches' in window) void caches.delete(OFFLINE_DATA_CACHE).catch(() => undefined);
}

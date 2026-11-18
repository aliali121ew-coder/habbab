// Families and patient records (and their photos) live only in this browser until those
// modules get a server API. Every such key starts with this prefix; preferences such as
// the theme or paper size do not, so they survive signing out.
const RECORD_PREFIX = 'ahbab:';

/** Removes every locally stored record so the next person on this device cannot read it. */
export function clearLocalRecords(): void {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(RECORD_PREFIX)) localStorage.removeItem(key);
    }
  } catch {
    // Storage blocked: nothing was saved in the first place.
  }
}

// Families (العوائل المتعففة) start empty: the sample families and sample delegates were removed
// on 2026-11-23. Real families will come from the server; until then this device store holds
// only what is added here. Live delegates come from useLiveDelegates() in DelegateChip.
export const DELEGATES = [];

export const AVAILABLE_MONTHS = [
  { id: '2026-11', label: 'تشرين الثاني 2026' },
  { id: '2026-10', label: 'تشرين الأول 2026' },
  { id: '2026-09', label: 'أيلول 2026' },
  { id: '2026-08', label: 'آب 2026' },
];


export const INITIAL_FAMILIES = [];

const STORAGE_KEY = 'ahbab:families-v3';
// Older device copies held the sample families (and their photos); clear them once.
const OLD_KEYS = ['ahbab:families-saas-v2', 'ahbab:families-store-v1', 'ahbab:family-photos-v1', 'ahbab:patient-photos'];
try {
  if (!localStorage.getItem('ahbab:sample-cleared')) {
    for (const key of OLD_KEYS) localStorage.removeItem(key);
    localStorage.setItem('ahbab:sample-cleared', '2026-11-23');
  }
} catch { /* storage blocked */ }

export function loadFamiliesStore() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : INITIAL_FAMILIES;
  } catch {
    return INITIAL_FAMILIES;
  }
}

export function saveFamiliesStore(families) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(families));
  } catch {
    // Ignore storage quota exceptions cleanly.
  }
}

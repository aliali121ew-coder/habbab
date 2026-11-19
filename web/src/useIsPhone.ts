import { useSyncExternalStore } from 'react';

// The phone layout's breakpoint, the same one the stylesheets and theme.js use.
const QUERY = '(max-width: 767.98px)';

const subscribe = (listener: () => void) => {
  const media = matchMedia(QUERY);
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
};

export const useIsPhone = () => useSyncExternalStore(subscribe, () => matchMedia(QUERY).matches, () => false);

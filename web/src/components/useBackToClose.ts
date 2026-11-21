import { useEffect, useRef } from 'react';

// While a panel or sheet is open it owns one history entry, so the phone's back button (or back
// gesture) closes the panel instead of leaving the page. Closing it with its own button removes
// that entry again. When one panel gives way to another at once (the foundation panel opening a
// program), the new one takes over the same entry instead of stacking a second one.
let nextId = 0;
let pendingBack: number | null = null;

export function useBackToClose(onClose: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const id = ++nextId;
    const state = { ...(window.history.state ?? {}), panel: id };
    if (pendingBack !== null) {
      // The previous panel just closed itself: reuse its entry rather than go back and forth.
      window.clearTimeout(pendingBack);
      pendingBack = null;
      window.history.replaceState(state, '');
    } else {
      window.history.pushState(state, '');
    }

    let leftByBack = false;
    const onPop = () => {
      if (window.history.state?.panel !== id) {
        leftByBack = true;
        closeRef.current();
      }
    };
    window.addEventListener('popstate', onPop);

    return () => {
      window.removeEventListener('popstate', onPop);
      // Closed by its own button: drop the entry it added (unless another panel takes it over).
      if (!leftByBack && window.history.state?.panel === id) {
        pendingBack = window.setTimeout(() => {
          pendingBack = null;
          window.history.back();
        }, 0);
      }
    };
  }, []);
}

/** The same, as a component: render it inside something that is only there while open. */
export function BackToClose({ onClose }: { onClose: () => void }) {
  useBackToClose(onClose);
  return null;
}

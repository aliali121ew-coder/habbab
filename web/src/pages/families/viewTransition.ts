// Helpers for progressive Same-Document View Transitions with accessibility focus routing.

let pendingFamilyHeroId: number | null = null;

export function getPendingFamilyHeroId(): number | null {
  return pendingFamilyHeroId;
}

export function clearPendingFamilyHeroId(): void {
  pendingFamilyHeroId = null;
}

/**
 * Navigates cleanly using `document.startViewTransition` when supported, morphing shared
 * family card elements and moving focus to `focusTargetId` once the DOM update settles.
 */
export function navigateWithTransition(
  href: string,
  options: {
    familyId?: number;
    focusTargetId?: string;
    sourceEl?: HTMLElement | null;
  } = {},
): void {
  const { familyId, focusTargetId, sourceEl } = options;

  if (familyId !== undefined) {
    pendingFamilyHeroId = familyId;
  }

  const applyNavigation = () => new Promise<void>((resolve) => {
    const onHash = () => {
      window.removeEventListener('hashchange', onHash);
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
    };
    window.addEventListener('hashchange', onHash);
    window.location.hash = href;
    window.setTimeout(() => {
      window.removeEventListener('hashchange', onHash);
      resolve();
    }, 120);
  });

  const routeFocus = () => {
    window.requestAnimationFrame(() => {
      if (focusTargetId) {
        const target = document.getElementById(focusTargetId);
        target?.focus({ preventScroll: true });
      }
      if (sourceEl) {
        sourceEl.style.viewTransitionName = '';
      }
    });
  };

  if (!document.startViewTransition) {
    applyNavigation();
    routeFocus();
    return;
  }

  if (sourceEl && familyId !== undefined) {
    sourceEl.style.viewTransitionName = `family-hero-${familyId}`;
  }

  const transition = document.startViewTransition(() => {
    applyNavigation();
  });

  transition.finished.finally(() => {
    if (sourceEl) {
      sourceEl.style.viewTransitionName = '';
    }
    pendingFamilyHeroId = null;
    routeFocus();
  });
}

/**
 * Wraps a list/filter DOM mutation in `document.startViewTransition` when available.
 */
export function runViewTransition(update: () => void): void {
  if (!document.startViewTransition) {
    update();
    return;
  }
  document.startViewTransition(update);
}

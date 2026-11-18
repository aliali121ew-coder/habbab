// Helpers for modal dialog top-layer animations, light-dismiss fallback, and post-interaction
// accessible form validation, following Modern Web Guidance patterns.

let supportsDisplayTransition: boolean | undefined;

function canTransitionDisplay(): boolean {
  if (supportsDisplayTransition !== undefined) return supportsDisplayTransition;
  if (!window.CSS?.supports?.('transition-behavior', 'allow-discrete') || !document.body) {
    return false;
  }
  const probe = document.createElement('div');
  probe.style.cssText = 'transition: display 1s allow-discrete !important; display: block;';
  document.body.appendChild(probe);
  getComputedStyle(probe).display;
  probe.style.display = 'none';
  supportsDisplayTransition = getComputedStyle(probe).display === 'block';
  probe.remove();
  return supportsDisplayTransition;
}

function supportsTopLayerExit(): boolean {
  return Boolean(window.CSS?.supports?.('overlay', 'auto') && canTransitionDisplay());
}

/**
 * Closes a modal `<dialog>`, running the `data-closing` exit transition fallback in browsers
 * that do not support `overlay` or discrete `display` transitions (Firefox, Safari).
 */
export async function closeTopLayer(dialog: HTMLDialogElement | null): Promise<void> {
  if (!dialog || !dialog.open) return;
  if (!supportsTopLayerExit()) {
    dialog.setAttribute('data-closing', '');
    const animations = dialog.getAnimations({ subtree: true });
    if (animations.length > 0) {
      await Promise.race([
        Promise.allSettled(animations.map((animation) => animation.finished)),
        new Promise((resolve) => window.setTimeout(resolve, 2000)),
      ]);
    }
    if (!dialog.hasAttribute('data-closing')) return;
    dialog.removeAttribute('data-closing');
  }
  dialog.close();
}

/**
 * Wires `cancel` (Esc / native light-dismiss) to `closeTopLayer` and adds a coordinate-based
 * backdrop click fallback when `closedBy` is unsupported.
 */
export function attachDialogDismiss(dialog: HTMLDialogElement): () => void {
  const onCancel = (event: Event) => {
    event.preventDefault();
    void closeTopLayer(dialog);
  };
  dialog.addEventListener('cancel', onCancel);

  const supportsClosedBy = 'closedBy' in HTMLDialogElement.prototype;
  const onBackdropClick = (event: MouseEvent) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    const inside =
      rect.top <= event.clientY
      && event.clientY <= rect.top + rect.height
      && rect.left <= event.clientX
      && event.clientX <= rect.left + rect.width;
    if (!inside) void closeTopLayer(dialog);
  };
  if (!supportsClosedBy) {
    dialog.addEventListener('click', onBackdropClick);
  }

  return () => {
    dialog.removeEventListener('cancel', onCancel);
    if (!supportsClosedBy) {
      dialog.removeEventListener('click', onBackdropClick);
    }
  };
}

const linkError = (el: HTMLElement, shown: boolean) => {
  const errorId = el.dataset.error;
  if (!errorId) return;
  const ids = (el.getAttribute('aria-describedby') || '')
    .split(/\s+/)
    .filter((id) => id && id !== errorId);
  if (shown) ids.push(errorId);
  if (ids.length) el.setAttribute('aria-describedby', ids.join(' '));
  else el.removeAttribute('aria-describedby');
};

const spokenText = (node: Node): string => {
  const copy = node.cloneNode(true) as Element;
  copy.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
  copy.querySelectorAll('[role="img"][aria-label]').forEach((n) => {
    n.replaceWith(`${n.getAttribute('aria-label')}: `);
  });
  return (copy.textContent ?? '').replace(/\s+/g, ' ').trim();
};

/**
 * Synchronizes `aria-invalid`, `aria-describedby`, and polite live-region announcements with
 * `:user-invalid` (and provides a `WeakMap`-backed fallback if `:user-invalid` is unsupported).
 */
export function attachAccessibleValidation(form: HTMLFormElement): () => void {
  const nativeUserInvalid = CSS.supports('selector(:user-invalid)');
  const dirtyState = new WeakMap<Element, { hasInteracted: boolean; hasBlurred: boolean }>();
  const flagged = new WeakSet<Element>();
  const announced = new WeakSet<Element>();

  const announcer = document.createElement('div');
  announcer.setAttribute('aria-live', 'polite');
  announcer.className = 'visually-hidden';
  document.body.append(announcer);

  let announceTimer: number | undefined;
  let announcedField: Element | undefined;

  const announceError = (el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) => {
    const errorId = el.dataset.error;
    const errorEl = errorId ? document.getElementById(errorId) : null;
    if (!errorEl) return;
    const label = el.labels?.[0] ? `${spokenText(el.labels[0])}: ` : '';
    window.clearTimeout(announceTimer);
    announcer.textContent = '';
    announcedField = el;
    announceTimer = window.setTimeout(() => {
      announcer.textContent = label + spokenText(errorEl);
    }, 500);
  };

  const syncControl = (target: EventTarget | null, announce = false) => {
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) {
      return;
    }
    const invalid = nativeUserInvalid ? target.matches(':user-invalid') : !target.validity.valid;
    if (!nativeUserInvalid) {
      target.classList.toggle('user-invalid-fallback', invalid);
      target.classList.toggle('user-valid-fallback', !invalid);
    }
    if (invalid) {
      if (announce && !announced.has(target)) {
        announceError(target);
        announced.add(target);
      }
      target.setAttribute('aria-invalid', 'true');
      linkError(target, true);
      flagged.add(target);
    } else if (flagged.has(target) || target.getAttribute('aria-invalid') !== 'true') {
      target.setAttribute('aria-invalid', 'false');
      linkError(target, false);
      flagged.delete(target);
      announced.delete(target);
      if (announcedField === target) {
        window.clearTimeout(announceTimer);
        announcer.textContent = '';
      }
    }
  };

  form.querySelectorAll('input, select, textarea').forEach((el) => {
    if (!el.hasAttribute('aria-invalid')) el.setAttribute('aria-invalid', 'false');
  });

  const onBlur = (event: FocusEvent) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (nativeUserInvalid) {
      syncControl(target, true);
      return;
    }
    const state = dirtyState.get(target) ?? { hasInteracted: false, hasBlurred: false };
    state.hasBlurred = true;
    dirtyState.set(target, state);
    if (state.hasInteracted) syncControl(target, true);
  };

  const onInput = (event: Event) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (nativeUserInvalid) {
      if (target.hasAttribute('aria-invalid')) syncControl(target, false);
      return;
    }
    const state = dirtyState.get(target) ?? { hasInteracted: false, hasBlurred: false };
    state.hasInteracted = true;
    dirtyState.set(target, state);
    if (state.hasBlurred) syncControl(target, false);
  };

  const onChange = (event: Event) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (nativeUserInvalid) {
      syncControl(target, true);
      return;
    }
    const state = dirtyState.get(target) ?? { hasInteracted: false, hasBlurred: false };
    state.hasInteracted = true;
    dirtyState.set(target, state);
    if (state.hasBlurred) syncControl(target, true);
  };

  const onInvalid = (event: Event) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    announced.add(target);
    if (!nativeUserInvalid) {
      dirtyState.set(target, { hasInteracted: true, hasBlurred: true });
    }
    syncControl(target, false);
  };

  form.addEventListener('blur', onBlur, true);
  form.addEventListener('input', onInput);
  form.addEventListener('change', onChange, true);
  form.addEventListener('invalid', onInvalid, true);

  return () => {
    window.clearTimeout(announceTimer);
    announcer.remove();
    form.removeEventListener('blur', onBlur, true);
    form.removeEventListener('input', onInput);
    form.removeEventListener('change', onChange, true);
    form.removeEventListener('invalid', onInvalid, true);
  };
}

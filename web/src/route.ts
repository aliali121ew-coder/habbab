import { useSyncExternalStore } from 'react';

// The manager starts on the home summary; a register is either one delegate's or everyone's.
export type Route =
  | 'home'
  | 'delegates'
  | 'expenses'
  | 'expenses-ledger'
  | 'patients'
  | 'patient-detail'
  | 'families'
  | 'family-detail'
  | `soon:${string}`
  // One delegate's full subscriber list on its own page (the phone shows only five on the register page).
  | `list:${number}`
  | number;

const subscribe = (listener: () => void) => {
  window.addEventListener('hashchange', listener);
  return () => window.removeEventListener('hashchange', listener);
};

function parse(hash: string): Route {
  // The combined register is gone; old #/all links land on the delegates page.
  if (hash === '#/all' || hash === '#/delegates') return 'delegates';
  if (hash === '#/expenses') return 'expenses';
  if (hash === '#/expenses/ledger') return 'expenses-ledger';
  if (hash === '#/patients') return 'patients';
  if (/^#\/patients\/\d+$/.test(hash)) return 'patient-detail';
  if (hash === '#/families') return 'families';
  if (/^#\/families\/\d+$/.test(hash)) return 'family-detail';
  const soon = /^#\/soon\/([a-z-]+)$/.exec(hash);
  if (soon) return `soon:${soon[1]}`;
  const list = /^#\/delegates\/(\d+)\/list$/.exec(hash);
  if (list) return `list:${Number(list[1])}`;
  const match = /^#\/delegates\/(\d+)$/.exec(hash);
  return match ? Number(match[1]) : 'home';
}

export const useRoute = () => parse(useSyncExternalStore(subscribe, () => location.hash));

export const patientIdFromHash = () => Number(/^#\/patients\/(\d+)$/.exec(location.hash)?.[1] ?? 0);
export const familyIdFromHash = () => Number(/^#\/families\/(\d+)$/.exec(location.hash)?.[1] ?? 0);

export const registerHref = (delegateId: number | null) => (delegateId === null ? '#/all' : `#/delegates/${delegateId}`);
export const familyHref = (familyId: number) => `#/families/${familyId}`;
export const subscriberListHref = (delegateId: number) => `#/delegates/${delegateId}/list`;

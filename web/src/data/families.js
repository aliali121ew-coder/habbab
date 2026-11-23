// العوائل المتعففة, from the server (/api/families). The list is kept in memory only (not on
// the device: it is personal data and belongs to the signed-in foundation), so the home page,
// the patients page and the family file can read it at once after the families page loaded it.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';

// Delegates now come from the server (useLiveDelegates in components/families/DelegateChip).
export const DELEGATES = [];

const MONTHS_AR = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'];

// This month and the three before it, for the month picker in the page header.
export const AVAILABLE_MONTHS = Array.from({ length: 4 }, (_, back) => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - back);
  return { id: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: `${MONTHS_AR[d.getMonth()]} ${d.getFullYear()}` };
});

export const INITIAL_FAMILIES = [];

// Device copies from before the server held families are cleared once (they were sample data).
try {
  for (const key of ['ahbab:families-v3', 'ahbab:families-saas-v2', 'ahbab:families-store-v1', 'ahbab:family-photos-v1']) localStorage.removeItem(key);
} catch { /* storage blocked */ }

let cache = [];
let loaded = false;
const listeners = new Set();
const publish = () => listeners.forEach((fn) => fn(cache));

export function clearFamiliesCache() {
  cache = [];
  loaded = false;
  publish();
}

/** The families last loaded from the server (empty until the first load). */
export function loadFamiliesStore() {
  return cache;
}

export async function fetchFamilies() {
  const data = await api('/families');
  cache = data.items;
  loaded = true;
  publish();
  return cache;
}

/** The families list with its loading state; any page that changes a family calls reload().
 *  `enabled` false (a foundation without the families section) asks the server nothing. */
export function useFamilies(enabled = true) {
  const [families, setFamilies] = useState(enabled ? cache : []);
  const [loading, setLoading] = useState(enabled && !loaded);
  const [error, setError] = useState('');
  const reload = useCallback(async () => {
    if (!enabled) return;
    setError('');
    try {
      await fetchFamilies();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setLoading(false);
    }
  }, [enabled]);
  useEffect(() => {
    if (!enabled) return undefined;
    listeners.add(setFamilies);
    void reload();
    return () => { listeners.delete(setFamilies); };
  }, [reload, enabled]);
  return { families, loading, error, reload };
}

export const getFamily = (id) => api(`/families/${id}`);

/** Files with the same head's four-part name at other foundations: [{ id, foundation, region }]. */
export const matchFamily = (headName) => api('/families/match', { method: 'POST', body: { headName } }).then((d) => d.items);

// The add dialog builds a whole family object; the server needs only what a person entered.
export async function createFamily(family, linkTo) {
  const { id } = await api('/families', {
    method: 'POST',
    body: {
      name: family.name,
      headName: family.headName,
      phone: family.phone || undefined,
      category: family.category,
      socialStatus: family.socialStatus,
      region: family.region,
      address: family.address,
      housing: family.housing,
      rent: family.rent,
      income: family.income,
      delegateId: family.delegate?.id ?? null,
      entitlements: family.entitlements,
      notes: family.notes,
      members: (family.members ?? []).map((m) => ({ name: m.name, relation: m.relation, age: m.age, status: m.status, chronic: m.chronic })),
      linkTo: linkTo ?? undefined,
    },
  });
  for (const visit of family.visits ?? []) {
    await api(`/families/${id}/visits`, { method: 'POST', body: { date: visit.date, delegateName: visit.delegateName, note: visit.note } });
  }
  return id;
}

export const updateFamily = (id, patch) => api(`/families/${id}`, { method: 'PATCH', body: patch });
export const payFamily = (id, payment) => api(`/families/${id}/payments`, {
  method: 'POST', body: { date: payment.date, amount: payment.amount, type: payment.type, receivedBy: payment.receivedBy, by: payment.by },
});
export const bulkPayFamilies = (ids) => api('/families/bulk-pay', { method: 'POST', body: { ids, date: new Date().toISOString().slice(0, 10) } });
export const visitFamily = (id, visit) => api(`/families/${id}/visits`, { method: 'POST', body: { date: visit.date, delegateName: visit.delegateName, note: visit.note } });
export const addMember = (id, member) => api(`/families/${id}/members`, { method: 'POST', body: member });
export const updateMember = (id, memberId, member) => api(`/families/${id}/members/${memberId}`, { method: 'PATCH', body: member });
export const removeMember = (id, memberId) => api(`/families/${id}/members/${memberId}`, { method: 'DELETE' });

export async function uploadFamilyPhoto(id, blob) {
  const form = new FormData();
  form.set('image', blob, 'image');
  return api(`/families/${id}/photo`, { method: 'POST', form });
}

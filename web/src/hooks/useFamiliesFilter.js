import { useMemo } from 'react';
import { DELEGATES } from '../data/families';
import {
  CATEGORY_CONFIG,
  PAYMENT_STATUS_LABELS,
  disbursementStatus,
  totalEntitlement,
} from '../utils/format';

export function useFamiliesFilter(families, filters) {
  const {
    query = '',
    category = 'all',
    delegateId = 'all',
    paymentStatus = 'all',
    sortBy = 'entitlement_desc',
  } = filters;

  const categoryCounts = useMemo(() => {
    const counts = { all: families.length, critical: 0, intensive: 0, stable: 0 };
    for (const fam of families) {
      if (counts[fam.category] !== undefined) counts[fam.category] += 1;
    }
    return counts;
  }, [families]);

  const delegateCounts = useMemo(() => {
    const map = new Map();
    for (const del of DELEGATES) map.set(del.id, 0);
    for (const fam of families) {
      const id = fam.delegate?.id;
      if (id != null) map.set(id, (map.get(id) ?? 0) + 1);
    }
    return map;
  }, [families]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    const list = families.filter((fam) => {
      if (category !== 'all' && fam.category !== category) return false;
      if (delegateId !== 'all' && String(fam.delegate?.id) !== String(delegateId)) return false;
      if (paymentStatus !== 'all' && disbursementStatus(fam) !== paymentStatus) return false;
      if (!q) return true;

      const haystack = [
        fam.name,
        fam.headName,
        fam.fileNo,
        fam.region,
        fam.address,
        fam.socialStatus,
        fam.delegate?.name,
        ...(fam.patients ?? []).map((p) => `${p.name} ${p.diagnosis}`),
        ...(fam.members ?? []).map((m) => `${m.name} ${m.chronic ?? ''}`),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(q);
    });

    return [...list].sort((a, b) => {
      if (sortBy === 'entitlement_desc') return totalEntitlement(b) - totalEntitlement(a);
      if (sortBy === 'visit_desc') return String(b.lastVisit).localeCompare(String(a.lastVisit));
      if (sortBy === 'arrears_desc') return b.arrears - a.arrears || b.arrearsMonths - a.arrearsMonths;
      return String(a.name).localeCompare(String(b.name), 'ar');
    });
  }, [families, query, category, delegateId, paymentStatus, sortBy]);

  const activeChips = useMemo(() => {
    const chips = [];
    if (query.trim()) {
      chips.push({ key: 'query', label: `البحث: «${query.trim()}»` });
    }
    if (category !== 'all') {
      chips.push({ key: 'category', label: `التصنيف: ${CATEGORY_CONFIG[category]?.label ?? category}` });
    }
    if (delegateId !== 'all') {
      const del = DELEGATES.find((d) => String(d.id) === String(delegateId));
      chips.push({ key: 'delegateId', label: `المندوب: ${del?.name ?? delegateId}` });
    }
    if (paymentStatus !== 'all') {
      chips.push({ key: 'paymentStatus', label: `حالة الصرف: ${PAYMENT_STATUS_LABELS[paymentStatus] ?? paymentStatus}` });
    }
    return chips;
  }, [query, category, delegateId, paymentStatus]);

  return {
    filtered,
    categoryCounts,
    delegateCounts,
    activeChips,
  };
}

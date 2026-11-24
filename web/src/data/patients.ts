// المرضى, from the server (/api/patients). Kept in memory only (personal data of the signed-in
// foundation), so the patients page, a patient's file, the home page and the reports read it at
// once after one of them loaded it.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import type { AidRecord, Patient } from '../pages/patients/sample';

type RawPatient = Omit<Patient, 'tone'>;
const withTone = (p: RawPatient): Patient => ({ ...p, tone: p.id % 6 });

try { localStorage.removeItem('ahbab:patient-photos'); } catch { /* storage blocked */ }

let cache: Patient[] = [];
let ownName = '';
let loaded = false;
const listeners = new Set<() => void>();
const publish = () => listeners.forEach((fn) => fn());

export function clearPatientsCache() {
  cache = [];
  ownName = '';
  loaded = false;
  publish();
}

export async function fetchPatients() {
  const data = await api<{ items: RawPatient[]; foundation: string }>('/patients');
  cache = data.items.map(withTone);
  ownName = data.foundation;
  loaded = true;
  publish();
  return cache;
}

/** The patients list with its loading state. `enabled` false asks the server nothing. */
export function usePatients(enabled = true) {
  const [, setTick] = useState(0);
  const [loading, setLoading] = useState(enabled && !loaded);
  const [error, setError] = useState('');
  const reload = useCallback(async () => {
    if (!enabled) return;
    setError('');
    try {
      await fetchPatients();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setLoading(false);
    }
  }, [enabled]);
  useEffect(() => {
    if (!enabled) return undefined;
    const fn = () => setTick((t) => t + 1);
    listeners.add(fn);
    void reload();
    return () => { listeners.delete(fn); };
  }, [reload, enabled]);
  return { patients: enabled ? cache : [], foundation: ownName, loading, error, reload };
}

export async function getPatient(id: number) {
  const data = await api<RawPatient & { foundation: string }>(`/patients/${id}`);
  return { patient: withTone(data), foundation: data.foundation };
}

export interface PatientInput {
  name: string;
  age?: number;
  gender?: 'male' | 'female';
  condition?: string;
  address?: string;
  phone?: string;
  notes?: string;
  familyId?: number | null;
  delegateId?: number | null;
}

/** The families and delegates a patient can be linked to (the manager and health officer). */
export interface PatientLinks { families: { id: number; name: string; delegate: string | null }[]; delegates: { id: number; name: string }[] }
export const patientLinks = () => api<PatientLinks>('/patients/links');

export const matchPatient = (name: string) =>
  api<{ items: { id: number; foundation: string; region: null }[] }>('/patients/match', { method: 'POST', body: { name } }).then((d) => d.items);
export const createPatient = (patient: PatientInput, linkTo?: number) =>
  api<{ id: number }>('/patients', { method: 'POST', body: { ...patient, linkTo } }).then((d) => d.id);
export const updatePatient = (id: number, patch: Partial<PatientInput>) => api(`/patients/${id}`, { method: 'PATCH', body: patch });

export type AidInput = Pick<AidRecord, 'date' | 'cash' | 'medicine' | 'exams' | 'doctor' | 'delegate' | 'note'>;
export const addAid = (id: number, aid: AidInput) => api(`/patients/${id}/aids`, { method: 'POST', body: aid });
export const updateAid = (id: number, aidId: number, aid: AidInput) => api(`/patients/${id}/aids/${aidId}`, { method: 'PATCH', body: aid });
export const removeAid = (id: number, aidId: number) => api(`/patients/${id}/aids/${aidId}`, { method: 'DELETE' });

export async function uploadPatientPhoto(id: number, blob: Blob) {
  const form = new FormData();
  form.set('image', blob, 'image');
  return api<{ photo: string }>(`/patients/${id}/photo`, { method: 'POST', form });
}

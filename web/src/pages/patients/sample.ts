// The patients' shapes, as /api/patients returns them (web/src/data/patients.ts loads them).
// Each record is one visit's aid: this foundation's own in full; another foundation's (when both
// confirmed the same patient) with its amounts, date and foundation name only.
export interface AidRecord {
  id: number;
  own: boolean;
  date: string;
  foundation: string;
  cash: number;
  medicine: number;
  exams: number;
  doctor: string;
  delegate: string;
  note: string;
}

export interface Patient {
  id: number;
  file: string;
  name: string;
  age: number;
  gender?: 'male' | 'female';
  condition: string;
  address: string;
  phone: string;
  notes: string;
  photo: string | null;
  linked: boolean;
  createdAt: string;
  tone: number;
  records: AidRecord[];
}

/** The foundations that gave these patients anything, this foundation first. */
export function foundationsOf(patients: Patient[], own: string): string[] {
  const others = new Set<string>();
  for (const patient of patients) for (const record of patient.records) if (!record.own) others.add(record.foundation);
  return [own, ...[...others].sort()];
}

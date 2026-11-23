// Patients start empty: the sample patients, doctors and other foundations were removed on
// 2026-11-23. Real patients will come from the server.
export interface AidRecord {
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
  condition: string;
  address: string;
  phone: string;
  tone: number;
  records: AidRecord[];
}

// The foundation's own records are tagged with this; the patients register moves to the server
// (phase 4), where each record carries its foundation's id instead.
export const OWN_FOUNDATION = 'المؤسسة';

// Foundations that appear in the patients register; others are added when they join.
export const FOUNDATIONS: string[] = [OWN_FOUNDATION];

export const PATIENTS: Patient[] = [];

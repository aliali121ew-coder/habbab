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

// The foundation this copy of the app belongs to; its own purchases are counted apart.
export const OWN_FOUNDATION = 'مؤسسة أحباب الحسين الثقافية الخيرية';

// Foundations that appear in the patients register; others are added when they join.
export const FOUNDATIONS: string[] = [OWN_FOUNDATION];

export const PATIENTS: Patient[] = [];

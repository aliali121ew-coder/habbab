export type FamilyPriority = 'critical' | 'intensive' | 'stable';
export type PaymentStatus = 'paid' | 'overdue' | 'pending';
export type AidCategory = 'salary' | 'aid' | 'medicine' | 'checkup';

export interface CaseOfficer {
  id: number;
  name: string;
  zone: string;
  phone: string;
  initials: string;
}

export interface FamilyMember {
  id: string;
  name: string;
  initials: string;
  relation: string;
  age: number;
  status: string;
  chronic?: string;
  orphanLabel?: 'يتيم' | 'يتيمة';
  patientId?: number;
}

export interface FamilyPatientRecord {
  id: number;
  name: string;
  initials: string;
  lastVisit: string;
  deliveredCash: number;
  medicineCost: number;
  examsCost: number;
  doctor: string;
  diagnosis: string;
}

export interface FamilyPaymentRecord {
  id: string;
  type: AidCategory;
  typeLabel: string;
  amount: number;
  date: string;
  officer: string;
  title: string;
  note: string;
  status: PaymentStatus;
}

export interface FamilyVisitRecord {
  id: string;
  date: string;
  officerName: string;
  summary: string;
  rating: 'مستقرة' | 'تحتاج متابعة' | 'حرجة';
  photosCount?: number;
}

export interface MonthlySpendPoint {
  month: string;
  due: number;
  paid: number;
}

export interface FamilyAlert {
  id: string;
  severity: 'rose' | 'amber' | 'blue';
  title: string;
  detail: string;
  badge: string;
}

export interface ActivityItem {
  id: string;
  kind: 'payment' | 'visit' | 'checkup';
  title: string;
  subtitle: string;
  date: string;
}

export interface FamilyDetail {
  id: number;
  fileNo: string;
  name: string;
  initials: string;
  priority: FamilyPriority;
  socialStatus: string;
  address: string;
  region: string;
  housing: string;
  rentAmount: number;
  registeredAt: string;
  incomeNote: string;
  caseSummary: string;
  officer: CaseOfficer;
  entitlements: {
    salary: number;
    aid: number;
    medicine: number;
    checkups: number;
  };
  paidThisMonth: number;
  arrears: number;
  arrearsMonths: number;
  trendPercent: number;
  monthLabel: string;
  members: FamilyMember[];
  patients: FamilyPatientRecord[];
  payments: FamilyPaymentRecord[];
  visits: FamilyVisitRecord[];
  monthlyHistory: MonthlySpendPoint[];
  internalAid: AidSource[];
  externalAid: AidSource[];
  alerts: FamilyAlert[];
  activities: ActivityItem[];
}

export type AidSourceStatus = 'active' | 'late' | 'paused';

export interface AidSourceRecord {
  id: string;
  date: string;
  title: string;
  amount: number;
  note: string;
}

/** One provider of aid to a family: one of our own programs, or another organization. */
export interface AidSource {
  id: string;
  kind: 'internal' | 'external';
  name: string;
  aidType: string;
  monthlyAmount: number;
  /** Paid so far this month; only tracked for our own programs. */
  paidThisMonth?: number;
  frequency: string;
  since: string;
  lastReceived: string | null;
  status: AidSourceStatus;
  contact?: { person: string; phone: string };
  note: string;
  history: AidSourceRecord[];
  /** Ids of the family members this provider helps. */
  beneficiaryIds: string[];
}

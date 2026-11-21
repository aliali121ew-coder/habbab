import type { DelegateSummary } from '../../api';
import { PATIENTS, type Patient } from '../patients/sample';

export type HousingType = 'rent' | 'owned' | 'shared' | 'informal';
export type PriorityLevel = 'urgent' | 'high' | 'stable';
export type FamilyCategory = 'widow_orphans' | 'chronic_patient' | 'elderly' | 'low_income';
export type FamilyAidKind = 'salary' | 'food' | 'rent' | 'cash_aid' | 'seasonal' | 'school';

export interface FamilyDelegate {
  id: number;
  name: string;
  phone: string;
  zone: string;
  avatarUrl?: string | null;
  isLive?: boolean;
}

export interface FamilyMember {
  id: string;
  name: string;
  relation: string;
  age: number;
  gender: 'male' | 'female';
  roleNote: string;
  healthNote: string;
  isOrphan?: boolean;
  patientId?: number;
}

export interface FamilyAid {
  id: string;
  date: string;
  kind: FamilyAidKind;
  title: string;
  amount: number;
  delegateName: string;
  foundation: string;
  receiptNo: string;
  monthLabel?: string;
  note: string;
}

export type UnifiedAidCategory =
  | FamilyAidKind
  | 'patient_cash'
  | 'patient_medicine'
  | 'patient_exam';

export interface UnifiedDisbursement {
  id: string;
  date: string;
  category: UnifiedAidCategory;
  group: 'salary' | 'assistance' | 'patient_aid' | 'medical_exam';
  label: string;
  title: string;
  amount: number;
  delegateName: string;
  foundation: string;
  doctor?: string;
  patientId?: number;
  patientName?: string;
  receiptNo: string;
  note: string;
  source: 'family' | 'patient';
}

export interface Family {
  id: number;
  fileNo: string;
  headName: string;
  guardianName: string;
  nationalId: string;
  phone: string;
  district: string;
  address: string;
  housing: HousingType;
  rentAmount: number;
  priority: PriorityLevel;
  category: FamilyCategory;
  monthlySalary: number;
  delegateId: number;
  delegateName: string;
  delegatePhone: string;
  registeredAt: string;
  lastVisit: string;
  verifiedBy: string;
  caseSummary: string;
  needs: string[];
  tone: number;
  members: FamilyMember[];
  patientIds: number[];
  aids: FamilyAid[];
}

export const HOUSING_LABELS: Record<HousingType, string> = {
  rent: 'إيجار',
  owned: 'ملك بسيط',
  shared: 'سكن مشترك',
  informal: 'تجاوز / كرفان',
};

export const PRIORITY_LABELS: Record<PriorityLevel, string> = {
  urgent: 'حرجة',
  high: 'متوسطة',
  stable: 'جيدة',
};

export const CATEGORY_LABELS: Record<FamilyCategory, string> = {
  widow_orphans: 'أرملة وأيتام',
  chronic_patient: 'مريض مزمن',
  elderly: 'كبار سن وعاجز',
  low_income: 'متعففة / دخل محدود',
};

export const FAMILY_AID_LABELS: Record<FamilyAidKind, string> = {
  salary: 'راتب شهري',
  food: 'سلة غذائية',
  rent: 'دعم إيجار',
  cash_aid: 'مساعدة مالية',
  seasonal: 'كسوة وموسمية',
  school: 'لوازم دراسية',
};

export const UNIFIED_CATEGORY_LABELS: Record<UnifiedAidCategory, string> = {
  ...FAMILY_AID_LABELS,
  patient_cash: 'مساعدة مريض نقدية',
  patient_medicine: 'شراء دواء',
  patient_exam: 'كشفية طبية',
};

export const SAMPLE_DELEGATES: FamilyDelegate[] = [
  { id: 101, name: 'كرار حيدر', phone: '0770 412 8891', zone: 'الكاظمية والحرية' },
  { id: 102, name: 'مصطفى جاسم العبيدي', phone: '0780 934 1120', zone: 'الشعلة والغزالية' },
  { id: 103, name: 'علي إحسان الموسوي', phone: '0771 665 3402', zone: 'الأعظمية والشعب' },
  { id: 104, name: 'حسين صادق التميمي', phone: '0790 218 7745', zone: 'مدينة الصدر والزعفرانية' },
  { id: 105, name: 'زهراء كاظم الربيعي', phone: '0781 550 9031', zone: 'الكرادة والبياع والدورة' },
];

export const INITIAL_FAMILIES: Family[] = [
  {
    id: 1,
    fileNo: 'FM-4012',
    headName: 'عائلة حسين علي الكاظمي',
    guardianName: 'حسين علي الكاظمي',
    nationalId: '1962-4410-8832',
    phone: '07701 234 561',
    district: 'الكاظمية',
    address: 'بغداد – الكاظمية، محلة 431، زقاق 14، دار 9',
    housing: 'rent',
    rentAmount: 275_000,
    priority: 'urgent',
    category: 'chronic_patient',
    monthlySalary: 250_000,
    delegateId: 101,
    delegateName: 'كرار حيدر',
    delegatePhone: '0770 412 8891',
    registeredAt: '2024-03-14',
    lastVisit: '2026-10-21',
    verifiedBy: 'لجنة الكشف الميداني — الكاظمية',
    caseSummary: 'رب الأسرة كبير سن ومصاب بالضغط والسكري المزمن (مسجل في سجل المرضى)، لا يملك راتب تقاعدي، يسكن في دار إيجار متواضعة مع زوجته وابنه الطالب الجامعي وابنته.',
    needs: ['راتب شهري', 'سلة غذائية', 'دعم إيجار سكن', 'متابعة علاج الضغط والسكري'],
    tone: 0,
    patientIds: [1],
    members: [
      { id: 'm-1-1', name: 'حسين علي الكاظمي', relation: 'رب الأسرة', age: 64, gender: 'male', roleNote: 'عاجز عن العمل', healthNote: 'ضغط وسكري مزمن', patientId: 1 },
      { id: 'm-1-2', name: 'سهام عبد الله', relation: 'الزوجة', age: 56, gender: 'female', roleNote: 'ربة بيت', healthNote: 'خشونة مفاصل' },
      { id: 'm-1-3', name: 'مرتضى حسين علي', relation: 'ابن', age: 20, gender: 'male', roleNote: 'طالب معهد تقني', healthNote: 'سليم' },
      { id: 'm-1-4', name: 'زهراء حسين علي', relation: 'ابنة', age: 16, gender: 'female', roleNote: 'طالبة إعدادية', healthNote: 'سليمة' },
    ],
    aids: [
      { id: 'fa-1-1', date: '2026-10-05', kind: 'salary', title: 'الراتب الشهري — تشرين الأول', amount: 250_000, delegateName: 'كرار حيدر', foundation: 'مؤسسة سجلات الخير', receiptNo: 'SL-9081', monthLabel: 'تشرين الأول 2026', note: 'استلام يدوي عبر المندوب مع التوقيع' },
      { id: 'fa-1-2', date: '2026-10-12', kind: 'food', title: 'سلة غذائية متكاملة + حصة زيت وسكر', amount: 85_000, delegateName: 'كرار حيدر', foundation: 'مؤسسة سجلات الخير', receiptNo: 'FD-3310', note: 'حصة شهرية معتمدة' },
      { id: 'fa-1-3', date: '2026-09-05', kind: 'salary', title: 'الراتب الشهري — أيلول', amount: 250_000, delegateName: 'كرار حيدر', foundation: 'مؤسسة سجلات الخير', receiptNo: 'SL-8842', monthLabel: 'أيلول 2026', note: 'منتظم' },
      { id: 'fa-1-4', date: '2026-09-18', kind: 'rent', title: 'مساهمة إيجار السكن', amount: 150_000, delegateName: 'كرار حيدر', foundation: 'مؤسسة سجلات الخير', receiptNo: 'RN-2209', note: 'دعم نصف الإيجار الشهري' },
    ],
  },
  {
    id: 2,
    fileNo: 'FM-4029',
    headName: 'عائلة الأرملة زينب كاظم الربيعي',
    guardianName: 'زينب كاظم الربيعي (أرملة)',
    nationalId: '1988-1129-3304',
    phone: '07802 556 120',
    district: 'الشعلة',
    address: 'بغداد – الشعلة، قطاع 12، دار 28',
    housing: 'rent',
    rentAmount: 300_000,
    priority: 'urgent',
    category: 'widow_orphans',
    monthlySalary: 325_000,
    delegateId: 102,
    delegateName: 'مصطفى جاسم العبيدي',
    delegatePhone: '0780 934 1120',
    registeredAt: '2023-11-02',
    lastVisit: '2026-10-23',
    verifiedBy: 'الباحث الاجتماعي — قطاع الشعلة',
    caseSummary: 'أرملة تعيل ثلاثة أيتام صغار، وتخضع حالياً لجرعات علاج سرطان الثدي (سجل المرضى #2). تم اعتماد راتب كفالة أيتام شهري إضافة لتغطية الإيجار والعلاج.',
    needs: ['راتب كفالة أيتام', 'دعم إيجار كامل', 'سلة غذائية شهرية', 'مواصلات وعلاج الأورام'],
    tone: 1,
    patientIds: [2, 10],
    members: [
      { id: 'm-2-1', name: 'زينب كاظم الربيعي', relation: 'الأم (أرملة)', age: 38, gender: 'female', roleNote: 'معيلة أيتام', healthNote: 'علاج سرطان الثدي', patientId: 2 },
      { id: 'm-2-2', name: 'سارة مجيد الساعدي', relation: 'ابنة الأخت المكفولة', age: 16, gender: 'female', roleNote: 'طالبة إعدادية', healthNote: 'سكري الأطفال', isOrphan: true, patientId: 10 },
      { id: 'm-2-3', name: 'عبد الله قاسم', relation: 'ابن يتيم', age: 11, gender: 'male', roleNote: 'طالب ابتدائي', healthNote: 'سليم', isOrphan: true },
      { id: 'm-2-4', name: 'رقية قاسم', relation: 'ابنة يتيمة', age: 8, gender: 'female', roleNote: 'طالبة ابتدائي', healthNote: 'سليمة', isOrphan: true },
    ],
    aids: [
      { id: 'fa-2-1', date: '2026-10-03', kind: 'salary', title: 'راتب كفالة أيتام — تشرين الأول', amount: 325_000, delegateName: 'مصطفى جاسم العبيدي', foundation: 'مؤسسة سجلات الخير', receiptNo: 'SL-9074', monthLabel: 'تشرين الأول 2026', note: 'شامل كفالة 3 أيتام' },
      { id: 'fa-2-2', date: '2026-10-08', kind: 'rent', title: 'تغطية إيجار الدار — تشرين الأول', amount: 250_000, delegateName: 'مصطفى جاسم العبيدي', foundation: 'مؤسسة سجلات الخير', receiptNo: 'RN-2411', note: 'تحويل مباشر لصاحب العقار' },
      { id: 'fa-2-3', date: '2026-09-25', kind: 'school', title: 'حقيبة وقرطاسية وزي مدرسي', amount: 140_000, delegateName: 'مصطفى جاسم العبيدي', foundation: 'مؤسسة سجلات الخير', receiptNo: 'SC-1084', note: 'بداية العام الدراسي' },
      { id: 'fa-2-4', date: '2026-09-03', kind: 'salary', title: 'راتب كفالة أيتام — أيلول', amount: 325_000, delegateName: 'مصطفى جاسم العبيدي', foundation: 'مؤسسة سجلات الخير', receiptNo: 'SL-8830', monthLabel: 'أيلول 2026', note: 'مستلم' },
    ],
  },
  {
    id: 3,
    fileNo: 'FM-4041',
    headName: 'عائلة جاسم التميمي',
    guardianName: 'أبو محمد التميمي',
    nationalId: '1979-8820-1145',
    phone: '07711 908 334',
    district: 'مدينة الصدر',
    address: 'بغداد – مدينة الصدر، قطاع 44، زقاق 6',
    housing: 'shared',
    rentAmount: 150_000,
    priority: 'high',
    category: 'chronic_patient',
    monthlySalary: 200_000,
    delegateId: 104,
    delegateName: 'حسين صادق التميمي',
    delegatePhone: '0790 218 7745',
    registeredAt: '2024-06-18',
    lastVisit: '2026-10-19',
    verifiedBy: 'لجنة مدينة الصدر الخيرية',
    caseSummary: 'أسرة من 5 أفراد، الابن الأصغر محمد (9 سنوات) مصاب بالثلاسيميا ويحتاج نقل دم وأدوية شهرية منتظمة من خلال وحدة المرضى، والأب عامل مياومة متقطع.',
    needs: ['راتب شهري داعم', 'أدوية الثلاسيميا', 'سلة غذائية غنية بالبروتين'],
    tone: 2,
    patientIds: [3],
    members: [
      { id: 'm-3-1', name: 'جاسم كريم التميمي', relation: 'رب الأسرة', age: 47, gender: 'male', roleNote: 'عامل أجر يومي', healthNote: 'سليم' },
      { id: 'm-3-2', name: 'هدى سلمان التميمي', relation: 'الأم', age: 41, gender: 'female', roleNote: 'ربة بيت', healthNote: 'فقر دم' },
      { id: 'm-3-3', name: 'محمد جاسم التميمي', relation: 'ابن مريض', age: 9, gender: 'male', roleNote: 'طالب ابتدائي', healthNote: 'ثلاسيميا كبرى', patientId: 3 },
      { id: 'm-3-4', name: 'آمنة جاسم التميمي', relation: 'ابنة', age: 14, gender: 'female', roleNote: 'طالبة متوسطة', healthNote: 'سليمة' },
      { id: 'm-3-5', name: 'علي جاسم التميمي', relation: 'ابن', age: 6, gender: 'male', roleNote: 'طفل', healthNote: 'سليم' },
    ],
    aids: [
      { id: 'fa-3-1', date: '2026-10-06', kind: 'salary', title: 'مخصص شهري ثابت — تشرين الأول', amount: 200_000, delegateName: 'حسين صادق التميمي', foundation: 'مؤسسة سجلات الخير', receiptNo: 'SL-9090', monthLabel: 'تشرين الأول 2026', note: 'صرف شهري' },
      { id: 'fa-3-2', date: '2026-10-14', kind: 'food', title: 'سلة غذائية + حليب ومكملات للطفل', amount: 95_000, delegateName: 'حسين صادق التميمي', foundation: 'مؤسسة سجلات الخير', receiptNo: 'FD-3345', note: 'توصيل عبر المندوب' },
      { id: 'fa-3-3', date: '2026-08-29', kind: 'cash_aid', title: 'مساعدة طارئة لأجور المستشفى', amount: 175_000, delegateName: 'حسين صادق التميمي', foundation: 'مؤسسة سجلات الخير', receiptNo: 'CA-5501', note: 'رقود 4 أيام' },
    ],
  },
  {
    id: 4,
    fileNo: 'FM-4058',
    headName: 'عائلة الحاجة فاطمة حسن العبيدي',
    guardianName: 'فاطمة حسن العبيدي (أرملة مسنة)',
    nationalId: '1955-0021-7718',
    phone: '07903 441 872',
    district: 'الحرية',
    address: 'بغداد – الحرية، محلة 410، دار 17',
    housing: 'owned',
    rentAmount: 0,
    priority: 'urgent',
    category: 'elderly',
    monthlySalary: 225_000,
    delegateId: 101,
    delegateName: 'كرار حيدر',
    delegatePhone: '0770 412 8891',
    registeredAt: '2022-09-10',
    lastVisit: '2026-10-20',
    verifiedBy: 'كرار حيدر + الباحث الطبي',
    caseSummary: 'سيدة مسنة (71 عاماً) تعاني من قصور كلوي مزمن وتغسل الكلى أسبوعياً، تسكن مع ابنتها المطلقة في دار متهالكة وتحتاج رعاية صحية ومعيشية مستمرة.',
    needs: ['راتب رعاية مسنين', 'كشفيات ومستلزمات غسيل كلى', 'سلة غذائية قليلة الصوديوم'],
    tone: 3,
    patientIds: [4],
    members: [
      { id: 'm-4-1', name: 'فاطمة حسن العبيدي', relation: 'رب الأسرة', age: 71, gender: 'female', roleNote: 'مسنة ومقعدة', healthNote: 'قصور كلوي', patientId: 4 },
      { id: 'm-4-2', name: 'إيناس شاكر العبيدي', relation: 'الابنة المرافقة', age: 39, gender: 'female', roleNote: 'متفرغة للتمريض المنزلي', healthNote: 'سليمة' },
    ],
    aids: [
      { id: 'fa-4-1', date: '2026-10-04', kind: 'salary', title: 'راتب رعاية المسنين — تشرين الأول', amount: 225_000, delegateName: 'كرار حيدر', foundation: 'مؤسسة سجلات الخير', receiptNo: 'SL-9078', monthLabel: 'تشرين الأول 2026', note: 'تسليم منزلي لحالة صحية' },
      { id: 'fa-4-2', date: '2026-10-16', kind: 'cash_aid', title: 'مساعدة مالية — مستلزمات شتوية وبطانيات', amount: 120_000, delegateName: 'كرار حيدر', foundation: 'مؤسسة سجلات الخير', receiptNo: 'CA-5612', note: 'حملة الشتاء' },
      { id: 'fa-4-3', date: '2026-09-04', kind: 'salary', title: 'راتب رعاية المسنين — أيلول', amount: 225_000, delegateName: 'كرار حيدر', foundation: 'مؤسسة سجلات الخير', receiptNo: 'SL-8835', monthLabel: 'أيلول 2026', note: 'مستلم' },
    ],
  },
  {
    id: 5,
    fileNo: 'FM-4073',
    headName: 'عائلة علي صادق الجبوري',
    guardianName: 'علي صادق الجبوري',
    nationalId: '1981-6192-4022',
    phone: '07724 118 905',
    district: 'الشعب',
    address: 'بغداد – الشعب، شارع 7، زقاق 19',
    housing: 'rent',
    rentAmount: 250_000,
    priority: 'high',
    category: 'chronic_patient',
    monthlySalary: 200_000,
    delegateId: 103,
    delegateName: 'علي إحسان الموسوي',
    delegatePhone: '0771 665 3402',
    registeredAt: '2025-01-22',
    lastVisit: '2026-10-15',
    verifiedBy: 'لجنة الشعب الميدانية',
    caseSummary: 'معيل أسرة أجرى عملية قلب مفتوح حديثاً ويخضع لفترة نقاهة تمنعه من العمل لمدة 6 أشهر، يعيل زوجة وطفلين في مدرسة ابتدائية.',
    needs: ['راتب مؤقت خلال فترة النقاهة', 'دعم إيجار', 'أدوية القلب والسيولة'],
    tone: 4,
    patientIds: [5],
    members: [
      { id: 'm-5-1', name: 'علي صادق الجبوري', relation: 'رب الأسرة', age: 45, gender: 'male', roleNote: 'في فترة نقاهة', healthNote: 'عملية قلب مفتوح', patientId: 5 },
      { id: 'm-5-2', name: 'أسماء رحيم', relation: 'الزوجة', age: 37, gender: 'female', roleNote: 'ربة بيت', healthNote: 'سليمة' },
      { id: 'm-5-3', name: 'حسن علي صادق', relation: 'ابن', age: 12, gender: 'male', roleNote: 'طالب ابتدائي', healthNote: 'سليم' },
      { id: 'm-5-4', name: 'مريم علي صادق', relation: 'ابنة', age: 8, gender: 'female', roleNote: 'طالبة ابتدائي', healthNote: 'سليمة' },
    ],
    aids: [
      { id: 'fa-5-1', date: '2026-10-07', kind: 'salary', title: 'راتب إسناد شهري — تشرين الأول', amount: 200_000, delegateName: 'علي إحسان الموسوي', foundation: 'مؤسسة سجلات الخير', receiptNo: 'SL-9096', monthLabel: 'تشرين الأول 2026', note: 'مجدول 6 أشهر' },
      { id: 'fa-5-2', date: '2026-10-11', kind: 'rent', title: 'مساهمة إيجار دار', amount: 150_000, delegateName: 'علي إحسان الموسوي', foundation: 'مؤسسة سجلات الخير', receiptNo: 'RN-2419', note: 'شهري مشترك' },
      { id: 'fa-5-3', date: '2026-09-20', kind: 'food', title: 'سلة مواد تموينية', amount: 75_000, delegateName: 'علي إحسان الموسوي', foundation: 'مؤسسة سجلات الخير', receiptNo: 'FD-3298', note: 'مستلمة' },
    ],
  },
  {
    id: 6,
    fileNo: 'FM-4089',
    headName: 'عائلة حيدر كريم الشمري',
    guardianName: 'أم مصطفى الشمري (عن زوجها المصاب)',
    nationalId: '1974-3305-9180',
    phone: '07707 390 218',
    district: 'الأعظمية',
    address: 'بغداد – الأعظمية، محلة 314، زقاق 11',
    housing: 'owned',
    rentAmount: 0,
    priority: 'high',
    category: 'chronic_patient',
    monthlySalary: 250_000,
    delegateId: 103,
    delegateName: 'علي إحسان الموسوي',
    delegatePhone: '0771 665 3402',
    registeredAt: '2024-08-05',
    lastVisit: '2026-10-18',
    verifiedBy: 'مندوب الأعظمية',
    caseSummary: 'رب الأسرة أصيب بجلطة دماغية أفقدته القدرة على العمل الحر، كما تعاني إحدى بناته من تصلب متعدد (حالة مريم #6 مسجلة بالمتابعة). الأسرة تعتمد بالكامل على دعم المؤسسة.',
    needs: ['راتب شهري ثابت', 'جلسات علاج طبيعي', 'دعم أدوية الأعصاب', 'سلة غذائية'],
    tone: 5,
    patientIds: [7, 6],
    members: [
      { id: 'm-6-1', name: 'حيدر كريم الشمري', relation: 'رب الأسرة', age: 52, gender: 'male', roleNote: 'عاجز جزئياً', healthNote: 'جلطة دماغية', patientId: 7 },
      { id: 'm-6-2', name: 'مريم عباس الحسيني', relation: 'قريبة مكفولة بالدار', age: 27, gender: 'female', roleNote: 'غير قادرة على العمل', healthNote: 'تصلب متعدد', patientId: 6 },
      { id: 'm-6-3', name: 'مصطفى حيدر كريم', relation: 'ابن', age: 17, gender: 'male', roleNote: 'طالب ثانوي', healthNote: 'سليم' },
    ],
    aids: [
      { id: 'fa-6-1', date: '2026-10-05', kind: 'salary', title: 'راتب الإعالة الشهرية — تشرين الأول', amount: 250_000, delegateName: 'علي إحسان الموسوي', foundation: 'مؤسسة سجلات الخير', receiptNo: 'SL-9085', monthLabel: 'تشرين الأول 2026', note: 'استلام الأم بالوكالة' },
      { id: 'fa-6-2', date: '2026-10-17', kind: 'seasonal', title: 'ملابس ومستلزمات الخريف', amount: 110_000, delegateName: 'علي إحسان الموسوي', foundation: 'مؤسسة سجلات الخير', receiptNo: 'SE-702', note: 'حملة الكسوة' },
      { id: 'fa-6-3', date: '2026-09-05', kind: 'salary', title: 'راتب الإعالة الشهرية — أيلول', amount: 250_000, delegateName: 'علي إحسان الموسوي', foundation: 'مؤسسة سجلات الخير', receiptNo: 'SL-8851', monthLabel: 'أيلول 2026', note: 'مستلم' },
    ],
  },
  {
    id: 7,
    fileNo: 'FM-4104',
    headName: 'عائلة عباس رشيد المالكي',
    guardianName: 'عباس رشيد المالكي',
    nationalId: '1968-5401-6620',
    phone: '07719 205 336',
    district: 'الدورة والبياع',
    address: 'بغداد – الدورة، حي الميكانيك، محلة 834',
    housing: 'informal',
    rentAmount: 100_000,
    priority: 'stable',
    category: 'low_income',
    monthlySalary: 175_000,
    delegateId: 105,
    delegateName: 'زهراء كاظم الربيعي',
    delegatePhone: '0781 550 9031',
    registeredAt: '2025-04-11',
    lastVisit: '2026-10-14',
    verifiedBy: 'المندوبة الميدانية — الكرخ الجنوبي',
    caseSummary: 'عائلة متعففة في حي الميكانيك؛ الأب تعرض لكسر في الحوض إثر حادث عمل وتتابع الزوجة وابنتهما حالة ربو مزمن وارتفاع مفاصل في العيادات الخيرية.',
    needs: ['راتب تكميلي', 'سلة غذائية شهرية', 'كشفيات وأجهزة بخار'],
    tone: 0,
    patientIds: [9, 8, 12],
    members: [
      { id: 'm-7-1', name: 'عباس رشيد المالكي', relation: 'رب الأسرة', age: 58, gender: 'male', roleNote: 'بائع بسيط حالياً', healthNote: 'كسر في الحوض', patientId: 9 },
      { id: 'm-7-2', name: 'هدى سلمان البياتي', relation: 'الزوجة', age: 49, gender: 'female', roleNote: 'ربة بيت', healthNote: 'التهاب مفاصل', patientId: 12 },
      { id: 'm-7-3', name: 'نور محمود الزبيدي', relation: 'كنّة العائلة', age: 33, gender: 'female', roleNote: 'ربة بيت', healthNote: 'ربو مزمن', patientId: 8 },
      { id: 'm-7-4', name: 'حمزة عباس رشيد', relation: 'حفيد', age: 5, gender: 'male', roleNote: 'طفل', healthNote: 'سليم' },
    ],
    aids: [
      { id: 'fa-7-1', date: '2026-10-08', kind: 'salary', title: 'راتب شهري داعم — تشرين الأول', amount: 175_000, delegateName: 'زهراء كاظم الربيعي', foundation: 'مؤسسة سجلات الخير', receiptNo: 'SL-9102', monthLabel: 'تشرين الأول 2026', note: 'مرتب شهري' },
      { id: 'fa-7-2', date: '2026-10-14', kind: 'food', title: 'سلة غذائية للعائلة الممتدة', amount: 90_000, delegateName: 'زهراء كاظم الربيعي', foundation: 'مؤسسة سجلات الخير', receiptNo: 'FD-3352', note: 'استلام كامل' },
    ],
  },
  {
    id: 8,
    fileNo: 'FM-4120',
    headName: 'عائلة يوسف حميد الخفاجي',
    guardianName: 'يوسف حميد الخفاجي',
    nationalId: '1959-7710-2094',
    phone: '07733 860 192',
    district: 'الزعفرانية',
    address: 'بغداد – الزعفرانية، محلة 958، دار 42',
    housing: 'owned',
    rentAmount: 0,
    priority: 'stable',
    category: 'elderly',
    monthlySalary: 150_000,
    delegateId: 104,
    delegateName: 'حسين صادق التميمي',
    delegatePhone: '0790 218 7745',
    registeredAt: '2025-07-09',
    lastVisit: '2026-10-10',
    verifiedBy: 'لجنة الزعفرانية',
    caseSummary: 'زوجان مسنان بدون معيل قريب؛ الزوج مصاب بماء أبيض في العين ويستعد لعملية بسيطة مع متابعة مستمرة عبر عيادة العيون في صفحة المرضى.',
    needs: ['راتب شهري رمزي', 'كشفيات وقطرات العين', 'سلة غذائية'],
    tone: 2,
    patientIds: [11],
    members: [
      { id: 'm-8-1', name: 'يوسف حميد الخفاجي', relation: 'رب الأسرة', age: 67, gender: 'male', roleNote: 'متقاعد بلا راتب كافٍ', healthNote: 'ماء أبيض في العين', patientId: 11 },
      { id: 'm-8-2', name: 'خديجة جبار', relation: 'الزوجة', age: 62, gender: 'female', roleNote: 'ربة بيت', healthNote: 'ضغط دم خفيف' },
    ],
    aids: [
      { id: 'fa-8-1', date: '2026-10-06', kind: 'salary', title: 'الراتب الشهري — تشرين الأول', amount: 150_000, delegateName: 'حسين صادق التميمي', foundation: 'مؤسسة سجلات الخير', receiptNo: 'SL-9091', monthLabel: 'تشرين الأول 2026', note: 'منتظم' },
      { id: 'fa-8-2', date: '2026-09-12', kind: 'cash_aid', title: 'مساعدة مالية — فحوصات قبل العملية', amount: 100_000, delegateName: 'حسين صادق التميمي', foundation: 'مؤسسة سجلات الخير', receiptNo: 'CA-5534', note: 'صرف فوري' },
    ],
  },
];

const FAMILIES_KEY = 'ahbab:families-store-v1';
const PHOTOS_KEY = 'ahbab:family-photos-v1';

export function loadFamilies(): Family[] {
  try {
    const raw = localStorage.getItem(FAMILIES_KEY);
    if (!raw) return INITIAL_FAMILIES;
    const parsed = JSON.parse(raw) as Family[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : INITIAL_FAMILIES;
  } catch {
    return INITIAL_FAMILIES;
  }
}

export function saveFamilies(families: Family[]): void {
  try {
    localStorage.setItem(FAMILIES_KEY, JSON.stringify(families));
  } catch {
    // Ignore quota errors in private browsing.
  }
}

export function loadFamilyPhotos(): Record<number, string> {
  try {
    const raw = localStorage.getItem(PHOTOS_KEY);
    return raw ? (JSON.parse(raw) as Record<number, string>) : {};
  } catch {
    return {};
  }
}

export function saveFamilyPhotos(photos: Record<number, string>): void {
  try {
    localStorage.setItem(PHOTOS_KEY, JSON.stringify(photos));
  } catch {
    // Ignore storage quota issues.
  }
}

export function mergeDelegates(liveDelegates: DelegateSummary[] = []): FamilyDelegate[] {
  const byName = new Map<string, FamilyDelegate>();
  for (const live of liveDelegates) {
    byName.set(live.full_name, {
      id: live.id,
      name: live.full_name,
      phone: 'مسجل بالنظام',
      zone: `${live.alive} مشترك`,
      avatarUrl: live.avatar_url,
      isLive: true,
    });
  }
  for (const sample of SAMPLE_DELEGATES) {
    if (!byName.has(sample.name)) {
      byName.set(sample.name, sample);
    }
  }
  return [...byName.values()];
}

export function getLinkedPatients(family: Family): Patient[] {
  const idSet = new Set<number>(family.patientIds);
  for (const member of family.members) {
    if (member.patientId) idSet.add(member.patientId);
  }
  return PATIENTS.filter((patient) => idSet.has(patient.id));
}

export function getUnifiedDisbursements(family: Family): {
  items: UnifiedDisbursement[];
  salariesTotal: number;
  assistanceTotal: number;
  patientCashTotal: number;
  patientMedicineTotal: number;
  patientExamsTotal: number;
  patientExamsCount: number;
  patientAidTotal: number;
  grandTotal: number;
  linkedPatients: Patient[];
} {
  const linkedPatients = getLinkedPatients(family);
  const items: UnifiedDisbursement[] = [];

  let salariesTotal = 0;
  let assistanceTotal = 0;
  let patientCashTotal = 0;
  let patientMedicineTotal = 0;
  let patientExamsTotal = 0;
  let patientExamsCount = 0;

  for (const aid of family.aids) {
    const isSalary = aid.kind === 'salary';
    if (isSalary) salariesTotal += aid.amount;
    else assistanceTotal += aid.amount;

    items.push({
      id: aid.id,
      date: aid.date,
      category: aid.kind,
      group: isSalary ? 'salary' : 'assistance',
      label: FAMILY_AID_LABELS[aid.kind],
      title: aid.title,
      amount: aid.amount,
      delegateName: aid.delegateName,
      foundation: aid.foundation,
      receiptNo: aid.receiptNo,
      note: aid.note,
      source: 'family',
    });
  }

  for (const patient of linkedPatients) {
    patient.records.forEach((record, index) => {
      if (record.cash > 0) {
        patientCashTotal += record.cash;
        items.push({
          id: `pt-${patient.id}-${index}-cash`,
          date: record.date,
          category: 'patient_cash',
          group: 'patient_aid',
          label: 'مساعدة مريض (مالي)',
          title: `مساعدة مالية للمريض ${patient.name}`,
          amount: record.cash,
          delegateName: record.delegate,
          foundation: record.foundation,
          doctor: record.doctor,
          patientId: patient.id,
          patientName: patient.name,
          receiptNo: `${patient.file}-C${index + 1}`,
          note: `${patient.condition} — ${record.note}`,
          source: 'patient',
        });
      }
      if (record.medicine > 0) {
        patientMedicineTotal += record.medicine;
        items.push({
          id: `pt-${patient.id}-${index}-med`,
          date: record.date,
          category: 'patient_medicine',
          group: 'patient_aid',
          label: 'شراء دواء',
          title: `صرف علاج — ${patient.name}`,
          amount: record.medicine,
          delegateName: record.delegate,
          foundation: record.foundation,
          doctor: record.doctor,
          patientId: patient.id,
          patientName: patient.name,
          receiptNo: `${patient.file}-M${index + 1}`,
          note: `${patient.condition} — ${record.note}`,
          source: 'patient',
        });
      }
      if (record.exams > 0) {
        patientExamsTotal += record.exams;
        patientExamsCount += 1;
        items.push({
          id: `pt-${patient.id}-${index}-exam`,
          date: record.date,
          category: 'patient_exam',
          group: 'medical_exam',
          label: 'كشفية طبية',
          title: `كشفية طبية — ${patient.name} (${record.doctor})`,
          amount: record.exams,
          delegateName: record.delegate,
          foundation: record.foundation,
          doctor: record.doctor,
          patientId: patient.id,
          patientName: patient.name,
          receiptNo: `${patient.file}-E${index + 1}`,
          note: `${patient.condition} — ${record.note}`,
          source: 'patient',
        });
      }
    });
  }

  items.sort((a, b) => b.date.localeCompare(a.date));
  const patientAidTotal = patientCashTotal + patientMedicineTotal + patientExamsTotal;

  return {
    items,
    salariesTotal,
    assistanceTotal,
    patientCashTotal,
    patientMedicineTotal,
    patientExamsTotal,
    patientExamsCount,
    patientAidTotal,
    grandTotal: salariesTotal + assistanceTotal + patientAidTotal,
    linkedPatients,
  };
}

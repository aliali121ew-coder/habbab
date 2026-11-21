import { DELEGATES, loadFamiliesStore } from '../data/families';
import type {
  AidCategory,
  AidSource,
  CaseOfficer,
  FamilyDetail,
  FamilyMember,
  FamilyPatientRecord,
  FamilyPaymentRecord,
} from '../types/family';

const enFormatter = new Intl.NumberFormat('en-US');

export function formatIQDParts(amount: number): { value: string; currency: string } {
  return {
    value: enFormatter.format(Math.round(Number(amount) || 0)),
    currency: 'د.ع',
  };
}

export function formatIQDText(amount: number): string {
  const { value, currency } = formatIQDParts(amount);
  return `${value} ${currency}`;
}

export function toInitials(name: string): string {
  const cleaned = name
    .replace(/^(عائلة|الأرملة|الحاجة|أسرة|د\.)\s+/g, '')
    .trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'ع';
  if (words.length === 1) return words[0].slice(0, 2);
  return `${words[0].charAt(0)} ${words[1].charAt(0)}`;
}

export const CASE_OFFICERS: CaseOfficer[] = DELEGATES.map((d) => ({
  id: d.id,
  name: d.name,
  zone: `مندوب ${d.region}`,
  phone: d.phone,
  initials: toInitials(d.name),
}));

const TYPE_MAP: Record<string, { type: AidCategory; label: string }> = {
  'راتب شهري': { type: 'salary', label: 'راتب شهري' },
  'مساعدات': { type: 'aid', label: 'مساعدات مالية' },
  'أدوية': { type: 'medicine', label: 'شراء دواء' },
  'كشفية': { type: 'checkup', label: 'كشفية طبية' },
};

const INTERNAL_PROGRAMS = [
  { key: 'salary', paymentType: 'راتب شهري', name: 'الراتب الشهري', aidType: 'راتب نقدي', frequency: 'شهري' },
  { key: 'aid', paymentType: 'مساعدات', name: 'المساعدات المالية', aidType: 'مساعدة نقدية', frequency: 'شهري' },
  { key: 'medicine', paymentType: 'أدوية', name: 'برنامج الأدوية', aidType: 'دواء عبر الوحدة الصحية', frequency: 'شهري' },
  { key: 'checkups', paymentType: 'كشفية', name: 'الكشفيات الطبية', aidType: 'كشفيات وفحوصات', frequency: 'حسب المراجعة' },
] as const;

// Sample organizations: other charities and programs that also support some families.
const EXTERNAL_ORGS = [
  { name: 'مؤسسة الرحمة الخيرية', aidType: 'سلة غذائية', amount: 85_000, frequency: 'شهري', months: 1, person: 'أبو حسن الحسيني', phone: '0770 318 2290' },
  { name: 'شبكة الرعاية الاجتماعية', aidType: 'راتب إعانة', amount: 175_000, frequency: 'كل شهرين', months: 2, person: 'قسم الحالات — الرصافة', phone: '0780 441 7716' },
  { name: 'جمعية الأيادي البيضاء', aidType: 'كسوة ولوازم مدرسية', amount: 120_000, frequency: 'فصلي', months: 3, person: 'أم زينب العامري', phone: '0771 902 5583' },
  { name: 'مستوصف النور الخيري', aidType: 'خصم علاج 50%', amount: 60_000, frequency: 'شهري', months: 1, person: 'د. سلام الخزرجي', phone: '0790 227 6401' },
] as const;

const monthsBack = (iso: string, n: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1 - n, d));
  return date.toISOString().slice(0, 10);
};

function buildInternalAid(
  raw: { entitlements?: Record<string, number>; payments?: { date: string; amount: number; type: string; receivedBy: string; by: string }[] },
  registeredAt: string,
): AidSource[] {
  const payments = raw.payments ?? [];
  return INTERNAL_PROGRAMS.flatMap((program) => {
    const due = raw.entitlements?.[program.key] ?? 0;
    if (due <= 0) return [];
    const own = payments.filter((p) => p.type === program.paymentType);
    const paid = own.filter((p) => p.date.startsWith('2026-11')).reduce((sum, p) => sum + p.amount, 0);
    return [{
      id: `int-${program.key}`,
      kind: 'internal' as const,
      name: program.name,
      aidType: program.aidType,
      monthlyAmount: due,
      paidThisMonth: paid,
      frequency: program.frequency,
      since: registeredAt,
      lastReceived: own[0]?.date ?? null,
      status: paid >= due ? 'active' as const : 'late' as const,
      note: paid >= due ? 'صُرف مستحق هذا الشهر كاملاً.' : `متبقٍ ${formatIQDText(due - paid)} من مستحق هذا الشهر.`,
      beneficiaryIds: [],
      history: own.map((p, idx) => ({
        id: `int-${program.key}-${idx}`,
        date: p.date,
        title: program.name,
        amount: p.amount,
        note: `المستلم: ${p.receivedBy} — بيد ${p.by}`,
      })),
    }];
  });
}

function buildExternalAid(familyId: number): AidSource[] {
  const count = familyId % 4 === 0 ? 0 : 1 + (familyId % 3);
  return Array.from({ length: count }, (_, i) => {
    const org = EXTERNAL_ORGS[(familyId + i) % EXTERNAL_ORGS.length];
    const paused = (familyId + i) % 5 === 0;
    const last = paused ? '2026-06-15' : monthsBack('2026-11-03', i);
    return {
      id: `ext-${familyId}-${i}`,
      kind: 'external' as const,
      name: org.name,
      aidType: org.aidType,
      monthlyAmount: org.amount,
      frequency: org.frequency,
      since: monthsBack('2026-11-01', 14 + i * 5),
      lastReceived: last,
      status: paused ? 'paused' as const : 'active' as const,
      contact: { person: org.person, phone: org.phone },
      beneficiaryIds: [],
      note: paused
        ? 'الدعم متوقف منذ منتصف السنة بانتظار تحديث بيانات العائلة لدى الجهة.'
        : 'يُستلم مباشرة من الجهة، وتتحقق المؤسسة منه في الزيارة الميدانية.',
      history: Array.from({ length: 4 }, (_, h) => ({
        id: `ext-${familyId}-${i}-${h}`,
        date: monthsBack(last, h * org.months),
        title: org.aidType,
        amount: org.amount,
        note: 'تأكيد الاستلام من العائلة',
      })),
    };
  });
}

// Who each provider actually helps: cash goes to the head of the family, medical programs
// to the members on the patient registry, school aid to the students.
function assignBeneficiaries(sources: AidSource[], members: FamilyMember[]): AidSource[] {
  const head = members.slice(0, 1);
  const patients = members.filter((m) => m.patientId || m.chronic);
  const students = members.filter((m) => m.age <= 18 && m.status.includes('طالب'));
  return sources.map((source) => {
    const medical = /دواء|كشف|علاج/.test(source.aidType);
    const school = /مدرس/.test(source.aidType);
    const picked = medical ? patients : school ? students : head;
    return { ...source, beneficiaryIds: (picked.length ? picked : head).map((m) => m.id) };
  });
}

export function getFamilyDetailById(id: number): FamilyDetail | null {
  const store = loadFamiliesStore();
  const raw = store.find((f) => f.id === id);
  if (!raw) return null;

  const { salary = 0, aid = 0, medicine = 0, checkups = 0 } = raw.entitlements ?? {};
  const totalDue = salary + aid + medicine + checkups;

  const members: FamilyMember[] = (raw.members ?? []).map((m: { name: string; relation: string; age: number; status: string; chronic?: string; gender?: 'ذكر' | 'أنثى'; phone?: string; notes?: string }, idx: number) => ({
    id: `mem-${raw.id}-${idx}`,
    name: m.name,
    initials: toInitials(m.name),
    relation: m.relation,
    age: m.age,
    status: m.status,
    chronic: m.chronic,
    gender: m.gender,
    phone: m.phone,
    notes: m.notes,
    orphanLabel: m.relation.includes('يتيمة') ? 'يتيمة' : m.relation.includes('يتيم') ? 'يتيم' : undefined,
    patientId: raw.patients?.find((p: { id?: number; name: string }) => p.name === m.name)?.id,
  }));

  // Rich patient defaults matching the exact patients registry figures
  const patients: FamilyPatientRecord[] = (raw.patients ?? []).map((p: { id?: number; name: string; diagnosis: string; lastVisit: string; medicineCost: number; examsCost?: number }, idx: number) => {
    const isZainab = p.id === 2;
    const isSara = p.id === 10;
    return {
      id: p.id ?? idx + 1,
      name: p.name,
      initials: toInitials(p.name),
      lastVisit: isZainab ? '2026-10-14' : isSara ? '2026-10-24' : p.lastVisit,
      deliveredCash: isZainab ? 1_235_000 : isSara ? 970_000 : (p.medicineCost + (p.examsCost ?? 0)),
      medicineCost: isZainab ? 930_000 : isSara ? 1_095_000 : p.medicineCost,
      examsCost: isZainab ? 140_000 : isSara ? 215_000 : (p.examsCost ?? 65_000),
      doctor: isZainab ? 'د. مريم التميمي' : isSara ? 'د. علي الموسوي' : 'د. حسن الجبوري',
      diagnosis: p.diagnosis,
    };
  });

  const payments: FamilyPaymentRecord[] = (raw.payments ?? []).map((p: { date: string; amount: number; type: string; receivedBy: string; by: string }, idx: number) => {
    const mapped = TYPE_MAP[p.type] ?? { type: 'aid', label: p.type };
    return {
      id: `pay-${raw.id}-${idx}`,
      type: mapped.type,
      typeLabel: mapped.label,
      amount: p.amount,
      date: p.date,
      officer: p.by,
      title: `صرف ${mapped.label}`,
      note: `المستلم: ${p.receivedBy}`,
      status: 'paid',
    };
  });

  if (raw.arrears > 0) {
    payments.push({
      id: `pay-${raw.id}-overdue`,
      type: 'aid',
      typeLabel: 'دعم الإيجار المتبقي',
      amount: raw.arrears,
      date: '2026-11-01',
      officer: raw.delegate?.name ?? 'المندوب',
      title: 'مستحق متأخر للشهر الحالي',
      note: raw.rent > 0 ? 'تغطية إيجار السكن ومستلزمات أساسية' : 'رصيد دعم متبقٍ',
      status: 'overdue',
    });
  }

  const visits = (raw.visits ?? []).map((v: { date: string; delegateName: string; note: string }, idx: number) => ({
    id: `vis-${raw.id}-${idx}`,
    date: v.date,
    officerName: v.delegateName,
    summary: v.note,
    rating: (raw.category === 'critical' ? 'تحتاج متابعة' : 'مستقرة') as 'مستقرة' | 'تحتاج متابعة' | 'حرجة',
    photosCount: idx === 0 ? 2 : 0,
  }));

  const monthlyHistory = [
    { month: 'حزيران', due: Math.round(totalDue * 0.88), paid: Math.round(totalDue * 0.88) },
    { month: 'تموز', due: Math.round(totalDue * 0.9), paid: Math.round(totalDue * 0.85) },
    { month: 'آب', due: Math.round(totalDue * 0.94), paid: Math.round(totalDue * 0.94) },
    { month: 'أيلول', due: Math.round(totalDue * 0.96), paid: Math.round(totalDue * 0.82) },
    { month: 'ت1', due: totalDue, paid: Math.round(totalDue * 0.91) },
    { month: 'ت2', due: totalDue, paid: raw.paidThisMonth },
  ];

  const alerts: FamilyDetail['alerts'] = [
    ...(raw.arrears > 0
      ? [{
        id: 'al-arrears',
        severity: 'rose' as const,
        title: 'متأخرات صرف الشهر الحالي',
        detail: `متبقٍ ${formatIQDText(raw.arrears)} من إجمالي الاستحقاق`,
        badge: raw.arrearsMonths > 1 ? `متأخر ${raw.arrearsMonths} أشهر` : 'متأخر شهر واحد',
      }]
      : []),
    ...(patients.length > 0
      ? [{
        id: 'al-med',
        severity: 'amber' as const,
        title: 'موعد متابعة دواء وكشفية قادم',
        detail: `${patients[0].name} — ${patients[0].diagnosis}`,
        badge: 'خلال 5 أيام',
      }]
      : []),
    ...(raw.rent > 0
      ? [{
        id: 'al-rent',
        severity: 'blue' as const,
        title: 'استحقاق إيجار السكن الشهري',
        detail: `${formatIQDText(raw.rent)} — يُستحق في 1 من كل شهر`,
        badge: 'دوري',
      }]
      : []),
  ];

  const activities: FamilyDetail['activities'] = [
    ...(payments[0]
      ? [{
        id: 'act-pay',
        kind: 'payment' as const,
        title: `${payments[0].typeLabel} — ${formatIQDText(payments[0].amount)}`,
        subtitle: `بيد ${payments[0].officer}`,
        date: payments[0].date,
      }]
      : []),
    ...(visits[0]
      ? [{
        id: 'act-vis',
        kind: 'visit' as const,
        title: 'زيارة ميدانية للمندوب',
        subtitle: visits[0].officerName,
        date: visits[0].date,
      }]
      : []),
    ...(patients[0]
      ? [{
        id: 'act-pt',
        kind: 'checkup' as const,
        title: `مراجعة طبية (${patients[0].doctor})`,
        subtitle: patients[0].name,
        date: patients[0].lastVisit,
      }]
      : []),
  ];

  const officer = CASE_OFFICERS.find((o) => o.id === raw.delegate?.id) ?? {
    id: raw.delegate?.id ?? 1,
    name: raw.delegate?.name ?? 'كرار حيدر',
    zone: `مندوب ${raw.region}`,
    phone: raw.delegate?.phone ?? '0770 000 0000',
    initials: toInitials(raw.delegate?.name ?? 'ك ح'),
  };

  return {
    id: raw.id,
    fileNo: raw.fileNo,
    name: raw.name,
    initials: toInitials(raw.headName || raw.name),
    priority: raw.category,
    socialStatus: raw.socialStatus,
    address: raw.address,
    phone: raw.phone ?? '',
    region: raw.region,
    housing: raw.housing,
    rentAmount: raw.rent,
    registeredAt: '2023-11-02',
    incomeNote: raw.income,
    caseSummary: raw.notes,
    officer,
    entitlements: { salary, aid, medicine, checkups },
    paidThisMonth: raw.paidThisMonth,
    arrears: raw.arrears,
    arrearsMonths: raw.arrearsMonths,
    trendPercent: raw.arrears > 0 ? -0.9 : 12,
    monthLabel: 'تشرين الثاني 2026',
    members,
    patients,
    payments,
    visits,
    monthlyHistory,
    internalAid: assignBeneficiaries(buildInternalAid(raw, '2023-11-02'), members),
    externalAid: assignBeneficiaries(buildExternalAid(raw.id), members),
    alerts,
    activities,
  };
}

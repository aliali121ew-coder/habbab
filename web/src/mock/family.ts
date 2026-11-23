import type {
  AidCategory,
  AidSource,
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
    const paid = own.filter((p) => p.date.startsWith(new Date().toISOString().slice(0, 7))).reduce((sum, p) => sum + p.amount, 0);
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

const AR_MONTHS = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'];
const SHORT_MONTHS = ['ك2', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'ت1', 'ت2', 'ك1'];

interface SharedAid { foundation_id: number; foundation: string; paid_on: string; amount: number; type: string }

// What other foundations that confirmed the same family gave it: one card per foundation, its
// payments as the card's history. Only type, amount, date and the foundation's name are known.
function sharedAid(familyId: number, shared: SharedAid[]): AidSource[] {
  const byFoundation = new Map<number, SharedAid[]>();
  for (const row of shared) byFoundation.set(row.foundation_id, [...(byFoundation.get(row.foundation_id) ?? []), row]);
  return [...byFoundation.values()].map((rows, i) => {
    const last = rows[0];
    const recent = rows.filter((r) => r.paid_on >= monthsBack(new Date().toISOString().slice(0, 10), 3));
    return {
      id: `ext-${familyId}-${i}`,
      kind: 'external' as const,
      name: last.foundation,
      aidType: [...new Set(rows.map((r) => r.type))].slice(0, 2).join('، '),
      monthlyAmount: Math.round(recent.reduce((sum, r) => sum + r.amount, 0) / 3),
      frequency: `${rows.length} ${rows.length === 1 ? 'مساعدة' : 'مساعدات'}`,
      since: rows[rows.length - 1].paid_on,
      lastReceived: last.paid_on,
      status: recent.length ? 'active' as const : 'paused' as const,
      beneficiaryIds: [],
      note: 'مسجّلة لدى المؤسسة نفسها، وتظهر هنا لأن الملفين مرتبطان بنفس العائلة.',
      history: rows.map((r, h) => ({ id: `ext-${familyId}-${i}-${h}`, date: r.paid_on, title: r.type, amount: r.amount, note: last.foundation })),
    };
  });
}

/** A family as the server returns it (GET /api/families/:id), shaped for the family file. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toFamilyDetail(raw: any): FamilyDetail {
  const { salary = 0, aid = 0, medicine = 0, checkups = 0 } = raw.entitlements ?? {};
  const totalDue = salary + aid + medicine + checkups;
  const thisMonth = new Date().toISOString().slice(0, 7);
  const registeredAt = String(raw.createdAt ?? '').slice(0, 10) || new Date().toISOString().slice(0, 10);

  const members: FamilyMember[] = (raw.members ?? []).map((m: { id: number; name: string; relation: string; age: number; status: string; chronic?: string; gender?: 'ذكر' | 'أنثى'; phone?: string; notes?: string }) => ({
    id: `mem-${raw.id}-${m.id}`,
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

  // The patients register moves to the server in phase 4; until then a family lists none.
  const patients: FamilyPatientRecord[] = (raw.patients ?? []).map((p: { id?: number; name: string; diagnosis: string; lastVisit: string; medicineCost: number; examsCost?: number; doctor?: string }, idx: number) => ({
    id: p.id ?? idx + 1,
    name: p.name,
    initials: toInitials(p.name),
    lastVisit: p.lastVisit,
    deliveredCash: p.medicineCost + (p.examsCost ?? 0),
    medicineCost: p.medicineCost,
    examsCost: p.examsCost ?? 0,
    doctor: p.doctor ?? '',
    diagnosis: p.diagnosis,
  }));

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
      date: `${thisMonth}-01`,
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
    photosCount: 0,
  }));

  // The last six months as recorded: what was due and what the foundation actually paid.
  const monthlyHistory = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - (5 - i));
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const paid = (raw.payments ?? []).filter((p: { date: string }) => p.date.startsWith(key)).reduce((sum: number, p: { amount: number }) => sum + p.amount, 0);
    return { month: SHORT_MONTHS[d.getMonth()], due: key < registeredAt.slice(0, 7) ? 0 : totalDue, paid };
  });

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

  const officer = {
    id: raw.delegate?.id ?? 0,
    name: raw.delegate?.name ?? 'بدون مندوب',
    zone: raw.delegate?.region ? `مندوب ${raw.delegate.region}` : 'لم يُسند بعد',
    phone: raw.delegate?.phone ?? '',
    initials: toInitials(raw.delegate?.name ?? '؟'),
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
    registeredAt,
    incomeNote: raw.income,
    caseSummary: raw.notes,
    officer,
    entitlements: { salary, aid, medicine, checkups },
    paidThisMonth: raw.paidThisMonth,
    arrears: raw.arrears,
    arrearsMonths: raw.arrearsMonths,
    trendPercent: raw.arrears > 0 ? -0.9 : 12,
    monthLabel: `${AR_MONTHS[new Date().getMonth()]} ${new Date().getFullYear()}`,
    members,
    patients,
    payments,
    visits,
    monthlyHistory,
    internalAid: assignBeneficiaries(buildInternalAid(raw, registeredAt), members),
    externalAid: assignBeneficiaries(sharedAid(raw.id, raw.shared ?? []), members),
    alerts,
    activities,
  };
}

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Building2, HandCoins, HeartHandshake, Plus, UserCheck, Users, X } from 'lucide-react';
import { attachAccessibleValidation, attachDialogDismiss, closeTopLayer } from '../expenses/dialogUtils';
import { PATIENTS } from '../patients/sample';
import { today } from '../../format';
import {
  CATEGORY_LABELS,
  FAMILY_AID_LABELS,
  HOUSING_LABELS,
  PRIORITY_LABELS,
  type Family,
  type FamilyAid,
  type FamilyAidKind,
  type FamilyCategory,
  type FamilyDelegate,
  type HousingType,
  type PriorityLevel,
} from './sample';

interface AddFamilyProps {
  open: boolean;
  delegates: FamilyDelegate[];
  currency: string;
  onClose: () => void;
  onCreate: (family: Family) => void;
}

export function AddFamilyDialog({ open, delegates, currency, onClose, onCreate }: AddFamilyProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const titleId = useId();
  const headErrorId = useId();
  const phoneErrorId = useId();
  const districtErrorId = useId();
  const delegateErrorId = useId();

  const [headName, setHeadName] = useState('');
  const [guardianName, setGuardianName] = useState('');
  const [phone, setPhone] = useState('');
  const [district, setDistrict] = useState('');
  const [address, setAddress] = useState('');
  const [category, setCategory] = useState<FamilyCategory>('widow_orphans');
  const [priority, setPriority] = useState<PriorityLevel>('high');
  const [housing, setHousing] = useState<HousingType>('rent');
  const [rentAmount, setRentAmount] = useState('250000');
  const [monthlySalary, setMonthlySalary] = useState('200000');
  const [delegateId, setDelegateId] = useState(String(delegates[0]?.id ?? 101));
  const [patientId, setPatientId] = useState('');
  const [memberCount, setMemberCount] = useState('4');
  const [caseSummary, setCaseSummary] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      void closeTopLayer(dialog);
    }
    return undefined;
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    const detachDismiss = attachDialogDismiss(dialog);
    const onCloseEvent = () => onClose();
    dialog.addEventListener('close', onCloseEvent);
    return () => {
      detachDismiss();
      dialog.removeEventListener('close', onCloseEvent);
    };
  }, [onClose]);

  useEffect(() => {
    const form = formRef.current;
    if (!form) return undefined;
    return attachAccessibleValidation(form);
  }, []);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const chosenDelegate = delegates.find((item) => String(item.id) === delegateId) ?? delegates[0];
    const id = Date.now();
    const numericSuffix = String(id).slice(-4);
    const salaryNum = Math.max(0, Number(monthlySalary) || 0);
    const rentNum = housing === 'rent' || housing === 'shared' ? Math.max(0, Number(rentAmount) || 0) : 0;
    const linkedPtId = Number(patientId) || 0;
    const membersTotal = Math.max(1, Math.min(14, Number(memberCount) || 1));

    const members = Array.from({ length: membersTotal }, (_, index) => {
      if (index === 0) {
        return {
          id: `m-${id}-0`,
          name: guardianName.trim() || headName.trim(),
          relation: 'رب الأسرة / المعيل',
          age: 42,
          gender: 'female' as const,
          roleNote: category === 'widow_orphans' ? 'أرملة معيلة' : 'رب الأسرة',
          healthNote: linkedPtId ? 'مرتبط بسجل المرضى' : 'مستقر',
          ...(linkedPtId ? { patientId: linkedPtId } : {}),
        };
      }
      return {
        id: `m-${id}-${index}`,
        name: `فرد الأسرة ${index + 1}`,
        relation: category === 'widow_orphans' ? 'ابن / ابنة يتيم' : 'فرد أسرة',
        age: 6 + index * 3,
        gender: (index % 2 === 0 ? 'female' : 'male') as 'male' | 'female',
        roleNote: 'طالب / معال',
        healthNote: 'سليم',
        isOrphan: category === 'widow_orphans',
      };
    });

    const newFamily: Family = {
      id,
      fileNo: `FM-${numericSuffix}`,
      headName: headName.trim(),
      guardianName: guardianName.trim() || headName.trim(),
      nationalId: `1984-${numericSuffix}-1020`,
      phone: phone.trim(),
      district: district.trim(),
      address: address.trim() || `بغداد – ${district.trim()}`,
      housing,
      rentAmount: rentNum,
      priority,
      category,
      monthlySalary: salaryNum,
      delegateId: chosenDelegate?.id ?? 101,
      delegateName: chosenDelegate?.name ?? 'كرار حيدر',
      delegatePhone: chosenDelegate?.phone ?? '0770 000 0000',
      registeredAt: today(),
      lastVisit: today(),
      verifiedBy: `المندوب ${chosenDelegate?.name ?? ''}`.trim(),
      caseSummary: caseSummary.trim() || 'ملف جديد مسجل قيد المتابعة الميدانية الدورية من قبل المندوب المختص.',
      needs: [
        ...(salaryNum > 0 ? ['راتب شهري'] : []),
        ...(housing === 'rent' ? ['دعم إيجار سكن'] : []),
        'سلة غذائية شهرية',
      ],
      tone: id % 6,
      members,
      patientIds: linkedPtId ? [linkedPtId] : [],
      aids: salaryNum > 0
        ? [{
          id: `fa-${id}-1`,
          date: today(),
          kind: 'salary',
          title: 'اعتماد أول راتب شهري للعائلة',
          amount: salaryNum,
          delegateName: chosenDelegate?.name ?? 'كرار حيدر',
          foundation: 'مؤسسة سجلات الخير',
          receiptNo: `SL-${numericSuffix}`,
          note: 'صرف تأسيسي عند فتح الملف',
        }]
        : [],
    };

    onCreate(newFamily);
    form.reset();
    setHeadName('');
    setGuardianName('');
    setPhone('');
    setDistrict('');
    setAddress('');
    setCaseSummary('');
    void closeTopLayer(dialogRef.current);
  };

  return (
    <dialog
      ref={dialogRef}
      className="fam-dialog"
      aria-labelledby={titleId}
      {...({ closedby: 'any' } as Record<string, string>)}
    >
      <header className="fam-dialog-head">
        <div className="fam-dialog-title">
          <span className="fam-dialog-icon" aria-hidden><HeartHandshake size={20} /></span>
          <div>
            <h2 id={titleId}>فتح ملف عائلة متعففة جديدة</h2>
            <p>ربط العائلة بمندوبها الخاص، بيانات السكن، الراتب، والحالات المرضية</p>
          </div>
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-label="إغلاق"
          onClick={() => void closeTopLayer(dialogRef.current)}
        >
          <X size={18} aria-hidden />
        </button>
      </header>

      <form ref={formRef} className="fam-dialog-body" onSubmit={handleSubmit} noValidate>
        <div className="fam-form-grid">
          <div className="fam-field fam-span-2">
            <label htmlFor={`${titleId}-head`}>اسم العائلة / العنوان الرئيسي للملف *</label>
            <input
              id={`${titleId}-head`}
              type="text"
              required
              minLength={4}
              placeholder="مثال: عائلة الأرملة سعاد كريم الساعدي"
              value={headName}
              onChange={(e) => setHeadName(e.target.value)}
              data-error={headErrorId}
            />
            <span id={headErrorId} className="exp-field-error">أدخل اسم العائلة (4 أحرف على الأقل)</span>
          </div>

          <div className="fam-field">
            <label htmlFor={`${titleId}-guardian`}>اسم المعيل / رب الأسرة</label>
            <input
              id={`${titleId}-guardian`}
              type="text"
              placeholder="الاسم الثلاثي"
              value={guardianName}
              onChange={(e) => setGuardianName(e.target.value)}
            />
          </div>

          <div className="fam-field">
            <label htmlFor={`${titleId}-phone`}>رقم الهاتف *</label>
            <input
              id={`${titleId}-phone`}
              type="tel"
              required
              minLength={8}
              dir="ltr"
              placeholder="0770 123 4567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              data-error={phoneErrorId}
            />
            <span id={phoneErrorId} className="exp-field-error">أدخل رقم هاتف صحيح</span>
          </div>

          <div className="fam-field">
            <label htmlFor={`${titleId}-delegate`}>المندوب الخاص بالعائلة *</label>
            <select
              id={`${titleId}-delegate`}
              className="fam-select"
              required
              value={delegateId}
              onChange={(e) => setDelegateId(e.target.value)}
              data-error={delegateErrorId}
            >
              {delegates.map((item) => (
                <option key={item.id} value={String(item.id)}>
                  {item.name} — {item.zone}
                </option>
              ))}
            </select>
            <span id={delegateErrorId} className="exp-field-error">اختر المندوب المسؤول</span>
          </div>

          <div className="fam-field">
            <label htmlFor={`${titleId}-district`}>المنطقة / القاطع *</label>
            <input
              id={`${titleId}-district`}
              type="text"
              required
              minLength={2}
              placeholder="مثال: الكاظمية، الشعلة، الكرادة"
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
              data-error={districtErrorId}
            />
            <span id={districtErrorId} className="exp-field-error">أدخل اسم المنطقة</span>
          </div>

          <div className="fam-field">
            <label htmlFor={`${titleId}-category`}>تصنيف الحالة</label>
            <select
              id={`${titleId}-category`}
              className="fam-select"
              value={category}
              onChange={(e) => setCategory(e.target.value as FamilyCategory)}
            >
              {(Object.keys(CATEGORY_LABELS) as FamilyCategory[]).map((key) => (
                <option key={key} value={key}>{CATEGORY_LABELS[key]}</option>
              ))}
            </select>
          </div>

          <div className="fam-field">
            <label htmlFor={`${titleId}-priority`}>درجة الأولوية</label>
            <select
              id={`${titleId}-priority`}
              className="fam-select"
              value={priority}
              onChange={(e) => setPriority(e.target.value as PriorityLevel)}
            >
              {(Object.keys(PRIORITY_LABELS) as PriorityLevel[]).map((key) => (
                <option key={key} value={key}>{PRIORITY_LABELS[key]}</option>
              ))}
            </select>
          </div>

          <div className="fam-field">
            <label htmlFor={`${titleId}-housing`}>حالة السكن</label>
            <select
              id={`${titleId}-housing`}
              className="fam-select"
              value={housing}
              onChange={(e) => setHousing(e.target.value as HousingType)}
            >
              {(Object.keys(HOUSING_LABELS) as HousingType[]).map((key) => (
                <option key={key} value={key}>{HOUSING_LABELS[key]}</option>
              ))}
            </select>
          </div>

          <div className="fam-field">
            <label htmlFor={`${titleId}-salary`}>الراتب الشهري المقرر ({currency})</label>
            <input
              id={`${titleId}-salary`}
              type="number"
              min={0}
              step={5000}
              dir="ltr"
              value={monthlySalary}
              onChange={(e) => setMonthlySalary(e.target.value)}
            />
          </div>

          {(housing === 'rent' || housing === 'shared') && (
            <div className="fam-field">
              <label htmlFor={`${titleId}-rent`}>مبلغ الإيجار الشهري ({currency})</label>
              <input
                id={`${titleId}-rent`}
                type="number"
                min={0}
                step={5000}
                dir="ltr"
                value={rentAmount}
                onChange={(e) => setRentAmount(e.target.value)}
              />
            </div>
          )}

          <div className="fam-field">
            <label htmlFor={`${titleId}-members`}>عدد أفراد العائلة</label>
            <input
              id={`${titleId}-members`}
              type="number"
              min={1}
              max={15}
              dir="ltr"
              value={memberCount}
              onChange={(e) => setMemberCount(e.target.value)}
            />
          </div>

          <div className="fam-field fam-span-2">
            <label htmlFor={`${titleId}-patient`}>ربط بمريض من صفحة المرضى (اختياري)</label>
            <select
              id={`${titleId}-patient`}
              className="fam-select"
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
            >
              <option value="">بدون ربط مريض حالي</option>
              {PATIENTS.map((pt) => (
                <option key={pt.id} value={String(pt.id)}>
                  {pt.name} — {pt.condition} ({pt.file})
                </option>
              ))}
            </select>
          </div>

          <div className="fam-field fam-span-2">
            <label htmlFor={`${titleId}-address`}>العنوان التفصيلي</label>
            <input
              id={`${titleId}-address`}
              type="text"
              placeholder="المحلة، الزقاق، رقم الدار، أقرب نقطة دالة"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>

          <div className="fam-field fam-span-2">
            <label htmlFor={`${titleId}-summary`}>التقييم الميداني وملخص الحالة</label>
            <textarea
              id={`${titleId}-summary`}
              rows={3}
              placeholder="وصف الوضع المعيشي، مصدر الدخل إن وجد، والاحتياجات الأساسية..."
              value={caseSummary}
              onChange={(e) => setCaseSummary(e.target.value)}
            />
          </div>
        </div>

        <footer className="fam-dialog-foot">
          <button type="button" className="btn" onClick={() => void closeTopLayer(dialogRef.current)}>
            إلغاء
          </button>
          <button type="submit" className="btn primary">
            <Plus size={17} aria-hidden /> حفظ وفتح الملف
          </button>
        </footer>
      </form>
    </dialog>
  );
}

interface AddAidProps {
  open: boolean;
  family: Family;
  delegates: FamilyDelegate[];
  currency: string;
  initialKind?: FamilyAidKind;
  onClose: () => void;
  onCreate: (aid: FamilyAid) => void;
}

export function AddFamilyAidDialog({
  open,
  family,
  delegates,
  currency,
  initialKind = 'salary',
  onClose,
  onCreate,
}: AddAidProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const titleId = useId();
  const titleErrId = useId();
  const amountErrId = useId();

  const [kind, setKind] = useState<FamilyAidKind>(initialKind);
  const [aidTitle, setAidTitle] = useState(
    initialKind === 'salary' ? 'صرف الراتب الشهري' : FAMILY_AID_LABELS[initialKind],
  );
  const [amount, setAmount] = useState(
    String(initialKind === 'salary' ? family.monthlySalary || 200000 : 100000),
  );
  const [date, setDate] = useState(today());
  const [delegateName, setDelegateName] = useState(family.delegateName);
  const [note, setNote] = useState('');

  useEffect(() => {
    setKind(initialKind);
    setAidTitle(initialKind === 'salary' ? 'صرف الراتب الشهري' : FAMILY_AID_LABELS[initialKind]);
    setAmount(String(initialKind === 'salary' ? family.monthlySalary || 200000 : 100000));
    setDelegateName(family.delegateName);
  }, [initialKind, family]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      void closeTopLayer(dialog);
    }
    return undefined;
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    const detachDismiss = attachDialogDismiss(dialog);
    const onCloseEvent = () => onClose();
    dialog.addEventListener('close', onCloseEvent);
    return () => {
      detachDismiss();
      dialog.removeEventListener('close', onCloseEvent);
    };
  }, [onClose]);

  useEffect(() => {
    const form = formRef.current;
    if (!form) return undefined;
    return attachAccessibleValidation(form);
  }, []);

  const handleKindChange = (nextKind: FamilyAidKind) => {
    setKind(nextKind);
    setAidTitle(nextKind === 'salary' ? 'صرف الراتب الشهري' : FAMILY_AID_LABELS[nextKind]);
    if (nextKind === 'salary' && family.monthlySalary > 0) {
      setAmount(String(family.monthlySalary));
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const numericAmount = Math.max(1000, Number(amount) || 0);
    const receiptPrefix = kind === 'salary' ? 'SL' : kind === 'food' ? 'FD' : kind === 'rent' ? 'RN' : 'CA';
    const newAid: FamilyAid = {
      id: `fa-${family.id}-${Date.now()}`,
      date,
      kind,
      title: aidTitle.trim(),
      amount: numericAmount,
      delegateName,
      foundation: 'مؤسسة سجلات الخير',
      receiptNo: `${receiptPrefix}-${String(Date.now()).slice(-4)}`,
      note: note.trim() || 'تسليم موثق عبر المندوب',
    };

    onCreate(newAid);
    setNote('');
    void closeTopLayer(dialogRef.current);
  };

  return (
    <dialog
      ref={dialogRef}
      className="fam-dialog"
      aria-labelledby={titleId}
      {...({ closedby: 'any' } as Record<string, string>)}
    >
      <header className="fam-dialog-head">
        <div className="fam-dialog-title">
          <span className="fam-dialog-icon" aria-hidden><HandCoins size={20} /></span>
          <div>
            <h2 id={titleId}>صرف راتب أو مساعدة للعائلة</h2>
            <p>{family.headName} • <bdi dir="ltr">{family.fileNo}</bdi></p>
          </div>
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-label="إغلاق"
          onClick={() => void closeTopLayer(dialogRef.current)}
        >
          <X size={18} aria-hidden />
        </button>
      </header>

      <form ref={formRef} className="fam-dialog-body" onSubmit={handleSubmit} noValidate>
        <div className="fam-form-grid">
          <div className="fam-field">
            <label htmlFor={`${titleId}-kind`}>نوع الصرف</label>
            <select
              id={`${titleId}-kind`}
              className="fam-select"
              value={kind}
              onChange={(e) => handleKindChange(e.target.value as FamilyAidKind)}
            >
              {(Object.keys(FAMILY_AID_LABELS) as FamilyAidKind[]).map((key) => (
                <option key={key} value={key}>{FAMILY_AID_LABELS[key]}</option>
              ))}
            </select>
          </div>

          <div className="fam-field">
            <label htmlFor={`${titleId}-date`}>التاريخ</label>
            <input
              id={`${titleId}-date`}
              type="date"
              required
              dir="ltr"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div className="fam-field fam-span-2">
            <label htmlFor={`${titleId}-aid-title`}>بيان الصرف *</label>
            <input
              id={`${titleId}-aid-title`}
              type="text"
              required
              minLength={3}
              value={aidTitle}
              onChange={(e) => setAidTitle(e.target.value)}
              data-error={titleErrId}
            />
            <span id={titleErrId} className="exp-field-error">أدخل بيان الصرف</span>
          </div>

          <div className="fam-field">
            <label htmlFor={`${titleId}-amount`}>المبلغ ({currency}) *</label>
            <input
              id={`${titleId}-amount`}
              type="number"
              required
              min={1000}
              step={5000}
              dir="ltr"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              data-error={amountErrId}
            />
            <span id={amountErrId} className="exp-field-error">أدخل مبلغاً لا يقل عن 1,000</span>
          </div>

          <div className="fam-field">
            <label htmlFor={`${titleId}-del`}>المندوب المسلّم</label>
            <select
              id={`${titleId}-del`}
              className="fam-select"
              value={delegateName}
              onChange={(e) => setDelegateName(e.target.value)}
            >
              {delegates.map((d) => (
                <option key={d.id} value={d.name}>{d.name}</option>
              ))}
            </select>
          </div>

          <div className="fam-field fam-span-2">
            <label htmlFor={`${titleId}-note`}>ملاحظات التسليم</label>
            <textarea
              id={`${titleId}-note`}
              rows={2}
              placeholder="مثال: استلام يدوي بتوقيع المعيل..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        <footer className="fam-dialog-foot">
          <button type="button" className="btn" onClick={() => void closeTopLayer(dialogRef.current)}>
            إلغاء
          </button>
          <button type="submit" className="btn primary">
            <UserCheck size={17} aria-hidden /> تأكيد وتسجيل الصرف
          </button>
        </footer>
      </form>
    </dialog>
  );
}

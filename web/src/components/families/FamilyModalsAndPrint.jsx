import { useEffect, useRef, useState } from 'react';
import {
  Banknote, Calendar, Check, ClipboardCheck, HandCoins, HeartHandshake,
  Pencil, Pill, ShoppingBasket, Stethoscope, User, Wallet, X,
} from 'lucide-react';
import { DELEGATES } from '../../data/families';
import { CATEGORY_CONFIG, formatIQD, totalEntitlement } from '../../utils/format';
import { useLiveDelegates } from './DelegateChip';
import { useIsDelegate } from './role';

const toDigits = (val) => String(val ?? '')
  .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
  .replace(/[^\d]/g, '');

const formatWithCommas = (val) => {
  const digits = toDigits(val);
  return digits ? Number(digits).toLocaleString('en-US') : '';
};

const parseAmount = (val) => Number(toDigits(val)) || 0;

// The six kinds of aid (the same as the cards at the top of the families page). The ids are what
// the records store, so the older ones keep their wording; the labels are what people read.
const PAYMENT_TYPES = [
  { id: 'سلة غذائية', label: 'سلة غذائية', icon: ShoppingBasket, tone: 'text-orange-600 bg-orange-500/10' },
  { id: 'مبالغ مالية', label: 'مبالغ مالية', icon: Banknote, tone: 'text-emerald-600 bg-emerald-600/10' },
  { id: 'أدوية', label: 'شراء دواء', icon: Pill, tone: 'text-pink-600 bg-pink-500/10' },
  { id: 'راتب شهري', label: 'صرف رواتب', icon: Wallet, tone: 'text-sky-600 bg-sky-500/10' },
  { id: 'مساعدات', label: 'مساعدات إنسانية', icon: HandCoins, tone: 'text-violet-600 bg-violet-500/10' },
  { id: 'كشفية', label: 'كشفيات طبية', icon: Stethoscope, tone: 'text-rose-600 bg-rose-500/10' },
];

export function AddFamilyModal({ open, onClose, onCreate }) {
  const dialogRef = useRef(null);
  const delegatesList = useLiveDelegates();
  const isDelegate = useIsDelegate();
  const [name, setName] = useState('');
  const [headName, setHeadName] = useState('');
  const [region, setRegion] = useState('الكاظمية');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [housing, setHousing] = useState('إيجار');
  const [rent, setRent] = useState('250000');
  const [category, setCategory] = useState('intensive');
  const [socialStatus, setSocialStatus] = useState('أرملة وأيتام');
  const [delegateId, setDelegateId] = useState(String(delegatesList[0]?.id ?? ''));
  const [salary, setSalary] = useState('250000');
  const [aid, setAid] = useState('150000');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  }, [open]);

  if (!open) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    const delegate = delegatesList.find((d) => String(d.id) === delegateId) ?? delegatesList[0] ?? null;
    const id = Date.now();
    const salaryNum = Math.max(0, parseAmount(salary));
    const aidNum = Math.max(0, parseAmount(aid));

    onCreate({
      id,
      fileNo: `FM-${String(id).slice(-4)}`,
      name: name.trim(),
      headName: headName.trim() || name.trim(),
      category,
      socialStatus,
      region: region.trim(),
      address: address.trim() || `بغداد – ${region.trim()}`,
      phone: phone.trim(),
      housing,
      rent: housing === 'إيجار' || housing === 'سكن مشترك' ? Math.max(0, parseAmount(rent)) : 0,
      income: 'مسجل حديثاً قيد المراجعة',
      delegate,
      entitlements: { salary: salaryNum, aid: aidNum, medicine: 0, checkups: 0 },
      paidThisMonth: 0,
      arrears: salaryNum + aidNum,
      arrearsMonths: 1,
      lastVisit: new Date().toISOString().slice(0, 10),
      notes: notes.trim() || 'ملف عائلة مسجل حديثاً، بانتظار استكمال الكشف الميداني.',
      members: [
        { name: headName.trim() || name.trim(), relation: 'رب الأسرة', age: 40, status: socialStatus },
      ],
      patients: [],
      payments: [],
      visits: [
        { date: new Date().toISOString().slice(0, 10), delegateName: delegate?.name ?? '', note: 'فتح الملف وتدقيق البيانات الأولية.' },
      ],
    });
    setName('');
    setHeadName('');
    setAddress('');
    setPhone('');
    setNotes('');
    onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="m-auto w-[min(640px,calc(100vw-24px))] overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/55 backdrop:backdrop-blur-xs"
    >
      <div className="flex items-center justify-between border-b border-slate-200/70 bg-gradient-to-l from-blue-600/8 via-indigo-50/40 to-white px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-bl from-blue-600 to-indigo-600 text-white shadow-sm">
            <HeartHandshake className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-bold text-slate-900">إضافة عائلة جديدة</h2>
            <p className="text-xs text-slate-500">ربط العائلة بالمندوب وتحديد الاستحقاقات الشهرية</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="إغلاق"
          className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200/80 bg-white text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="max-h-[72dvh] space-y-5 overflow-y-auto p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">اسم العائلة *</span>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: عائلة الأرملة نادية سالم العزاوي"
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 text-sm text-slate-900 transition focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-3 focus:ring-blue-500/15"
              />
            </label>

            <label className="block sm:col-span-2">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">اسم رب الأسرة الرباعي</span>
              <input
                type="text"
                value={headName}
                onChange={(e) => setHeadName(e.target.value)}
                placeholder="مثال: نادية سالم حميد العزاوي"
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 text-sm text-slate-900 transition focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-3 focus:ring-blue-500/15"
              />
              <span className="mt-1 block text-[11px] text-slate-500">يُستخدم لمعرفة إن كانت العائلة مسجّلة عند مؤسسة أخرى.</span>
            </label>

            <div className="sm:col-span-2">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">درجة الأولوية</span>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: 'critical', label: 'حرجة', active: 'border-rose-500 bg-rose-500/10 text-rose-700' },
                  { key: 'intensive', label: 'متوسطة', active: 'border-amber-500 bg-amber-500/10 text-amber-700' },
                  { key: 'stable', label: 'جيدة', active: 'border-emerald-500 bg-emerald-500/10 text-emerald-700' },
                ].map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setCategory(opt.key)}
                    className={`h-10 rounded-xl border text-xs font-bold transition ${
                      category === opt.key
                        ? opt.active
                        : 'border-slate-200 bg-slate-50/70 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {!isDelegate && (
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">المندوب المسؤول</span>
              <select
                value={delegateId}
                onChange={(e) => setDelegateId(e.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-xs font-semibold"
              >
                {delegatesList.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}{d.region ? ` (${d.region})` : ''}</option>
                ))}
              </select>
            </label>
            )}

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">الحالة الاجتماعية</span>
              <select
                value={socialStatus}
                onChange={(e) => setSocialStatus(e.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-xs font-semibold"
              >
                <option value="أرملة وأيتام">أرملة وأيتام</option>
                <option value="مريض مزمن">مريض مزمن</option>
                <option value="كبار سن وعاجز">كبار سن وعاجز</option>
                <option value="متعففة / دخل محدود">متعففة / دخل محدود</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">المنطقة *</span>
              <input
                type="text"
                required
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-xs"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">نوع السكن</span>
              <select
                value={housing}
                onChange={(e) => setHousing(e.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-xs font-semibold"
              >
                <option value="إيجار">إيجار</option>
                <option value="ملك بسيط">ملك بسيط</option>
                <option value="سكن مشترك">سكن مشترك</option>
                <option value="تجاوز / كرفان">تجاوز / كرفان</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">رقم الهاتف</span>
              <input
                type="tel"
                inputMode="tel"
                dir="ltr"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="07xx xxx xxxx"
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-xs font-bold tabular-nums"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">الراتب الشهري (د.ع)</span>
              <input
                type="text"
                inputMode="numeric"
                dir="ltr"
                value={formatWithCommas(salary)}
                onChange={(e) => setSalary(toDigits(e.target.value))}
                placeholder="0"
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-xs font-bold tabular-nums"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">المساعدات الشهرية (د.ع)</span>
              <input
                type="text"
                inputMode="numeric"
                dir="ltr"
                value={formatWithCommas(aid)}
                onChange={(e) => setAid(toDigits(e.target.value))}
                placeholder="0"
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-xs font-bold tabular-nums"
              />
            </label>

            {(housing === 'إيجار' || housing === 'سكن مشترك') && (
              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">مبلغ الإيجار الشهري (د.ع)</span>
                <input
                  type="text"
                  inputMode="numeric"
                  dir="ltr"
                  value={formatWithCommas(rent)}
                  onChange={(e) => setRent(toDigits(e.target.value))}
                  placeholder="0"
                  className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-xs font-bold tabular-nums"
                />
              </label>
            )}

            <label className="block sm:col-span-2">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">ملاحظات الحالة</span>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="وصف الوضع المعيشي والاحتياجات..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-xs"
              />
            </label>
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2.5 border-t border-slate-200/70 bg-slate-50/70 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
          >
            إلغاء
          </button>
          <button
            type="submit"
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-gradient-to-l from-blue-600 to-indigo-600 px-5 text-xs font-semibold text-white shadow-[0_6px_16px_-6px_rgba(37,99,235,0.65)] transition hover:brightness-105"
          >
            <Check className="h-4 w-4" aria-hidden />
            <span>حفظ العائلة</span>
          </button>
        </footer>
      </form>
    </dialog>
  );
}

export function PaymentModal({ family, onClose, onConfirm }) {
  const dialogRef = useRef(null);
  const due = family ? totalEntitlement(family) : 0;
  const defaultAmount = family ? (family.arrears > 0 ? family.arrears : family.entitlements?.salary || 200000) : 200000;

  const [amount, setAmount] = useState(String(defaultAmount));
  const [type, setType] = useState('راتب شهري');
  const [receivedBy, setReceivedBy] = useState(family?.headName ?? '');
  const [date, setDate] = useState('2026-11-15');

  useEffect(() => {
    if (!family) return;
    setAmount(String(family.arrears > 0 ? family.arrears : family.entitlements?.salary || 200000));
    setReceivedBy(family.headName ?? '');
    setType('راتب شهري');
  }, [family]);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (family && !el.open) el.showModal();
    else if (!family && el.open) el.close();
  }, [family]);

  if (!family) return null;

  const numericAmount = Math.max(0, parseAmount(amount));
  const presets = [
    ...(family.arrears > 0 ? [{ label: 'سداد المتبقي', val: family.arrears }] : []),
    ...(family.entitlements?.salary > 0 ? [{ label: 'الراتب الشهري', val: family.entitlements.salary }] : []),
    { label: '100,000', val: 100_000 },
    { label: '250,000', val: 250_000 },
  ];

  const submit = (e) => {
    e.preventDefault();
    const safeAmount = Math.max(1000, parseAmount(amount));
    onConfirm(family.id, {
      date,
      amount: safeAmount,
      type,
      receivedBy: receivedBy.trim() || family.headName,
      by: family.delegate?.name ?? 'الإدارة',
    });
    onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="m-auto w-[min(520px,calc(100vw-24px))] overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/55 backdrop:backdrop-blur-xs"
    >
      {/* Elevated Modal Header */}
      <div className="flex items-start justify-between gap-3 border-b border-slate-200/70 bg-gradient-to-l from-emerald-500/10 via-blue-500/5 to-white px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-bl from-emerald-500 to-teal-600 text-white shadow-sm">
            <HandCoins className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">صرف دفعة مالية</h2>
              <span className="rounded-md bg-white px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-500 ring-1 ring-slate-200/80" dir="ltr">
                {family.fileNo}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">{family.name}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="إغلاق"
          className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200/80 bg-white text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <form onSubmit={submit}>
        <div className="space-y-5 p-6">
          {/* Live Balance Strip */}
          <dl className="grid grid-cols-3 gap-2 rounded-2xl border border-slate-200/70 bg-slate-50/70 p-3 text-center">
            <div>
              <dt className="text-[11px] text-slate-500">المستحق الشهري</dt>
              <dd className="mt-0.5 text-xs font-bold text-slate-900 tabular-nums">{formatIQD(due)}</dd>
            </div>
            <div className="border-x border-slate-200/70">
              <dt className="text-[11px] text-slate-500">المصروف</dt>
              <dd className="mt-0.5 text-xs font-bold text-emerald-600 tabular-nums">{formatIQD(family.paidThisMonth)}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-slate-500">المتبقي</dt>
              <dd className={`mt-0.5 text-xs font-bold tabular-nums ${family.arrears > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                {formatIQD(family.arrears)}
              </dd>
            </div>
          </dl>

          {/* Visual Payment Type Selector */}
          <div>
            <span className="mb-2 block text-xs font-semibold text-slate-600">نوع الدفعة</span>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {PAYMENT_TYPES.map((item) => {
                const Icon = item.icon;
                const active = type === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setType(item.id)}
                    className={`flex flex-col items-center gap-1.5 rounded-2xl border p-3 text-center transition ${
                      active
                        ? 'border-blue-600 bg-blue-600/5 ring-2 ring-blue-600/20'
                        : 'border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50/70'
                    }`}
                  >
                    <span className={`inline-flex h-8 w-8 items-center justify-center rounded-xl ${item.tone}`}>
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    <span className={`text-[11px] font-bold ${active ? 'text-blue-700' : 'text-slate-700'}`}>
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Amount Input + Live Preview + Quick Presets */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="fam-pay-amount" className="text-xs font-semibold text-slate-600">
                المبلغ المصروف
              </label>
              <span className="text-xs font-bold text-blue-600 tabular-nums">{formatIQD(numericAmount)}</span>
            </div>

            <div className="relative">
              <input
                id="fam-pay-amount"
                type="text"
                inputMode="numeric"
                required
                dir="ltr"
                value={formatWithCommas(amount)}
                onChange={(e) => setAmount(toDigits(e.target.value))}
                placeholder="0"
                className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50/70 pe-14 ps-4 text-lg font-bold text-slate-900 tabular-nums transition focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-3 focus:ring-blue-500/15"
              />
              <span className="pointer-events-none absolute end-3.5 top-1/2 -translate-y-1/2 rounded-lg bg-slate-200/70 px-2 py-0.5 text-xs font-bold text-slate-600">
                د.ع
              </span>
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5">
              {presets.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setAmount(String(p.val))}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Recipient & Date */}
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-slate-600">
                <User className="h-3.5 w-3.5 text-slate-400" aria-hidden /> اسم المستلم
              </span>
              <input
                type="text"
                required
                value={receivedBy}
                onChange={(e) => setReceivedBy(e.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-xs font-medium text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-slate-600">
                <Calendar className="h-3.5 w-3.5 text-slate-400" aria-hidden /> تاريخ الصرف
              </span>
              <input
                type="date"
                required
                dir="ltr"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-xs font-medium text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none"
              />
            </label>
          </div>
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-slate-200/70 bg-slate-50/70 px-6 py-4">
          <span className="text-[11px] text-slate-500">
            المندوب: <b className="text-slate-700">{family.delegate?.name}</b>
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-gradient-to-l from-blue-600 to-indigo-600 px-5 text-xs font-semibold text-white shadow-[0_6px_16px_-6px_rgba(37,99,235,0.65)] transition hover:brightness-105"
            >
              <Check className="h-4 w-4" aria-hidden />
              <span>تأكيد الصرف</span>
            </button>
          </div>
        </footer>
      </form>
    </dialog>
  );
}

export function EditAidModal({ family, onClose, onSave }) {
  const dialogRef = useRef(null);
  const delegatesList = useLiveDelegates();
  const isDelegate = useIsDelegate();
  const [category, setCategory] = useState('intensive');
  const [delegateId, setDelegateId] = useState('');
  const [salary, setSalary] = useState('0');
  const [aid, setAid] = useState('0');
  const [medicine, setMedicine] = useState('0');
  const [aidType, setAidType] = useState('مساعدات');

  useEffect(() => {
    if (!family) return;
    setCategory(family.category ?? 'stable');
    setDelegateId(String(family.delegate?.id ?? ''));
    setSalary(String(family.entitlements?.salary ?? 0));
    setAid(String(family.entitlements?.aid ?? 0));
    setMedicine(String(family.entitlements?.medicine ?? 0));
    const nonSalary = (family.payments ?? []).find((p) => p.type !== 'راتب شهري');
    setAidType(nonSalary?.type ?? 'مساعدات');
  }, [family]);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (family && !el.open) el.showModal();
    else if (!family && el.open) el.close();
  }, [family]);

  if (!family) return null;

  const salaryNum = Math.max(0, parseAmount(salary));
  const aidNum = Math.max(0, parseAmount(aid));
  const medNum = Math.max(0, parseAmount(medicine));
  const checkupsNum = family.entitlements?.checkups ?? 0;
  const totalDue = salaryNum + aidNum + medNum + checkupsNum;

  const submit = (e) => {
    e.preventDefault();
    const chosenDelegate = delegatesList.find((d) => String(d.id) === delegateId) ?? family.delegate;
    onSave(family.id, {
      category,
      delegate: chosenDelegate,
      entitlements: {
        ...(family.entitlements ?? {}),
        salary: salaryNum,
        aid: aidNum,
        medicine: medNum,
        checkups: checkupsNum,
      },
      aidType,
    });
    onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="m-auto w-[min(520px,calc(100vw-24px))] overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/55 backdrop:backdrop-blur-xs"
    >
      <div className="flex items-start justify-between gap-3 border-b border-slate-200/70 bg-gradient-to-l from-blue-600/10 via-indigo-50/40 to-white px-5 py-3.5">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-bl from-blue-600 to-indigo-600 text-white shadow-sm">
            <Pencil className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <h2 className="text-sm font-bold text-slate-900">تعديل المساعدة والاستحقاقات</h2>
            <p className="mt-0.5 text-xs text-slate-500">{family.name}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="إغلاق"
          className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200/80 bg-white text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <form onSubmit={submit}>
        <div className="space-y-4 p-5">
          {/* Status */}
          <div>
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">حالة العائلة</span>
            <div className="grid grid-cols-3 gap-2">
              {[
                { key: 'critical', label: 'حرجة', active: 'border-rose-500 bg-rose-500/10 text-rose-700' },
                { key: 'intensive', label: 'متوسطة', active: 'border-amber-500 bg-amber-500/10 text-amber-700' },
                { key: 'stable', label: 'جيدة', active: 'border-emerald-500 bg-emerald-500/10 text-emerald-700' },
              ].map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setCategory(opt.key)}
                  className={`h-9 rounded-xl border text-xs font-bold transition ${
                    category === opt.key
                      ? opt.active
                      : 'border-slate-200 bg-slate-50/70 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Delegate & Aid Type */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {!isDelegate && (
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">المندوب المسؤول</span>
              <select
                value={delegateId}
                onChange={(e) => setDelegateId(e.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-xs font-semibold text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none"
              >
                {family.delegate && !delegatesList.some((d) => String(d.id) === String(family.delegate.id)) && (
                  <option value={family.delegate.id}>{family.delegate.name}</option>
                )}
                {delegatesList.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </label>
            )}

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">نوع المساعدة الإضافية</span>
              <select
                value={aidType}
                onChange={(e) => setAidType(e.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-xs font-semibold text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none"
              >
                {PAYMENT_TYPES.filter((t) => t.id !== 'راتب شهري').map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>
            </label>
          </div>

          {/* Amounts with live commas */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">الراتب الشهري</span>
              <input
                type="text"
                inputMode="numeric"
                dir="ltr"
                value={formatWithCommas(salary)}
                onChange={(e) => setSalary(toDigits(e.target.value))}
                placeholder="0"
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-sm font-bold text-slate-900 tabular-nums focus:border-blue-500 focus:bg-white focus:outline-none"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">المساعدات</span>
              <input
                type="text"
                inputMode="numeric"
                dir="ltr"
                value={formatWithCommas(aid)}
                onChange={(e) => setAid(toDigits(e.target.value))}
                placeholder="0"
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-sm font-bold text-slate-900 tabular-nums focus:border-blue-500 focus:bg-white focus:outline-none"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">الأدوية</span>
              <input
                type="text"
                inputMode="numeric"
                dir="ltr"
                value={formatWithCommas(medicine)}
                onChange={(e) => setMedicine(toDigits(e.target.value))}
                placeholder="0"
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-sm font-bold text-slate-900 tabular-nums focus:border-blue-500 focus:bg-white focus:outline-none"
              />
            </label>
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-slate-200/70 bg-slate-50/70 px-4 py-2.5 text-xs">
            <span className="font-semibold text-slate-500">إجمالي الاستحقاق الشهري</span>
            <b className="text-sm font-extrabold text-blue-600 tabular-nums">{formatIQD(totalDue)}</b>
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-slate-200/70 bg-slate-50/70 px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
          >
            إلغاء
          </button>
          <button
            type="submit"
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-gradient-to-l from-blue-600 to-indigo-600 px-5 text-xs font-semibold text-white shadow-[0_6px_16px_-6px_rgba(37,99,235,0.65)] transition hover:brightness-105"
          >
            <Check className="h-4 w-4" aria-hidden />
            <span>حفظ التعديل</span>
          </button>
        </footer>
      </form>
    </dialog>
  );
}

export function VisitModal({ family, onClose, onConfirm }) {
  const dialogRef = useRef(null);
  const [note, setNote] = useState('');

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (family && !el.open) el.showModal();
    else if (!family && el.open) el.close();
  }, [family]);

  if (!family) return null;

  const submit = (e) => {
    e.preventDefault();
    if (!note.trim()) return;
    onConfirm(family.id, {
      date: '2026-11-15',
      delegateName: family.delegate?.name ?? 'المندوب',
      note: note.trim(),
    });
    setNote('');
    onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="m-auto w-[min(480px,calc(100vw-24px))] overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/55 backdrop:backdrop-blur-xs"
    >
      <div className="flex items-center justify-between border-b border-slate-200/70 bg-gradient-to-l from-amber-500/10 via-white to-white px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-600">
            <ClipboardCheck className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-bold text-slate-900">تسجيل زيارة ميدانية</h2>
            <p className="text-xs text-slate-500">{family.name} · {family.delegate?.name}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="إغلاق"
          className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200/80 bg-white text-slate-500 transition hover:bg-slate-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <form onSubmit={submit}>
        <div className="p-6">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">ملاحظات وتقرير الزيارة *</span>
            <textarea
              rows={3}
              required
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="مثال: تم تفقد الأسرة وتدقيق وضع السكن والاحتياجات..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 text-xs focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-3 focus:ring-blue-500/15"
            />
          </label>
        </div>

        <footer className="flex justify-end gap-2 border-t border-slate-200/70 bg-slate-50/70 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
          >
            إلغاء
          </button>
          <button
            type="submit"
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-gradient-to-l from-blue-600 to-indigo-600 px-5 text-xs font-semibold text-white shadow-[0_6px_16px_-6px_rgba(37,99,235,0.65)] transition hover:brightness-105"
          >
            <Check className="h-4 w-4" aria-hidden />
            <span>حفظ الزيارة</span>
          </button>
        </footer>
      </form>
    </dialog>
  );
}

export function OfficialFamiliesPrintSheet({ families, monthLabel }) {
  const totalDue = families.reduce((s, f) => s + totalEntitlement(f), 0);
  const totalPaid = families.reduce((s, f) => s + f.paidThisMonth, 0);
  const totalArrears = families.reduce((s, f) => s + f.arrears, 0);

  return (
    <div className="fam-v2-print hidden p-8 text-slate-900" dir="rtl">
      <div className="flex items-end justify-between border-b-2 border-slate-900 pb-4">
        <div>
          <p className="text-xs font-semibold text-slate-600">مؤسسة سجلات الخير — قسم الرعاية الاجتماعية</p>
          <h1 className="mt-1 text-2xl font-bold">كشف مستحقات العوائل المتعففة</h1>
        </div>
        <div className="text-end text-xs">
          <p>الشهر: <b>{monthLabel}</b></p>
          <p>العدد: <b className="tabular-nums">{families.length} عائلة</b></p>
        </div>
      </div>

      <div className="my-5 grid grid-cols-3 gap-4 rounded-xl border border-slate-300 p-4 text-xs">
        <div><span className="text-slate-500">إجمالي المستحقات:</span> <b className="block text-sm tabular-nums">{formatIQD(totalDue)}</b></div>
        <div><span className="text-slate-500">المصروف:</span> <b className="block text-sm tabular-nums">{formatIQD(totalPaid)}</b></div>
        <div><span className="text-slate-500">المتأخرات:</span> <b className="block text-sm tabular-nums">{formatIQD(totalArrears)}</b></div>
      </div>

      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-slate-100">
            <th className="border border-slate-300 p-2 text-start">رقم الملف</th>
            <th className="border border-slate-300 p-2 text-start">العائلة</th>
            <th className="border border-slate-300 p-2 text-start">التصنيف</th>
            <th className="border border-slate-300 p-2 text-start">المندوب</th>
            <th className="border border-slate-300 p-2 text-start">المنطقة</th>
            <th className="border border-slate-300 p-2 text-end">المستحق</th>
            <th className="border border-slate-300 p-2 text-end">المصروف</th>
            <th className="border border-slate-300 p-2 text-end">المتأخرات</th>
          </tr>
        </thead>
        <tbody>
          {families.map((fam) => (
            <tr key={fam.id}>
              <td className="border border-slate-300 p-2 font-mono" dir="ltr">{fam.fileNo}</td>
              <td className="border border-slate-300 p-2 font-semibold">{fam.name}</td>
              <td className="border border-slate-300 p-2">{CATEGORY_CONFIG[fam.category]?.label}</td>
              <td className="border border-slate-300 p-2">{fam.delegate?.name}</td>
              <td className="border border-slate-300 p-2">{fam.region}</td>
              <td className="border border-slate-300 p-2 text-end tabular-nums">{formatIQD(totalEntitlement(fam))}</td>
              <td className="border border-slate-300 p-2 text-end tabular-nums">{formatIQD(fam.paidThisMonth)}</td>
              <td className="border border-slate-300 p-2 text-end tabular-nums">{formatIQD(fam.arrears)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

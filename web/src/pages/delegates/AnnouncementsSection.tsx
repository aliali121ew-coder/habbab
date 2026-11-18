import { useState, type FormEvent } from 'react';
import { Check, Megaphone, PackageCheck, Plus, Trash2, X } from 'lucide-react';
import { today } from '../../format';

export type AnnouncementKind = 'materials' | 'salaries' | 'general';
export type AnnouncementStatus = 'active' | 'scheduled' | 'done';

export interface Announcement {
  id: string;
  title: string;
  details: string;
  kind: AnnouncementKind;
  status: AnnouncementStatus;
  region: string;
  date: string;
}

const STORAGE_KEY = 'ahbab:announcements-v1';

const INITIAL_ANNOUNCEMENTS: Announcement[] = [
  {
    id: 'ann-1',
    title: 'توزيع السلال الغذائية لشهر تشرين الثاني',
    details: 'تسلّم المندوبون 180 سلة غذائية متكاملة للتوزيع على العوائل المتعففة في قواطع الكاظمية والشعلة.',
    kind: 'materials',
    status: 'active',
    region: 'الكاظمية والشعلة',
    date: '2026-11-16',
  },
  {
    id: 'ann-2',
    title: 'حملة توزيع كسوة الشتاء والبطانيات',
    details: 'يرجى من مندوبي الأعظمية ومدينة الصدر تحديث قوائم الأيتام قبل يوم الخميس لتجهيز الحصص.',
    kind: 'materials',
    status: 'scheduled',
    region: 'الأعظمية ومدينة الصدر',
    date: '2026-11-18',
  },
  {
    id: 'ann-3',
    title: 'إغلاق تحصيل واشتراكات الشهر الحالي',
    details: 'تذكير لكافة المندوبين بتسليم وصولات التحصيل الشهرية للمحاسب قبل نهاية الأسبوع.',
    kind: 'salaries',
    status: 'active',
    region: 'جميع القواطع',
    date: '2026-11-15',
  },
];

function loadAnnouncements(): Announcement[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return INITIAL_ANNOUNCEMENTS;
    const parsed = JSON.parse(raw) as Announcement[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : INITIAL_ANNOUNCEMENTS;
  } catch {
    return INITIAL_ANNOUNCEMENTS;
  }
}

function saveAnnouncements(list: Announcement[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Ignore storage quota issues
  }
}

const KIND_LABELS: Record<AnnouncementKind, string> = {
  materials: 'توزيع مواد',
  salaries: 'رواتب وتحصيل',
  general: 'إعلان إداري',
};

const STATUS_META: Record<AnnouncementStatus, { label: string; bg: string; color: string }> = {
  active: { label: 'جاري التنفيذ', bg: 'var(--fp-emerald-soft)', color: 'var(--fp-emerald)' },
  scheduled: { label: 'مجدول قريباً', bg: 'var(--fp-amber-soft)', color: 'var(--fp-amber)' },
  done: { label: 'مكتمل', bg: 'var(--fp-muted-2)', color: 'var(--fp-ink-3)' },
};

export function AnnouncementsSection({ isAdmin }: { isAdmin: boolean }) {
  const [items, setItems] = useState<Announcement[]>(() => loadAnnouncements());
  const [openAdd, setOpenAdd] = useState(false);

  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [kind, setKind] = useState<AnnouncementKind>('materials');
  const [status, setStatus] = useState<AnnouncementStatus>('active');
  const [region, setRegion] = useState('جميع القواطع');

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const next: Announcement = {
      id: `ann-${Date.now()}`,
      title: title.trim(),
      details: details.trim() || 'يرجى المتابعة من قبل المندوبين المعنيين.',
      kind,
      status,
      region: region.trim() || 'جميع القواطع',
      date: today(),
    };
    const updated = [next, ...items];
    setItems(updated);
    saveAnnouncements(updated);
    setTitle('');
    setDetails('');
    setOpenAdd(false);
  };

  const handleRemove = (id: string) => {
    const updated = items.filter((item) => item.id !== id);
    setItems(updated);
    saveAnnouncements(updated);
  };

  const cycleStatus = (id: string) => {
    const order: AnnouncementStatus[] = ['active', 'scheduled', 'done'];
    const updated = items.map((item) => {
      if (item.id !== id) return item;
      const nextStatus = order[(order.indexOf(item.status) + 1) % order.length];
      return { ...item, status: nextStatus };
    });
    setItems(updated);
    saveAnnouncements(updated);
  };

  return (
    <section aria-label="الإعلانات والتوزيعات" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className="inline-flex h-8 w-8 items-center justify-center rounded-xl"
            style={{ backgroundColor: 'var(--fp-primary-soft)', color: 'var(--fp-primary)' }}
            aria-hidden
          >
            <Megaphone className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-base font-bold" style={{ color: 'var(--fp-ink)' }}>
              الإعلانات وتوزيع المواد
            </h2>
            <p className="text-xs" style={{ color: 'var(--fp-ink-3)' }}>
              إشعارات حملات توزيع المواد الغذائية والكسوة والتنبيهات للمندوبين
            </p>
          </div>
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={() => setOpenAdd(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition hover:opacity-85"
            style={{
              backgroundColor: 'var(--fp-card)',
              borderColor: 'var(--fp-border)',
              color: 'var(--fp-primary)',
            }}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            <span>إعلان جديد</span>
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div
          className="fp-card flex items-center justify-center p-6 text-xs"
          style={{ color: 'var(--fp-ink-3)' }}
        >
          لا توجد إعلانات توزيع حالياً.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-3">
          {items.map((item) => {
            const st = STATUS_META[item.status];
            return (
              <article
                key={item.id}
                className="fp-card fp-card-interactive flex flex-col justify-between gap-3 p-4"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold"
                      style={{ backgroundColor: 'var(--fp-primary-soft)', color: 'var(--fp-primary)' }}
                    >
                      <PackageCheck className="h-3 w-3" aria-hidden />
                      {KIND_LABELS[item.kind]}
                    </span>

                    <button
                      type="button"
                      onClick={() => isAdmin && cycleStatus(item.id)}
                      title={isAdmin ? 'اضغط لتغيير الحالة' : undefined}
                      className="rounded-full px-2.5 py-0.5 text-[11px] font-bold transition"
                      style={{ backgroundColor: st.bg, color: st.color }}
                    >
                      {st.label}
                    </button>
                  </div>

                  <h3 className="mt-2.5 text-sm font-bold leading-snug" style={{ color: 'var(--fp-ink)' }}>
                    {item.title}
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--fp-ink-2)' }}>
                    {item.details}
                  </p>
                </div>

                <div
                  className="flex items-center justify-between gap-2 border-t pt-2.5 text-[11px]"
                  style={{ borderColor: 'var(--fp-border)', color: 'var(--fp-ink-3)' }}
                >
                  <span>{item.region} · <bdi dir="ltr">{item.date}</bdi></span>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => handleRemove(item.id)}
                      aria-label={`حذف إعلان ${item.title}`}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-lg transition hover:opacity-75"
                      style={{ color: 'var(--fp-rose)' }}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {openAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-xs">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="نشر إعلان أو توزيع مواد"
            className="fp-card w-full max-w-md overflow-hidden"
          >
            <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: 'var(--fp-border)' }}>
              <h3 className="text-sm font-bold" style={{ color: 'var(--fp-ink)' }}>إضافة إعلان / حملة توزيع</h3>
              <button
                type="button"
                onClick={() => setOpenAdd(false)}
                aria-label="إغلاق"
                style={{ color: 'var(--fp-ink-3)' }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-3.5 p-5 text-xs">
              <label className="block">
                <span className="mb-1 block font-semibold" style={{ color: 'var(--fp-ink-2)' }}>عنوان الإعلان *</span>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="مثال: توزيع سلات غذائية — قاطع الكاظمية"
                  className="h-10 w-full rounded-xl border px-3"
                  style={{ backgroundColor: 'var(--fp-muted)', borderColor: 'var(--fp-border)', color: 'var(--fp-ink)' }}
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block font-semibold" style={{ color: 'var(--fp-ink-2)' }}>النوع</span>
                  <select
                    value={kind}
                    onChange={(e) => setKind(e.target.value as AnnouncementKind)}
                    className="h-10 w-full rounded-xl border px-3 font-semibold"
                    style={{ backgroundColor: 'var(--fp-muted)', borderColor: 'var(--fp-border)', color: 'var(--fp-ink)' }}
                  >
                    <option value="materials">توزيع مواد</option>
                    <option value="salaries">رواتب وتحصيل</option>
                    <option value="general">إعلان إداري</option>
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block font-semibold" style={{ color: 'var(--fp-ink-2)' }}>الحالة</span>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as AnnouncementStatus)}
                    className="h-10 w-full rounded-xl border px-3 font-semibold"
                    style={{ backgroundColor: 'var(--fp-muted)', borderColor: 'var(--fp-border)', color: 'var(--fp-ink)' }}
                  >
                    <option value="active">جاري التنفيذ</option>
                    <option value="scheduled">مجدول قريباً</option>
                    <option value="done">مكتمل</option>
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="mb-1 block font-semibold" style={{ color: 'var(--fp-ink-2)' }}>القاطع / المنطقة</span>
                <input
                  type="text"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  className="h-10 w-full rounded-xl border px-3"
                  style={{ backgroundColor: 'var(--fp-muted)', borderColor: 'var(--fp-border)', color: 'var(--fp-ink)' }}
                />
              </label>

              <label className="block">
                <span className="mb-1 block font-semibold" style={{ color: 'var(--fp-ink-2)' }}>التفاصيل</span>
                <textarea
                  rows={3}
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder="تفاصيل المواد الموزعة أو التعليمات للمندوبين..."
                  className="w-full rounded-xl border p-3"
                  style={{ backgroundColor: 'var(--fp-muted)', borderColor: 'var(--fp-border)', color: 'var(--fp-ink)' }}
                />
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setOpenAdd(false)}
                  className="h-9 rounded-xl border px-4 font-semibold"
                  style={{ borderColor: 'var(--fp-border)', color: 'var(--fp-ink-2)' }}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="inline-flex h-9 items-center gap-1 rounded-xl px-4 font-semibold text-white"
                  style={{ backgroundColor: 'var(--fp-primary)' }}
                >
                  <Check className="h-3.5 w-3.5" aria-hidden /> نشر الإعلان
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

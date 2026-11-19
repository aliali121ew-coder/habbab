import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, Camera, Crop, IdCard, MapPin, Phone, Save, UserRound, UsersRound, X } from 'lucide-react';
import { api, type DelegateProfile } from '../../api';
import { formatNumber, initialOf } from '../../format';
import { useDelegatePhoto } from '../subscribers/useDelegatePhoto';
import { PhotoFramer } from '../../components/PhotoFramer';

interface Props {
  delegateId: number;
  onClose: () => void;
  onChanged: () => void;
}

interface Draft {
  full_name: string;
  phone: string;
  address: string;
  birth_date: string;
}

const toDraft = (profile: DelegateProfile): Draft => ({
  full_name: profile.full_name,
  phone: profile.phone ?? '',
  address: profile.address ?? '',
  birth_date: profile.birth_date ?? '',
});

const CURRENT_YEAR = new Date().getUTCFullYear();
const YEARS = Array.from({ length: CURRENT_YEAR - 1924 }, (_, idx) => CURRENT_YEAR - idx);
const MONTHS = Array.from({ length: 12 }, (_, idx) => idx + 1);
const pad2 = (n: number) => String(n).padStart(2, '0');
const daysInMonth = (year: number, month: number) => new Date(year || 2000, month || 1, 0).getDate();

function parseBirthDate(value: string): { year: string; month: string; day: string } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return { year: '', month: '', day: '' };
  return {
    year: String(Number(match[1])),
    month: String(Number(match[2])),
    day: String(Number(match[3])),
  };
}

function BirthDatePicker({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const initial = parseBirthDate(value);
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);
  const [day, setDay] = useState(initial.day);

  useEffect(() => {
    const parsed = parseBirthDate(value);
    setYear(parsed.year);
    setMonth(parsed.month);
    setDay(parsed.day);
  }, [value]);

  const maxDay = daysInMonth(Number(year), Number(month));
  const days = Array.from({ length: maxDay }, (_, idx) => idx + 1);

  const update = (nextYear: string, nextMonth: string, nextDay: string) => {
    const clampedDay = nextDay
      ? String(Math.min(Number(nextDay), daysInMonth(Number(nextYear), Number(nextMonth))))
      : '';
    setYear(nextYear);
    setMonth(nextMonth);
    setDay(clampedDay);
    if (nextYear && nextMonth && clampedDay) {
      onChange(`${nextYear}-${pad2(Number(nextMonth))}-${pad2(Number(clampedDay))}`);
    } else if (!nextYear && !nextMonth && !clampedDay) {
      onChange('');
    }
  };

  return (
    <div className="birth-date-grid" dir="ltr">
      <div className="birth-date-col">
        <span className="birth-date-sub">السنة</span>
        <select
          aria-label="سنة الميلاد"
          value={year}
          onChange={(e) => update(e.target.value, month, day)}
        >
          <option value="">YYYY</option>
          {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      <div className="birth-date-col">
        <span className="birth-date-sub">الشهر</span>
        <select
          aria-label="شهر الميلاد"
          value={month}
          onChange={(e) => update(year, e.target.value, day)}
        >
          <option value="">MM</option>
          {MONTHS.map((m) => <option key={m} value={m}>{pad2(m)}</option>)}
        </select>
      </div>
      <div className="birth-date-col">
        <span className="birth-date-sub">اليوم</span>
        <select
          aria-label="يوم الميلاد"
          value={day}
          onChange={(e) => update(year, month, e.target.value)}
        >
          <option value="">DD</option>
          {days.map((d) => <option key={d} value={d}>{pad2(d)}</option>)}
        </select>
      </div>
    </div>
  );
}

function FieldCard({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <label className="profile-field">
      <span className="profile-field-label"><span aria-hidden>{icon}</span>{label}</span>
      {children}
    </label>
  );
}

// The delegate's profile, sliding in from the right: photo and figures on a dark band,
// then one card per detail, editable in place.
export function DelegateProfileDrawer({ delegateId, onClose, onChanged }: Props) {
  const [profile, setProfile] = useState<DelegateProfile | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const load = () => api<DelegateProfile>(`/collections/delegates/${delegateId}/profile`)
    .then((data) => { setProfile(data); setDraft(toDraft(data)); })
    .catch((failure) => setError((failure as Error).message));

  useEffect(() => { void load(); }, [delegateId]);
  const { uploading, uploadError, framing, pickPhoto, reframe, uploadFramed, cancelFraming } =
    useDelegatePhoto(() => { void load(); onChanged(); });

  useEffect(() => {
    closeRef.current?.focus();
    // While the photo framer is open, Escape is the framer's (it closes itself, not the profile).
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !framing) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, framing]);

  const dirty = !!(profile && draft && JSON.stringify(toDraft(profile)) !== JSON.stringify(draft));
  const set = (key: keyof Draft) => (event: { target: { value: string } }) => setDraft((current) => current && { ...current, [key]: event.target.value });

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft || !dirty || saving) return;
    setSaving(true);
    setError('');
    try {
      await api(`/collections/delegates/${delegateId}/profile`, {
        method: 'PATCH',
        body: draft,
      });
      onChanged();
      // Saved: the drawer has done its job.
      onClose();
    } catch (failure) {
      setError((failure as Error).message);
      setSaving(false);
    }
  };

  return createPortal(
    <>
    <div className="profile-overlay" onClick={onClose}>
      <aside className="profile-drawer" role="dialog" aria-modal="true" aria-label="الملف الشخصي للمندوب" onClick={(event) => event.stopPropagation()}>
        <header className={profile?.avatar_url ? 'profile-hero has-photo' : 'profile-hero'}>
          {/* With a photo the whole picture shows, scaled down to fit the band, over a blurred
              copy of itself that fills the width. The figures sit in a strip below, off the photo. */}
          {profile?.avatar_url && <img className="profile-hero-backdrop" src={profile.avatar_url} alt="" aria-hidden />}
          {profile?.avatar_url && <img className="profile-hero-photo" src={profile.avatar_url} alt={`صورة ${profile.full_name}`} />}
          <div className="profile-hero-top">
            <span className="profile-badge" aria-hidden><IdCard size={20} /></span>
            <div>
              <small>الملف الشخصي</small>
              <h2>{profile?.full_name ?? '…'}</h2>
            </div>
            <button ref={closeRef} type="button" className="profile-close" aria-label="إغلاق" onClick={onClose}><X size={18} aria-hidden /></button>
          </div>

          <div className="profile-photo">
            {!profile?.avatar_url && <span aria-hidden>{profile ? initialOf(profile.full_name) : ''}</span>}
            <div className="profile-photo-actions">
              <button type="button" className="profile-photo-btn" disabled={uploading || !profile} onClick={() => fileRef.current?.click()}>
                <Camera size={14} aria-hidden /> {uploading ? 'جارٍ الرفع…' : 'صورة المندوب'}
              </button>
              {profile?.avatar_url && (
                <button type="button" className="profile-photo-btn" disabled={uploading} onClick={() => reframe(profile.avatar_url!)}>
                  <Crop size={14} aria-hidden /> ضبط الصورة
                </button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickPhoto} />
          </div>

        </header>
        <div className="profile-strip">
          <dl className="profile-tiles">
            <div><dt><UsersRound size={14} aria-hidden /> الأحياء</dt><dd><bdi>{profile ? formatNumber(profile.alive) : '—'}</bdi></dd></div>
            <div><dt><UserRound size={14} aria-hidden /> الأموات</dt><dd><bdi>{profile ? formatNumber(profile.deceased) : '—'}</bdi></dd></div>
          </dl>
        </div>

        <form className="profile-form" onSubmit={save}>
          <div className="profile-fields">
            {(error || uploadError) && <p className="form-error" role="alert">{error || uploadError}</p>}
            {draft ? (
              <>
                <FieldCard icon={<UserRound size={15} />} label="الاسم الكامل">
                  <input value={draft.full_name} onChange={set('full_name')} required minLength={3} maxLength={120} />
                </FieldCard>
                <FieldCard icon={<Phone size={15} />} label="رقم الهاتف">
                  <input type="tel" inputMode="tel" dir="ltr" value={draft.phone} onChange={set('phone')} placeholder="07XXXXXXXXX" maxLength={20} />
                </FieldCard>
                <FieldCard icon={<MapPin size={15} />} label="العنوان">
                  <input value={draft.address} onChange={set('address')} placeholder="المحافظة - القضاء - الحي" maxLength={200} />
                </FieldCard>
                <div className="profile-field">
                  <span className="profile-field-label"><span aria-hidden><CalendarDays size={15} /></span>المواليد</span>
                  <BirthDatePicker
                    value={draft.birth_date}
                    onChange={(next) => setDraft((current) => current && { ...current, birth_date: next })}
                  />
                </div>
              </>
            ) : !error && [0, 1, 2, 3].map((key) => <div key={key} className="profile-field skeleton" />)}
          </div>

          <footer className="profile-actions">
            <button type="button" className="btn" onClick={onClose}>إلغاء</button>
            <button type="submit" className="btn primary" disabled={!dirty || saving}>
              <Save size={16} aria-hidden /> {saving ? 'جارٍ الحفظ…' : 'حفظ التفاصيل'}
            </button>
          </footer>
        </form>
      </aside>
    </div>
    {/* Outside the overlay, so a click in the framer never reaches the overlay's close. */}
    {framing && (
      <PhotoFramer source={framing} onCancel={cancelFraming} onDone={(framed) => uploadFramed(delegateId, framed)} />
    )}
    </>,
    document.body,
  );
}

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, Camera, IdCard, MapPin, Phone, Save, UserRound, UsersRound, X } from 'lucide-react';
import { api, type DelegateProfile } from '../../api';
import { formatNumber, initialOf } from '../../format';
import { useDelegatePhoto } from '../subscribers/useDelegatePhoto';

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
  joined_year: string;
}

const toDraft = (profile: DelegateProfile): Draft => ({
  full_name: profile.full_name,
  phone: profile.phone ?? '',
  address: profile.address ?? '',
  birth_date: profile.birth_date ?? '',
  joined_year: String(profile.joined_year),
});

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
  const { uploading, uploadError, changePhoto } = useDelegatePhoto(() => { void load(); onChanged(); });

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

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
        body: { ...draft, joined_year: draft.joined_year ? Number(draft.joined_year) : null },
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
            <button type="button" className="profile-photo-btn" disabled={uploading || !profile} onClick={() => fileRef.current?.click()}>
              <Camera size={14} aria-hidden /> {uploading ? 'جارٍ الرفع…' : 'صورة المندوب'}
            </button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(event) => changePhoto(delegateId, event)} />
          </div>

        </header>
        <div className="profile-strip">
          <dl className="profile-tiles">
            <div><dt><UsersRound size={14} aria-hidden /> الأحياء</dt><dd><bdi>{profile ? formatNumber(profile.alive) : '—'}</bdi></dd></div>
            <div><dt><UserRound size={14} aria-hidden /> الأموات</dt><dd><bdi>{profile ? formatNumber(profile.deceased) : '—'}</bdi></dd></div>
            <div><dt><CalendarDays size={14} aria-hidden /> منذ</dt><dd><bdi>{profile ? profile.joined_year : '—'}</bdi></dd></div>
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
                <FieldCard icon={<CalendarDays size={15} />} label="المواليد">
                  <input type="date" dir="ltr" value={draft.birth_date} onChange={set('birth_date')} max={new Date().toISOString().slice(0, 10)} />
                </FieldCard>
                <FieldCard icon={<IdCard size={15} />} label="سنة الاشتراك">
                  <input type="number" inputMode="numeric" dir="ltr" value={draft.joined_year} onChange={set('joined_year')} min={1990} max={new Date().getUTCFullYear()} />
                </FieldCard>
              </>
            ) : !error && [0, 1, 2, 3, 4].map((key) => <div key={key} className="profile-field skeleton" />)}
          </div>

          <footer className="profile-actions">
            <button type="button" className="btn" onClick={onClose}>إلغاء</button>
            <button type="submit" className="btn primary" disabled={!dirty || saving}>
              <Save size={16} aria-hidden /> {saving ? 'جارٍ الحفظ…' : 'حفظ التفاصيل'}
            </button>
          </footer>
        </form>
      </aside>
    </div>,
    document.body,
  );
}

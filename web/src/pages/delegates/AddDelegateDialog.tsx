import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type MouseEvent, type ReactNode } from 'react';
import { AtSign, CalendarDays, Camera, ChevronDown, Crop, Eye, EyeOff, HeartHandshake, Lock, MapPin, Phone, Trash2, UserCheck, UserMinus, UserPlus, UserRound, Users, X } from 'lucide-react';
import { api } from '../../api';
import { formatNumber, initialOf } from '../../format';
import { PhotoFramer } from '../../components/PhotoFramer';

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

function Field({ icon, label, hint, children }: { icon: ReactNode; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="add-field">
      <span className="add-field-label"><span aria-hidden>{icon}</span>{label}{hint && <small>{hint}</small>}</span>
      {children}
    </div>
  );
}

// Centered glass-backdrop dialog for adding a delegate with profile details and subscriber counts per category.
export function AddDelegateDialog({ onClose, onCreated }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fullName, setFullName] = useState('');
  const [age, setAge] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  // The framed square (already sized for upload) and the original, kept to frame it again.
  const [photoFile, setPhotoFile] = useState<Blob | null>(null);
  const [photoOriginal, setPhotoOriginal] = useState<Blob | null>(null);
  const [framing, setFraming] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');

  const [hasAlive, setHasAlive] = useState(true);
  const [hasDeceased, setHasDeceased] = useState(false);
  const [aliveCount, setAliveCount] = useState('0');
  const [deceasedCount, setDeceasedCount] = useState('0');

  const [showAccount, setShowAccount] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  // A chosen photo goes to the framer first; the preview shows what will be saved.
  const handlePhotoChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setPhotoOriginal(file);
    setFraming(file);
  };

  const acceptFramed = (framed: Blob) => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPhotoFile(framed);
    setPreviewUrl(URL.createObjectURL(framed));
    setFraming(null);
  };

  const clearPhoto = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPhotoFile(null);
    setPhotoOriginal(null);
    setPreviewUrl('');
  };

  const handleBackdropClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === ref.current) ref.current?.close();
  };

  const totalSubscribers = (hasAlive ? Math.max(0, Number(aliveCount) || 0) : 0)
    + (hasDeceased ? Math.max(0, Number(deceasedCount) || 0) : 0);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!hasAlive && !hasDeceased) {
      setError('اختر فئة اشتراك واحدة على الأقل (الأحياء أو الأموات).');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const compressedPhoto = photoFile;
      const created = await api<{ id: number }>('/collections/delegates', {
        method: 'POST',
        body: {
          full_name: fullName.trim(),
          age: age.trim() ? Number(age) : null,
          phone: phone.trim() || null,
          address: address.trim() || null,
          alive_count: hasAlive ? Math.max(0, Number(aliveCount) || 0) : 0,
          deceased_count: hasDeceased ? Math.max(0, Number(deceasedCount) || 0) : 0,
          username: username.trim(),
          password,
        },
      });
      if (compressedPhoto) {
        const form = new FormData();
        form.set('image', compressedPhoto, 'image');
        await api(`/collections/delegates/${created.id}/photo`, { method: 'POST', form });
      }
      onCreated();
    } catch (failure) {
      setError((failure as Error).message);
      setBusy(false);
    }
  };

  return (
    <dialog
      ref={ref}
      className="add-dialog delegate-add-dialog"
      aria-labelledby="add-delegate-title"
      onClick={handleBackdropClick}
      onClose={onClose}
      // Escape while framing closes only the framer.
      onCancel={(event) => { if (framing) event.preventDefault(); }}
    >
      <form onSubmit={submit}>
        <header className="add-head">
          <span className="add-badge" aria-hidden><UserPlus size={20} /></span>
          <div>
            <h2 id="add-delegate-title">إضافة مندوب جديد</h2>
            <p>تفاصيل المندوب وفئة الاشتراك وعدد المشتركين</p>
          </div>
          <button type="button" className="add-close" aria-label="إغلاق" onClick={() => ref.current?.close()}>
            <X size={18} aria-hidden />
          </button>
        </header>

        <div className="add-body">
          <div className="delegate-photo-picker">
            <div className="delegate-photo-preview" aria-hidden={!previewUrl}>
              {previewUrl
                ? <img src={previewUrl} alt="معاينة صورة المندوب" />
                : <span>{fullName.trim() ? initialOf(fullName.trim()) : <Camera size={22} />}</span>}
            </div>
            <div className="delegate-photo-meta">
              <strong>صورة المندوب</strong>
              <small>اختيارية — تضبط إطارها قبل الحفظ</small>
              <div className="delegate-photo-actions">
                <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
                  <Camera size={15} aria-hidden />
                  <span>{previewUrl ? 'تغيير الصورة' : 'اختيار صورة'}</span>
                </button>
                {previewUrl && photoOriginal && (
                  <button type="button" className="btn" onClick={() => setFraming(photoOriginal)}>
                    <Crop size={15} aria-hidden />
                    <span>ضبط الصورة</span>
                  </button>
                )}
                {previewUrl && (
                  <button type="button" className="btn danger" aria-label="إزالة الصورة" onClick={clearPhoto}>
                    <Trash2 size={15} aria-hidden />
                    <span>إزالة</span>
                  </button>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={handlePhotoChange} />
              {framing && (
                <PhotoFramer source={framing} container={ref.current} onCancel={() => setFraming(null)} onDone={acceptFramed} />
              )}
            </div>
          </div>

          <Field icon={<UserRound size={15} />} label="الاسم">
            <input
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="مثال: مندوب الكرادة أو الاسم الكامل"
              autoComplete="off"
              required
              minLength={3}
              maxLength={120}
              autoFocus
            />
          </Field>

          <div className="delegate-add-grid">
            <Field icon={<CalendarDays size={15} />} label="العمر" hint="سنة">
              <input
                type="number"
                inputMode="numeric"
                dir="ltr"
                value={age}
                onChange={(event) => setAge(event.target.value)}
                placeholder="35"
                min={15}
                max={120}
              />
            </Field>

            <Field icon={<Phone size={15} />} label="رقم الهاتف">
              <input
                type="tel"
                inputMode="tel"
                dir="ltr"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="07XXXXXXXXX"
                autoComplete="off"
                maxLength={20}
              />
            </Field>
          </div>

          <Field icon={<MapPin size={15} />} label="العنوان">
            <input
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="المحافظة - القضاء - الحي"
              autoComplete="off"
              maxLength={200}
            />
          </Field>

          <div className="add-field">
            <span className="add-field-label">
              <span aria-hidden><HeartHandshake size={15} /></span>
              فئة الاشتراك وعدد المشتركين
              <small>الإجمالي: <bdi>{formatNumber(totalSubscribers)}</bdi></small>
            </span>

            <div className="delegate-tiers-grid">
              <div className={`delegate-tier-card ${hasAlive ? 'is-active' : ''}`}>
                <button
                  type="button"
                  className="delegate-tier-toggle"
                  aria-pressed={hasAlive}
                  onClick={() => setHasAlive((prev) => !prev)}
                >
                  <UserCheck size={16} aria-hidden />
                  <span>الأحياء</span>
                </button>
                {hasAlive && (
                  <label className="delegate-tier-count">
                    <span>عدد المشتركين</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      dir="ltr"
                      min={0}
                      max={100000}
                      value={aliveCount}
                      onChange={(event) => setAliveCount(event.target.value)}
                    />
                  </label>
                )}
              </div>

              <div className={`delegate-tier-card ${hasDeceased ? 'is-active' : ''}`}>
                <button
                  type="button"
                  className="delegate-tier-toggle"
                  aria-pressed={hasDeceased}
                  onClick={() => setHasDeceased((prev) => !prev)}
                >
                  <UserMinus size={16} aria-hidden />
                  <span>الأموات</span>
                </button>
                {hasDeceased && (
                  <label className="delegate-tier-count">
                    <span>عدد المشتركين</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      dir="ltr"
                      min={0}
                      max={100000}
                      value={deceasedCount}
                      onChange={(event) => setDeceasedCount(event.target.value)}
                    />
                  </label>
                )}
              </div>
            </div>
          </div>

          <div className="delegate-account-box">
            <button
              type="button"
              className="delegate-account-toggle"
              aria-expanded={showAccount}
              onClick={() => setShowAccount((prev) => !prev)}
            >
              <Users size={15} aria-hidden />
              <span>بيانات تسجيل الدخول (اختياري)</span>
              <ChevronDown size={15} className={showAccount ? 'is-open' : ''} aria-hidden />
            </button>

            {showAccount && (
              <div className="delegate-add-grid">
                <Field icon={<AtSign size={15} />} label="اسم المستخدم" hint="3–32">
                  <input
                    dir="ltr"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    placeholder="delegate_name"
                    autoComplete="off"
                    pattern="[a-zA-Z0-9._-]{3,32}"
                    title="3 إلى 32 حرفاً: أحرف لاتينية وأرقام و . و _ و -"
                    minLength={3}
                    maxLength={32}
                  />
                </Field>

                <Field icon={<Lock size={15} />} label="كلمة المرور" hint="10+ أحرف">
                  <div className="add-pass-row">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      dir="ltr"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="••••••••••"
                      autoComplete="new-password"
                      minLength={10}
                      maxLength={128}
                    />
                    <button
                      type="button"
                      className="add-pass-toggle"
                      aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                      onClick={() => setShowPassword((prev) => !prev)}
                    >
                      {showPassword ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
                    </button>
                  </div>
                </Field>
              </div>
            )}
          </div>

          {error && <p className="form-error" role="alert">{error}</p>}
        </div>

        <footer className="add-actions">
          <button type="button" className="btn" onClick={() => ref.current?.close()}>إلغاء</button>
          <button type="submit" className="btn primary" disabled={busy}>
            <UserPlus size={17} aria-hidden /> {busy ? 'جارٍ الإضافة…' : 'إضافة المندوب'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}

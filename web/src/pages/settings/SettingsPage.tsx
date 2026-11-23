import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Building2, ImageUp, Loader2, Settings, Trash2 } from 'lucide-react';
import { api } from '../../api';
import { useBranding } from '../../branding';
import { compressBrandImage } from '../../image';

type Kind = 'logo' | 'stamp' | 'signature' | 'signature2';

const SLOTS: { kind: Kind; label: string; hint: string; side: number }[] = [
  { kind: 'logo', label: 'الشعار', hint: 'في رأس التطبيق وكل الأوراق', side: 800 },
  { kind: 'stamp', label: 'الختم', hint: 'بخلفية شفافة إن أمكن', side: 800 },
  { kind: 'signature', label: 'توقيع المحاسب', hint: 'حبر فقط بخلفية شفافة', side: 700 },
  { kind: 'signature2', label: 'توقيع المدير', hint: 'حبر فقط بخلفية شفافة', side: 700 },
];

// One image of the letterhead: its preview on a checkered ground (so a transparent stamp shows
// as it will print), and buttons to upload, replace or remove it.
function ImageSlot({ kind, label, hint, side, url, onChanged }: { kind: Kind; label: string; hint: string; side: number; url: string | null; onChanged: () => Promise<void> }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.set('image', await compressBrandImage(file, side), 'image');
      await api(`/branding/image/${kind}`, { method: 'PUT', form });
      await onChanged();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!window.confirm(`إزالة ${label}؟ يُترك مكانه فارغاً في الأوراق المطبوعة.`)) return;
    setBusy(true);
    setError('');
    try {
      await api(`/branding/image/${kind}`, { method: 'DELETE' });
      await onChanged();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="set-slot">
      <div className={`set-slot-preview${kind === 'logo' ? ' is-round' : ''}`}>
        {busy ? <Loader2 className="set-spin" size={22} aria-label="جارٍ الرفع" />
          : url ? <img src={url} alt={label} /> : <span>لا توجد صورة</span>}
      </div>
      <div className="set-slot-text">
        <b>{label}</b>
        <small>{hint}</small>
      </div>
      <div className="set-slot-actions">
        <button type="button" className="btn" disabled={busy} onClick={() => input.current?.click()}>
          <ImageUp size={15} aria-hidden /> {url ? 'تغيير' : 'رفع'}
        </button>
        {url && (
          <button type="button" className="btn danger" disabled={busy} onClick={() => void remove()} aria-label={`إزالة ${label}`}>
            <Trash2 size={15} aria-hidden />
          </button>
        )}
      </div>
      {error && <p className="set-error" role="alert">{error}</p>}
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden
        onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; void upload(file); }} />
    </div>
  );
}

// الإعدادات: the foundation's letterhead, printed on its sheets and receipts. The manager of the
// foundation edits it; the name itself is set by the system admin.
export function SettingsPage() {
  const brand = useBranding();
  const [address, setAddress] = useState('');
  const [stampPlace, setStampPlace] = useState('');
  const [phone1, setPhone1] = useState('');
  const [phone2, setPhone2] = useState('');
  const [accountant, setAccountant] = useState('');
  const [manager, setManager] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'saved'>('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    setAddress(brand.address ?? '');
    setStampPlace(brand.stamp_place ?? '');
    setPhone1(brand.phones[0] ?? '');
    setPhone2(brand.phones[1] ?? '');
    setAccountant(brand.accountant_name ?? '');
    setManager(brand.manager_name ?? '');
  }, [brand.address, brand.stamp_place, brand.phones, brand.accountant_name, brand.manager_name]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setState('busy');
    setError('');
    try {
      await api('/branding', {
        method: 'PATCH',
        body: {
          address: address.trim() || null,
          stamp_place: stampPlace.trim() || null,
          phones: [phone1, phone2].map((p) => p.trim()).filter(Boolean),
          accountant_name: accountant.trim() || null,
          manager_name: manager.trim() || null,
        },
      });
      await brand.reload();
      setState('saved');
    } catch (failure) {
      setError((failure as Error).message);
      setState('idle');
    }
  };

  const images: Record<Kind, string | null> = { logo: brand.logo, stamp: brand.stamp, signature: brand.signature, signature2: brand.signature2 };

  return (
    <div className="set">
      <header className="set-head">
        <span className="set-head-icon" aria-hidden><Settings size={22} /></span>
        <div>
          <h1>الإعدادات</h1>
          <p>الورقة الرسمية للمؤسسة: تظهر في كل ما يُطبع ويُرسل</p>
        </div>
      </header>

      <section className="set-card" aria-labelledby="set-images">
        <h2 id="set-images">الشعار والختم والتواقيع</h2>
        <div className="set-slots">
          {SLOTS.map((slot) => <ImageSlot key={slot.kind} {...slot} url={images[slot.kind]} onChanged={brand.reload} />)}
        </div>
      </section>

      <form className="set-card" onSubmit={save} aria-labelledby="set-details">
        <h2 id="set-details">بيانات الطباعة</h2>
        <div className="set-name">
          <Building2 size={16} aria-hidden />
          <span><b>{brand.name}</b><small>اسم المؤسسة يغيّره مدير النظام</small></span>
        </div>
        <label className="field">
          <span>العنوان الكامل</span>
          <input value={address} onChange={(event) => { setAddress(event.target.value); setState('idle'); }} maxLength={160} placeholder="المحافظة - القضاء - الحي" />
        </label>
        <div className="set-row">
          <label className="field">
            <span>المكان تحت الختم</span>
            <input value={stampPlace} onChange={(event) => { setStampPlace(event.target.value); setState('idle'); }} maxLength={60} placeholder="المحافظة - القضاء" />
          </label>
          <label className="field">
            <span>هاتف 1</span>
            <input dir="ltr" inputMode="tel" value={phone1} onChange={(event) => { setPhone1(event.target.value); setState('idle'); }} maxLength={20} />
          </label>
          <label className="field">
            <span>هاتف 2</span>
            <input dir="ltr" inputMode="tel" value={phone2} onChange={(event) => { setPhone2(event.target.value); setState('idle'); }} maxLength={20} />
          </label>
        </div>
        <div className="set-row two">
          <label className="field">
            <span>اسم المحاسب (فوق توقيعه)</span>
            <input value={accountant} onChange={(event) => { setAccountant(event.target.value); setState('idle'); }} maxLength={80} />
          </label>
          <label className="field">
            <span>اسم مدير المؤسسة (فوق توقيعه)</span>
            <input value={manager} onChange={(event) => { setManager(event.target.value); setState('idle'); }} maxLength={80} />
          </label>
        </div>
        {error && <p className="set-error" role="alert">{error}</p>}
        <div className="set-actions">
          {state === 'saved' && <span className="set-saved" role="status">تم الحفظ</span>}
          <button type="submit" className="btn primary" disabled={state === 'busy'}>{state === 'busy' ? 'جارٍ الحفظ…' : 'حفظ'}</button>
        </div>
      </form>
    </div>
  );
}

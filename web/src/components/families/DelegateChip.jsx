import { useEffect, useRef, useState } from 'react';
import { Camera, MessageCircle, Phone } from 'lucide-react';
import { api } from '../../api';
import { whatsappUrl } from '../../utils/format';

const AVATAR_TONES = [
  'bg-blue-600/10 text-blue-700',
  'bg-indigo-600/10 text-indigo-700',
  'bg-sky-600/10 text-sky-700',
  'bg-emerald-600/10 text-emerald-700',
  'bg-slate-600/10 text-slate-700',
];

const PHOTO_STORE_KEY = 'ahbab:delegate-photos-v1';
const PHOTO_EVENT = 'ahbab:delegate-photos-changed';

let serverPhotoCache = null;
let serverPhotoPromise = null;

function normName(name) {
  return String(name ?? '').trim().replace(/\s+/g, ' ');
}

function loadLocalPhotos() {
  try {
    return JSON.parse(window.localStorage.getItem(PHOTO_STORE_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function saveLocalPhoto(key, dataUrl) {
  try {
    const map = loadLocalPhotos();
    map[key] = dataUrl;
    window.localStorage.setItem(PHOTO_STORE_KEY, JSON.stringify(map));
    window.dispatchEvent(new Event(PHOTO_EVENT));
  } catch {
    // Ignore storage quota errors.
  }
}

function loadServerPhotos() {
  if (serverPhotoCache) return Promise.resolve(serverPhotoCache);
  if (!serverPhotoPromise) {
    serverPhotoPromise = api('/collections/overview')
      .then((overview) => {
        const byName = {};
        const byId = {};
        for (const d of overview?.delegates ?? []) {
          if (d?.avatar_url) {
            if (d.full_name) byName[normName(d.full_name)] = d.avatar_url;
            if (d.id != null) byId[String(d.id)] = d.avatar_url;
          }
        }
        serverPhotoCache = { byName, byId };
        return serverPhotoCache;
      })
      .catch(() => {
        serverPhotoCache = { byName: {}, byId: {} };
        return serverPhotoCache;
      });
  }
  return serverPhotoPromise;
}

function compressAvatar(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('تعذّر قراءة الصورة'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('ملف غير صالح'));
      img.onload = () => {
        const size = 160;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const min = Math.min(img.width, img.height);
        const sx = (img.width - min) / 2;
        const sy = (img.height - min) / 2;
        ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export function DelegateAvatar({ delegate, size = 'sm', editable = false }) {
  const [serverPhotos, setServerPhotos] = useState(() => serverPhotoCache ?? { byName: {}, byId: {} });
  const [localPhotos, setLocalPhotos] = useState(() => loadLocalPhotos());
  const [imgFailed, setImgFailed] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    let alive = true;
    void loadServerPhotos().then((data) => { if (alive) setServerPhotos(data); });
    const onChange = () => setLocalPhotos(loadLocalPhotos());
    window.addEventListener(PHOTO_EVENT, onChange);
    return () => {
      alive = false;
      window.removeEventListener(PHOTO_EVENT, onChange);
    };
  }, []);

  const nameKey = normName(delegate?.name);
  const idKey = delegate?.id != null ? String(delegate.id) : '';
  const photoSrc = !imgFailed
    ? (localPhotos[nameKey] || (idKey && localPhotos[idKey]) || delegate?.avatar || delegate?.avatar_url || serverPhotos.byName[nameKey] || (idKey && serverPhotos.byId[idKey]) || null)
    : null;

  useEffect(() => { setImgFailed(false); }, [photoSrc]);

  const tone = AVATAR_TONES[(delegate?.id ?? 0) % AVATAR_TONES.length];
  const dim = size === 'md' ? 'h-9 w-9 text-xs' : 'h-7 w-7 text-[11px]';
  const initial = delegate?.name?.trim()?.charAt(0) || 'م';

  const onFilePick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !nameKey) return;
    try {
      const dataUrl = await compressAvatar(file);
      saveLocalPhoto(nameKey, dataUrl);
    } catch {
      // Ignore invalid image files.
    }
  };

  const inner = photoSrc ? (
    <img
      src={photoSrc}
      alt={delegate?.name ?? 'صورة المندوب'}
      onError={() => setImgFailed(true)}
      className={`${dim} shrink-0 rounded-full object-cover ring-2 ring-white/80 shadow-xs`}
    />
  ) : (
    <span
      className={`${dim} ${tone} inline-flex shrink-0 items-center justify-center rounded-full font-bold ring-1 ring-slate-200/80`}
      aria-hidden
    >
      {initial}
    </span>
  );

  if (!editable) return inner;

  return (
    <span
      className="group/av relative inline-flex shrink-0"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        title={photoSrc ? `تغيير صورة ${delegate?.name}` : `إضافة صورة ${delegate?.name}`}
        aria-label={photoSrc ? `تغيير صورة المندوب ${delegate?.name}` : `إضافة صورة المندوب ${delegate?.name}`}
        className="relative inline-flex rounded-full focus-visible:outline-2 focus-visible:outline-blue-600"
      >
        {inner}
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-slate-900/50 text-white opacity-0 transition group-hover/av:opacity-100">
          <Camera className="h-3.5 w-3.5" aria-hidden />
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFilePick}
      />
    </span>
  );
}

export function DelegateChip({ delegate, compact = false }) {
  if (!delegate) return null;

  return (
    <div
      className={`flex items-center justify-between gap-2 rounded-xl bg-slate-50 ${
        compact ? 'px-3 py-2' : 'px-3.5 py-2.5'
      } border border-slate-200/60`}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <DelegateAvatar delegate={delegate} size={compact ? 'sm' : 'md'} />
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-slate-800">{delegate.name}</p>
          <p className="truncate text-[11px] text-slate-500 tabular-nums" dir="ltr">
            {delegate.phone}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <a
          href={`tel:${delegate.phone.replace(/\s+/g, '')}`}
          aria-label={`اتصال بالمندوب ${delegate.name}`}
          title="اتصال هاتفي"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200/80 bg-white text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600 focus-visible:outline-2 focus-visible:outline-blue-600"
        >
          <Phone className="h-3.5 w-3.5" aria-hidden />
        </a>
        <a
          href={whatsappUrl(delegate.phone)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`مراسلة ${delegate.name} على واتساب`}
          title="واتساب"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200/80 bg-white text-emerald-600 transition hover:border-emerald-200 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-emerald-600"
        >
          <MessageCircle className="h-3.5 w-3.5" aria-hidden />
        </a>
      </div>
    </div>
  );
}

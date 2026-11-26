import { useEffect, useState } from 'react';
import {
  ArrowRight, Bookmark, Check, Compass, Copy, LoaderCircle, LocateFixed, RotateCcw, Search, Sparkles,
} from 'lucide-react';
import { api } from '../../api';
import { PROVINCE_LIST, distanceKm } from '../requests/locations';
import {
  DAILY_AMAL, DUAS, ISTIKHARA_VERSES, OFFLINE_SURAHS, SURAHS, ZIYARAT,
  type IstikharaResult, type SurahMeta, type WorshipDoc,
} from './worshipData';

const toArabicDigits = (n: number) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);

/* ══════════════════════════ 1 · القرآن الكريم ══════════════════════════ */

interface SurahPayload {
  number: number;
  name: string;
  ayahs: { n: number; text: string }[];
}

const BOOKMARK_KEY = 'ahbab:quran-bookmark:v1';
const surahCacheKey = (n: number) => `ahbab:quran-surah:v1:${n}`;

export function QuranSection() {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<SurahMeta | null>(null);
  const [ayahs, setAyahs] = useState<{ n: number; text: string }[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fontSize, setFontSize] = useState(24);
  const [bookmark, setBookmark] = useState<number | null>(() => {
    try { const v = Number(localStorage.getItem(BOOKMARK_KEY)); return v >= 1 && v <= 114 ? v : null; } catch { return null; }
  });

  async function openSurah(meta: SurahMeta) {
    setActive(meta);
    setError('');
    setAyahs(null);
    try {
      const cached = localStorage.getItem(surahCacheKey(meta.n));
      if (cached) {
        setAyahs(JSON.parse(cached) as { n: number; text: string }[]);
        return;
      }
    } catch { /* ignore */ }
    if (OFFLINE_SURAHS[meta.n]) {
      setAyahs(OFFLINE_SURAHS[meta.n]);
      return;
    }
    setLoading(true);
    try {
      const data = await api<SurahPayload>(`/worship/surah/${meta.n}`);
      setAyahs(data.ayahs);
      try { localStorage.setItem(surahCacheKey(meta.n), JSON.stringify(data.ayahs)); } catch { /* quota */ }
    } catch (e) {
      setError((e as Error).message || 'تعذّر تحميل السورة، تحقق من الإنترنت');
    } finally {
      setLoading(false);
    }
  }

  function saveBookmark(n: number) {
    setBookmark(n);
    try { localStorage.setItem(BOOKMARK_KEY, String(n)); } catch { /* ignore */ }
  }

  if (active) {
    const idx = SURAHS.findIndex((s) => s.n === active.n);
    const prev = idx > 0 ? SURAHS[idx - 1] : null;
    const next = idx < SURAHS.length - 1 ? SURAHS[idx + 1] : null;
    const showBasmala = active.n !== 1 && active.n !== 9;
    return (
      <section className="wsp-panel" aria-label={`سورة ${active.name}`}>
        <div className="wsp-toolbar">
          <button type="button" className="wsp-btn" onClick={() => setActive(null)}>
            <ArrowRight size={16} /> فهرس السور
          </button>
          <strong>سورة {active.name} ({active.place} · {active.verses} آية)</strong>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button type="button" className="wsp-btn" onClick={() => setFontSize((f) => Math.max(18, f - 2))} aria-label="تصغير الخط">أ-</button>
            <button type="button" className="wsp-btn" onClick={() => setFontSize((f) => Math.min(36, f + 2))} aria-label="تكبير الخط">أ+</button>
            <button
              type="button"
              className={`wsp-btn${bookmark === active.n ? ' primary' : ''}`}
              onClick={() => saveBookmark(active.n)}
            >
              <Bookmark size={15} /> {bookmark === active.n ? 'محفوظة للمتابعة' : 'حفظ الموضع'}
            </button>
          </div>
        </div>

        {loading && (
          <p style={{ textAlign: 'center', padding: 28, color: 'var(--ink-3)', display: 'flex', justifyContent: 'center', gap: 8, alignItems: 'center' }}>
            <LoaderCircle size={18} className="rq-spin" /> جارٍ تحميل سورة {active.name}…
          </p>
        )}
        {error && <p className="rq-route-err" role="alert">{error}</p>}
        {ayahs && (
          <div className="wsp-mushaf" style={{ fontSize }}>
            {showBasmala && <p className="wsp-basmala">بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</p>}
            <div>
              {ayahs.map((a) => (
                <span key={a.n}>
                  {a.text}
                  <span className="wsp-ayah-num">﴿{toArabicDigits(a.n)}﴾</span>{' '}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="wsp-toolbar">
          {prev ? <button type="button" className="wsp-btn" onClick={() => void openSurah(prev)}>السابقة: {prev.name}</button> : <span />}
          {next && <button type="button" className="wsp-btn primary" onClick={() => void openSurah(next)}>التالية: {next.name}</button>}
        </div>
      </section>
    );
  }

  const q = query.trim();
  const filtered = q ? SURAHS.filter((s) => s.name.includes(q) || String(s.n) === q) : SURAHS;
  const savedMeta = bookmark ? SURAHS.find((s) => s.n === bookmark) : null;

  return (
    <section className="wsp-panel" aria-label="فهرس القرآن الكريم">
      {savedMeta && (
        <div className="wsp-bookmark-bar">
          <span>آخر موضع قراءة محفوظ: <b>سورة {savedMeta.name}</b></span>
          <button type="button" className="wsp-btn primary" onClick={() => void openSurah(savedMeta)}>
            <Bookmark size={15} /> متابعة القراءة
          </button>
        </div>
      )}
      <div className="wsp-toolbar">
        <label className="wsp-search">
          <Search size={17} aria-hidden />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث عن سورة بالاسم أو الرقم (1–114)…" />
        </label>
        <small style={{ color: 'var(--ink-3)', fontWeight: 700 }}>{filtered.length} سورة</small>
      </div>
      <div className="wsp-surah-grid">
        {filtered.map((s) => (
          <button key={s.n} type="button" className="wsp-surah-item" onClick={() => void openSurah(s)}>
            <span className="wsp-surah-num">{s.n}</span>
            <span className="wsp-surah-meta">
              <strong>سورة {s.name}</strong>
              <small>{s.place} · {s.verses} آية</small>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

/* ══════════════════════════ 2 & 3 · الأدعية والزيارات ══════════════════════════ */

export function ReaderSection({ kind }: { kind: 'duas' | 'ziyarat' }) {
  const list: WorshipDoc[] = kind === 'duas' ? DUAS : ZIYARAT;
  const [selected, setSelected] = useState<WorshipDoc | null>(null);
  const [fontSize, setFontSize] = useState(22);
  const [copied, setCopied] = useState(false);

  if (selected) {
    const copyAll = () => {
      void navigator.clipboard?.writeText(`${selected.title}\n\n${selected.paragraphs.join('\n\n')}`).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      });
    };
    return (
      <section className="wsp-panel" aria-label={selected.title}>
        <div className="wsp-toolbar">
          <button type="button" className="wsp-btn" onClick={() => setSelected(null)}>
            <ArrowRight size={16} /> رجوع للقائمة
          </button>
          <strong>{selected.title}</strong>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" className="wsp-btn" onClick={() => setFontSize((f) => Math.max(16, f - 2))}>أ-</button>
            <button type="button" className="wsp-btn" onClick={() => setFontSize((f) => Math.min(34, f + 2))}>أ+</button>
            <button type="button" className="wsp-btn" onClick={copyAll}>
              {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'تم النسخ' : 'نسخ'}
            </button>
          </div>
        </div>
        <article className="wsp-reader-text" style={{ fontSize }}>
          {selected.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
        </article>
      </section>
    );
  }

  return (
    <section className="wsp-panel" aria-label={kind === 'duas' ? 'الأدعية المأثورة' : 'الزيارات المأثورة'}>
      <div className="wsp-list-grid">
        {list.map((doc) => (
          <button key={doc.id} type="button" className="wsp-doc-card" onClick={() => setSelected(doc)}>
            <span className="wsp-doc-tag">{doc.tag}</span>
            <strong>{doc.title}</strong>
            <small>{doc.summary}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

/* ══════════════════════════ 4 · أعمال الأيام والمسبحة ══════════════════════════ */

export function AmalSection() {
  const todayIdx = new Date().getDay();
  const [dayIdx, setDayIdx] = useState(todayIdx);
  const [dhikrCount, setDhikrCount] = useState(0);
  const [tasbihStage, setTasbihStage] = useState<0 | 1 | 2>(0); // 34, 33, 33
  const [tasbihCount, setTasbihCount] = useState(0);
  const [doneDeeds, setDoneDeeds] = useState<Record<string, boolean>>({});

  const day = DAILY_AMAL.find((d) => d.dayIndex === dayIdx) ?? DAILY_AMAL[0];
  const tasbihLabels = ['الله أكبر (34)', 'الحمد لله (33)', 'سبحان الله (33)'] as const;
  const tasbihMax = [34, 33, 33] as const;

  function tapTasbih() {
    if (tasbihCount + 1 >= tasbihMax[tasbihStage]) {
      if (tasbihStage < 2) { setTasbihStage((s) => (s + 1) as 0 | 1 | 2); setTasbihCount(0); }
      else { setTasbihCount(tasbihMax[2]); }
    } else {
      setTasbihCount((c) => c + 1);
    }
  }

  return (
    <section className="wsp-panel" aria-label="أعمال الأيام">
      <div className="wsp-days" role="tablist" aria-label="أيام الأسبوع">
        {DAILY_AMAL.map((d) => (
          <button
            key={d.dayIndex}
            type="button"
            role="tab"
            aria-selected={dayIdx === d.dayIndex}
            className={dayIdx === d.dayIndex ? 'on' : ''}
            onClick={() => { setDayIdx(d.dayIndex); setDhikrCount(0); }}
          >
            {d.name}{d.dayIndex === todayIdx ? ' (اليوم)' : ''}
          </button>
        ))}
      </div>

      <div className="wsp-amal-grid">
        <div className="wsp-dhikr-box">
          <small style={{ color: 'var(--ink-3)', fontWeight: 700 }}>ذكر يوم {day.name} (100 مرة)</small>
          <p className="wsp-dhikr-phrase">{day.dhikr}</p>
          <button type="button" className="wsp-counter-btn" onClick={() => setDhikrCount((c) => c + 1)}>
            <b><bdi>{dhikrCount}</bdi></b>
            <small>{dhikrCount >= 100 ? 'اكتمل ✓' : 'اضغط للتسبيح'}</small>
          </button>
          <button type="button" className="wsp-btn" onClick={() => setDhikrCount(0)}>
            <RotateCcw size={14} /> تصفير
          </button>
        </div>

        <div className="wsp-dhikr-box">
          <small style={{ color: 'var(--ink-3)', fontWeight: 700 }}>تسبيحة السيدة الزهراء (ع)</small>
          <p className="wsp-dhikr-phrase">{tasbihLabels[tasbihStage]}</p>
          <button type="button" className="wsp-counter-btn" onClick={tapTasbih}>
            <b><bdi>{tasbihCount}</bdi></b>
            <small>من {tasbihMax[tasbihStage]}</small>
          </button>
          <button type="button" className="wsp-btn" onClick={() => { setTasbihStage(0); setTasbihCount(0); }}>
            <RotateCcw size={14} /> إعادة التسبيحة
          </button>
        </div>
      </div>

      <div>
        <h3 style={{ margin: '4px 0 10px', fontSize: '1rem' }}>مستحبات يوم {day.name} · {day.ziyarahOf}</h3>
        <ul className="wsp-deeds">
          {day.deeds.map((item, idx) => {
            const key = `${day.dayIndex}-${idx}`;
            const isDone = Boolean(doneDeeds[key]);
            return (
              <li key={key}>
                <button type="button" className={isDone ? 'done' : ''} onClick={() => setDoneDeeds((p) => ({ ...p, [key]: !isDone }))}>
                  <span className="wsp-check">{isDone && <Check size={14} />}</span>
                  <span>{item}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

/* ══════════════════════════ 5 · اتجاه القبلة ══════════════════════════ */

const KAABA = { lat: 21.422487, lng: 39.826206 };

function calcQiblaBearing(lat: number, lng: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const deg = (r: number) => (r * 180) / Math.PI;
  const dLng = rad(KAABA.lng - lng);
  const y = Math.sin(dLng);
  const x = Math.cos(rad(lat)) * Math.tan(rad(KAABA.lat)) - Math.sin(rad(lat)) * Math.cos(dLng);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

export function QiblaSection() {
  const babil = PROVINCE_LIST.find((p) => p.name === 'بابل') ?? PROVINCE_LIST[0];
  const [coords, setCoords] = useState<{ lat: number; lng: number; label: string }>({ lat: babil.lat, lng: babil.lng, label: 'بابل' });
  const [heading, setHeading] = useState<number | null>(null);
  const [sensorOn, setSensorOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const qibla = calcQiblaBearing(coords.lat, coords.lng);
  const distKm = Math.round(distanceKm(coords.lat, coords.lng, KAABA.lat, KAABA.lng));
  const diff = heading !== null ? ((qibla - heading + 540) % 360) - 180 : null;
  const aligned = diff !== null && Math.abs(diff) <= 6;

  useEffect(() => {
    if (!sensorOn) return undefined;
    const onOrient = (ev: DeviceOrientationEvent) => {
      const webkit = (ev as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading;
      if (typeof webkit === 'number' && !Number.isNaN(webkit)) {
        setHeading(webkit);
      } else if (typeof ev.alpha === 'number') {
        setHeading((360 - ev.alpha) % 360);
      }
    };
    window.addEventListener('deviceorientation', onOrient, true);
    return () => window.removeEventListener('deviceorientation', onOrient, true);
  }, [sensorOn]);

  async function enableCompass() {
    setNote('');
    const DevOri = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
    if (typeof DevOri?.requestPermission === 'function') {
      try {
        const res = await DevOri.requestPermission();
        if (res !== 'granted') { setNote('يرجى السماح بالوصول إلى مستشعر البوصلة في الهاتف'); return; }
      } catch {
        setNote('تعذّر تشغيل مستشعر البوصلة على هذا الجهاز');
        return;
      }
    }
    setSensorOn(true);
  }

  function detectGps() {
    if (!navigator.geolocation) { setNote('الموقع غير مدعوم على هذا الجهاز'); return; }
    setBusy(true); setNote('');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setCoords({ lat: p.coords.latitude, lng: p.coords.longitude, label: 'موقعك الحالي (GPS)' });
        setBusy(false);
      },
      () => { setNote('تعذّر قراءة GPS — يمكنك اختيار محافظتك من القائمة'); setBusy(false); },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  const dialRotation = heading !== null ? -heading : 0;

  return (
    <section className="wsp-panel" aria-label="بوصلة اتجاه القبلة">
      <div className="wsp-toolbar">
        <select
          className="wsp-btn"
          value={PROVINCE_LIST.some((p) => p.name === coords.label) ? coords.label : ''}
          onChange={(e) => {
            const found = PROVINCE_LIST.find((p) => p.name === e.target.value);
            if (found) setCoords({ lat: found.lat, lng: found.lng, label: found.name });
          }}
          aria-label="اختيار المحافظة"
        >
          {!PROVINCE_LIST.some((p) => p.name === coords.label) && <option value="">{coords.label}</option>}
          {PROVINCE_LIST.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="wsp-btn" onClick={detectGps} disabled={busy}>
            {busy ? <LoaderCircle size={15} className="rq-spin" /> : <LocateFixed size={15} />} تحديد موقعي
          </button>
          <button type="button" className="wsp-btn primary" onClick={() => void enableCompass()}>
            <Compass size={15} /> {sensorOn ? 'البوصلة مفعّلة' : 'تشغيل البوصلة الحية'}
          </button>
        </div>
      </div>

      <div className="wsp-qibla">
        {aligned && <span className="wsp-qibla-ok">أنت متجه نحو القبلة تماماً ✓</span>}
        <div className="wsp-compass-wrap">
          <div className="wsp-compass-dial" style={{ transform: `rotate(${dialRotation.toFixed(1)}deg)` }}>
            <span className="wsp-compass-dir n">ش</span>
            <span className="wsp-compass-dir s">ج</span>
            <span className="wsp-compass-dir e">شرق</span>
            <span className="wsp-compass-dir w">غرب</span>
            <div className="wsp-qibla-needle" style={{ transform: `rotate(${qibla.toFixed(1)}deg)` }}>
              <span className="wsp-qibla-kaaba" title="الكعبة المشرفة">الكعبة</span>
              <span className="wsp-qibla-shaft" />
            </div>
          </div>
        </div>
        <div className="wsp-qibla-stats">
          <span>زاوية القبلة: <bdi>{Math.round(qibla)}°</bdi> (جنوب غرب)</span>
          <span>المسافة إلى مكة: <bdi>{distKm.toLocaleString('en-US')}</bdi> كم</span>
          <span>الموقع: {coords.label}</span>
        </div>
        {note && <p className="rq-route-err">{note}</p>}
      </div>
    </section>
  );
}

/* ══════════════════════════ 6 · الاستخارة بالقرآن والسبحة ══════════════════════════ */

export function IstikharaSection() {
  const [mode, setMode] = useState<'quran' | 'tasbih'>('quran');
  const [qResult, setQResult] = useState<IstikharaResult | null>(null);
  const [beads, setBeads] = useState<number | null>(null);

  function drawQuran() {
    const idx = Math.floor(Math.random() * ISTIKHARA_VERSES.length);
    setQResult(ISTIKHARA_VERSES[idx]);
  }

  function drawBeads() {
    // Traditional rosary count between 7 and 27 beads, counted two by two (1 = odd = do, 2 = even = avoid)
    const count = 7 + Math.floor(Math.random() * 21);
    setBeads(count);
  }

  const odd = beads !== null ? beads % 2 === 1 : null;

  return (
    <section className="wsp-panel" aria-label="الاستخارة بالقرآن والسبحة">
      <div className="wsp-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={mode === 'quran'} className={mode === 'quran' ? 'on' : ''} onClick={() => setMode('quran')}>
          الاستخارة بالقرآن الكريم
        </button>
        <button type="button" role="tab" aria-selected={mode === 'tasbih'} className={mode === 'tasbih' ? 'on' : ''} onClick={() => setMode('tasbih')}>
          الاستخارة بالسبحة
        </button>
      </div>

      {mode === 'quran' ? (
        <div className="wsp-isti-card">
          <small style={{ color: 'var(--ink-3)', fontWeight: 700 }}>
            آداب الاستخارة: انوِ حاجتك، وصلِّ على محمد وآل محمد (3 مرات)، واقرأ سورة الإخلاص (3 مرات) ثم اضغط.
          </small>
          {qResult ? (
            <>
              <span className={`wsp-isti-badge ${qResult.verdict}`}>{qResult.verdictLabel}</span>
              <p className="wsp-isti-verse">﴿ {qResult.verse} ﴾</p>
              <small style={{ color: 'var(--ink-3)', fontWeight: 700 }}>{qResult.surah} — الآية {qResult.ayahNo}</small>
              <p style={{ margin: 0, color: 'var(--ink-2)', maxWidth: 560, lineHeight: 1.7 }}>{qResult.guidance}</p>
            </>
          ) : (
            <p style={{ margin: '8px 0', color: 'var(--ink-2)' }}>استحضر النية وتوكّل على الله ثم افتح المصحف.</p>
          )}
          <button type="button" className="wsp-btn primary" onClick={drawQuran}>
            <Sparkles size={16} /> {qResult ? 'استخارة جديدة' : 'افتح المصحف للاستخارة'}
          </button>
        </div>
      ) : (
        <div className="wsp-isti-card">
          <small style={{ color: 'var(--ink-3)', fontWeight: 700 }}>
            صلِّ على محمد وآل محمد (3 مرات) وانوِ أمرك، ثم امسك السبحة لتُعدَّ خرزاتها اثنين اثنين (الفرد: افعل · الزوج: اترك).
          </small>
          {beads !== null && (
            <>
              <span className={`wsp-isti-badge ${odd ? 'excellent' : 'avoid'}`}>
                {odd ? 'بقي فرد (واحدة) — افعل، استخارة جيدة بإذن الله' : 'بقي زوج (اثنتان) — اترك، لا تفعل'}
              </span>
              <div className="wsp-beads" aria-label={`عدد الخرزات ${beads}`}>
                {Array.from({ length: beads }, (_, i) => (
                  <span key={i} className={`wsp-bead${i >= beads - (odd ? 1 : 2) ? ' rem' : ''}`} />
                ))}
              </div>
              <small style={{ color: 'var(--ink-3)', fontWeight: 700 }}>عدد الخرزات الممسوكة: {beads}</small>
            </>
          )}
          <button type="button" className="wsp-btn primary" onClick={drawBeads}>
            <Sparkles size={16} /> {beads !== null ? 'إعادة الاستخارة بالسبحة' : 'امسك السبحة'}
          </button>
        </div>
      )}
    </section>
  );
}

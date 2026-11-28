import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Bookmark, BookOpen, Search, Settings } from 'lucide-react';
import './styles/quran-tokens.css';
import { QuranProvider, useQuran, type QuranTab, type QuranTheme } from './store/quranStore';
import { QuranIndex, type OpenTarget } from './screens/QuranIndex';
import { QButton, QIconButton } from './components/ui/Primitives';
import { MUSHAF_SURAHS } from './data/mushafMeta';
import { api } from '../../../api';
import { OFFLINE_SURAHS } from '../worshipData';

interface SurahPayload {
  number: number;
  name: string;
  ayahs: { n: number; text: string }[];
}

const surahCacheKey = (n: number) => `ahbab:quran-surah:v1:${n}`;

function QuranOnboarding() {
  const { settings, updateSettings, num } = useQuran();
  const [step, setStep] = useState<0 | 1 | 2>(0);

  if (settings.onboarded) return null;

  const finish = () => updateSettings({ onboarded: true });

  return (
    <div className="q-onboard-backdrop" role="dialog" aria-modal="true" aria-label="إعداد سريع للقرآن الكريم">
      <motion.div
        className="q-onboard-card"
        initial={{ opacity: 0, scale: 0.94, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="q-onboard-steps" aria-hidden="true">
          {[0, 1, 2].map((i) => <span key={i} className={step === i ? 'on' : ''} />)}
        </div>

        {step === 0 && (
          <div style={{ display: 'grid', gap: 12, textAlign: 'center' }}>
            <strong style={{ fontSize: '1.15rem' }}>اختر مظهر القراءة المريح لعينيك</strong>
            <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--q-ink-2)' }}>
              يمكنك التبديل في أي وقت بين النهاري والورقي الدافئ والليلي الحقيقي
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {([
                { id: 'light', label: 'نهاري', bg: '#FAF8F3', ink: '#1B1B1B' },
                { id: 'sepia', label: 'ورقي دافئ', bg: '#F4ECD8', ink: '#3B2F1E' },
                { id: 'dark', label: 'ليلي OLED', bg: '#000000', ink: '#E8E6E1' },
              ] as const).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => updateSettings({ themePref: t.id })}
                  style={{
                    padding: '14px 8px',
                    borderRadius: 14,
                    border: settings.themePref === t.id ? '2px solid var(--q-primary)' : '1px solid var(--q-line)',
                    background: t.bg,
                    color: t.ink,
                    font: 'inherit',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 1 && (
          <div style={{ display: 'grid', gap: 12, textAlign: 'center' }}>
            <strong style={{ fontSize: '1.15rem' }}>حجم خط المصحف</strong>
            <div
              className="q-card"
              style={{
                padding: '18px 14px',
                fontFamily: 'var(--q-font-mushaf)',
                fontSize: settings.fontSize,
                lineHeight: 2,
                background: 'var(--q-page-paper)',
              }}
            >
              بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
              <QButton onClick={() => updateSettings({ fontSize: Math.max(18, settings.fontSize - 2) })}>أ−</QButton>
              <strong style={{ minWidth: 56 }}>{num(settings.fontSize)} px</strong>
              <QButton onClick={() => updateSettings({ fontSize: Math.min(36, settings.fontSize + 2) })}>أ+</QButton>
            </div>
          </div>
        )}

        {step === 2 && (
          <div style={{ display: 'grid', gap: 12, textAlign: 'center' }}>
            <strong style={{ fontSize: '1.15rem' }}>شكل الأرقام في المصحف</strong>
            <p style={{ margin: 0, fontSize: '0.86rem', color: 'var(--q-ink-2)' }}>
              اختر الأرقام العربية الشرقية (١٢٣) أو الأرقام القياسية (123)
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <QButton
                variant={settings.digits === 'arabic' ? 'primary' : 'default'}
                onClick={() => updateSettings({ digits: 'arabic' })}
              >
                ١٢٣ عربية
              </QButton>
              <QButton
                variant={settings.digits === 'latin' ? 'primary' : 'default'}
                onClick={() => updateSettings({ digits: 'latin' })}
              >
                123 قياسية
              </QButton>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <QButton variant="ghost" onClick={finish}>تخطي</QButton>
          {step < 2 ? (
            <QButton variant="primary" onClick={() => setStep((s) => (s + 1) as 0 | 1 | 2)}>التالي</QButton>
          ) : (
            <QButton variant="primary" onClick={finish}>ابدأ القراءة</QButton>
          )}
        </div>
      </motion.div>
    </div>
  );
}

/** Temporary Phase-2 bridge reader so opening any surah keeps working seamlessly until Phase 3 builds the 604-page 3D Mushaf Reader. */
function QuickSurahReader({
  target,
  onBack,
  onOpenSurah,
}: {
  target: OpenTarget;
  onBack: () => void;
  onOpenSurah: (next: OpenTarget) => void;
}) {
  const { settings, updateSettings, setLastRead, num } = useQuran();
  const [ayahs, setAyahs] = useState<{ n: number; text: string }[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loadedId, setLoadedId] = useState<number>(0);

  const meta = MUSHAF_SURAHS[target.surah - 1] ?? MUSHAF_SURAHS[0];

  if (loadedId !== meta.n && !loading) {
    setLoadedId(meta.n);
    setError('');
    setLastRead({ surah: meta.n, page: target.page || meta.page, ayah: target.ayah ?? 1 });
    let hit: { n: number; text: string }[] | null = null;
    try {
      const cached = localStorage.getItem(surahCacheKey(meta.n));
      if (cached) hit = JSON.parse(cached) as { n: number; text: string }[];
    } catch { /* ignore */ }
    if (!hit && OFFLINE_SURAHS[meta.n]) hit = OFFLINE_SURAHS[meta.n];
    if (hit) {
      setAyahs(hit);
    } else {
      setAyahs(null);
      setLoading(true);
      void api<SurahPayload>(`/worship/surah/${meta.n}`)
        .then((data) => {
          setAyahs(data.ayahs);
          try { localStorage.setItem(surahCacheKey(meta.n), JSON.stringify(data.ayahs)); } catch { /* quota */ }
        })
        .catch((e) => setError((e as Error).message || 'تعذّر تحميل السورة، تحقق من الإنترنت'))
        .finally(() => setLoading(false));
    }
  }

  const prev = meta.n > 1 ? MUSHAF_SURAHS[meta.n - 2] : null;
  const next = meta.n < 114 ? MUSHAF_SURAHS[meta.n] : null;
  const showBasmala = meta.n !== 1 && meta.n !== 9;

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <header className="q-header">
        <QIconButton onClick={onBack} aria-label="العودة إلى الفهرس">
          <ArrowRight size={22} />
        </QIconButton>
        <h2 className="q-header-title">سورة {meta.name}</h2>
        <div className="q-header-actions">
          <QButton onClick={() => updateSettings({ fontSize: Math.max(18, settings.fontSize - 2) })} aria-label="تصغير الخط">أ−</QButton>
          <QButton onClick={() => updateSettings({ fontSize: Math.min(36, settings.fontSize + 2) })} aria-label="تكبير الخط">أ+</QButton>
        </div>
      </header>

      {loading && <div className="q-card" style={{ padding: 32, textAlign: 'center', color: 'var(--q-ink-3)' }}>جارٍ تحميل سورة {meta.name}…</div>}
      {error && <div className="q-card" style={{ padding: 20, color: 'var(--q-danger)', textAlign: 'center' }}>{error}</div>}
      {ayahs && (
        <article
          className="q-card"
          style={{
            padding: '24px clamp(16px, 3vw, 36px)',
            background: 'var(--q-page-paper)',
            borderColor: 'var(--q-page-frame)',
            fontFamily: 'var(--q-font-mushaf)',
            fontSize: settings.fontSize,
            lineHeight: 2.15,
            textAlign: 'justify',
          }}
        >
          {showBasmala && (
            <p style={{ textAlign: 'center', fontSize: '1.35em', color: 'var(--q-primary)', margin: '0 0 18px', fontWeight: 700 }}>
              بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
            </p>
          )}
          <div>
            {ayahs.map((a) => (
              <span key={a.n}>
                {a.text}{' '}
                <span style={{ color: 'var(--q-gold)', fontSize: '0.82em', paddingInline: 4 }}>
                  ﴿{num(a.n)}﴾
                </span>{' '}
              </span>
            ))}
          </div>
        </article>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        {prev ? (
          <QButton onClick={() => onOpenSurah({ surah: prev.n, page: prev.page, ayah: 1 })}>السابقة: {prev.name}</QButton>
        ) : <span />}
        {next && (
          <QButton variant="primary" onClick={() => onOpenSurah({ surah: next.n, page: next.page, ayah: 1 })}>التالية: {next.name}</QButton>
        )}
      </div>
    </div>
  );
}

function QuranWorkspace({ onBackToWorship }: { onBackToWorship: () => void }) {
  const { resolvedTheme, updateSettings } = useQuran();
  const [activeTab, setActiveTab] = useState<QuranTab>('index');
  const [readingTarget, setReadingTarget] = useState<OpenTarget | null>(null);

  const pickTheme = (t: QuranTheme) => updateSettings({ themePref: t });

  return (
    <div className="q-root q-shell" dir="rtl" data-q-theme={resolvedTheme}>
      <QuranOnboarding />

      {readingTarget ? (
        <QuickSurahReader
          target={readingTarget}
          onBack={() => setReadingTarget(null)}
          onOpenSurah={(next) => setReadingTarget(next)}
        />
      ) : (
        <>
          {/* Clean Header matching reference: Right back arrow · Centered «القرآن الكريم» · Left 3-theme quick dots */}
          <header className="q-header">
            <QIconButton onClick={onBackToWorship} aria-label="العودة إلى العبادات">
              <ArrowRight size={22} />
            </QIconButton>
            <h1 className="q-header-title">القرآن الكريم</h1>
            <div className="q-theme-dots" role="group" aria-label="مظهر القرآن">
              <button
                type="button"
                className={`q-theme-dot light${resolvedTheme === 'light' ? ' on' : ''}`}
                onClick={() => pickTheme('light')}
                aria-label="المظهر النهاري"
                title="نهاري"
              />
              <button
                type="button"
                className={`q-theme-dot sepia${resolvedTheme === 'sepia' ? ' on' : ''}`}
                onClick={() => pickTheme('sepia')}
                aria-label="المظهر الورقي الدافئ"
                title="ورقي دافئ"
              />
              <button
                type="button"
                className={`q-theme-dot dark${resolvedTheme === 'dark' ? ' on' : ''}`}
                onClick={() => pickTheme('dark')}
                aria-label="المظهر الليلي الحقيقي"
                title="ليلي OLED"
              />
            </div>
          </header>

          {/* Compact Quran Sub-Navigation (Index · Search · Bookmarks · Settings) */}
          <nav className="q-subnav" aria-label="أقسام المصحف">
            {([
              { id: 'index', label: 'الفهرس', Icon: BookOpen },
              { id: 'search', label: 'البحث', Icon: Search },
              { id: 'bookmarks', label: 'الفواصل', Icon: Bookmark },
              { id: 'settings', label: 'الإعدادات', Icon: Settings },
            ] as const).map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                className={`q-subnav-btn${activeTab === id ? ' on' : ''}`}
                onClick={() => setActiveTab(id)}
              >
                <Icon size={16} aria-hidden="true" />
                <span>{label}</span>
              </button>
            ))}
          </nav>

          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              style={{ display: 'grid', gap: 14 }}
            >
              {activeTab === 'index' && <QuranIndex onOpen={(target) => setReadingTarget(target)} />}
              {activeTab === 'search' && (
                <div className="q-card" style={{ padding: 28, textAlign: 'center', color: 'var(--q-ink-2)' }}>
                  <strong style={{ display: 'block', marginBottom: 6 }}>البحث الذكي داخل الآيات</strong>
                  <small style={{ color: 'var(--q-ink-3)' }}>سيُبنى بالكامل في المرحلة 6 مع Web Worker والتطبيع العربي والقفز المباشر.</small>
                </div>
              )}
              {activeTab === 'bookmarks' && (
                <div className="q-card" style={{ padding: 28, textAlign: 'center', color: 'var(--q-ink-2)' }}>
                  <strong style={{ display: 'block', marginBottom: 6 }}>الفواصل الملونة ومتتبع الختمة</strong>
                  <small style={{ color: 'var(--q-ink-3)' }}>سيُبنى بالكامل في المرحلة 7 مع الفواصل الملونة وورد اليوم وسلسلة الأيام.</small>
                </div>
              )}
              {activeTab === 'settings' && (
                <div className="q-card" style={{ padding: 28, textAlign: 'center', color: 'var(--q-ink-2)' }}>
                  <strong style={{ display: 'block', marginBottom: 6 }}>إعدادات المصحف والتحميلات</strong>
                  <small style={{ color: 'var(--q-ink-3)' }}>سيُبنى بالكامل في المرحلة 8 مع معاينة الخطوط وإدارة التحميلات والنسخ الاحتياطي.</small>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </>
      )}
    </div>
  );
}

export function QuranApp({ onBackToWorship }: { onBackToWorship: () => void }) {
  return (
    <QuranProvider>
      <QuranWorkspace onBackToWorship={onBackToWorship} />
    </QuranProvider>
  );
}

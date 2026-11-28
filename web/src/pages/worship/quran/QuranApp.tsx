import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Bookmark, BookOpen, Search, Settings } from 'lucide-react';
import './styles/quran-tokens.css';
import { QuranProvider, useQuran, type QuranTab, type QuranTheme } from './store/quranStore';
import { QuranIndex, type OpenTarget } from './screens/QuranIndex';
import { QuranSearch } from './screens/QuranSearch';
import { MushafReader } from './screens/MushafReader';
import { QButton, QIconButton } from './components/ui/Primitives';

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

function QuranWorkspace({ onBackToWorship }: { onBackToWorship: () => void }) {
  const { resolvedTheme, updateSettings } = useQuran();
  const [activeTab, setActiveTab] = useState<QuranTab>('index');
  const [readingTarget, setReadingTarget] = useState<OpenTarget | null>(null);

  const pickTheme = (t: QuranTheme) => updateSettings({ themePref: t });

  return (
    <div className="q-root q-shell" dir="rtl" data-q-theme={resolvedTheme}>
      <QuranOnboarding />

      {readingTarget && (
        <MushafReader
          initialPage={readingTarget.page}
          initialAyah={readingTarget.ayah}
          onClose={() => setReadingTarget(null)}
        />
      )}

      {!readingTarget && (
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
              {activeTab === 'search' && <QuranSearch onOpen={(target) => setReadingTarget(target)} />}
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

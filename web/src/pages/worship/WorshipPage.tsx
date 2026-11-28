import { useState } from 'react';
import { ArrowRight, BookOpen, Compass, Hand, Sparkles, type LucideIcon } from 'lucide-react';
import { AmalSection, IstikharaSection, QiblaSection, ReaderSection } from './WorshipSections';
import { QuranApp } from './quran/QuranApp';
import quranCardUrl from '../../assets/worship/quran.jpg';
import duasCardUrl from '../../assets/worship/duas.jpg';
import ziyaratCardUrl from '../../assets/worship/ziyarat.jpg';
import amalCardUrl from '../../assets/worship/amal.jpg';
import qiblaCardUrl from '../../assets/worship/qibla.jpg';
import istikharaCardUrl from '../../assets/worship/istikhara.jpg';

/** A small mosque, since the icon set has none. Drawn on the same 24px grid as the others. */
function Mosque({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2.5c.3 0 .5.2.5.5v1.1C15.4 4.9 17.5 7 17.5 9.5H6.5c0-2.5 2.1-4.6 5-5.4V3c0-.3.2-.5.5-.5Z" />
      <path d="M2.5 7.5c.3 0 .5.2.5.5v1h.5c.3 0 .5.2.5.5V21H1.5V9.5c0-.3.2-.5.5-.5H2V8c0-.3.2-.5.5-.5Zm19 0c.3 0 .5.2.5.5v1h.5c.3 0 .5.2.5.5V21h-2.5V9.5c0-.3.2-.5.5-.5h.5V8c0-.3.2-.5.5-.5Z" />
      <path d="M5.5 11h13v10h-4.5v-3.5a2 2 0 0 0-4 0V21H5.5V11Z" />
    </svg>
  );
}

type SectionSlug = 'quran' | 'duas' | 'ziyarat' | 'amal' | 'qibla' | 'istikhara';
type Tile = { slug: SectionSlug; title: string; hint: string; tone: string; icon: LucideIcon | typeof Mosque; cardImg: string };

// The order follows the reference: right column first on an Arabic screen.
const TILES: Tile[] = [
  { slug: 'quran', title: 'القرآن الكريم', hint: 'تلاوة وحفظ', tone: 'green', icon: BookOpen, cardImg: quranCardUrl },
  { slug: 'duas', title: 'الأدعية', hint: 'أدعية مأثورة', tone: 'violet', icon: Hand, cardImg: duasCardUrl },
  { slug: 'ziyarat', title: 'الزيارات', hint: 'زيارات مأثورة', tone: 'sky', icon: Mosque, cardImg: ziyaratCardUrl },
  { slug: 'amal', title: 'الأعمال', hint: 'أعمال الأيام', tone: 'amber', icon: Sparkles, cardImg: amalCardUrl },
  { slug: 'qibla', title: 'اتجاه القبلة', hint: 'بوصلة القبلة', tone: 'red', icon: Compass, cardImg: qiblaCardUrl },
  { slug: 'istikhara', title: 'الاستخارة', hint: 'بالقرآن والسبحة', tone: 'indigo', icon: Sparkles, cardImg: istikharaCardUrl },
];

/** العبادات: full-width hub with six working sections (Quran, Duas, Ziyarat, Amal, Qibla, Istikhara). */
export function WorshipPage() {
  const [section, setSection] = useState<SectionSlug | null>(null);
  const current = section ? TILES.find((t) => t.slug === section) ?? null : null;

  if (section === 'quran') {
    return <QuranApp onBackToWorship={() => setSection(null)} />;
  }

  return (
    <div dir="rtl" className="wsp">
      <header className="wsp-hero">
        <div className="wsp-hero-main">
          <span className="wsp-hero-icon"><Mosque size={34} /></span>
          <div>
            <h1>{current ? current.title : 'العبادات'}</h1>
            <p>{current ? current.hint : 'زادك الروحي في مكان واحد'}</p>
          </div>
        </div>
        {current && (
          <button type="button" className="wsp-back" onClick={() => setSection(null)}>
            <ArrowRight size={17} /> جميع الأقسام
          </button>
        )}
      </header>

      {!section ? (
        <>
          <div className="wsp-grid">
            {TILES.map(({ slug, title, hint, tone, icon: Icon }) => (
              <button key={slug} type="button" className={`wsp-tile tone-${tone}`} onClick={() => setSection(slug)}>
                <span className="wsp-tile-icon"><Icon size={34} /></span>
                <strong>{title}</strong>
                <small>{hint}</small>
              </button>
            ))}
          </div>

          {/* Phone-only: 6 stacked luxury illustrated cards with crisp live Arabic titles & دخول CTA */}
          <div className="wsp-phone-cards" aria-label="أقسام العبادات">
            {TILES.map(({ slug, title, hint, cardImg }, idx) => (
              <button
                key={slug}
                type="button"
                className={`wsp-pcard wsp-pcard-${slug}`}
                style={{ ['--i' as string]: idx }}
                aria-label={`${title} — ${hint}`}
                onClick={() => setSection(slug)}
              >
                <img src={cardImg} alt="" aria-hidden="true" loading={idx < 3 ? 'eager' : 'lazy'} decoding="async" />
                <span className="wsp-pcard-content">
                  <strong>{title}</strong>
                  <small>{hint}</small>
                  <span className="wsp-pcard-cta" aria-hidden="true">دخول</span>
                </span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <nav className="wsp-tabs" aria-label="أقسام العبادات">
            {TILES.map(({ slug, title, icon: Icon }) => (
              <button key={slug} type="button" className={section === slug ? 'on' : ''} onClick={() => setSection(slug)}>
                <Icon size={15} /> {title}
              </button>
            ))}
          </nav>
          {section === 'duas' && <ReaderSection kind="duas" />}
          {section === 'ziyarat' && <ReaderSection kind="ziyarat" />}
          {section === 'amal' && <AmalSection />}
          {section === 'qibla' && <QiblaSection />}
          {section === 'istikhara' && <IstikharaSection />}
        </>
      )}
    </div>
  );
}

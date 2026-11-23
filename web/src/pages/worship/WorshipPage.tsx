import { BookOpen, Compass, Hand, Sparkles, type LucideIcon } from 'lucide-react';

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

type Tile = { slug: string; title: string; hint: string; tone: string; icon: LucideIcon | typeof Mosque };

// The order follows the reference: right column first on an Arabic screen.
const TILES: Tile[] = [
  { slug: 'quran', title: 'القرآن الكريم', hint: 'تلاوة وحفظ', tone: 'green', icon: BookOpen },
  { slug: 'duas', title: 'الأدعية', hint: 'أدعية مأثورة', tone: 'violet', icon: Hand },
  { slug: 'ziyarat', title: 'الزيارات', hint: 'زيارات مأثورة', tone: 'sky', icon: Mosque },
  { slug: 'amal', title: 'الأعمال', hint: 'أعمال الأيام', tone: 'amber', icon: Sparkles },
  { slug: 'qibla', title: 'اتجاه القبلة', hint: 'بوصلة القبلة', tone: 'red', icon: Compass },
  { slug: 'istikhara', title: 'الاستخارة', hint: 'بالقرآن والسبحة', tone: 'indigo', icon: Sparkles },
];

/** العبادات: a header and six section tiles. Each section's content is programmed later. */
export function WorshipPage() {
  return (
    <div dir="rtl" className="wsp">
      <header className="wsp-hero">
        <span className="wsp-hero-icon"><Mosque size={34} /></span>
        <div>
          <h1>العبادات</h1>
          <p>زادك الروحي في مكان واحد</p>
        </div>
      </header>

      <div className="wsp-grid">
        {TILES.map(({ slug, title, hint, tone, icon: Icon }) => (
          <button key={slug} type="button" className={`wsp-tile tone-${tone}`}>
            <span className="wsp-tile-icon"><Icon size={34} /></span>
            <strong>{title}</strong>
            <small>{hint}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

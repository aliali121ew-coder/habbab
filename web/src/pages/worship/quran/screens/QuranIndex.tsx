import { useCallback, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Play, Search } from 'lucide-react';
import {
  HIZB_LIST, JUZ_LIST, MUSHAF_SURAHS, TOTAL_PAGES, surahForPage,
  type MushafSurah,
} from '../data/mushafMeta';
import { useQuran } from '../store/quranStore';
import { QSegmentedControl, QStarBadge, type SegOption } from '../components/ui/Primitives';

type IndexTab = 'surahs' | 'juz' | 'hizb' | 'pages';

const INDEX_TABS: readonly SegOption<IndexTab>[] = [
  { id: 'surahs', label: 'السور' },
  { id: 'juz', label: 'الأجزاء' },
  { id: 'hizb', label: 'الأحزاب' },
  { id: 'pages', label: 'الصفحات' },
];

const FAST_SURAH_MARKS = [1, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 114];
const FAST_PAGE_MARKS = [1, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 550, 604];

function normalizeQuick(text: string): string {
  return text
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .trim()
    .toLowerCase();
}

export interface OpenTarget {
  surah: number;
  page: number;
  ayah?: number;
}

export function QuranIndex({
  onOpen,
}: {
  onOpen: (target: OpenTarget) => void;
}) {
  const { lastRead, num } = useQuran();
  const [tab, setTab] = useState<IndexTab>('surahs');
  const [query, setQuery] = useState('');
  const [pageWindowStart, setPageWindowStart] = useState(0);
  const [fastBubble, setFastBubble] = useState<string | null>(null);
  const itemRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const bubbleTimer = useRef<number | null>(null);

  const lastSurah = MUSHAF_SURAHS[lastRead.surah - 1] ?? MUSHAF_SURAHS[0];
  const progressPct = Math.max(1, Math.min(100, Math.round((lastRead.page / TOTAL_PAGES) * 100)));

  const filteredSurahs = useMemo<MushafSurah[]>(() => {
    const q = normalizeQuick(query);
    if (!q) return MUSHAF_SURAHS;
    return MUSHAF_SURAHS.filter((s) =>
      normalizeQuick(s.name).includes(q)
      || s.en.toLowerCase().includes(q)
      || String(s.n) === q
      || num(s.n) === query.trim(),
    );
  }, [query, num]);

  const showBubble = useCallback((label: string) => {
    setFastBubble(label);
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try { navigator.vibrate(8); } catch { /* ignore */ }
    }
    if (bubbleTimer.current) window.clearTimeout(bubbleTimer.current);
    bubbleTimer.current = window.setTimeout(() => setFastBubble(null), 850);
  }, []);

  const jumpToSurah = useCallback((n: number) => {
    showBubble(`س ${num(n)}`);
    const el = itemRefs.current.get(n);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [num, showBubble]);

  const jumpToPageBand = useCallback((p: number) => {
    showBubble(`ص ${num(p)}`);
    const bandStart = Math.max(0, Math.min(TOTAL_PAGES - 40, p - 1));
    setPageWindowStart(bandStart);
  }, [num, showBubble]);

  // Lightweight virtualized window for the 604 pages tab (renders 40 items at a time)
  const visiblePages = useMemo(() => {
    const qNum = Number(query.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).trim());
    if (Number.isInteger(qNum) && qNum >= 1 && qNum <= TOTAL_PAGES) {
      return [qNum];
    }
    const start = pageWindowStart + 1;
    const end = Math.min(TOTAL_PAGES, start + 39);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }, [pageWindowStart, query]);

  return (
    <>
      {/* Hero Continue Reading Card — matches the emerald card in the reference design */}
      <button
        type="button"
        className="q-continue"
        onClick={() => onOpen({ surah: lastRead.surah, page: lastRead.page, ayah: lastRead.ayah })}
        aria-label={`متابعة القراءة: سورة ${lastSurah.name} الآية ${lastRead.ayah}`}
      >
        <span className="q-continue-play" aria-hidden="true">
          <Play size={22} fill="currentColor" />
        </span>
        <span className="q-continue-body">
          <span className="q-continue-kicker">متابعة القراءة</span>
          <span className="q-continue-title">
            سورة {lastSurah.name} - الآية {num(lastRead.ayah)}
          </span>
          <span className="q-continue-prog">
            <span className="q-continue-bar">
              <span style={{ width: `${progressPct}%` }} />
            </span>
            <span className="q-continue-pct">ص {num(lastRead.page)} · {num(progressPct)}٪</span>
          </span>
        </span>
        <span className="q-continue-arrow" aria-hidden="true">
          <ArrowLeft size={20} />
        </span>
      </button>

      {/* Search Bar */}
      <label className="q-search-bar">
        <Search size={19} aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={tab === 'pages' ? 'اكتب رقم الصفحة (١–٦٠٤)...' : 'ابحث عن سورة...'}
          aria-label="ابحث عن سورة"
        />
      </label>

      {/* Segmented Control (السور · الأجزاء · الأحزاب · الصفحات) */}
      <QSegmentedControl
        options={INDEX_TABS}
        value={tab}
        onChange={setTab}
        layoutId="q-index-seg"
        ariaLabel="تصنيف فهرس القرآن الكريم"
      />

      {/* Tab 1: Surahs */}
      {tab === 'surahs' && (
        <div className="q-list-wrap is-grid" role="list" aria-label="قائمة السور">
          {filteredSurahs.length === 0 ? (
            <div className="q-card" style={{ padding: 28, textAlign: 'center', color: 'var(--q-ink-3)' }}>
              لا توجد سورة مطابقة لـ «{query}»
            </div>
          ) : (
            filteredSurahs.map((s) => (
              <button
                key={s.n}
                ref={(el) => {
                  if (el) itemRefs.current.set(s.n, el);
                  else itemRefs.current.delete(s.n);
                }}
                type="button"
                className="q-surah-card"
                onClick={() => onOpen({ surah: s.n, page: s.page, ayah: 1 })}
              >
                <QStarBadge label={num(s.n)} />
                <span className="q-surah-info">
                  <span className="q-surah-en">{s.en}</span>
                  <span className="q-surah-sub">
                    <span>{s.place}</span>
                    <span>•</span>
                    <span>{num(s.verses)} آية</span>
                    <span>•</span>
                    <span>ص {num(s.page)}</span>
                  </span>
                </span>
                <span className="q-surah-ar">{s.name}</span>
              </button>
            ))
          )}
        </div>
      )}

      {/* Tab 2: Juz (30) */}
      {tab === 'juz' && (
        <div className="q-list-wrap is-grid" role="list" aria-label="الأجزاء الثلاثون">
          {JUZ_LIST.map((j) => {
            const startSurah = MUSHAF_SURAHS[j.startSurah - 1];
            return (
              <button
                key={j.n}
                type="button"
                className="q-meta-card"
                onClick={() => onOpen({ surah: j.startSurah, page: j.startPage, ayah: 1 })}
              >
                <span className="q-meta-left">
                  <QStarBadge label={num(j.n)} />
                  <span className="q-surah-info">
                    <span className="q-surah-en">{j.name}</span>
                    <span className="q-surah-sub">يبدأ من سورة {startSurah.name}</span>
                  </span>
                </span>
                <span className="q-meta-pill">ص {num(j.startPage)}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Tab 3: Hizb (60) */}
      {tab === 'hizb' && (
        <div className="q-list-wrap is-grid" role="list" aria-label="الأحزاب الستون">
          {HIZB_LIST.map((h) => {
            const s = surahForPage(h.startPage);
            return (
              <button
                key={h.n}
                type="button"
                className="q-meta-card"
                onClick={() => onOpen({ surah: s.n, page: h.startPage, ayah: 1 })}
              >
                <span className="q-meta-left">
                  <QStarBadge label={num(h.n)} />
                  <span className="q-surah-info">
                    <span className="q-surah-en">الحزب {num(h.n)}</span>
                    <span className="q-surah-sub">الجزء {num(h.juz)} • سورة {s.name}</span>
                  </span>
                </span>
                <span className="q-meta-pill">ص {num(h.startPage)}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Tab 4: Pages (604 — virtualized 40-page band + quick range selector) */}
      {tab === 'pages' && (
        <div style={{ display: 'grid', gap: 10 }}>
          {!query.trim() && (
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
              {[0, 100, 200, 300, 400, 500, 564].map((start) => {
                const active = pageWindowStart >= start && pageWindowStart < start + 100;
                return (
                  <button
                    key={start}
                    type="button"
                    className={`q-chip${active ? ' on' : ''}`}
                    onClick={() => setPageWindowStart(start)}
                  >
                    ص {num(start + 1)}–{num(Math.min(TOTAL_PAGES, start + 40))}
                  </button>
                );
              })}
            </div>
          )}
          <div className="q-list-wrap is-grid" role="list" aria-label="صفحات المصحف">
            {visiblePages.map((p) => {
              const s = surahForPage(p);
              return (
                <button
                  key={p}
                  type="button"
                  className="q-meta-card"
                  onClick={() => onOpen({ surah: s.n, page: p, ayah: 1 })}
                >
                  <span className="q-meta-left">
                    <QStarBadge label={num(p)} />
                    <span className="q-surah-info">
                      <span className="q-surah-en">صفحة {num(p)}</span>
                      <span className="q-surah-sub">سورة {s.name} • الجزء {num(s.juz)}</span>
                    </span>
                  </span>
                  <span className="q-surah-ar" style={{ fontSize: '1.2rem' }}>{s.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Side Fast Scroller for Surahs (when unfiltered) & Pages */}
      {tab === 'surahs' && !query.trim() && (
        <div className="q-fast-track" aria-label="القفز السريع للسور">
          {FAST_SURAH_MARKS.map((m) => (
            <span
              key={m}
              role="button"
              tabIndex={0}
              className="q-fast-mark"
              onClick={() => jumpToSurah(m)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') jumpToSurah(m); }}
            >
              {num(m)}
            </span>
          ))}
        </div>
      )}
      {tab === 'pages' && !query.trim() && (
        <div className="q-fast-track" aria-label="القفز السريع للصفحات">
          {FAST_PAGE_MARKS.map((m) => (
            <span
              key={m}
              role="button"
              tabIndex={0}
              className="q-fast-mark"
              onClick={() => jumpToPageBand(m)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') jumpToPageBand(m); }}
            >
              {num(m)}
            </span>
          ))}
        </div>
      )}
      {fastBubble && <div className="q-fast-bubble" aria-live="polite">{fastBubble}</div>}
    </>
  );
}

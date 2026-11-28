import { useEffect, useMemo, useState } from 'react';
import { ArrowUpLeft, Clock, LoaderCircle, Search, Sparkles, Trash2, X } from 'lucide-react';
import { api } from '../../../../api';
import { MUSHAF_SURAHS, TOTAL_PAGES, surahForPage, type MushafSurah } from '../data/mushafMeta';
import { useQuran } from '../store/quranStore';
import { QChip, QStarBadge } from '../components/ui/Primitives';
import type { OpenTarget } from './QuranIndex';

const HISTORY_KEY = 'ahbab:quran:search-history:v1';

const POPULAR_QUERIES = [
  { label: 'آية الكرسي', target: { surah: 2, page: 42, ayah: 255 } as OpenTarget },
  { label: 'سورة الكهف', target: { surah: 18, page: 293, ayah: 1 } as OpenTarget },
  { label: 'سورة يس', target: { surah: 36, page: 440, ayah: 1 } as OpenTarget },
  { label: 'سورة الرحمن', target: { surah: 55, page: 531, ayah: 1 } as OpenTarget },
  { label: 'سورة الملك', target: { surah: 67, page: 562, ayah: 1 } as OpenTarget },
  { label: 'الله نور السماوات', query: 'الله نور السماوات' },
];

export function normalizeArabic(text: string): string {
  return text
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

interface AyahMatch {
  surah: number;
  ayah: number;
  text: string;
}

interface SearchApiResponse {
  count: number;
  matches: AyahMatch[];
}

type PlaceFilter = 'all' | 'مكية' | 'مدنية';
type ScopeFilter = 'all' | 'surahs' | 'ayahs';

function loadHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as string[]).slice(0, 8) : [];
  } catch {
    return [];
  }
}

function saveHistory(items: string[]) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, 8))); } catch { /* ignore */ }
}

/** Highlights matching words inside an ayah text while preserving Arabic readability. */
function HighlightAyah({ text, query }: { text: string; query: string }) {
  const words = normalizeArabic(query).split(' ').filter((w) => w.length >= 2);
  if (!words.length) return <>{text}</>;
  const tokens = text.split(/(\s+)/);
  return (
    <>
      {tokens.map((tok, i) => {
        const normTok = normalizeArabic(tok);
        const hit = normTok.length >= 2 && words.some((w) => normTok.includes(w));
        return hit ? (
          <mark
            key={i}
            style={{
              background: 'var(--q-ayah-hl)',
              color: 'var(--q-primary)',
              borderRadius: 6,
              paddingInline: 3,
              fontWeight: 800,
            }}
          >
            {tok}
          </mark>
        ) : (
          <span key={i}>{tok}</span>
        );
      })}
    </>
  );
}

export function QuranSearch({ onOpen }: { onOpen: (target: OpenTarget) => void }) {
  const { num } = useQuran();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [place, setPlace] = useState<PlaceFilter>('all');
  const [scope, setScope] = useState<ScopeFilter>('all');
  const [history, setHistory] = useState<string[]>(loadHistory);
  const [ayahMatches, setAyahMatches] = useState<AyahMatch[]>([]);
  const [totalAyahCount, setTotalAyahCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Debounce 220ms for smooth typing
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query.trim()), 220);
    return () => window.clearTimeout(t);
  }, [query]);

  // Direct jump parser: "255" (page), "2:255" (surah:ayah), "البقرة 255" (surah name + ayah)
  const directJump = useMemo<{ label: string; sub: string; target: OpenTarget } | null>(() => {
    const norm = normalizeArabic(query);
    if (!norm) return null;

    // Pattern 1: "2:255"
    const colon = norm.match(/^(\d{1,3})\s*[:：]\s*(\d{1,3})$/);
    if (colon) {
      const sNum = Number(colon[1]);
      const aNum = Number(colon[2]);
      const meta = MUSHAF_SURAHS[sNum - 1];
      if (meta && aNum >= 1 && aNum <= meta.verses) {
        return {
          label: `سورة ${meta.name} — الآية ${num(aNum)}`,
          sub: `انتقال مباشر · ص ${num(meta.page)}`,
          target: { surah: meta.n, page: meta.page, ayah: aNum },
        };
      }
    }

    // Pattern 2: "البقرة 255"
    const nameNum = norm.match(/^(.+?)\s+(\d{1,3})$/);
    if (nameNum) {
      const sQuery = nameNum[1].replace(/^سوره\s+/, '').trim();
      const aNum = Number(nameNum[2]);
      const meta = MUSHAF_SURAHS.find((s) => normalizeArabic(s.name).includes(sQuery));
      if (meta && aNum >= 1 && aNum <= meta.verses) {
        return {
          label: `سورة ${meta.name} — الآية ${num(aNum)}`,
          sub: `انتقال مباشر · ص ${num(meta.page)}`,
          target: { surah: meta.n, page: meta.page, ayah: aNum },
        };
      }
    }

    // Pattern 3: Page number 1..604
    if (/^\d{1,3}$/.test(norm)) {
      const p = Number(norm);
      if (p >= 1 && p <= TOTAL_PAGES) {
        const meta = surahForPage(p);
        return {
          label: `صفحة ${num(p)} — سورة ${meta.name}`,
          sub: `انتقال مباشر · الجزء ${num(meta.juz)}`,
          target: { surah: meta.n, page: p, ayah: 1 },
        };
      }
    }
    return null;
  }, [query, num]);

  // Instant Surah search (100% local & offline)
  const surahMatches = useMemo<MushafSurah[]>(() => {
    const norm = normalizeArabic(query).replace(/^سوره\s+/, '').trim();
    if (!norm) return [];
    return MUSHAF_SURAHS.filter((s) => {
      if (place !== 'all' && s.place !== place) return false;
      return (
        normalizeArabic(s.name).includes(norm)
        || s.en.toLowerCase().includes(norm)
        || String(s.n) === norm
      );
    });
  }, [query, place]);

  // Comprehensive Ayah search (all 6,236 ayahs via edge-cached /api/worship/search)
  useEffect(() => {
    const clean = normalizeArabic(debounced);
    if (clean.length < 2 || /^\d+$/.test(clean) || /^\d+:\d+$/.test(clean) || scope === 'surahs') {
      setAyahMatches([]);
      setTotalAyahCount(0);
      setLoading(false);
      setError('');
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError('');
    void api<SearchApiResponse>(`/worship/search?q=${encodeURIComponent(clean)}`)
      .then((res) => {
        if (cancelled) return;
        setAyahMatches(res.matches ?? []);
        setTotalAyahCount(res.count ?? res.matches?.length ?? 0);
      })
      .catch((e) => {
        if (cancelled) return;
        setError((e as Error).message || 'تعذّر البحث في الآيات حالياً');
        setAyahMatches([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [debounced, scope]);

  const filteredAyahs = useMemo(() => {
    if (place === 'all') return ayahMatches;
    return ayahMatches.filter((m) => MUSHAF_SURAHS[m.surah - 1]?.place === place);
  }, [ayahMatches, place]);

  const commitAndOpen = (target: OpenTarget, term?: string) => {
    const q = (term ?? query).trim();
    if (q.length >= 2) {
      const next = [q, ...history.filter((h) => h !== q)].slice(0, 8);
      setHistory(next);
      saveHistory(next);
    }
    onOpen(target);
  };

  const clearHistory = () => {
    setHistory([]);
    saveHistory([]);
  };

  const hasQuery = query.trim().length > 0;
  const showSurahs = scope !== 'ayahs' && surahMatches.length > 0;
  const showAyahs = scope !== 'surahs' && (loading || error || filteredAyahs.length > 0);

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {/* Main Comprehensive Search Input */}
      <label className="q-search-bar">
        <Search size={19} aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ابحث عن آية أو سورة أو صفحة (مثل: البقرة ٢٥٥)..."
          aria-label="بحث شامل في الآيات والسور"
          autoFocus
        />
        {hasQuery && (
          <button
            type="button"
            className="q-icon-btn"
            style={{ width: 32, height: 32 }}
            onClick={() => setQuery('')}
            aria-label="مسح البحث"
          >
            <X size={16} />
          </button>
        )}
      </label>

      {/* Filter Chips: Scope (الكل / السور / الآيات) + Place (مكية / مدنية) */}
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
        <QChip active={scope === 'all'} onClick={() => setScope('all')}>الكل</QChip>
        <QChip active={scope === 'surahs'} onClick={() => setScope('surahs')}>السور</QChip>
        <QChip active={scope === 'ayahs'} onClick={() => setScope('ayahs')}>الآيات</QChip>
        <span style={{ width: 1, background: 'var(--q-line)', marginInline: 2 }} aria-hidden="true" />
        <QChip active={place === 'مكية'} onClick={() => setPlace((p) => (p === 'مكية' ? 'all' : 'مكية'))}>مكية</QChip>
        <QChip active={place === 'مدنية'} onClick={() => setPlace((p) => (p === 'مدنية' ? 'all' : 'مدنية'))}>مدنية</QChip>
      </div>

      {/* Empty State: Popular Suggestions + Recent Search History */}
      {!hasQuery && (
        <div style={{ display: 'grid', gap: 14 }}>
          <div className="q-card" style={{ padding: 16, display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.86rem', fontWeight: 800, color: 'var(--q-primary)' }}>
              <Sparkles size={16} />
              <span>اقتراحات شائعة</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {POPULAR_QUERIES.map((item) => (
                <QChip
                  key={item.label}
                  onClick={() => {
                    if (item.target) commitAndOpen(item.target, item.label);
                    else if (item.query) setQuery(item.query);
                  }}
                >
                  {item.label}
                </QChip>
              ))}
            </div>
          </div>

          {history.length > 0 && (
            <div className="q-card" style={{ padding: 16, display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.86rem', fontWeight: 800, color: 'var(--q-ink-2)' }}>
                  <Clock size={16} />
                  <span>عمليات البحث الأخيرة</span>
                </span>
                <button
                  type="button"
                  className="q-btn ghost"
                  style={{ minHeight: 32, paddingInline: 10, fontSize: '0.78rem' }}
                  onClick={clearHistory}
                >
                  <Trash2 size={14} /> مسح
                </button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {history.map((h) => (
                  <QChip key={h} onClick={() => setQuery(h)}>{h}</QChip>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Direct Jump Banner */}
      {directJump && (
        <button
          type="button"
          className="q-meta-card"
          style={{ borderColor: 'var(--q-primary-border)', background: 'var(--q-primary-soft)' }}
          onClick={() => commitAndOpen(directJump.target)}
        >
          <span className="q-surah-info">
            <span className="q-surah-en" style={{ color: 'var(--q-primary)' }}>{directJump.label}</span>
            <span className="q-surah-sub">{directJump.sub}</span>
          </span>
          <ArrowUpLeft size={19} style={{ color: 'var(--q-primary)' }} />
        </button>
      )}

      {/* Matching Surahs Section */}
      {hasQuery && showSurahs && (
        <section style={{ display: 'grid', gap: 8 }} aria-label="نتائج السور">
          <div style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--q-ink-3)', paddingInline: 4 }}>
            السور ({num(surahMatches.length)})
          </div>
          <div className="q-list-wrap is-grid">
            {surahMatches.map((s) => (
              <button
                key={s.n}
                type="button"
                className="q-surah-card"
                onClick={() => commitAndOpen({ surah: s.n, page: s.page, ayah: 1 })}
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
            ))}
          </div>
        </section>
      )}

      {/* Matching Ayahs Section */}
      {hasQuery && showAyahs && (
        <section style={{ display: 'grid', gap: 8 }} aria-label="نتائج الآيات">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingInline: 4 }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--q-ink-3)' }}>
              الآيات {!loading && `(${num(filteredAyahs.length)}${totalAyahCount > filteredAyahs.length ? ` من ${num(totalAyahCount)}` : ''})`}
            </span>
          </div>

          {loading && (
            <div className="q-card" style={{ padding: 24, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, color: 'var(--q-ink-3)' }}>
              <LoaderCircle size={18} className="rq-spin" />
              <span>جارٍ البحث في آيات القرآن الكريم…</span>
            </div>
          )}

          {error && !loading && (
            <div className="q-card" style={{ padding: 18, textAlign: 'center', color: 'var(--q-danger)' }}>
              {error}
            </div>
          )}

          {!loading && filteredAyahs.map((m, idx) => {
            const s = MUSHAF_SURAHS[m.surah - 1];
            return (
              <button
                key={`${m.surah}-${m.ayah}-${idx}`}
                type="button"
                className="q-card"
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  textAlign: 'start',
                  cursor: 'pointer',
                  display: 'grid',
                  gap: 8,
                  font: 'inherit',
                  color: 'var(--q-ink)',
                }}
                onClick={() => commitAndOpen({ surah: m.surah, page: s?.page ?? 1, ayah: m.ayah })}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--q-primary)' }}>
                    سورة {s?.name ?? m.surah} · الآية {num(m.ayah)}
                  </span>
                  <span className="q-meta-pill">{s?.place}</span>
                </div>
                <p
                  style={{
                    margin: 0,
                    fontFamily: 'var(--q-font-mushaf)',
                    fontSize: '1.22rem',
                    lineHeight: 1.95,
                    color: 'var(--q-ink)',
                  }}
                >
                  <HighlightAyah text={m.text} query={debounced} />
                </p>
              </button>
            );
          })}
        </section>
      )}

      {/* No Results */}
      {hasQuery && !loading && !error && !directJump && !showSurahs && filteredAyahs.length === 0 && (
        <div className="q-card" style={{ padding: 28, textAlign: 'center', display: 'grid', gap: 6 }}>
          <strong style={{ color: 'var(--q-ink)' }}>لا توجد نتائج مطابقة لـ «{query}»</strong>
          <small style={{ color: 'var(--q-ink-3)' }}>
            جرّب البحث بكلمة أخرى من الآية أو باسم السورة أو برقم الصفحة (١–٦٠٤).
          </small>
        </div>
      )}
    </div>
  );
}

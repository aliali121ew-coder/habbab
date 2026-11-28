import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  ArrowRight, Bookmark, BookOpen, ChevronLeft, ChevronRight, Eye, EyeOff,
  LoaderCircle, Sparkles, Volume2, VolumeX,
} from 'lucide-react';
import '../styles/quran-reader.css';
import {
  getCachedPageSync, loadMushafPage, preloadAdjacentPages,
  type MushafAyah, type MushafPageData,
} from '../data/pageLoader';
import { TOTAL_PAGES, juzForPage, surahForPage } from '../data/mushafMeta';
import { useQuran, type FlipMode, type QuranTheme } from '../store/quranStore';
import { playPageFlipSound } from '../utils/pageSound';
import { QChip, QIconButton } from '../components/ui/Primitives';
import { AyahContextMenu } from '../components/AyahContextMenu';
import { idbSet, type StoredBookmark } from '../db/quranDb';

function renderTajweedText(text: string, enabled: boolean) {
  if (!enabled) return text;
  // Subtle highlight for Madd (آ / ٰٓ), Ghunna (نّ / مّ), and Qalqala letters with sukun
  const parts = text.split(/([نم]ّ|[قطبجد]ْ|[\u0622\u0653])/g);
  return parts.map((p, i) => {
    if (/^[نم]ّ$/.test(p)) return <span key={i} className="qr-tj-ghunna">{p}</span>;
    if (/^[قطبجد]ْ$/.test(p)) return <span key={i} className="qr-tj-qalqala">{p}</span>;
    if (/^[\u0622\u0653]$/.test(p)) return <span key={i} className="qr-tj-madd">{p}</span>;
    return <span key={i}>{p}</span>;
  });
}

function MushafPageSheet({
  data,
  loading,
  error,
  onRetry,
  fontSize,
  tajweed,
  hifzMode,
  revealedAyahs,
  highlightedAyah,
  num,
  onAyahSelect,
}: {
  data: MushafPageData | undefined;
  loading: boolean;
  error: string;
  onRetry: () => void;
  fontSize: number;
  tajweed: boolean;
  hifzMode: boolean;
  revealedAyahs: Set<string>;
  highlightedAyah: string | null;
  num: (v: number | string) => string;
  onAyahSelect: (ayah: MushafAyah, clientY: number) => void;
}) {
  const longPressTimer = useRef<number | null>(null);

  if (loading && !data) {
    return (
      <div className="qr-page-card" style={{ justifyContent: 'center', alignItems: 'center', gap: 10 }}>
        <LoaderCircle size={26} className="rq-spin" style={{ color: 'var(--q-primary)' }} />
        <small style={{ color: 'var(--q-ink-3)', fontWeight: 700 }}>جارٍ تجهيز صفحة المصحف…</small>
      </div>
    );
  }
  if (error && !data) {
    return (
      <div className="qr-page-card" style={{ justifyContent: 'center', alignItems: 'center', gap: 12, padding: 24, textAlign: 'center' }}>
        <strong style={{ color: 'var(--q-danger)' }}>{error}</strong>
        <button type="button" className="q-btn primary" onClick={onRetry}>إعادة المحاولة</button>
      </div>
    );
  }
  if (!data) return <div className="qr-page-card" />;

  const surahMeta = surahForPage(data.page);
  const juzMeta = juzForPage(data.page);
  const hizbNum = Math.ceil(data.hizbQuarter / 4);

  // Group ayahs into contiguous surah blocks on this page
  const blocks: { surah: number; surahName: string; startsSurah: boolean; ayahs: MushafAyah[] }[] = [];
  for (const a of data.ayahs) {
    const last = blocks[blocks.length - 1];
    if (!last || last.surah !== a.surah) {
      blocks.push({ surah: a.surah, surahName: a.surahName, startsSurah: a.n === 1, ayahs: [a] });
    } else {
      last.ayahs.push(a);
    }
  }

  return (
    <div className="qr-page-card">
      <div className="qr-page-head">
        <span>سورة {surahMeta.name}</span>
        <span>{juzMeta.name} · الحزب {num(hizbNum)}</span>
      </div>

      <div className="qr-page-scroll">
        {blocks.map((block, bIdx) => (
          <div key={`${block.surah}-${bIdx}`}>
            {block.startsSurah && (
              <>
                <div className="qr-surah-banner">{block.surahName}</div>
                {block.surah !== 1 && block.surah !== 9 && (
                  <p className="qr-basmala">بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</p>
                )}
              </>
            )}
            <div className="qr-mushaf-text" style={{ fontSize }}>
              {block.ayahs.map((a) => {
                const key = `${a.surah}:${a.n}`;
                const isHl = highlightedAyah === key;
                const isRevealed = revealedAyahs.has(key);
                return (
                  <span
                    key={key}
                    className={`qr-ayah${isHl ? ' hl' : ''}${hifzMode ? ' hidden-hifz' : ''}${isRevealed ? ' revealed' : ''}`}
                    onPointerDown={(e) => {
                      const y = e.clientY;
                      longPressTimer.current = window.setTimeout(() => {
                        onAyahSelect(a, y);
                      }, 420);
                    }}
                    onPointerUp={() => {
                      if (longPressTimer.current) {
                        window.clearTimeout(longPressTimer.current);
                        longPressTimer.current = null;
                      }
                    }}
                    onPointerCancel={() => {
                      if (longPressTimer.current) {
                        window.clearTimeout(longPressTimer.current);
                        longPressTimer.current = null;
                      }
                    }}
                    onClick={(e) => {
                      if (hifzMode) {
                        e.stopPropagation();
                        onAyahSelect(a, e.clientY);
                      }
                    }}
                  >
                    {renderTajweedText(a.text, tajweed)}
                    {a.sajda && <span className="qr-sajda" title="موضع سجدة">۩</span>}
                    <span
                      className="qr-ayah-rosette"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAyahSelect(a, e.clientY);
                      }}
                    >
                      ﴿{num(a.n)}﴾
                    </span>{' '}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="qr-page-foot">
        <span>— {num(data.page)} —</span>
      </div>
    </div>
  );
}

export function MushafReader({
  initialPage,
  initialAyah,
  onClose,
}: {
  initialPage: number;
  initialAyah?: number;
  onClose: () => void;
}) {
  const { settings, resolvedTheme, updateSettings, setLastRead, num } = useQuran();
  const [page, setPage] = useState(() => Math.max(1, Math.min(TOTAL_PAGES, initialPage)));
  const [pageData, setPageData] = useState<MushafPageData | undefined>(() => getCachedPageSync(initialPage));
  const [underPageData, setUnderPageData] = useState<MushafPageData | undefined>(undefined);
  const [loading, setLoading] = useState(!getCachedPageSync(initialPage));
  const [error, setError] = useState('');
  const [barsVisible, setBarsVisible] = useState(true);
  const [hifzMode, setHifzMode] = useState(false);
  const [revealedAyahs, setRevealedAyahs] = useState<Set<string>>(new Set());
  const [selectedAyah, setSelectedAyah] = useState<{ ayah: MushafAyah; y: number } | null>(null);
  const [quickBookmarked, setQuickBookmarked] = useState(false);

  // Interactive 3D Page Curl drag state
  // progress: 0 = resting, >0 = curling toward NEXT page (RTL left->right drag), <0 = curling toward PREV page (right->left drag)
  const [dragProgress, setDragProgress] = useState(0);
  const [animating, setAnimating] = useState(false);
  const dragRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    startTime: number;
    width: number;
    locked: 'none' | 'horizontal' | 'vertical';
  }>({ active: false, startX: 0, startY: 0, startTime: 0, width: 375, locked: 'none' });
  const bookRef = useRef<HTMLDivElement | null>(null);
  const reducedMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  // Load current page + preload adjacent pages
  const fetchCurrent = useCallback((p: number) => {
    const cached = getCachedPageSync(p);
    if (cached) {
      setPageData(cached);
      setLoading(false);
      setError('');
    } else {
      setLoading(true);
      setError('');
    }
    void loadMushafPage(p)
      .then((d) => {
        setPageData(d);
        setLoading(false);
        const first = d.ayahs[0];
        if (first) {
          setLastRead({ surah: first.surah, page: p, ayah: p === initialPage && initialAyah ? initialAyah : first.n });
        }
      })
      .catch((e) => {
        setError((e as Error).message || 'تعذّر تحميل الصفحة');
        setLoading(false);
      });
    preloadAdjacentPages(p);
  }, [initialAyah, initialPage, setLastRead]);

  useEffect(() => {
    fetchCurrent(page);
    setRevealedAyahs(new Set());
  }, [page, fetchCurrent]);

  // Keep Screen Awake (Wake Lock API) while reading
  useEffect(() => {
    if (!settings.wakeLock || !('wakeLock' in navigator)) return;
    let sentinel: { release: () => Promise<void> } | null = null;
    const lockApi = (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock;
    void lockApi?.request('screen').then((s) => { sentinel = s; }).catch(() => undefined);
    return () => { void sentinel?.release().catch(() => undefined); };
  }, [settings.wakeLock]);

  // Programmatic animated flip (for buttons / keyboard arrows)
  const flipTo = useCallback((dir: 1 | -1) => {
    const next = page + dir;
    if (next < 1 || next > TOTAL_PAGES || animating) return;
    setUnderPageData(getCachedPageSync(next));
    if (settings.flipSound) playPageFlipSound();
    if (reducedMotion || settings.flipMode === 'scroll') {
      setPage(next);
      return;
    }
    setAnimating(true);
    setDragProgress(dir);
    window.setTimeout(() => {
      setAnimating(false);
      setDragProgress(0);
      setPage(next);
    }, 330);
  }, [animating, page, reducedMotion, settings.flipMode, settings.flipSound]);

  // Desktop keyboard shortcuts (RTL: ArrowLeft = Next page, ArrowRight = Prev page, Escape = Close)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); flipTo(1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); flipTo(-1); }
      else if (e.key === 'Escape') { onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flipTo, onClose]);

  // Pointer drag-follow handlers for 60fps 3D Page Curl
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (animating || settings.flipMode === 'scroll' || selectedAyah) return;
    const rect = bookRef.current?.getBoundingClientRect();
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      startTime: performance.now(),
      width: rect?.width || window.innerWidth,
      locked: 'none',
    };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d.active) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;

    if (d.locked === 'none') {
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.15) {
        d.locked = 'horizontal';
      } else if (Math.abs(dy) > 12) {
        d.locked = 'vertical';
        return;
      } else {
        return;
      }
    }
    if (d.locked !== 'horizontal') return;

    // RTL Mushaf: dragging left -> right (dx > 0) turns to NEXT page (+1); right -> left (dx < 0) goes PREV (-1)
    let ratio = dx / d.width;
    if (ratio > 0 && page >= TOTAL_PAGES) ratio = 0;
    if (ratio < 0 && page <= 1) ratio = 0;
    ratio = Math.max(-1, Math.min(1, ratio));

    const targetPage = ratio > 0 ? page + 1 : ratio < 0 ? page - 1 : page;
    if (targetPage !== page) {
      const under = getCachedPageSync(targetPage);
      if (under !== underPageData) setUnderPageData(under);
    }
    setDragProgress(ratio);
  };

  const finishDrag = (clientX: number) => {
    const d = dragRef.current;
    if (!d.active) return;
    d.active = false;

    if (d.locked !== 'horizontal') return;
    const dx = clientX - d.startX;
    const dt = Math.max(16, performance.now() - d.startTime);
    const velocity = Math.abs(dx) / dt; // px/ms
    const ratio = dx / d.width;

    const shouldCommit = Math.abs(ratio) > 0.24 || (velocity > 0.42 && Math.abs(dx) > 28);
    const dir: 1 | -1 = ratio > 0 ? 1 : -1;
    const next = page + dir;

    if (shouldCommit && next >= 1 && next <= TOTAL_PAGES) {
      if (settings.flipSound) playPageFlipSound();
      setAnimating(true);
      setDragProgress(dir);
      window.setTimeout(() => {
        setAnimating(false);
        setDragProgress(0);
        setPage(next);
      }, 320);
    } else {
      setAnimating(true);
      setDragProgress(0);
      window.setTimeout(() => setAnimating(false), 260);
    }
  };

  const quickBookmarkPage = async () => {
    const first = pageData?.ayahs[0];
    if (!first) return;
    const id = `${first.surah}:${first.n}`;
    const entry: StoredBookmark = {
      id,
      surah: first.surah,
      ayah: first.n,
      page,
      color: '#B8963E',
      label: 'علامة صفحة',
      note: `صفحة ${page} · ${first.surahName}`,
      createdAt: Date.now(),
    };
    await idbSet('bookmarks', id, entry);
    setQuickBookmarked(true);
    setTimeout(() => setQuickBookmarked(false), 1500);
  };

  const surahMeta = surahForPage(page);
  const juzMeta = juzForPage(page);

  // Compute 3D Curl Transform, Dynamic Cast Shadow, Paper Sheen & Corner Peel
  const absP = Math.abs(dragProgress);
  const isNext = dragProgress >= 0;
  const effectiveMode: FlipMode = reducedMotion ? 'slide' : settings.flipMode;

  let sheetTransform = 'none';
  let sheetOrigin = 'right center';
  if (absP > 0.001) {
    if (effectiveMode === 'curl') {
      // Curl around the spine: next page curls from left edge toward right spine
      sheetOrigin = isNext ? 'right center' : 'left center';
      const angle = isNext ? absP * 112 : -absP * 112;
      const liftZ = Math.sin(absP * Math.PI) * 28;
      sheetTransform = `translateZ(${liftZ.toFixed(1)}px) rotateY(${angle.toFixed(2)}deg)`;
    } else {
      const tx = dragProgress * 104;
      sheetTransform = `translateX(${tx.toFixed(2)}%)`;
    }
  }

  const peelSize = effectiveMode === 'curl' ? Math.round(Math.sin(Math.min(1, absP * 1.15) * Math.PI) * 145) : 0;
  const sheenOpacity = effectiveMode === 'curl' ? Math.min(0.95, absP * 1.4) : 0;
  const underShadowOpacity = Math.max(0, (1 - absP * 0.7) * Math.min(1, absP * 2.2));

  const cycleTheme = () => {
    const order: QuranTheme[] = ['light', 'sepia', 'dark'];
    const idx = order.indexOf(resolvedTheme);
    updateSettings({ themePref: order[(idx + 1) % order.length] });
  };

  const cycleFlipMode = () => {
    const order: FlipMode[] = ['curl', 'slide', 'scroll'];
    const idx = order.indexOf(settings.flipMode);
    updateSettings({ flipMode: order[(idx + 1) % order.length] });
  };

  const flipLabel = settings.flipMode === 'curl' ? 'تقليب ورقي' : settings.flipMode === 'slide' ? 'انزلاق' : 'تمرير';

  return (
    <div className="q-root qr-fullscreen" dir="rtl" data-q-theme={resolvedTheme}>
      {/* Immersive Top Bar */}
      <header className={`qr-topbar${barsVisible ? '' : ' hidden'}`}>
        <QIconButton onClick={onClose} aria-label="العودة إلى الفهرس">
          <ArrowRight size={22} />
        </QIconButton>
        <div className="qr-top-meta">
          <strong>سورة {surahMeta.name}</strong>
          <small>{juzMeta.name} · صفحة {num(page)} من {num(TOTAL_PAGES)}</small>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <QIconButton
            active={settings.flipSound}
            onClick={() => updateSettings({ flipSound: !settings.flipSound })}
            aria-label={settings.flipSound ? 'كتم صوت الورق' : 'تشغيل صوت الورق'}
            title={settings.flipSound ? 'صوت الورق مفعّل' : 'صوت الورق مكتوم'}
          >
            {settings.flipSound ? <Volume2 size={19} /> : <VolumeX size={19} />}
          </QIconButton>
          <QIconButton
            active={quickBookmarked}
            onClick={() => void quickBookmarkPage()}
            aria-label="حفظ علامة لهذه الصفحة"
          >
            <Bookmark size={19} fill={quickBookmarked ? 'currentColor' : 'none'} />
          </QIconButton>
        </div>
      </header>

      {/* Main 3D Page Stage */}
      <main
        className="qr-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => finishDrag(e.clientX)}
        onPointerCancel={(e) => finishDrag(e.clientX)}
        onClick={() => {
          if (dragRef.current.locked !== 'horizontal') setBarsVisible((v) => !v);
        }}
      >
        {/* Desktop Side Page Arrows */}
        {page > 1 && (
          <button
            type="button"
            className="qr-edge-btn prev"
            onClick={(e) => { e.stopPropagation(); flipTo(-1); }}
            aria-label="الصفحة السابقة"
          >
            <ChevronRight size={22} />
          </button>
        )}
        {page < TOTAL_PAGES && (
          <button
            type="button"
            className="qr-edge-btn next"
            onClick={(e) => { e.stopPropagation(); flipTo(1); }}
            aria-label="الصفحة التالية"
          >
            <ChevronLeft size={22} />
          </button>
        )}

        <div ref={bookRef} className="qr-book">
          {/* Underneath revealed page during curl/slide */}
          {absP > 0.001 && (
            <div className="qr-sheet-under" aria-hidden="true">
              <MushafPageSheet
                data={underPageData}
                loading={!underPageData}
                error=""
                onRetry={() => undefined}
                fontSize={settings.fontSize}
                tajweed={settings.tajweed}
                hifzMode={hifzMode}
                revealedAyahs={revealedAyahs}
                highlightedAyah={null}
                num={num}
                onAyahSelect={() => undefined}
              />
              <div
                className="qr-under-shadow"
                style={{
                  opacity: underShadowOpacity,
                  transform: `translateX(${isNext ? (absP - 0.5) * 60 : (0.5 - absP) * 60}%)`,
                }}
              />
            </div>
          )}

          {/* Active Turning Sheet */}
          <div
            className={`qr-sheet-active${animating ? ' animating' : ''}`}
            style={{
              transformOrigin: sheetOrigin,
              transform: sheetTransform,
            }}
          >
            <MushafPageSheet
              data={pageData}
              loading={loading}
              error={error}
              onRetry={() => fetchCurrent(page)}
              fontSize={settings.fontSize}
              tajweed={settings.tajweed}
              hifzMode={hifzMode}
              revealedAyahs={revealedAyahs}
              highlightedAyah={selectedAyah ? `${selectedAyah.ayah.surah}:${selectedAyah.ayah.n}` : null}
              num={num}
              onAyahSelect={(ayah, y) => {
                if (hifzMode) {
                  const key = `${ayah.surah}:${ayah.n}`;
                  setRevealedAyahs((prev) => {
                    const next = new Set(prev);
                    if (next.has(key)) next.delete(key);
                    else next.add(key);
                    return next;
                  });
                } else {
                  setSelectedAyah({ ayah, y });
                }
              }}
            />

            {/* Dynamic Specular Paper Bend Sheen */}
            {sheenOpacity > 0.01 && (
              <div
                className="qr-curl-sheen"
                style={{
                  opacity: sheenOpacity,
                  background: isNext
                    ? `linear-gradient(90deg, rgb(0 0 0 / 26%) 0%, rgb(255 255 255 / 32%) ${Math.max(12, 52 - absP * 38)}%, rgb(0 0 0 / 12%) 75%, transparent 100%)`
                    : `linear-gradient(270deg, rgb(0 0 0 / 26%) 0%, rgb(255 255 255 / 32%) ${Math.max(12, 52 - absP * 38)}%, rgb(0 0 0 / 12%) 75%, transparent 100%)`,
                }}
              />
            )}

            {/* Curled Corner Fold Visual */}
            {peelSize > 4 && (
              <div
                className="qr-curl-peel"
                style={{
                  width: peelSize,
                  height: peelSize,
                  [isNext ? 'left' : 'right']: 0,
                  borderRadius: isNext ? '0 0 24px 0' : '0 0 0 24px',
                }}
              />
            )}
          </div>
        </div>
      </main>

      {/* Immersive Bottom Bar: Page Slider + Quick Reading Tools */}
      <footer className={`qr-bottombar${barsVisible ? '' : ' hidden'}`}>
        <div className="qr-slider-row">
          <span className="qr-slider-badge">ص {num(page)}</span>
          <input
            type="range"
            min={1}
            max={TOTAL_PAGES}
            value={page}
            onChange={(e) => setPage(Number(e.target.value))}
            aria-label="الانتقال إلى صفحة المصحف"
          />
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--q-ink-3)' }}>{num(TOTAL_PAGES)}</span>
        </div>

        <div className="qr-tools-row">
          <QChip onClick={cycleFlipMode}>
            <BookOpen size={14} /> {flipLabel}
          </QChip>
          <QChip active={settings.tajweed} onClick={() => updateSettings({ tajweed: !settings.tajweed })}>
            <Sparkles size={14} /> تجويد
          </QChip>
          <QChip active={hifzMode} onClick={() => setHifzMode((v) => !v)}>
            {hifzMode ? <EyeOff size={14} /> : <Eye size={14} />} حفظ
          </QChip>
          <QChip onClick={() => updateSettings({ fontSize: Math.max(18, settings.fontSize - 2) })}>أ−</QChip>
          <QChip onClick={() => updateSettings({ fontSize: Math.min(34, settings.fontSize + 2) })}>أ+</QChip>
          <QChip onClick={cycleTheme}>
            {resolvedTheme === 'light' ? 'نهاري' : resolvedTheme === 'sepia' ? 'ورقي' : 'ليلي'}
          </QChip>
        </div>
      </footer>

      {/* Floating Ayah Context Menu */}
      {selectedAyah && (
        <AyahContextMenu
          ayah={selectedAyah.ayah}
          page={page}
          anchorY={selectedAyah.y}
          onClose={() => setSelectedAyah(null)}
        />
      )}
    </div>
  );
}

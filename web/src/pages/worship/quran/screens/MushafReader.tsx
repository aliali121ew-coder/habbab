import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
                      longPressTimer.current = window.setTimeout(() => onAyahSelect(a, y), 420);
                    }}
                    onPointerUp={() => {
                      if (longPressTimer.current) { window.clearTimeout(longPressTimer.current); longPressTimer.current = null; }
                    }}
                    onPointerMove={() => {
                      if (longPressTimer.current) { window.clearTimeout(longPressTimer.current); longPressTimer.current = null; }
                    }}
                    onPointerCancel={() => {
                      if (longPressTimer.current) { window.clearTimeout(longPressTimer.current); longPressTimer.current = null; }
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

interface CurlState {
  active: boolean;
  /** +1 = turning to NEXT page (peeling from left edge -> right), -1 = turning to PREV page (right -> left) */
  dir: 1 | -1;
  /** 0..1: exact position of the curled fold across the page (freezes wherever the user holds their finger!) */
  progress: number;
  /** -1 (top) .. +1 (bottom): tilts the diagonal curl edge toward the user's finger position */
  tilt: number;
}

const IDLE_CURL: CurlState = { active: false, dir: 1, progress: 0, tilt: 0.25 };

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

  // Interactive 60fps Page Curl state (stays held wherever user keeps their finger!)
  const [curl, setCurl] = useState<CurlState>(IDLE_CURL);
  const curlRef = useRef<CurlState>(IDLE_CURL);
  const rafAnimRef = useRef<number | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const bookRef = useRef<HTMLDivElement | null>(null);
  const pageRef = useRef(page);
  pageRef.current = page;

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const selectedRef = useRef(selectedAyah);
  selectedRef.current = selectedAyah;

  const reducedMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  const setCurlBoth = useCallback((next: CurlState) => {
    curlRef.current = next;
    setCurl(next);
  }, []);

  const cancelAnim = useCallback(() => {
    if (rafAnimRef.current !== null) {
      cancelAnimationFrame(rafAnimRef.current);
      rafAnimRef.current = null;
    }
  }, []);

  // Load current page + preload next 2 & prev page immediately
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

  // Wake Lock API
  useEffect(() => {
    if (!settings.wakeLock || !('wakeLock' in navigator)) return;
    let sentinel: { release: () => Promise<void> } | null = null;
    const lockApi = (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock;
    void lockApi?.request('screen').then((s) => { sentinel = s; }).catch(() => undefined);
    return () => { void sentinel?.release().catch(() => undefined); };
  }, [settings.wakeLock]);

  // Smooth rAF animation from current curl progress -> target (0 = snap back, 1 = complete turn)
  const animateCurlTo = useCallback((
    dir: 1 | -1,
    fromProgress: number,
    toProgress: 0 | 1,
    tilt: number,
    durationMs: number,
    onDone?: () => void,
  ) => {
    cancelAnim();
    const start = performance.now();
    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
    const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

    const step = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / durationMs);
      const eased = fromProgress === 0 ? easeInOutCubic(t) : easeOutCubic(t);
      const progress = fromProgress + (toProgress - fromProgress) * eased;
      setCurlBoth({ active: true, dir, progress, tilt });
      if (t < 1) {
        rafAnimRef.current = requestAnimationFrame(step);
      } else {
        rafAnimRef.current = null;
        setCurlBoth(IDLE_CURL);
        onDone?.();
      }
    };
    rafAnimRef.current = requestAnimationFrame(step);
  }, [cancelAnim, setCurlBoth]);

  // Programmatic visible page curl (for side buttons / keyboard arrows — 620ms so user clearly sees the curled paper!)
  const flipTo = useCallback((dir: 1 | -1) => {
    const curr = pageRef.current;
    const next = curr + dir;
    if (next < 1 || next > TOTAL_PAGES || rafAnimRef.current !== null) return;
    setUnderPageData(getCachedPageSync(next));
    void loadMushafPage(next).then((d) => setUnderPageData(d)).catch(() => undefined);
    if (settingsRef.current.flipSound) playPageFlipSound();
    if (reducedMotion || settingsRef.current.flipMode === 'scroll') {
      setPage(next);
      return;
    }
    animateCurlTo(dir, 0, 1, 0.35, 620, () => setPage(next));
  }, [animateCurlTo, reducedMotion]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); flipTo(1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); flipTo(-1); }
      else if (e.key === 'Escape') { onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flipTo, onClose]);

  // Native non-passive touch + mouse listeners so dragging NEVER gets hijacked by mobile scroll/back-swipe
  // AND stays paused curled in place as long as the user holds their finger down!
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const drag = {
      down: false,
      startX: 0,
      startY: 0,
      lastX: 0,
      startTime: 0,
      lastTime: 0,
      width: 375,
      height: 700,
      top: 0,
      locked: 'none' as 'none' | 'horizontal' | 'vertical',
      moved: false,
    };

    const startGesture = (clientX: number, clientY: number) => {
      if (settingsRef.current.flipMode === 'scroll' || selectedRef.current) return;
      cancelAnim();
      const rect = bookRef.current?.getBoundingClientRect();
      drag.down = true;
      drag.startX = clientX;
      drag.startY = clientY;
      drag.lastX = clientX;
      drag.startTime = performance.now();
      drag.lastTime = drag.startTime;
      drag.width = rect?.width || window.innerWidth;
      drag.height = rect?.height || window.innerHeight;
      drag.top = rect?.top || 0;
      drag.locked = 'none';
      drag.moved = false;
    };

    const moveGesture = (clientX: number, clientY: number, prevent?: () => void) => {
      if (!drag.down) return;
      const dx = clientX - drag.startX;
      const dy = clientY - drag.startY;

      if (drag.locked === 'none') {
        if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.1) {
          drag.locked = 'horizontal';
          drag.moved = true;
        } else if (Math.abs(dy) > 12) {
          drag.locked = 'vertical';
          return;
        } else {
          return;
        }
      }
      if (drag.locked !== 'horizontal') return;
      prevent?.();

      const currPage = pageRef.current;
      // RTL Mushaf: drag left -> right (dx > 0) peels to NEXT page (+1); right -> left (dx < 0) peels to PREV (-1)
      const dir: 1 | -1 = dx >= 0 ? 1 : -1;
      const targetPage = currPage + dir;
      if (targetPage < 1 || targetPage > TOTAL_PAGES) {
        setCurlBoth(IDLE_CURL);
        return;
      }

      const rawProgress = Math.min(0.98, Math.max(0.01, Math.abs(dx) / (drag.width * 0.88)));
      const normY = ((clientY - drag.top) / drag.height) * 2 - 1; // -1 (top) .. +1 (bottom)
      const tilt = Math.max(-0.85, Math.min(0.85, normY));

      const cachedUnder = getCachedPageSync(targetPage);
      if (cachedUnder) setUnderPageData(cachedUnder);
      else void loadMushafPage(targetPage).then((d) => setUnderPageData(d)).catch(() => undefined);

      drag.lastX = clientX;
      drag.lastTime = performance.now();
      setCurlBoth({ active: true, dir, progress: rawProgress, tilt });
    };

    const endGesture = (clientX: number) => {
      if (!drag.down) return;
      drag.down = false;

      if (drag.locked !== 'horizontal') return;
      const c = curlRef.current;
      if (!c.active) return;

      const totalDx = clientX - drag.startX;
      const dt = Math.max(16, performance.now() - drag.startTime);
      const velocity = Math.abs(totalDx) / dt; // px/ms
      const next = pageRef.current + c.dir;

      const shouldCommit = (c.progress > 0.28 || (velocity > 0.35 && c.progress > 0.08))
        && next >= 1 && next <= TOTAL_PAGES;

      if (shouldCommit) {
        if (settingsRef.current.flipSound) playPageFlipSound();
        const remainingMs = Math.max(240, Math.round((1 - c.progress) * 520));
        animateCurlTo(c.dir, c.progress, 1, c.tilt, remainingMs, () => setPage(next));
      } else {
        const backMs = Math.max(200, Math.round(c.progress * 380));
        animateCurlTo(c.dir, c.progress, 0, c.tilt, backMs);
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      startGesture(e.touches[0].clientX, e.touches[0].clientY);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      moveGesture(e.touches[0].clientX, e.touches[0].clientY, () => e.preventDefault());
    };
    const onTouchEnd = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      endGesture(t ? t.clientX : drag.lastX);
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      startGesture(e.clientX, e.clientY);
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!drag.down) return;
      moveGesture(e.clientX, e.clientY, () => e.preventDefault());
    };
    const onMouseUp = (e: MouseEvent) => endGesture(e.clientX);

    stage.addEventListener('touchstart', onTouchStart, { passive: true });
    stage.addEventListener('touchmove', onTouchMove, { passive: false });
    stage.addEventListener('touchend', onTouchEnd, { passive: true });
    stage.addEventListener('touchcancel', onTouchEnd, { passive: true });
    stage.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      cancelAnim();
      stage.removeEventListener('touchstart', onTouchStart);
      stage.removeEventListener('touchmove', onTouchMove);
      stage.removeEventListener('touchend', onTouchEnd);
      stage.removeEventListener('touchcancel', onTouchEnd);
      stage.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [animateCurlTo, cancelAnim, setCurlBoth]);

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

  // ── Compute Real Geometric Page Curl Clip-Paths, Curled Flap & Dynamic Shadows ──
  const effectiveMode: FlipMode = reducedMotion ? 'slide' : settings.flipMode;
  const isCurling = curl.active && curl.progress > 0.002;
  const p = curl.progress; // 0..1
  const isNext = curl.dir === 1;

  // Diagonal fold line X coordinates at top (y=0%) and bottom (y=100%)
  // Tilt gives the iconic diagonal curved-corner peel (matching the reference image!)
  const tiltOffset = curl.tilt * Math.sin(p * Math.PI) * 18; // up to ±18% diagonal slant
  const foldCenter = isNext ? p * 100 : (1 - p) * 100;
  const foldTop = Math.max(-5, Math.min(105, foldCenter - tiltOffset));
  const foldBot = Math.max(-5, Math.min(105, foldCenter + tiltOffset));

  // Curled back-side paper flap width (widest in mid-turn, tapers cleanly at edges)
  const flapWidth = Math.min(38, Math.sin(Math.pow(p, 0.85) * Math.PI) * 44);
  const flapTop = isNext ? Math.min(108, foldTop + flapWidth) : Math.max(-8, foldTop - flapWidth);
  const flapBot = isNext ? Math.min(108, foldBot + flapWidth) : Math.max(-8, foldBot - flapWidth);

  // Clip-path of the front (current) page: everything NOT yet peeled away
  const frontClip = isCurling && effectiveMode === 'curl'
    ? (isNext
      ? `polygon(${foldTop.toFixed(2)}% 0%, 100% 0%, 100% 100%, ${foldBot.toFixed(2)}% 100%)`
      : `polygon(0% 0%, ${foldTop.toFixed(2)}% 0%, ${foldBot.toFixed(2)}% 100%, 0% 100%)`)
    : undefined;

  // Clip-path of the curled-over back side of the paper flap
  const flapClip = isCurling && effectiveMode === 'curl'
    ? (isNext
      ? `polygon(${foldTop.toFixed(2)}% 0%, ${flapTop.toFixed(2)}% 0%, ${flapBot.toFixed(2)}% 100%, ${foldBot.toFixed(2)}% 100%)`
      : `polygon(${flapTop.toFixed(2)}% 0%, ${foldTop.toFixed(2)}% 0%, ${foldBot.toFixed(2)}% 100%, ${flapBot.toFixed(2)}% 100%)`)
    : undefined;

  // Cylindrical 3D paper shading across the curled flap (matches warm/white glossy bent sheet)
  const isDark = resolvedTheme === 'dark';
  const isSepia = resolvedTheme === 'sepia';
  const flapGrad = isDark
    ? (isNext
      ? `linear-gradient(90deg, #0A0D0C 0%, #1F2824 28%, #2E3A34 55%, #161C19 88%, #070908 100%)`
      : `linear-gradient(270deg, #0A0D0C 0%, #1F2824 28%, #2E3A34 55%, #161C19 88%, #070908 100%)`)
    : isSepia
      ? (isNext
        ? `linear-gradient(90deg, #D5C4A0 0%, #FBF4E3 30%, #FFFDF7 54%, #E8D9B9 86%, #C4B089 100%)`
        : `linear-gradient(270deg, #D5C4A0 0%, #FBF4E3 30%, #FFFDF7 54%, #E8D9B9 86%, #C4B089 100%)`)
      : (isNext
        ? `linear-gradient(90deg, #DED8C8 0%, #FFFFFF 32%, #FDFBF5 58%, #EAE4D6 88%, #C8C1B2 100%)`
        : `linear-gradient(270deg, #DED8C8 0%, #FFFFFF 32%, #FDFBF5 58%, #EAE4D6 88%, #C8C1B2 100%)`);

  // Dynamic cast shadow falling onto the revealed page right behind the curled fold
  const shadowStrength = Math.sin(p * Math.PI);
  const castShadowBg = isNext
    ? `linear-gradient(90deg, transparent ${Math.max(0, foldCenter - 26).toFixed(1)}%, rgb(0 0 0 / ${(0.42 * shadowStrength).toFixed(2)}) ${Math.max(0, foldCenter - 2).toFixed(1)}%, rgb(0 0 0 / ${(0.22 * shadowStrength).toFixed(2)}) ${Math.min(100, foldCenter + 12).toFixed(1)}%, transparent ${Math.min(100, foldCenter + 30).toFixed(1)}%)`
    : `linear-gradient(90deg, transparent ${Math.max(0, foldCenter - 30).toFixed(1)}%, rgb(0 0 0 / ${(0.22 * shadowStrength).toFixed(2)}) ${Math.max(0, foldCenter - 12).toFixed(1)}%, rgb(0 0 0 / ${(0.42 * shadowStrength).toFixed(2)}) ${Math.min(100, foldCenter + 2).toFixed(1)}%, transparent ${Math.min(100, foldCenter + 26).toFixed(1)}%)`;

  // Slide mode transform fallback
  const slideTransform = isCurling && effectiveMode === 'slide'
    ? `translateX(${(isNext ? p : -p) * 100}%)`
    : undefined;

  const cycleTheme = () => {
    const order: QuranTheme[] = ['light', 'sepia', 'dark'];
    updateSettings({ themePref: order[(order.indexOf(resolvedTheme) + 1) % order.length] });
  };

  const cycleFlipMode = () => {
    const order: FlipMode[] = ['curl', 'slide', 'scroll'];
    updateSettings({ flipMode: order[(order.indexOf(settings.flipMode) + 1) % order.length] });
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

      {/* Main Interactive Page Curl Stage */}
      <main
        ref={stageRef}
        className="qr-stage"
        onClick={() => {
          if (!curlRef.current.active) setBarsVisible((v) => !v);
        }}
      >
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
          {/* Layer 1: Revealed Underneath Page */}
          {isCurling && (
            <div className="qr-layer-under" aria-hidden="true">
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
            </div>
          )}

          {/* Layer 2: Dynamic Cast Shadow on Revealed Page */}
          {isCurling && effectiveMode === 'curl' && (
            <div className="qr-layer-cast-shadow" style={{ background: castShadowBg }} />
          )}

          {/* Layer 3: Active Front Page (clipped live to the fold line) */}
          <div
            className="qr-layer-front"
            style={{
              clipPath: frontClip,
              WebkitClipPath: frontClip,
              transform: slideTransform,
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

            {/* Subtle Corner Peel Hint when idle */}
            {!isCurling && effectiveMode === 'curl' && page < TOTAL_PAGES && (
              <span className="qr-corner-hint" aria-hidden="true" />
            )}
          </div>

          {/* Layer 4: Curled Back-Side Paper Flap with Cylindrical Shading & Cast Drop Shadow */}
          {isCurling && effectiveMode === 'curl' && flapClip && (
            <div
              className="qr-curl-flap-wrap"
              style={{
                filter: `drop-shadow(${isNext ? -14 : 14}px 6px 20px rgb(0 0 0 / ${(0.45 * shadowStrength).toFixed(2)}))`,
              }}
            >
              <div
                className="qr-curl-flap"
                style={{
                  clipPath: flapClip,
                  WebkitClipPath: flapClip,
                  background: flapGrad,
                }}
              />
            </div>
          )}
        </div>
      </main>

      {/* Immersive Bottom Bar */}
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

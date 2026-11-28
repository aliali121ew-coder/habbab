import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { playPageFlipSound, warmPageAudio } from '../utils/pageSound';
import { prewarmPageCanvases, renderMushafPageCanvas } from '../utils/mushafCanvasRenderer';
import { QChip, QIconButton } from '../components/ui/Primitives';
import { AyahContextMenu } from '../components/AyahContextMenu';
import { idbSet, type StoredBookmark } from '../db/quranDb';
import type { WebGLCurlFrame } from '../components/WebGLPageCurl';

// Lazy-load Three.js WebGL Page Curl ONLY when MushafReader opens
const LazyWebGLPageCurl = lazy(() => import('../components/WebGLPageCurl'));

function checkWebGLAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl'));
  } catch {
    return false;
  }
}

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
  scrollRef,
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
  scrollRef?: React.RefObject<HTMLDivElement | null>;
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

      <div ref={scrollRef} className="qr-page-scroll">
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
      <div className="qr-gut" aria-hidden="true" />
    </div>
  );
}

const IDLE_FRAME: WebGLCurlFrame = {
  active: false,
  dir: 1,
  progress: 0,
  cornerTilt: 0.35,
  speed: 0,
};

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
  const [pagesMap, setPagesMap] = useState<Record<number, MushafPageData>>(() => {
    const init: Record<number, MushafPageData> = {};
    for (const p of [initialPage, initialPage + 1, initialPage - 1]) {
      const hit = getCachedPageSync(p);
      if (hit) init[p] = hit;
    }
    return init;
  });
  const [loading, setLoading] = useState(!getCachedPageSync(initialPage));
  const [error, setError] = useState('');
  const [barsVisible, setBarsVisible] = useState(true);
  const [hifzMode, setHifzMode] = useState(false);
  const [revealedAyahs, setRevealedAyahs] = useState<Set<string>>(new Set());
  const [selectedAyah, setSelectedAyah] = useState<{ ayah: MushafAyah; y: number } | null>(null);
  const [quickBookmarked, setQuickBookmarked] = useState(false);

  // Capabilities & automatic fallback detection
  const webglSupported = useMemo(checkWebGLAvailable, []);
  const reducedMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );
  const useWebGL = webglSupported && !reducedMotion && settings.flipMode === 'curl';

  // Measure `.qr-book` dimensions so WebGL mesh & Canvas textures match the DOM card pixel-for-pixel
  const stageRef = useRef<HTMLDivElement | null>(null);
  const bookRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [bookSize, setBookSize] = useState<{ w: number; h: number }>({ w: 360, h: 580 });

  useEffect(() => {
    const el = bookRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 40 && r.height > 40) {
        setBookSize((prev) =>
          Math.abs(prev.w - r.width) < 1 && Math.abs(prev.h - r.height) < 1
            ? prev
            : { w: Math.round(r.width), h: Math.round(r.height) },
        );
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [barsVisible]);

  // WebGL active state & textures
  const frameRef = useRef<WebGLCurlFrame>({ ...IDLE_FRAME });
  const [webglVisible, setWebglVisible] = useState(false);
  const [webglCanvases, setWebglCanvases] = useState<{
    front: HTMLCanvasElement | null;
    back: HTMLCanvasElement | null;
    under: HTMLCanvasElement | null;
  }>({ front: null, back: null, under: null });

  // CSS fallback slide state (when WebGL is unavailable or reduced-motion / slide mode is active)
  const [cssSlide, setCssSlide] = useState<{ active: boolean; dir: 1 | -1; progress: number }>({
    active: false,
    dir: 1,
    progress: 0,
  });

  const springRafRef = useRef<number | null>(null);
  const pageRef = useRef(page);
  pageRef.current = page;
  const pagesMapRef = useRef(pagesMap);
  pagesMapRef.current = pagesMap;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const themeRef = useRef(resolvedTheme);
  themeRef.current = resolvedTheme;
  const numRef = useRef(num);
  numRef.current = num;
  const bookSizeRef = useRef(bookSize);
  bookSizeRef.current = bookSize;
  const useWebGLRef = useRef(useWebGL);
  useWebGLRef.current = useWebGL;
  const selectedRef = useRef(selectedAyah);
  selectedRef.current = selectedAyah;

  const cancelSpring = useCallback(() => {
    if (springRafRef.current !== null) {
      cancelAnimationFrame(springRafRef.current);
      springRafRef.current = null;
    }
  }, []);

  const ensurePages = useCallback((nums: number[]) => {
    for (const p of nums) {
      if (p < 1 || p > TOTAL_PAGES) continue;
      const hit = getCachedPageSync(p);
      if (hit) {
        setPagesMap((prev) => (prev[p] === hit ? prev : { ...prev, [p]: hit }));
      } else {
        void loadMushafPage(p)
          .then((d) => setPagesMap((prev) => ({ ...prev, [p]: d })))
          .catch(() => undefined);
      }
    }
  }, []);

  const fetchCurrent = useCallback((p: number) => {
    const cached = getCachedPageSync(p);
    if (cached) {
      setPagesMap((prev) => ({ ...prev, [p]: cached }));
      setLoading(false);
      setError('');
    } else {
      setLoading(true);
      setError('');
    }
    void loadMushafPage(p)
      .then((d) => {
        setPagesMap((prev) => ({ ...prev, [p]: d }));
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
    ensurePages([p + 1, p - 1, p + 2]);
    preloadAdjacentPages(p);
  }, [ensurePages, initialAyah, initialPage, setLastRead]);

  useEffect(() => {
    fetchCurrent(page);
    setRevealedAyahs(new Set());
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [page, fetchCurrent]);

  // Pre-warm high-DPI Canvas textures in idle time so starting a drag takes 0ms!
  useEffect(() => {
    if (!useWebGL) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    prewarmPageCanvases(
      [pagesMap[page], pagesMap[page + 1], pagesMap[page - 1]],
      {
        width: bookSize.w,
        height: bookSize.h,
        dpr,
        theme: resolvedTheme,
        fontSize: settings.fontSize,
        tajweed: settings.tajweed,
        scrollTop: 0,
        num,
      },
    );
  }, [useWebGL, page, pagesMap, bookSize.w, bookSize.h, resolvedTheme, settings.fontSize, settings.tajweed, num]);

  // Wake Lock API
  useEffect(() => {
    if (!settings.wakeLock || !('wakeLock' in navigator)) return;
    let sentinel: { release: () => Promise<void> } | null = null;
    const lockApi = (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock;
    void lockApi?.request('screen').then((s) => { sentinel = s; }).catch(() => undefined);
    return () => { void sentinel?.release().catch(() => undefined); };
  }, [settings.wakeLock]);

  // Prepare the 3 GPU Canvas textures for a turn in direction `dir` (+1 = Next, -1 = Prev)
  const prepareTurnTextures = useCallback((currPage: number, dir: 1 | -1) => {
    const targetPage = currPage + dir;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const sz = bookSizeRef.current;
    const baseOpts = {
      width: sz.w,
      height: sz.h,
      dpr,
      theme: themeRef.current,
      fontSize: settingsRef.current.fontSize,
      tajweed: settingsRef.current.tajweed,
      num: numRef.current,
    };
    const currData = pagesMapRef.current[currPage] ?? getCachedPageSync(currPage);
    const nextData = pagesMapRef.current[targetPage] ?? getCachedPageSync(targetPage);

    const front = renderMushafPageCanvas(currData, {
      ...baseOpts,
      scrollTop: scrollRef.current?.scrollTop ?? 0,
    });
    const under = renderMushafPageCanvas(nextData, { ...baseOpts, scrollTop: 0 });
    setWebglCanvases({ front, back: under, under });
  }, []);

  // Damped Spring Physics solver on pointer release (or programmatic button tap)
  const runSpringTo = useCallback((
    dir: 1 | -1,
    target: 0 | 1,
    initialVelocityProgressPerSec: number,
    onCommit?: () => void,
  ) => {
    cancelSpring();
    let pos = frameRef.current.progress;
    let vel = initialVelocityProgressPerSec;
    let lastT = performance.now();

    // Natural critically-damped paper spring (snappy with momentum, zero rubbery oscillation)
    const stiffness = 185;
    const damping = 25;

    const tick = (now: number) => {
      const dt = Math.min(0.032, Math.max(0.001, (now - lastT) / 1000));
      lastT = now;

      const force = -stiffness * (pos - target) - damping * vel;
      vel += force * dt;
      pos += vel * dt;

      const clampedPos = Math.max(0, Math.min(1, pos));
      frameRef.current.progress = clampedPos;
      frameRef.current.speed = Math.min(1.5, Math.abs(vel) * 0.45);

      if (!useWebGLRef.current) {
        setCssSlide({ active: true, dir, progress: clampedPos });
      }

      const done = Math.abs(pos - target) < 0.004 && Math.abs(vel) < 0.025;
      if (!done) {
        springRafRef.current = requestAnimationFrame(tick);
      } else {
        springRafRef.current = null;
        frameRef.current = { ...IDLE_FRAME };
        if (target === 1) {
          onCommit?.();
          // Wait 1 rAF so React commits the new DOM page before hiding WebGL overlay (zero flash!)
          requestAnimationFrame(() => {
            setWebglVisible(false);
            setCssSlide({ active: false, dir: 1, progress: 0 });
          });
        } else {
          setWebglVisible(false);
          setCssSlide({ active: false, dir: 1, progress: 0 });
        }
      }
    };

    springRafRef.current = requestAnimationFrame(tick);
  }, [cancelSpring]);

  // Programmatic flip (side arrows / keyboard)
  const flipTo = useCallback((dir: 1 | -1) => {
    const curr = pageRef.current;
    const next = curr + dir;
    if (next < 1 || next > TOTAL_PAGES || springRafRef.current !== null) return;

    ensurePages([next, next + 1]);
    if (settingsRef.current.flipSound) playPageFlipSound(0.54);

    if (settingsRef.current.flipMode === 'scroll' || reducedMotion) {
      setPage(next);
      return;
    }

    if (useWebGLRef.current) {
      prepareTurnTextures(curr, dir);
      frameRef.current = {
        active: true,
        dir,
        progress: 0.01,
        cornerTilt: 0.45, // peels gracefully from the upper corner first
        speed: 0.65,
      };
      setWebglVisible(true);
    } else {
      frameRef.current = { ...IDLE_FRAME, active: true, dir, progress: 0.01 };
      setCssSlide({ active: true, dir, progress: 0.01 });
    }

    runSpringTo(dir, 1, 1.85, () => setPage(next));
  }, [ensurePages, prepareTurnTextures, reducedMotion, runSpringTo]);

  // Keyboard shortcuts (RTL: ArrowLeft = Next page, ArrowRight = Prev page, Escape = Close)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); flipTo(1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); flipTo(-1); }
      else if (e.key === 'Escape') { onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flipTo, onClose]);

  // Real-time Pointer Tracking (RTL left->right = Next Page, top-left / bottom-left corner tilt, velocity spring)
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const drag = {
      down: false,
      startX: 0,
      startY: 0,
      lastX: 0,
      lastTime: 0,
      vxPxPerMs: 0,
      width: 360,
      height: 580,
      top: 0,
      cornerTilt: 0.35,
      locked: 'none' as 'none' | 'horizontal' | 'vertical',
      dir: 1 as 1 | -1,
      preparedDir: 0 as 0 | 1 | -1,
    };

    const startGesture = (clientX: number, clientY: number) => {
      if (settingsRef.current.flipMode === 'scroll' || selectedRef.current) return;
      warmPageAudio();
      cancelSpring();
      const rect = bookRef.current?.getBoundingClientRect();
      drag.down = true;
      drag.startX = clientX;
      drag.startY = clientY;
      drag.lastX = clientX;
      drag.lastTime = performance.now();
      drag.vxPxPerMs = 0;
      drag.width = rect?.width || window.innerWidth;
      drag.height = rect?.height || window.innerHeight;
      drag.top = rect?.top || 0;
      drag.locked = 'none';
      drag.preparedDir = 0;

      // Determine whether user grabbed near top corner (+1) or bottom corner (-1)
      const relY = Math.max(0, Math.min(1, (clientY - drag.top) / drag.height));
      // Top of page (relY=0) -> +0.9, middle (0.5) -> +0.25, bottom (relY=1) -> -0.85
      drag.cornerTilt = Math.max(-0.9, Math.min(0.95, (0.58 - relY) * 1.7));
    };

    const moveGesture = (clientX: number, clientY: number, prevent?: () => void) => {
      if (!drag.down) return;
      const dx = clientX - drag.startX;
      const dy = clientY - drag.startY;

      if (drag.locked === 'none') {
        if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.1) {
          drag.locked = 'horizontal';
          drag.dir = dx >= 0 ? 1 : -1;
        } else if (Math.abs(dy) > 12) {
          drag.locked = 'vertical';
          return;
        } else {
          return;
        }
      }
      if (drag.locked !== 'horizontal') return;
      prevent?.();

      const curr = pageRef.current;
      const dir: 1 | -1 = dx >= 0 ? 1 : -1;
      drag.dir = dir;
      const targetPage = curr + dir;
      if (targetPage < 1 || targetPage > TOTAL_PAGES) return;

      if (drag.preparedDir !== dir) {
        drag.preparedDir = dir;
        ensurePages([targetPage]);
        if (useWebGLRef.current) {
          prepareTurnTextures(curr, dir);
          setWebglVisible(true);
        }
      }

      const now = performance.now();
      const dt = Math.max(4, now - drag.lastTime);
      const instVx = (clientX - drag.lastX) / dt; // px/ms
      drag.vxPxPerMs = drag.vxPxPerMs * 0.62 + instVx * 0.38;
      drag.lastX = clientX;
      drag.lastTime = now;

      // Smoothly update live vertical finger tracking so corner follows vertical finger motion too
      const liveRelY = Math.max(0, Math.min(1, (clientY - drag.top) / drag.height));
      const liveTilt = Math.max(-0.9, Math.min(0.95, (0.55 - liveRelY) * 1.65));
      drag.cornerTilt = drag.cornerTilt * 0.75 + liveTilt * 0.25;

      const progress = Math.max(0.005, Math.min(0.97, Math.abs(dx) / (drag.width * 0.92)));
      const normSpeed = Math.min(1.5, Math.abs(drag.vxPxPerMs) * 0.85);

      frameRef.current = {
        active: true,
        dir,
        progress,
        cornerTilt: drag.cornerTilt,
        speed: normSpeed,
      };

      if (!useWebGLRef.current) {
        setCssSlide({ active: true, dir, progress });
      }
    };

    const endGesture = () => {
      if (!drag.down) return;
      drag.down = false;
      if (drag.locked !== 'horizontal' || drag.preparedDir === 0) return;

      const curr = pageRef.current;
      const dir = drag.dir;
      const next = curr + dir;
      const p = frameRef.current.progress;
      // Signed velocity toward completing the turn (in px/ms)
      const signedVx = dir === 1 ? drag.vxPxPerMs : -drag.vxPxPerMs;
      const progressVelPerSec = (signedVx * 1000) / Math.max(240, drag.width);

      const shouldCommit = next >= 1 && next <= TOTAL_PAGES
        && (p > 0.26 || (signedVx > 0.38 && p > 0.06))
        && signedVx > -0.45;

      if (shouldCommit) {
        if (settingsRef.current.flipSound) playPageFlipSound(0.46);
        runSpringTo(dir, 1, Math.max(0.6, progressVelPerSec), () => setPage(next));
      } else {
        runSpringTo(dir, 0, Math.min(-0.4, progressVelPerSec));
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
    const onTouchEnd = () => endGesture();

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      startGesture(e.clientX, e.clientY);
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!drag.down) return;
      moveGesture(e.clientX, e.clientY, () => e.preventDefault());
    };
    const onMouseUp = () => endGesture();

    stage.addEventListener('touchstart', onTouchStart, { passive: true });
    stage.addEventListener('touchmove', onTouchMove, { passive: false });
    stage.addEventListener('touchend', onTouchEnd, { passive: true });
    stage.addEventListener('touchcancel', onTouchEnd, { passive: true });
    stage.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      cancelSpring();
      stage.removeEventListener('touchstart', onTouchStart);
      stage.removeEventListener('touchmove', onTouchMove);
      stage.removeEventListener('touchend', onTouchEnd);
      stage.removeEventListener('touchcancel', onTouchEnd);
      stage.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [cancelSpring, ensurePages, prepareTurnTextures, runSpringTo]);

  const quickBookmarkPage = async () => {
    const first = pagesMap[page]?.ayahs[0];
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

  const handleAyahSelect = (ayah: MushafAyah, y: number) => {
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
  };

  const surahMeta = surahForPage(page);
  const juzMeta = juzForPage(page);

  const cycleTheme = () => {
    const order: QuranTheme[] = ['light', 'sepia', 'dark'];
    updateSettings({ themePref: order[(order.indexOf(resolvedTheme) + 1) % order.length] });
  };

  const cycleFlipMode = () => {
    const order: FlipMode[] = ['curl', 'slide', 'scroll'];
    updateSettings({ flipMode: order[(order.indexOf(settings.flipMode) + 1) % order.length] });
  };

  const flipLabel = settings.flipMode === 'curl' ? 'تقليب ورقي' : settings.flipMode === 'slide' ? 'انزلاق' : 'تمرير';

  const cssSlideTransform = cssSlide.active
    ? `translateX(${(cssSlide.dir * cssSlide.progress * 102).toFixed(2)}%)`
    : undefined;

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

      {/* Main Stage — Reserves space when bars are visible; returns to normal interactive DOM after flip */}
      <main
        ref={stageRef}
        className={`qr-stage${barsVisible ? ' bars-on' : ''}`}
        onClick={() => {
          if (!webglVisible && !cssSlide.active) setBarsVisible((v) => !v);
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
          {/* CSS Fallback Under-Page (used only when WebGL is disabled / reduced-motion / slide mode) */}
          {cssSlide.active && (
            <div className="qr-css-under" aria-hidden="true">
              <MushafPageSheet
                data={pagesMap[page + cssSlide.dir]}
                loading={!pagesMap[page + cssSlide.dir]}
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

          {/* Live Interactive & Selectable DOM Mushaf Page */}
          <div
            className={`qr-dom-layer${webglVisible ? ' webgl-hidden' : ''}`}
            style={{
              transform: cssSlideTransform,
              transition: cssSlide.active ? 'none' : undefined,
            }}
          >
            <MushafPageSheet
              data={pagesMap[page]}
              loading={loading && !pagesMap[page]}
              error={error}
              onRetry={() => fetchCurrent(page)}
              fontSize={settings.fontSize}
              tajweed={settings.tajweed}
              hifzMode={hifzMode}
              revealedAyahs={revealedAyahs}
              highlightedAyah={selectedAyah ? `${selectedAyah.ayah.surah}:${selectedAyah.ayah.n}` : null}
              num={num}
              scrollRef={scrollRef}
              onAyahSelect={handleAyahSelect}
            />
            {!webglVisible && useWebGL && page < TOTAL_PAGES && (
              <span className="qr-top-corner-hint" aria-hidden="true" />
            )}
          </div>

          {/* Lazy-loaded Three.js WebGL 40×60 Mesh Cylindrical Page Curl */}
          {useWebGL && (
            <Suspense fallback={null}>
              <LazyWebGLPageCurl
                width={bookSize.w}
                height={bookSize.h}
                frontCanvas={webglCanvases.front}
                backCanvas={webglCanvases.back}
                underCanvas={webglCanvases.under}
                frameRef={frameRef}
                visible={webglVisible}
              />
            </Suspense>
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
          <QChip active={settings.flipMode === 'curl'} onClick={cycleFlipMode}>
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

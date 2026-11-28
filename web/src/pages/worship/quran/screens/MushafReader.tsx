import { useCallback, useEffect, useRef, useState } from 'react';
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
import { QChip, QIconButton } from '../components/ui/Primitives';
import { AyahContextMenu } from '../components/AyahContextMenu';
import { idbSet, type StoredBookmark } from '../db/quranDb';

const SINGLE_MAX_ANGLE = 112;
const SPREAD_MAX_ANGLE = 180;
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

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
  gutterSide = 'right',
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
  gutterSide?: 'right' | 'left';
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
      <div className={`qr-gut${gutterSide === 'left' ? ' left-side' : ''}`} aria-hidden="true" />
    </div>
  );
}

interface FlipState {
  active: boolean;
  kind: 'next' | 'prev';
  angle: number;
}

const IDLE_FLIP: FlipState = { active: false, kind: 'next', angle: 0 };

function useIsWideBook(): boolean {
  const [wide, setWide] = useState(() => (typeof window !== 'undefined' ? window.innerWidth >= 900 : false));
  useEffect(() => {
    const onResize = () => setWide(window.innerWidth >= 900);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return wide;
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
  const isWide = useIsWideBook();
  const isSpread = isWide && settings.doublePage && settings.flipMode === 'curl';
  const maxAngle = isSpread ? SPREAD_MAX_ANGLE : SINGLE_MAX_ANGLE;
  const stepSize = isSpread ? 2 : 1;

  // In spread mode, keep the right page odd (1, 3, 5, ...) so facing pairs match printed Madinah Mushaf!
  const normalizePage = useCallback((p: number, spread: boolean) => {
    const clamped = Math.max(1, Math.min(TOTAL_PAGES, p));
    if (!spread) return clamped;
    return clamped % 2 === 0 ? Math.max(1, clamped - 1) : clamped;
  }, []);

  const [page, setPage] = useState(() => normalizePage(initialPage, isSpread));
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

  const [flip, setFlip] = useState<FlipState>(IDLE_FLIP);
  const flipRef = useRef<FlipState>(IDLE_FLIP);
  const rafRef = useRef<number | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const bookRef = useRef<HTMLDivElement | null>(null);
  const pageRef = useRef(page);
  pageRef.current = page;

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const selectedRef = useRef(selectedAyah);
  selectedRef.current = selectedAyah;
  const isSpreadRef = useRef(isSpread);
  isSpreadRef.current = isSpread;

  const setFlipBoth = useCallback((next: FlipState) => {
    flipRef.current = next;
    setFlip(next);
  }, []);

  const cancelAnim = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
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
    // Preload facing + next + prev pages into React map & IndexedDB
    ensurePages([p + 1, p + 2, p + 3, p - 1, p - 2]);
    preloadAdjacentPages(p);
  }, [ensurePages, initialAyah, initialPage, setLastRead]);

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

  const animateAngle = useCallback((
    kind: 'next' | 'prev',
    fromAngle: number,
    toAngle: number,
    dur: number,
    useEaseInOut: boolean,
    onDone?: () => void,
  ) => {
    cancelAnim();
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / dur);
      const e = useEaseInOut ? easeInOutCubic(t) : easeOutCubic(t);
      const angle = fromAngle + (toAngle - fromAngle) * e;
      setFlipBoth({ active: true, kind, angle });
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        rafRef.current = null;
        setFlipBoth(IDLE_FLIP);
        onDone?.();
      }
    };
    rafRef.current = requestAnimationFrame(step);
  }, [cancelAnim, setFlipBoth]);

  // Programmatic visible 3D flip (820ms on desktop 2-page spread like the video, 620ms on mobile!)
  const flipTo = useCallback((dir: 1 | -1) => {
    const spread = isSpreadRef.current;
    const step = spread ? 2 : 1;
    const maxA = spread ? SPREAD_MAX_ANGLE : SINGLE_MAX_ANGLE;
    const curr = pageRef.current;
    const next = Math.max(1, Math.min(TOTAL_PAGES, curr + dir * step));
    if (next === curr || rafRef.current !== null) return;

    ensurePages([next, next + 1]);
    if (settingsRef.current.flipSound) playPageFlipSound(spread ? 0.72 : 0.55);
    if (settingsRef.current.flipMode === 'scroll') {
      setPage(next);
      return;
    }
    const dur = spread ? 820 : 620;
    if (dir === 1) {
      animateAngle('next', 0, maxA, dur, true, () => setPage(next));
    } else {
      animateAngle('prev', maxA, 0, dur, true, () => setPage(next));
    }
  }, [animateAngle, ensurePages]);

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

  // Live 1:1 Finger/Mouse Drag-Follow & Hold (pauses mid-air until user lifts finger!)
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const drag = {
      down: false,
      startX: 0,
      startY: 0,
      lastX: 0,
      vx: 0,
      width: 375,
      locked: 'none' as 'none' | 'horizontal' | 'vertical',
      kind: 'next' as 'next' | 'prev',
    };

    const startGesture = (clientX: number, clientY: number) => {
      if (settingsRef.current.flipMode === 'scroll' || selectedRef.current) return;
      warmPageAudio();
      cancelAnim();
      const rect = bookRef.current?.getBoundingClientRect();
      drag.down = true;
      drag.startX = clientX;
      drag.startY = clientY;
      drag.lastX = clientX;
      drag.vx = 0;
      drag.width = rect?.width || window.innerWidth;
      drag.locked = 'none';
    };

    const moveGesture = (clientX: number, clientY: number, prevent?: () => void) => {
      if (!drag.down) return;
      const dx = clientX - drag.startX;
      const dy = clientY - drag.startY;

      if (drag.locked === 'none') {
        if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.1) {
          drag.locked = 'horizontal';
          drag.kind = dx >= 0 ? 'next' : 'prev';
        } else if (Math.abs(dy) > 12) {
          drag.locked = 'vertical';
          return;
        } else {
          return;
        }
      }
      if (drag.locked !== 'horizontal') return;
      prevent?.();

      const spread = isSpreadRef.current;
      const step = spread ? 2 : 1;
      const maxA = spread ? SPREAD_MAX_ANGLE : SINGLE_MAX_ANGLE;
      const curr = pageRef.current;
      const targetPage = drag.kind === 'next' ? curr + step : curr - step;
      if (targetPage < 1 || targetPage > TOTAL_PAGES) {
        setFlipBoth(IDLE_FLIP);
        return;
      }

      ensurePages([targetPage, targetPage + 1]);
      drag.vx = clientX - drag.lastX;
      drag.lastX = clientX;

      const span = spread ? drag.width * 0.72 : drag.width * 0.85;
      const ratio = Math.max(0, Math.min(1, Math.abs(dx) / span));
      const arc = Math.acos(Math.max(-1, Math.min(1, 1 - ratio * 2))) / Math.PI; // 0..1
      const mappedAngle = Math.max(0, Math.min(maxA, arc * maxA));

      const angle = drag.kind === 'next' ? mappedAngle : maxA - mappedAngle;
      setFlipBoth({ active: true, kind: drag.kind, angle });
    };

    const endGesture = () => {
      if (!drag.down) return;
      drag.down = false;
      if (drag.locked !== 'horizontal') return;

      const f = flipRef.current;
      if (!f.active) return;

      const spread = isSpreadRef.current;
      const step = spread ? 2 : 1;
      const maxA = spread ? SPREAD_MAX_ANGLE : SINGLE_MAX_ANGLE;
      const threshold = maxA * 0.32;

      if (f.kind === 'next') {
        const next = Math.min(TOTAL_PAGES, pageRef.current + step);
        if ((f.angle > threshold || drag.vx > 6) && next !== pageRef.current) {
          if (settingsRef.current.flipSound) playPageFlipSound(0.45);
          const rem = Math.max(240, Math.round(((maxA - f.angle) / maxA) * 520));
          animateAngle('next', f.angle, maxA, rem, false, () => setPage(next));
        } else {
          const rem = Math.max(200, Math.round((f.angle / maxA) * 360));
          animateAngle('next', f.angle, 0, rem, false);
        }
      } else {
        const prev = Math.max(1, pageRef.current - step);
        if ((f.angle < maxA - threshold || drag.vx < -6) && prev !== pageRef.current) {
          if (settingsRef.current.flipSound) playPageFlipSound(0.45);
          const rem = Math.max(240, Math.round((f.angle / maxA) * 520));
          animateAngle('prev', f.angle, 0, rem, false, () => setPage(prev));
        } else {
          const rem = Math.max(200, Math.round(((maxA - f.angle) / maxA) * 360));
          animateAngle('prev', f.angle, maxA, rem, false);
        }
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
      cancelAnim();
      stage.removeEventListener('touchstart', onTouchStart);
      stage.removeEventListener('touchmove', onTouchMove);
      stage.removeEventListener('touchend', onTouchEnd);
      stage.removeEventListener('touchcancel', onTouchEnd);
      stage.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [animateAngle, cancelAnim, ensurePages, setFlipBoth]);

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
  const isFlipping = flip.active;
  const a = flip.angle;
  const r = a / maxAngle;
  const sinA = Math.sin((a * Math.PI) / 180);

  const cycleTheme = () => {
    const order: QuranTheme[] = ['light', 'sepia', 'dark'];
    updateSettings({ themePref: order[(order.indexOf(resolvedTheme) + 1) % order.length] });
  };

  const cycleFlipMode = () => {
    const order: FlipMode[] = ['curl', 'slide', 'scroll'];
    updateSettings({ flipMode: order[(order.indexOf(settings.flipMode) + 1) % order.length] });
  };

  const flipLabel = settings.flipMode === 'curl' ? 'تقليب ورقي' : settings.flipMode === 'slide' ? 'انزلاق' : 'تمرير';

  // Single-page lighting & transforms
  const singleTopData = isFlipping && flip.kind === 'prev' ? pagesMap[page - 1] : pagesMap[page];
  const singleUnderData = isFlipping ? (flip.kind === 'next' ? pagesMap[page + 1] : pagesMap[page]) : undefined;
  const singleTopTransform = isFlipping
    ? (settings.flipMode === 'curl' ? `rotateY(${a.toFixed(2)}deg)` : `translateX(${(r * 100).toFixed(2)}%)`)
    : 'none';
  const singleTopBrightness = isFlipping && settings.flipMode === 'curl' ? (1 - 0.48 * r).toFixed(3) : '1';
  const singleTopOpacity = isFlipping && settings.flipMode === 'curl' && a > 96
    ? Math.max(0, 1 - (a - 96) / (SINGLE_MAX_ANGLE - 96))
    : 1;
  const singleUnderBrightness = isFlipping && settings.flipMode === 'curl' ? (0.55 + 0.45 * (1 - r)).toFixed(3) : '1';

  // Double-page spread slots (RTL Arabic book: right = odd page P, left = even page P+1)
  const spreadRightNum = isFlipping && flip.kind === 'prev' ? Math.max(1, page - 2) : page;
  const spreadLeftNum = isFlipping && flip.kind === 'next' ? Math.min(TOTAL_PAGES, page + 3) : Math.min(TOTAL_PAGES, page + 1);
  const spreadLeafFrontNum = isFlipping ? (flip.kind === 'next' ? page + 1 : page - 1) : page + 1;
  const spreadLeafBackNum = isFlipping ? (flip.kind === 'next' ? page + 2 : page) : page + 2;

  return (
    <div className="q-root qr-fullscreen" dir="rtl" data-q-theme={resolvedTheme}>
      {/* Immersive Top Bar */}
      <header className={`qr-topbar${barsVisible ? '' : ' hidden'}`}>
        <QIconButton onClick={onClose} aria-label="العودة إلى الفهرس">
          <ArrowRight size={22} />
        </QIconButton>
        <div className="qr-top-meta">
          <strong>سورة {surahMeta.name}</strong>
          <small>
            {juzMeta.name} · {isSpread ? `صفحة ${num(page)}–${num(Math.min(TOTAL_PAGES, page + 1))}` : `صفحة ${num(page)}`} من {num(TOTAL_PAGES)}
          </small>
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

      {/* Main 3D Book Stage (reserves exact padding when bars are visible — ZERO overlap!) */}
      <main
        ref={stageRef}
        className={`qr-stage${barsVisible ? ' bars-on' : ''}`}
        onClick={() => {
          if (!flipRef.current.active) setBarsVisible((v) => !v);
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
        {page + stepSize - 1 < TOTAL_PAGES && (
          <button
            type="button"
            className="qr-edge-btn next"
            onClick={(e) => { e.stopPropagation(); flipTo(1); }}
            aria-label="الصفحة التالية"
          >
            <ChevronLeft size={22} />
          </button>
        )}

        {isSpread ? (
          /* ══ DESKTOP / TABLET: 2-Page Open Book Spread (Matches Video 1:1!) ══ */
          <div ref={bookRef} className="qr-spread">
            <div className="qr-spread-shadow" aria-hidden="true" />

            {/* Stationary Right Half (Odd page) */}
            <div className="qr-spread-half right">
              <MushafPageSheet
                data={pagesMap[spreadRightNum]}
                loading={loading && !pagesMap[spreadRightNum]}
                error={error}
                onRetry={() => fetchCurrent(page)}
                fontSize={settings.fontSize}
                tajweed={settings.tajweed}
                hifzMode={hifzMode}
                revealedAyahs={revealedAyahs}
                highlightedAyah={selectedAyah ? `${selectedAyah.ayah.surah}:${selectedAyah.ayah.n}` : null}
                num={num}
                gutterSide="left"
                onAyahSelect={handleAyahSelect}
              />
              {isFlipping && <div className="qr-cast right-side" style={{ opacity: (sinA * 0.5).toFixed(3) }} />}
            </div>

            {/* Stationary Left Half (Even page) */}
            <div className="qr-spread-half left">
              <MushafPageSheet
                data={pagesMap[spreadLeftNum]}
                loading={!pagesMap[spreadLeftNum]}
                error=""
                onRetry={() => fetchCurrent(page)}
                fontSize={settings.fontSize}
                tajweed={settings.tajweed}
                hifzMode={hifzMode}
                revealedAyahs={revealedAyahs}
                highlightedAyah={selectedAyah ? `${selectedAyah.ayah.surah}:${selectedAyah.ayah.n}` : null}
                num={num}
                gutterSide="right"
                onAyahSelect={handleAyahSelect}
              />
              {isFlipping && <div className="qr-cast" style={{ opacity: (sinA * 0.5).toFixed(3) }} />}
            </div>

            {/* 2-Sided 3D Turning Leaf (0° -> 180° around center spine!) */}
            {isFlipping && (
              <div
                className="qr-spread-leaf"
                style={{ transform: `rotateY(${a.toFixed(2)}deg)` }}
                aria-hidden="true"
              >
                <div className="qr-spread-face front">
                  <MushafPageSheet
                    data={pagesMap[spreadLeafFrontNum]}
                    loading={false}
                    error=""
                    onRetry={() => undefined}
                    fontSize={settings.fontSize}
                    tajweed={settings.tajweed}
                    hifzMode={hifzMode}
                    revealedAyahs={revealedAyahs}
                    highlightedAyah={null}
                    num={num}
                    gutterSide="right"
                    onAyahSelect={() => undefined}
                  />
                  <div className="qr-shade" style={{ opacity: a < 90 ? (sinA * 0.7).toFixed(3) : '0' }} />
                </div>
                <div className="qr-spread-face back">
                  <MushafPageSheet
                    data={pagesMap[spreadLeafBackNum]}
                    loading={false}
                    error=""
                    onRetry={() => undefined}
                    fontSize={settings.fontSize}
                    tajweed={settings.tajweed}
                    hifzMode={hifzMode}
                    revealedAyahs={revealedAyahs}
                    highlightedAyah={null}
                    num={num}
                    gutterSide="left"
                    onAyahSelect={() => undefined}
                  />
                  <div className="qr-shade back-side" style={{ opacity: a > 90 ? (sinA * 0.7).toFixed(3) : '0' }} />
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ══ MOBILE: Single-Page 3D Leaf Flip ══ */
          <div ref={bookRef} className="qr-book">
            {isFlipping && (
              <div
                className="qr-leaf-under"
                style={{ filter: `brightness(${singleUnderBrightness})` }}
                aria-hidden="true"
              >
                <MushafPageSheet
                  data={singleUnderData}
                  loading={!singleUnderData}
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
                <div className="qr-cast" style={{ opacity: settings.flipMode === 'curl' ? (sinA * 0.5).toFixed(3) : '0' }} />
              </div>
            )}

            <div
              className="qr-leaf-top"
              style={{
                transform: singleTopTransform,
                filter: `brightness(${singleTopBrightness})`,
                opacity: singleTopOpacity,
              }}
            >
              <MushafPageSheet
                data={singleTopData}
                loading={!isFlipping && loading}
                error={!isFlipping ? error : ''}
                onRetry={() => fetchCurrent(page)}
                fontSize={settings.fontSize}
                tajweed={settings.tajweed}
                hifzMode={hifzMode}
                revealedAyahs={revealedAyahs}
                highlightedAyah={selectedAyah ? `${selectedAyah.ayah.surah}:${selectedAyah.ayah.n}` : null}
                num={num}
                onAyahSelect={handleAyahSelect}
              />
              <div className="qr-shade" style={{ opacity: isFlipping && settings.flipMode === 'curl' ? (sinA * 0.65).toFixed(3) : '0' }} />
            </div>
          </div>
        )}
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
            onChange={(e) => setPage(normalizePage(Number(e.target.value), isSpread))}
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

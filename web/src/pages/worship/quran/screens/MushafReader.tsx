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
import { playPageFlipSound, warmPageAudio } from '../utils/pageSound';
import { QChip, QIconButton } from '../components/ui/Primitives';
import { AyahContextMenu } from '../components/AyahContextMenu';
import { idbSet, type StoredBookmark } from '../db/quranDb';

const MAX_ANGLE = 112;
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
      <div className="qr-gut" aria-hidden="true" />
    </div>
  );
}

interface FlipState {
  active: boolean;
  /** 'next' = current page lifts off (0 -> 112deg) revealing page+1 underneath
   *  'prev' = previous page drops down from right spine (112 -> 0deg) covering current page */
  kind: 'next' | 'prev';
  /** Exact 3D rotation angle in degrees (0..112), held live under the user's finger! */
  angle: number;
}

const IDLE_FLIP: FlipState = { active: false, kind: 'next', angle: 0 };

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
  const [otherPageData, setOtherPageData] = useState<MushafPageData | undefined>(undefined);
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

  const reducedMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );

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

  // Smooth rAF animation of the 3D leaf rotation angle (exact cubic easing from reference)
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

  // Programmatic flip (620ms visible 3D leaf turn with realistic 3-layer sound!)
  const flipTo = useCallback((dir: 1 | -1) => {
    const curr = pageRef.current;
    const next = curr + dir;
    if (next < 1 || next > TOTAL_PAGES || rafRef.current !== null) return;
    setOtherPageData(getCachedPageSync(next));
    void loadMushafPage(next).then((d) => setOtherPageData(d)).catch(() => undefined);
    if (settingsRef.current.flipSound) playPageFlipSound(0.55);
    if (reducedMotion || settingsRef.current.flipMode === 'scroll') {
      setPage(next);
      return;
    }
    if (dir === 1) {
      animateAngle('next', 0, MAX_ANGLE, 620, true, () => setPage(next));
    } else {
      animateAngle('prev', MAX_ANGLE, 0, 620, true, () => setPage(next));
    }
  }, [animateAngle, reducedMotion]);

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

  // Live 1:1 Finger Drag-Follow & Hold (freezes at exact 3D angle until finger lifts!)
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

      const curr = pageRef.current;
      const targetPage = drag.kind === 'next' ? curr + 1 : curr - 1;
      if (targetPage < 1 || targetPage > TOTAL_PAGES) {
        setFlipBoth(IDLE_FLIP);
        return;
      }

      const cached = getCachedPageSync(targetPage);
      if (cached) setOtherPageData(cached);
      else void loadMushafPage(targetPage).then((d) => setOtherPageData(d)).catch(() => undefined);

      drag.vx = clientX - drag.lastX;
      drag.lastX = clientX;

      // Exact physical acos mapping from reference (natural 3D circular arc as finger moves!)
      const ratio = Math.max(0, Math.min(1, Math.abs(dx) / (drag.width * 0.85)));
      const arc = Math.acos(Math.max(-1, Math.min(1, 1 - ratio * 1.65))) / Math.PI; // 0..0.73+
      const mappedAngle = Math.max(0, Math.min(MAX_ANGLE, arc * 140));

      const angle = drag.kind === 'next' ? mappedAngle : MAX_ANGLE - mappedAngle;
      setFlipBoth({ active: true, kind: drag.kind, angle });
    };

    const endGesture = () => {
      if (!drag.down) return;
      drag.down = false;
      if (drag.locked !== 'horizontal') return;

      const f = flipRef.current;
      if (!f.active) return;

      if (f.kind === 'next') {
        const next = pageRef.current + 1;
        if ((f.angle > 38 || drag.vx > 6) && next <= TOTAL_PAGES) {
          if (settingsRef.current.flipSound) playPageFlipSound(0.45);
          const rem = Math.max(240, Math.round(((MAX_ANGLE - f.angle) / MAX_ANGLE) * 480));
          animateAngle('next', f.angle, MAX_ANGLE, rem, false, () => setPage(next));
        } else {
          const rem = Math.max(200, Math.round((f.angle / MAX_ANGLE) * 340));
          animateAngle('next', f.angle, 0, rem, false);
        }
      } else {
        const prev = pageRef.current - 1;
        if ((f.angle < MAX_ANGLE - 38 || drag.vx < -6) && prev >= 1) {
          if (settingsRef.current.flipSound) playPageFlipSound(0.45);
          const rem = Math.max(240, Math.round((f.angle / MAX_ANGLE) * 480));
          animateAngle('prev', f.angle, 0, rem, false, () => setPage(prev));
        } else {
          const rem = Math.max(200, Math.round(((MAX_ANGLE - f.angle) / MAX_ANGLE) * 340));
          animateAngle('prev', f.angle, MAX_ANGLE, rem, false);
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
  }, [animateAngle, cancelAnim, setFlipBoth]);

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

  // Exact lighting, cast shadow, and 3D rotation formulas from the reference book engine
  const effectiveMode: FlipMode = reducedMotion ? 'slide' : settings.flipMode;
  const isFlipping = flip.active;
  const a = flip.angle; // 0..112 deg
  const r = a / MAX_ANGLE; // 0..1
  const sinA = Math.sin((a * Math.PI) / 180);

  // Which page is the top rotating leaf vs the stationary under page?
  // - When flipping NEXT: top = current page (rotates 0 -> 112), under = next page (page+1)
  // - When flipping PREV: top = prev page (rotates 112 -> 0), under = current page
  const topData = isFlipping && flip.kind === 'prev' ? otherPageData : pageData;
  const underData = isFlipping ? (flip.kind === 'next' ? otherPageData : pageData) : undefined;

  const topTransform = isFlipping
    ? (effectiveMode === 'curl'
      ? `rotateY(${a.toFixed(2)}deg)`
      : `translateX(${(r * 100).toFixed(2)}%)`)
    : 'none';
  const topBrightness = isFlipping && effectiveMode === 'curl' ? (1 - 0.48 * r).toFixed(3) : '1';
  const topOpacity = isFlipping && effectiveMode === 'curl' && a > 96
    ? Math.max(0, 1 - (a - 96) / (MAX_ANGLE - 96))
    : 1;
  const underBrightness = isFlipping && effectiveMode === 'curl' ? (0.55 + 0.45 * (1 - r)).toFixed(3) : '1';
  const shadeOpacity = isFlipping && effectiveMode === 'curl' ? (sinA * 0.65).toFixed(3) : '0';
  const castOpacity = isFlipping && effectiveMode === 'curl' ? (sinA * 0.5).toFixed(3) : '0';

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

      {/* Main 3D Book Stage */}
      <main
        ref={stageRef}
        className="qr-stage"
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
          {/* Underneath stationary page with live shadow brightness */}
          {isFlipping && (
            <div
              className="qr-leaf-under"
              style={{ filter: `brightness(${underBrightness})` }}
              aria-hidden="true"
            >
              <MushafPageSheet
                data={underData}
                loading={!underData}
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
              <div className="qr-cast" style={{ opacity: castOpacity }} />
            </div>
          )}

          {/* Top 3D Rotating Book Leaf */}
          <div
            className="qr-leaf-top"
            style={{
              transform: topTransform,
              filter: `brightness(${topBrightness})`,
              opacity: topOpacity,
            }}
          >
            <MushafPageSheet
              data={topData}
              loading={!isFlipping && loading}
              error={!isFlipping ? error : ''}
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
            <div className="qr-shade" style={{ opacity: shadeOpacity }} />
          </div>
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

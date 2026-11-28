import type { MushafAyah, MushafPageData } from '../data/pageLoader';
import { juzForPage, surahForPage } from '../data/mushafMeta';
import type { QuranTheme } from '../store/quranStore';

export interface MushafRenderOptions {
  width: number;
  height: number;
  dpr: number;
  theme: QuranTheme;
  fontSize: number;
  tajweed: boolean;
  scrollTop?: number;
  num: (v: number | string) => string;
}

interface Palette {
  paper: string;
  frame: string;
  ink: string;
  primary: string;
  gold: string;
  bannerBg1: string;
  bannerBg2: string;
}

const PALETTES: Record<QuranTheme, Palette> = {
  light: {
    paper: '#FDFBF5',
    frame: '#C8AD68',
    ink: '#1B1B1B',
    primary: '#1F6B4A',
    gold: '#B8963E',
    bannerBg1: 'rgba(31, 107, 74, 0.10)',
    bannerBg2: 'rgba(184, 150, 62, 0.18)',
  },
  sepia: {
    paper: '#F7EFE0',
    frame: '#B3924D',
    ink: '#3B2F1E',
    primary: '#5E7F4F',
    gold: '#A98331',
    bannerBg1: 'rgba(94, 127, 79, 0.12)',
    bannerBg2: 'rgba(169, 131, 49, 0.18)',
  },
  dark: {
    paper: '#070908',
    frame: '#6B5A2C',
    ink: '#E8E6E1',
    primary: '#3FAE7A',
    gold: '#D4B259',
    bannerBg1: 'rgba(63, 174, 122, 0.14)',
    bannerBg2: 'rgba(212, 178, 89, 0.18)',
  },
};

// LRU cache of pre-rendered page canvases (max 8 entries to keep memory light)
const canvasCache = new Map<string, HTMLCanvasElement>();

function cacheKey(data: MushafPageData, opts: MushafRenderOptions): string {
  return [
    data.page,
    Math.round(opts.width),
    Math.round(opts.height),
    opts.dpr.toFixed(2),
    opts.theme,
    opts.fontSize,
    opts.tajweed ? 1 : 0,
    Math.round(opts.scrollTop ?? 0),
    opts.num(1),
  ].join(':');
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

interface Token {
  text: string;
  isRosette?: boolean;
  isSajda?: boolean;
}

function tokenizeAyahs(ayahs: MushafAyah[], num: (v: number | string) => string): Token[] {
  const tokens: Token[] = [];
  for (const a of ayahs) {
    const words = a.text.trim().split(/\s+/);
    for (const w of words) {
      if (w) tokens.push({ text: w });
    }
    if (a.sajda) tokens.push({ text: '۩', isSajda: true });
    tokens.push({ text: `﴿${num(a.n)}﴾`, isRosette: true });
  }
  return tokens;
}

/**
 * Renders a Mushaf page onto a high-DPI HTMLCanvasElement (capped at DPR <= 2)
 * matching `.qr-page-card` layout & typography so WebGL <-> DOM transitions are seamless.
 */
export function renderMushafPageCanvas(
  data: MushafPageData | undefined,
  opts: MushafRenderOptions,
): HTMLCanvasElement {
  const w = Math.max(240, Math.round(opts.width));
  const h = Math.max(340, Math.round(opts.height));
  const dpr = Math.min(2, Math.max(1, opts.dpr));
  const pal = PALETTES[opts.theme];

  if (data) {
    const key = cacheKey(data, { ...opts, width: w, height: h, dpr });
    const hit = canvasCache.get(key);
    if (hit) return hit;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    ctx.scale(dpr, dpr);
    drawPage(ctx, data, w, h, pal, opts);

    if (canvasCache.size >= 8) {
      const oldest = canvasCache.keys().next().value;
      if (oldest) canvasCache.delete(oldest);
    }
    canvasCache.set(key, canvas);
    return canvas;
  }

  // Fallback blank paper sheet while loading
  const blank = document.createElement('canvas');
  blank.width = Math.round(w * dpr);
  blank.height = Math.round(h * dpr);
  const ctx = blank.getContext('2d');
  if (ctx) {
    ctx.scale(dpr, dpr);
    roundRect(ctx, 0, 0, w, h, 16);
    ctx.fillStyle = pal.paper;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = pal.frame;
    ctx.stroke();
  }
  return blank;
}

function drawPage(
  ctx: CanvasRenderingContext2D,
  data: MushafPageData,
  w: number,
  h: number,
  pal: Palette,
  opts: MushafRenderOptions,
) {
  ctx.direction = 'rtl';
  ctx.textBaseline = 'alphabetic';

  // 1. Paper surface & double ornamental frame
  roundRect(ctx, 0, 0, w, h, 16);
  ctx.fillStyle = pal.paper;
  ctx.fill();

  ctx.save();
  roundRect(ctx, 0.75, 0.75, w - 1.5, h - 1.5, 15.5);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = pal.frame;
  ctx.stroke();

  roundRect(ctx, 5.5, 5.5, w - 11, h - 11, 11.5);
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = pal.frame;
  ctx.stroke();
  ctx.restore();

  // Subtle right spine shadow
  const spineGrad = ctx.createLinearGradient(w, 0, w - 48, 0);
  spineGrad.addColorStop(0, 'rgba(18, 34, 32, 0.18)');
  spineGrad.addColorStop(0.45, 'rgba(18, 34, 32, 0.05)');
  spineGrad.addColorStop(1, 'rgba(18, 34, 32, 0)');
  ctx.fillStyle = spineGrad;
  ctx.fillRect(w - 48, 0, 48, h);

  // 2. Page Header
  const headH = 34;
  const footH = 32;
  const surahMeta = surahForPage(data.page);
  const juzMeta = juzForPage(data.page);
  const hizbNum = Math.ceil(data.hizbQuarter / 4);

  ctx.font = '800 12.5px "IBM Plex Sans Arabic", sans-serif';
  ctx.fillStyle = pal.gold;
  ctx.textAlign = 'right';
  ctx.fillText(`سورة ${surahMeta.name}`, w - 18, 22);
  ctx.textAlign = 'left';
  ctx.fillText(`${juzMeta.name} · الحزب ${opts.num(hizbNum)}`, 18, 22);

  ctx.save();
  ctx.strokeStyle = pal.frame;
  ctx.globalAlpha = 0.3;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(12, headH);
  ctx.lineTo(w - 12, headH);
  ctx.moveTo(12, h - footH);
  ctx.lineTo(w - 12, h - footH);
  ctx.stroke();
  ctx.restore();

  // 3. Clipped scrollable content region
  const padX = Math.max(14, Math.min(30, w * 0.052));
  const contentW = w - padX * 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(6, headH + 1, w - 12, h - headH - footH - 2);
  ctx.clip();

  let cursorY = headH + 14 - (opts.scrollTop ?? 0);

  // Group ayahs into contiguous surah blocks
  const blocks: { surah: number; surahName: string; startsSurah: boolean; ayahs: MushafAyah[] }[] = [];
  for (const a of data.ayahs) {
    const last = blocks[blocks.length - 1];
    if (!last || last.surah !== a.surah) {
      blocks.push({ surah: a.surah, surahName: a.surahName, startsSurah: a.n === 1, ayahs: [a] });
    } else {
      last.ayahs.push(a);
    }
  }

  const fs = opts.fontSize;
  const lineH = fs * 2.1;

  for (const block of blocks) {
    if (block.startsSurah) {
      // Ornamental Surah Banner
      const bannerH = 38;
      cursorY += 4;
      const bGrad = ctx.createLinearGradient(padX, cursorY, padX + contentW, cursorY);
      bGrad.addColorStop(0, pal.bannerBg1);
      bGrad.addColorStop(0.5, pal.bannerBg2);
      bGrad.addColorStop(1, pal.bannerBg1);
      roundRect(ctx, padX, cursorY, contentW, bannerH, 11);
      ctx.fillStyle = bGrad;
      ctx.fill();
      ctx.save();
      ctx.strokeStyle = pal.gold;
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();

      ctx.font = '700 20px "Amiri", "Noto Naskh Arabic", serif';
      ctx.fillStyle = pal.primary;
      ctx.textAlign = 'center';
      ctx.fillText(block.surahName, w / 2, cursorY + 26);
      cursorY += bannerH + 10;

      // Basmala
      if (block.surah !== 1 && block.surah !== 9) {
        ctx.font = `700 ${Math.round(fs * 1.24)}px "Amiri", "Noto Naskh Arabic", serif`;
        ctx.fillStyle = pal.primary;
        ctx.textAlign = 'center';
        ctx.fillText('بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ', w / 2, cursorY + fs * 1.05);
        cursorY += fs * 1.65;
      }
    }

    // Wrap tokens into lines
    const tokens = tokenizeAyahs(block.ayahs, opts.num);
    const mainFont = `400 ${fs}px "Amiri", "Noto Naskh Arabic", serif`;
    const rosetteFont = `700 ${Math.round(fs * 0.78)}px "Amiri", "Noto Naskh Arabic", serif`;

    ctx.font = mainFont;
    const spaceW = ctx.measureText(' ').width * 1.15;

    const measured = tokens.map((t) => {
      ctx.font = t.isRosette ? rosetteFont : mainFont;
      return { ...t, width: ctx.measureText(t.text).width };
    });

    const lines: { items: typeof measured; totalWordsW: number }[] = [];
    let cur: typeof measured = [];
    let curW = 0;

    for (const m of measured) {
      const addW = cur.length === 0 ? m.width : spaceW + m.width;
      if (cur.length > 0 && curW + addW > contentW) {
        const wordsOnly = cur.reduce((s, x) => s + x.width, 0);
        lines.push({ items: cur, totalWordsW: wordsOnly });
        cur = [m];
        curW = m.width;
      } else {
        cur.push(m);
        curW += addW;
      }
    }
    if (cur.length > 0) {
      lines.push({ items: cur, totalWordsW: cur.reduce((s, x) => s + x.width, 0) });
    }

    // Draw lines (justified for full lines, centered for the last line — matching text-align-last: center)
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      const baselineY = cursorY + fs * 1.25;
      const isLast = li === lines.length - 1;

      if (baselineY > headH - lineH && baselineY < h - footH + lineH) {
        if (isLast || line.items.length === 1) {
          // Centered last line
          const totalLineW = line.totalWordsW + spaceW * (line.items.length - 1);
          let xRight = w / 2 + totalLineW / 2;
          ctx.textAlign = 'right';
          for (const item of line.items) {
            ctx.font = item.isRosette ? rosetteFont : mainFont;
            ctx.fillStyle = item.isRosette ? pal.gold : item.isSajda ? pal.primary : pal.ink;
            ctx.fillText(item.text, xRight, baselineY);
            xRight -= item.width + spaceW;
          }
        } else {
          // Justified RTL line from right margin (w - padX) to left margin (padX)
          const gap = (contentW - line.totalWordsW) / (line.items.length - 1);
          let xRight = w - padX;
          ctx.textAlign = 'right';
          for (const item of line.items) {
            ctx.font = item.isRosette ? rosetteFont : mainFont;
            ctx.fillStyle = item.isRosette ? pal.gold : item.isSajda ? pal.primary : pal.ink;
            ctx.fillText(item.text, xRight, baselineY);
            xRight -= item.width + gap;
          }
        }
      }
      cursorY += lineH;
    }
  }

  ctx.restore();

  // 4. Page Footer
  ctx.font = '800 12.5px "IBM Plex Sans Arabic", sans-serif';
  ctx.fillStyle = pal.gold;
  ctx.textAlign = 'center';
  ctx.fillText(`— ${opts.num(data.page)} —`, w / 2, h - 11);
}

/** Pre-warms textures for adjacent pages in idle time so drag start has 0ms latency. */
export function prewarmPageCanvases(
  pages: (MushafPageData | undefined)[],
  opts: MushafRenderOptions,
) {
  if (opts.width < 50 || opts.height < 50) return;
  const run = () => {
    for (const p of pages) {
      if (p) renderMushafPageCanvas(p, opts);
    }
  };
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    window.requestIdleCallback(run, { timeout: 600 });
  } else {
    setTimeout(run, 32);
  }
}

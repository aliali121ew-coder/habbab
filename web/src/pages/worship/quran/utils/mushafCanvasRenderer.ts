import type { MushafAyah, MushafPageData } from '../data/pageLoader';
import { juzForPage, surahForPage } from '../data/mushafMeta';
import type { QuranTheme } from '../store/quranStore';

export interface MushafRenderOptions {
  width: number;
  height: number;
  dpr: number;
  theme: QuranTheme;
  tajweed: boolean;
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

const canvasCache = new Map<string, HTMLCanvasElement>();

function cacheKey(data: MushafPageData, opts: MushafRenderOptions): string {
  return [
    data.page,
    Math.round(opts.width),
    Math.round(opts.height),
    opts.dpr.toFixed(2),
    opts.theme,
    opts.tajweed ? 1 : 0,
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

interface SurahBlock {
  surah: number;
  surahName: string;
  startsSurah: boolean;
  tokens: Token[];
}

interface MeasuredToken extends Token {
  width: number;
}

interface PreparedBlock {
  surah: number;
  surahName: string;
  startsSurah: boolean;
  bannerH: number;
  basmalaH: number;
  lines: { items: MeasuredToken[]; totalWordsW: number }[];
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

function layoutBlocksAtFontSize(
  ctx: CanvasRenderingContext2D,
  blocks: SurahBlock[],
  contentW: number,
  fs: number,
  lineRatio: number,
): { prepared: PreparedBlock[]; totalH: number; spaceW: number } {
  const mainFont = `400 ${fs.toFixed(2)}px "Amiri", "Noto Naskh Arabic", serif`;
  const rosetteFont = `700 ${(fs * 0.78).toFixed(2)}px "Amiri", "Noto Naskh Arabic", serif`;
  ctx.font = mainFont;
  const spaceW = ctx.measureText(' ').width * 1.1;
  const lineH = fs * lineRatio;

  let totalH = 0;
  const prepared: PreparedBlock[] = [];

  for (const b of blocks) {
    let bannerH = 0;
    let basmalaH = 0;
    if (b.startsSurah) {
      bannerH = Math.max(26, Math.min(36, fs * 1.65));
      totalH += bannerH + 6;
      if (b.surah !== 1 && b.surah !== 9) {
        basmalaH = fs * 1.55;
        totalH += basmalaH + 4;
      }
    }

    const measured: MeasuredToken[] = b.tokens.map((t) => {
      ctx.font = t.isRosette ? rosetteFont : mainFont;
      return { ...t, width: ctx.measureText(t.text).width };
    });

    const lines: { items: MeasuredToken[]; totalWordsW: number }[] = [];
    let cur: MeasuredToken[] = [];
    let curW = 0;

    for (const m of measured) {
      const addW = cur.length === 0 ? m.width : spaceW + m.width;
      if (cur.length > 0 && curW + addW > contentW) {
        lines.push({ items: cur, totalWordsW: cur.reduce((s, x) => s + x.width, 0) });
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

    totalH += lines.length * lineH;
    prepared.push({ surah: b.surah, surahName: b.surahName, startsSurah: b.startsSurah, bannerH, basmalaH, lines });
  }

  return { prepared, totalH, spaceW };
}

/**
 * Renders a Mushaf page onto a high-DPI HTMLCanvasElement (DPR <= 2) with 100% auto-fitted text
 * inside the paper frame (ZERO vertical clipping or overflow).
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
    drawPageAutoFit(ctx, data, w, h, pal, opts);

    if (canvasCache.size >= 8) {
      const oldest = canvasCache.keys().next().value;
      if (oldest) canvasCache.delete(oldest);
    }
    canvasCache.set(key, canvas);
    return canvas;
  }

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

function drawPageAutoFit(
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

  // 2. Page Header & Footer
  const headH = 33;
  const footH = 30;
  const surahMeta = surahForPage(data.page);
  const juzMeta = juzForPage(data.page);
  const hizbNum = Math.ceil(data.hizbQuarter / 4);

  ctx.font = '800 12px "IBM Plex Sans Arabic", sans-serif';
  ctx.fillStyle = pal.gold;
  ctx.textAlign = 'right';
  ctx.fillText(`سورة ${surahMeta.name}`, w - 18, 21);
  ctx.textAlign = 'left';
  ctx.fillText(`${juzMeta.name} · الحزب ${opts.num(hizbNum)}`, 18, 21);

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

  // 3. Build surah blocks & binary-search exact font size so 100% of text fits inside paper borders
  const padX = Math.max(12, Math.min(26, w * 0.045));
  const contentW = w - padX * 2;
  const availH = h - headH - footH - 16;

  const rawBlocks: SurahBlock[] = [];
  for (const a of data.ayahs) {
    const last = rawBlocks[rawBlocks.length - 1];
    if (!last || last.surah !== a.surah) {
      rawBlocks.push({ surah: a.surah, surahName: a.surahName, startsSurah: a.n === 1, tokens: [] });
    }
  }
  // Populate tokens per block
  let bCursor = -1;
  let prevSurah = -1;
  const groupedAyahs: MushafAyah[][] = [];
  for (const a of data.ayahs) {
    if (a.surah !== prevSurah) {
      bCursor++;
      prevSurah = a.surah;
      groupedAyahs[bCursor] = [];
    }
    groupedAyahs[bCursor].push(a);
  }
  for (let i = 0; i < rawBlocks.length; i++) {
    rawBlocks[i].tokens = tokenizeAyahs(groupedAyahs[i], opts.num);
  }

  const baseLineRatio = 1.92;
  let lo = 10.5;
  let hi = 28;
  for (let iter = 0; iter < 7; iter++) {
    const mid = (lo + hi) / 2;
    const test = layoutBlocksAtFontSize(ctx, rawBlocks, contentW, mid, baseLineRatio);
    if (test.totalH <= availH) lo = mid;
    else hi = mid;
  }

  const bestFs = lo;
  const fit = layoutBlocksAtFontSize(ctx, rawBlocks, contentW, bestFs, baseLineRatio);
  const totalLines = fit.prepared.reduce((acc, b) => acc + b.lines.length, 0);

  // Gently stretch line-height up to 2.22 if there is extra vertical breathing room, else center cleanly
  let lineH = bestFs * baseLineRatio;
  if (totalLines > 4 && fit.totalH < availH * 0.95) {
    const extraPerLine = (availH - fit.totalH) / totalLines;
    lineH = Math.min(bestFs * 2.24, lineH + extraPerLine * 0.82);
  }

  const finalTotalH = fit.prepared.reduce(
    (sum, b) => sum + (b.startsSurah ? b.bannerH + 6 + (b.basmalaH ? b.basmalaH + 4 : 0) : 0) + b.lines.length * lineH,
    0,
  );

  let cursorY = headH + 8 + Math.max(0, (availH - finalTotalH) / 2);
  const mainFont = `400 ${bestFs.toFixed(2)}px "Amiri", "Noto Naskh Arabic", serif`;
  const rosetteFont = `700 ${(bestFs * 0.78).toFixed(2)}px "Amiri", "Noto Naskh Arabic", serif`;

  for (const block of fit.prepared) {
    if (block.startsSurah) {
      const bGrad = ctx.createLinearGradient(padX, cursorY, padX + contentW, cursorY);
      bGrad.addColorStop(0, pal.bannerBg1);
      bGrad.addColorStop(0.5, pal.bannerBg2);
      bGrad.addColorStop(1, pal.bannerBg1);
      roundRect(ctx, padX, cursorY, contentW, block.bannerH, 10);
      ctx.fillStyle = bGrad;
      ctx.fill();
      ctx.save();
      ctx.strokeStyle = pal.gold;
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();

      ctx.font = `700 ${Math.max(15, Math.min(20, bestFs * 0.98)).toFixed(1)}px "Amiri", "Noto Naskh Arabic", serif`;
      ctx.fillStyle = pal.primary;
      ctx.textAlign = 'center';
      ctx.fillText(block.surahName, w / 2, cursorY + block.bannerH * 0.7);
      cursorY += block.bannerH + 6;

      if (block.basmalaH > 0) {
        ctx.font = `700 ${(bestFs * 1.18).toFixed(1)}px "Amiri", "Noto Naskh Arabic", serif`;
        ctx.fillStyle = pal.primary;
        ctx.textAlign = 'center';
        ctx.fillText('بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ', w / 2, cursorY + block.basmalaH * 0.72);
        cursorY += block.basmalaH + 4;
      }
    }

    for (let li = 0; li < block.lines.length; li++) {
      const line = block.lines[li];
      const baselineY = cursorY + lineH * 0.72;
      const isLast = li === block.lines.length - 1;

      if (isLast || line.items.length === 1) {
        const totalLineW = line.totalWordsW + fit.spaceW * (line.items.length - 1);
        let xRight = w / 2 + totalLineW / 2;
        ctx.textAlign = 'right';
        for (const item of line.items) {
          ctx.font = item.isRosette ? rosetteFont : mainFont;
          ctx.fillStyle = item.isRosette ? pal.gold : item.isSajda ? pal.primary : pal.ink;
          ctx.fillText(item.text, xRight, baselineY);
          xRight -= item.width + fit.spaceW;
        }
      } else {
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
      cursorY += lineH;
    }
  }

  // 4. Page Footer
  ctx.font = '800 12px "IBM Plex Sans Arabic", sans-serif';
  ctx.fillStyle = pal.gold;
  ctx.textAlign = 'center';
  ctx.fillText(`— ${opts.num(data.page)} —`, w / 2, h - 10);
}

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

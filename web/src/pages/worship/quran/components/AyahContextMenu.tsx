import { useState } from 'react';
import { Bookmark, BookOpen, Check, Copy, Image as ImageIcon, Share2, X } from 'lucide-react';
import type { MushafAyah } from '../data/pageLoader';
import { idbSet, type StoredBookmark } from '../db/quranDb';
import { useQuran } from '../store/quranStore';

const SHARE_THEMES = [
  { id: 'emerald', label: 'زمردي', bg1: '#164632', bg2: '#23694B', ink: '#FAF8F3', gold: '#E8C77A' },
  { id: 'paper', label: 'ورقي', bg1: '#FBF5E6', bg2: '#EFE2C5', ink: '#2F2415', gold: '#A98331' },
  { id: 'oled', label: 'ليلي', bg1: '#050807', bg2: '#111B17', ink: '#ECEAE4', gold: '#D4B259' },
  { id: 'royal', label: 'كحلي', bg1: '#0F1B33', bg2: '#1C3054', ink: '#F8FAFC', gold: '#E8C77A' },
] as const;

function wrapArabicLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    const test = current ? `${current} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = w;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

async function renderAyahCardBlob(
  ayah: MushafAyah,
  page: number,
  themeId: (typeof SHARE_THEMES)[number]['id'],
  numStr: string,
): Promise<Blob | null> {
  const theme = SHARE_THEMES.find((t) => t.id === themeId) ?? SHARE_THEMES[0];
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1080;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const grad = ctx.createLinearGradient(0, 0, 1080, 1080);
  grad.addColorStop(0, theme.bg1);
  grad.addColorStop(1, theme.bg2);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1080, 1080);

  // Ornamental double border
  ctx.strokeStyle = theme.gold;
  ctx.lineWidth = 4;
  ctx.strokeRect(48, 48, 984, 984);
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.55;
  ctx.strokeRect(64, 64, 952, 952);
  ctx.globalAlpha = 1;

  // Header
  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.fillStyle = theme.gold;
  ctx.font = '700 34px "IBM Plex Sans Arabic", sans-serif';
  ctx.fillText(`﴿ ${ayah.surahName} · الآية ${numStr} ﴾`, 540, 155);

  // Verse text
  const fontSize = ayah.text.length > 260 ? 38 : ayah.text.length > 140 ? 46 : 56;
  ctx.fillStyle = theme.ink;
  ctx.font = `700 ${fontSize}px "Amiri", "Noto Naskh Arabic", serif`;
  const lines = wrapArabicLines(ctx, ayah.text, 840);
  const lineH = fontSize * 1.9;
  const totalH = lines.length * lineH;
  let y = Math.max(250, (1080 - totalH) / 2 + fontSize * 0.4);
  for (const line of lines) {
    ctx.fillText(line, 540, y);
    y += lineH;
  }

  // Footer watermark
  ctx.fillStyle = theme.gold;
  ctx.font = '600 26px "IBM Plex Sans Arabic", sans-serif';
  ctx.fillText(`مؤسسة أحباب الحسين الثقافية الخيرية · صفحة ${page}`, 540, 975);

  return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}

export function AyahContextMenu({
  ayah,
  page,
  anchorY,
  onClose,
  onOpenTafsir,
}: {
  ayah: MushafAyah;
  page: number;
  anchorY: number;
  onClose: () => void;
  onOpenTafsir?: (ayah: MushafAyah) => void;
}) {
  const { num } = useQuran();
  const [copied, setCopied] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareTheme, setShareTheme] = useState<(typeof SHARE_THEMES)[number]['id']>('emerald');
  const [sharing, setSharing] = useState(false);

  const ayahNum = num(ayah.n);

  const copyText = () => {
    const txt = `${ayah.text}\n[${ayah.surahName}: ${ayahNum}]`;
    void navigator.clipboard?.writeText(txt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    });
  };

  const saveBookmark = async () => {
    const id = `${ayah.surah}:${ayah.n}`;
    const entry: StoredBookmark = {
      id,
      surah: ayah.surah,
      ayah: ayah.n,
      page,
      color: '#1F6B4A',
      label: 'للورد',
      note: ayah.text.slice(0, 90),
      createdAt: Date.now(),
    };
    await idbSet('bookmarks', id, entry);
    setBookmarked(true);
    setTimeout(() => setBookmarked(false), 1500);
  };

  const shareAsText = async () => {
    const txt = `${ayah.text}\n[${ayah.surahName}: ${ayahNum}]`;
    if (navigator.share) {
      try { await navigator.share({ title: ayah.surahName, text: txt }); return; } catch { /* cancel */ }
    }
    copyText();
  };

  const downloadOrShareImage = async () => {
    setSharing(true);
    try {
      const blob = await renderAyahCardBlob(ayah, page, shareTheme, ayahNum);
      if (!blob) return;
      const file = new File([blob], `ayah-${ayah.surah}-${ayah.n}.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `${ayah.surahName} (${ayahNum})` });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ayah-${ayah.surah}-${ayah.n}.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      }
    } finally {
      setSharing(false);
    }
  };

  const topPos = Math.max(72, Math.min(window.innerHeight - 230, anchorY - 12));

  return (
    <div className="qr-ctx-backdrop" onClick={onClose}>
      <div
        className="qr-ctx-menu"
        style={{ top: shareOpen ? '50%' : topPos, transform: shareOpen ? 'translate(-50%, -50%)' : 'translateX(-50%)' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`خيارات الآية ${ayahNum}`}
      >
        <div className="qr-ctx-head">
          <span>{ayah.surahName} · الآية {ayahNum}</span>
          <button type="button" className="qr-ctx-close" onClick={onClose} aria-label="إغلاق">
            <X size={16} />
          </button>
        </div>

        {!shareOpen ? (
          <div className="qr-ctx-actions">
            {onOpenTafsir && (
              <button type="button" className="qr-ctx-btn" onClick={() => onOpenTafsir(ayah)}>
                <BookOpen size={17} />
                <span>التفسير</span>
              </button>
            )}
            <button type="button" className="qr-ctx-btn" onClick={() => void saveBookmark()}>
              {bookmarked ? <Check size={17} /> : <Bookmark size={17} />}
              <span>{bookmarked ? 'حُفظت' : 'فاصل'}</span>
            </button>
            <button type="button" className="qr-ctx-btn" onClick={copyText}>
              {copied ? <Check size={17} /> : <Copy size={17} />}
              <span>{copied ? 'نُسخت' : 'نسخ'}</span>
            </button>
            <button type="button" className="qr-ctx-btn" onClick={() => void shareAsText()}>
              <Share2 size={17} />
              <span>مشاركة</span>
            </button>
            <button type="button" className="qr-ctx-btn" onClick={() => setShareOpen(true)}>
              <ImageIcon size={17} />
              <span>صورة</span>
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
              {SHARE_THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setShareTheme(t.id)}
                  style={{
                    height: 40,
                    borderRadius: 10,
                    border: shareTheme === t.id ? `2px solid ${t.gold}` : '1px solid var(--q-line)',
                    background: `linear-gradient(135deg, ${t.bg1}, ${t.bg2})`,
                    color: t.ink,
                    font: 'inherit',
                    fontSize: '0.76rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="q-btn" style={{ flex: 1 }} onClick={() => setShareOpen(false)}>
                رجوع
              </button>
              <button
                type="button"
                className="q-btn primary"
                style={{ flex: 2 }}
                disabled={sharing}
                onClick={() => void downloadOrShareImage()}
              >
                <ImageIcon size={16} />
                <span>{sharing ? 'جارٍ التوليد…' : 'حفظ / مشاركة الصورة'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

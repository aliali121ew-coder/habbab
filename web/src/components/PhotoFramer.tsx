import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check, Minus, Plus, RotateCcw, X } from 'lucide-react';
import { cropAvatar } from '../image';

// The square on screen; the saved picture is this square at the avatar size.
const FRAME = 280;
const MAX_ZOOM = 4;

interface Props {
  source: Blob;
  onCancel: () => void;
  /** Receives the framed square, ready to upload. */
  onDone: (framed: Blob) => Promise<void> | void;
  /** Where to render; inside a modal <dialog> it must be the dialog, which sits above the page. */
  container?: Element | null;
}

interface Point { x: number; y: number }

// Frame a photo before it is saved: drag to move it (finger or mouse), pinch, slide or scroll to
// zoom. The picture always covers the whole square, so no empty edge can be saved.
export function PhotoFramer({ source, onCancel, onDone, container }: Props) {
  const url = useMemo(() => URL.createObjectURL(source), [source]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pointers = useRef(new Map<number, Point>());
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);

  // At zoom 1 the shorter side just fills the frame.
  const base = natural ? FRAME / Math.min(natural.w, natural.h) : 1;

  const clamp = (point: Point, z: number): Point => {
    if (!natural) return point;
    const scale = base * z;
    const maxX = (natural.w * scale - FRAME) / 2;
    const maxY = (natural.h * scale - FRAME) / 2;
    return { x: Math.max(-maxX, Math.min(maxX, point.x)), y: Math.max(-maxY, Math.min(maxY, point.y)) };
  };
  const applyZoom = (value: number) => {
    const next = Math.min(MAX_ZOOM, Math.max(1, value));
    setZoom(next);
    setOffset((current) => clamp(current, next));
  };
  const reset = () => { setZoom(1); setOffset({ x: 0, y: 0 }); };

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape' && !busy) onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  const down = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom };
    }
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    const now = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, now);
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      applyZoom(pinch.current.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.current.distance));
    } else if (pointers.current.size === 1) {
      setOffset((current) => clamp({ x: current.x + now.x - previous.x, y: current.y + now.y - previous.y }, zoom));
    }
  };
  const up = (event: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };
  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 30 : 10;
    const moves: Record<string, Point> = { ArrowLeft: { x: step, y: 0 }, ArrowRight: { x: -step, y: 0 }, ArrowUp: { x: 0, y: step }, ArrowDown: { x: 0, y: -step } };
    if (moves[event.key]) {
      event.preventDefault();
      setOffset((current) => clamp({ x: current.x + moves[event.key].x, y: current.y + moves[event.key].y }, zoom));
    } else if (event.key === '+' || event.key === '=') applyZoom(zoom + 0.1);
    else if (event.key === '-') applyZoom(zoom - 0.1);
  };

  const save = async () => {
    if (!natural || busy) return;
    setBusy(true);
    setError('');
    try {
      const scale = base * zoom;
      const left = FRAME / 2 + offset.x - (natural.w * scale) / 2;
      const top = FRAME / 2 + offset.y - (natural.h * scale) / 2;
      const side = FRAME / scale;
      const sx = Math.max(0, Math.min(natural.w - side, -left / scale));
      const sy = Math.max(0, Math.min(natural.h - side, -top / scale));
      await onDone(await cropAvatar(source, { sx, sy, side }));
    } catch (failure) {
      setError((failure as Error).message);
      setBusy(false);
    }
  };

  const scale = base * zoom;
  return createPortal(
    <div className="framer-overlay" role="dialog" aria-modal="true" aria-label="ضبط الصورة" onClick={() => !busy && onCancel()}>
      <div className="framer-sheet" onClick={(event) => event.stopPropagation()}>
        <header className="framer-head">
          <div>
            <strong>ضبط الصورة</strong>
            <small>اسحب الصورة لتحريكها، وكبّرها أو صغّرها</small>
          </div>
          <button type="button" className="framer-close" aria-label="إغلاق" disabled={busy} onClick={onCancel}><X size={18} aria-hidden /></button>
        </header>

        <div
          className="framer-frame"
          style={{ width: FRAME, height: FRAME }}
          tabIndex={0}
          aria-label="الصورة، اسحبها أو استعمل الأسهم لتحريكها"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onWheel={(event) => applyZoom(zoom - event.deltaY * 0.0015)}
          onKeyDown={keys}
        >
          <img
            src={url}
            alt=""
            draggable={false}
            onLoad={(event) => setNatural({ w: event.currentTarget.naturalWidth, h: event.currentTarget.naturalHeight })}
            style={natural ? {
              width: natural.w * scale,
              height: natural.h * scale,
              transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
            } : { opacity: 0 }}
          />
          <span className="framer-grid" aria-hidden />
        </div>

        <div className="framer-zoom">
          <button type="button" aria-label="تصغير" disabled={busy || zoom <= 1} onClick={() => applyZoom(zoom - 0.2)}><Minus size={16} aria-hidden /></button>
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            aria-label="التكبير"
            onChange={(event) => applyZoom(Number(event.target.value))}
            disabled={busy}
          />
          <button type="button" aria-label="تكبير" disabled={busy || zoom >= MAX_ZOOM} onClick={() => applyZoom(zoom + 0.2)}><Plus size={16} aria-hidden /></button>
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}

        <footer className="framer-actions">
          <button type="button" className="btn" disabled={busy} onClick={reset}><RotateCcw size={16} aria-hidden /> إعادة</button>
          <button type="button" className="btn primary" disabled={busy || !natural} onClick={save}>
            <Check size={17} aria-hidden /> {busy ? 'جارٍ الحفظ…' : 'حفظ الصورة'}
          </button>
        </footer>
      </div>
    </div>,
    container ?? document.body,
  );
}

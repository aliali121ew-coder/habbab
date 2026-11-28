import type { QuranTheme } from '../store/quranStore';

export interface CurlGeometry {
  /** SVG clipPath d attribute in objectBoundingBox (0..1) units for the front page */
  frontClipPath: string;
  /** SVG path for the curled back-side paper flap in 0..100 viewBox */
  flapPath: string;
  /** SVG path for the soft cast shadow underneath the curled corner in 0..100 viewBox */
  shadowPath: string;
  /** SVG path for the subtle arch highlight ridge along the curl fold */
  ridgePath: string;
  /** Gradient endpoints (0..100) perpendicular to the curl fold */
  grad: { x1: number; y1: number; x2: number; y2: number };
  /** Shadow opacity 0..1 */
  shadowOpacity: number;
}

/**
 * Computes realistic top-corner curved Bézier page-curl geometry (matching physical paper peel):
 * - Peels from the TOP corner FIRST (top-left in RTL when advancing to next page).
 * - Uses cubic Bézier curves + subtle organic paper wave so the sheet never looks like a stiff straight board.
 * - Progress p in (0..1) drives the curl smoothly from top corner -> full page sweep.
 */
export function computePageCurl(p: number, dir: 1 | -1, tiltY = 0): CurlGeometry {
  const clamped = Math.max(0.001, Math.min(0.999, p));
  const sinP = Math.sin(clamped * Math.PI);
  // Subtle organic wave as the paper flexes mid-turn
  const wave = Math.sin(clamped * Math.PI * 2.4) * 2.6 * sinP;
  const wave2 = Math.cos(clamped * Math.PI * 1.8) * 1.8 * sinP;

  // Top edge fold advances FIRST, then left edge follows down (creates the iconic top-corner curl!)
  const tx = Math.min(132, Math.pow(clamped, 0.78) * 138);
  const ly = Math.min(148, Math.pow(clamped, 0.92) * 152 + tiltY * 14 * sinP);

  // Tip of the curled-over corner (reflected inward by cylindrical paper curvature + wave)
  const curlRadius = 0.56 - 0.1 * clamped;
  const tipX = Math.min(108, tx * curlRadius + wave);
  const tipY = Math.min(108, ly * curlRadius + wave2);

  // Control points for the curved arch on the top edge and left edge (the "bell/arch" bend in the photo)
  const topArchX = tx * 0.84 + wave * 0.4;
  const topArchY = Math.max(0, ly * 0.08 + 2.5 * sinP);

  const leftArchX = Math.max(0, tx * 0.08 + 2.5 * sinP);
  const leftArchY = ly * 0.84 + wave2 * 0.4;

  // Inner curve of the curled flap edges meeting at the tip
  const cTopToTipX = tipX + (tx - tipX) * 0.14;
  const cTopToTipY = tipY * 0.42;

  const cLeftToTipX = tipX * 0.42;
  const cLeftToTipY = tipY + (ly - tipY) * 0.14;

  // Mirror X coordinates when curling from top-right (previous page)
  const mx = (x: number) => (dir === 1 ? x : 100 - x);
  const n = (v: number) => v.toFixed(2);
  const u = (v: number) => (v / 100).toFixed(4);

  // 1. Front page clipPath (keeps everything OUTSIDE the peeled top-corner region)
  // Path traces around the un-peeled remainder of the 0..1 page box with a curved fold cut
  const fTx = Math.max(0, Math.min(100, tx));
  const fLy = Math.max(0, Math.min(100, ly));
  const cFold1X = fTx * 0.62 + wave * 0.35;
  const cFold1Y = fLy * 0.24;
  const cFold2X = fTx * 0.24;
  const cFold2Y = fLy * 0.62 + wave2 * 0.35;

  const frontClipPath = dir === 1
    ? `M ${u(fTx)} 0 L 1 0 L 1 1 L 0 1 L 0 ${u(fLy)} C ${u(cFold2X)} ${u(cFold2Y)} ${u(cFold1X)} ${u(cFold1Y)} ${u(fTx)} 0 Z`
    : `M ${u(100 - fTx)} 0 L 0 0 L 0 1 L 1 1 L 1 ${u(fLy)} C ${u(100 - cFold2X)} ${u(cFold2Y)} ${u(100 - cFold1X)} ${u(cFold1Y)} ${u(100 - fTx)} 0 Z`;

  // 2. Curled back-side paper flap (exact curved silhouette from the reference image!)
  const flapPath = [
    `M ${n(mx(tx))} 0`,
    `C ${n(mx(topArchX))} ${n(topArchY)}, ${n(mx(cTopToTipX))} ${n(cTopToTipY)}, ${n(mx(tipX))} ${n(tipY)}`,
    `C ${n(mx(cLeftToTipX))} ${n(cLeftToTipY)}, ${n(mx(leftArchX))} ${n(leftArchY)}, ${n(mx(0))} ${n(ly)}`,
    `C ${n(mx(cFold2X))} ${n(cFold2Y)}, ${n(mx(cFold1X))} ${n(cFold1Y)}, ${n(mx(tx))} 0 Z`,
  ].join(' ');

  // 3. Soft cast shadow underneath the curled corner (slightly expanded & offset toward the page interior)
  const shExpand = 9 + sinP * 11;
  const shTx = tx + shExpand;
  const shLy = ly + shExpand;
  const shTipX = tipX + shExpand * 0.92;
  const shTipY = tipY + shExpand * 0.92;
  const shadowPath = [
    `M ${n(mx(shTx))} -2`,
    `C ${n(mx(topArchX + shExpand * 0.7))} ${n(topArchY + shExpand * 0.4)}, ${n(mx(shTipX + 2))} ${n(shTipY * 0.48)}, ${n(mx(shTipX))} ${n(shTipY)}`,
    `C ${n(mx(shTipX * 0.48))} ${n(shTipY + 2)}, ${n(mx(leftArchX + shExpand * 0.4))} ${n(leftArchY + shExpand * 0.7)}, ${n(mx(-2))} ${n(shLy)}`,
    `L ${n(mx(0))} ${n(ly)}`,
    `C ${n(mx(cFold2X))} ${n(cFold2Y)}, ${n(mx(cFold1X))} ${n(cFold1Y)}, ${n(mx(tx))} 0 Z`,
  ].join(' ');

  // 4. Subtle crease highlight ridge along the fold curve
  const ridgePath = `M ${n(mx(tx))} 0 C ${n(mx(cFold1X))} ${n(cFold1Y)}, ${n(mx(cFold2X))} ${n(cFold2Y)}, ${n(mx(0))} ${n(ly)}`;

  return {
    frontClipPath,
    flapPath,
    shadowPath,
    ridgePath,
    grad: {
      x1: mx(0),
      y1: 0,
      x2: mx(tipX),
      y2: tipY,
    },
    shadowOpacity: Math.min(0.68, 0.18 + sinP * 0.54),
  };
}

export function PageCurlOverlay({
  geom,
  theme,
  clipId,
}: {
  geom: CurlGeometry;
  theme: QuranTheme;
  clipId: string;
}) {
  const colors = theme === 'dark'
    ? { c0: '#070A09', c1: '#1E2723', c2: '#313E38', c3: '#18201D', c4: '#050706', shadow: '#000000' }
    : theme === 'sepia'
      ? { c0: '#C8B48E', c1: '#FBF3DF', c2: '#FFFDF7', c3: '#EAE0C5', c4: '#B9A37C', shadow: '#261A0B' }
      : { c0: '#D4CEC0', c1: '#FFFFFF', c2: '#FDFBF5', c3: '#EFEAE0', c4: '#BEB7A8', shadow: '#121820' };

  return (
    <>
      {/* Hidden SVG defining the live curved clipPath for the front page */}
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <defs>
          <clipPath id={clipId} clipPathUnits="objectBoundingBox">
            <path d={geom.frontClipPath} />
          </clipPath>
        </defs>
      </svg>

      {/* Visible SVG rendering the deep blurred cast shadow + curved 3D glossy paper underside */}
      <svg
        className="qr-curl-svg"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <filter id={`${clipId}-blur`} x="-25%" y="-25%" width="150%" height="150%">
            <feGaussianBlur stdDeviation="3.4" />
          </filter>
          <linearGradient
            id={`${clipId}-paper`}
            gradientUnits="userSpaceOnUse"
            x1={geom.grad.x1}
            y1={geom.grad.y1}
            x2={geom.grad.x2}
            y2={geom.grad.y2}
          >
            <stop offset="0%" stopColor={colors.c0} />
            <stop offset="28%" stopColor={colors.c1} />
            <stop offset="56%" stopColor={colors.c2} />
            <stop offset="84%" stopColor={colors.c3} />
            <stop offset="100%" stopColor={colors.c4} />
          </linearGradient>
          <linearGradient
            id={`${clipId}-sh`}
            gradientUnits="userSpaceOnUse"
            x1={geom.grad.x1}
            y1={geom.grad.y1}
            x2={geom.grad.x2 + 12}
            y2={geom.grad.y2 + 12}
          >
            <stop offset="0%" stopColor={colors.shadow} stopOpacity="0.58" />
            <stop offset="55%" stopColor={colors.shadow} stopOpacity="0.34" />
            <stop offset="100%" stopColor={colors.shadow} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Deep soft cast shadow falling onto the revealed page underneath */}
        <path
          d={geom.shadowPath}
          fill={`url(#${clipId}-sh)`}
          opacity={geom.shadowOpacity}
          filter={`url(#${clipId}-blur)`}
        />

        {/* Curved 3D back-side of the turning sheet */}
        <path d={geom.flapPath} fill={`url(#${clipId}-paper)`} />

        {/* Delicate fold crease rim */}
        <path
          d={geom.ridgePath}
          fill="none"
          stroke={colors.shadow}
          strokeOpacity="0.18"
          strokeWidth="0.6"
        />
      </svg>
    </>
  );
}

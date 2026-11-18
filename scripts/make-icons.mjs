// Draws the app icons for installing on Windows, Android and iOS from the khatam mark used in
// the favicon: web/public/icons/*.png. Run with: node scripts/make-icons.mjs
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const out = new URL('../web/public/icons/', import.meta.url);
await mkdir(out, { recursive: true });

const GREEN = '#0f4c3a';
const GOLD = '#d9b86a';

// The mark sits inside `inset` of the square; the rest is the green ground.
// `round` rounds the ground's corners (for plain icons); maskable and Apple icons stay square,
// because the system cuts its own shape.
function svg(size, { inset, round }) {
  const box = size * (1 - 2 * inset);
  const scale = box / 32;
  const offset = size * inset;
  const radius = round ? size * 0.22 : 0;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="${GREEN}"/>
  <g transform="translate(${offset} ${offset}) scale(${scale})" fill="none" stroke="${GOLD}" stroke-width="1.6" stroke-linejoin="round">
    <rect x="7" y="7" width="18" height="18"/>
    <rect x="7" y="7" width="18" height="18" transform="rotate(45 16 16)"/>
    <circle cx="16" cy="16" r="3.2"/>
  </g>
</svg>`);
}

const icons = [
  ['icon-192.png', 192, { inset: 0.08, round: true }],
  ['icon-512.png', 512, { inset: 0.08, round: true }],
  // Maskable: the mark stays inside the central safe circle (80%).
  ['icon-maskable-512.png', 512, { inset: 0.2, round: false }],
  ['apple-touch-icon.png', 180, { inset: 0.14, round: false }],
];

for (const [name, size, options] of icons) {
  await sharp(svg(size, options)).png().toFile(fileURLToPath(new URL(name, out)));
  console.log('wrote', name);
}

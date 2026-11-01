const MAX_BYTES = 300 * 1024;
const MAX_THUMB_BYTES = 40 * 1024;

function encode(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function drawScaled(bitmap, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function shrink(bitmap, maxSide, limit, type) {
  for (let side = maxSide; side >= 200; side = Math.round(side * 0.75)) {
    const canvas = drawScaled(bitmap, side);
    for (const quality of [0.8, 0.65, 0.5, 0.35]) {
      const blob = await encode(canvas, type, quality);
      if (blob && blob.size <= limit) return blob;
    }
  }
  throw new Error('تعذّر ضغط الصورة، جرّب صورة أخرى');
}

export async function compressImage(file) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('تعذّر قراءة الصورة');
  }
  // Safari silently returns PNG for WebP, so probe once and fall back to JPEG.
  const probe = await encode(drawScaled(bitmap, 16), 'image/webp', 0.8);
  const type = probe?.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
  const image = await shrink(bitmap, 1600, MAX_BYTES, type);
  const thumb = await shrink(bitmap, 240, MAX_THUMB_BYTES, type);
  bitmap.close();
  return { image, thumb };
}

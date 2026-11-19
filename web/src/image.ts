const MAX_BYTES = 300 * 1024;
const AVATAR_SIDE = 320;

const encode = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

// Square centre crop, so every portrait fits the arch frame the same way.
export async function compressAvatar(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => {
    throw new Error('تعذّر قراءة الصورة');
  });
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_SIDE;
  canvas.height = AVATAR_SIDE;
  canvas.getContext('2d')!.drawImage(
    bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, AVATAR_SIDE, AVATAR_SIDE,
  );
  bitmap.close();

  // Safari silently returns PNG for WebP, so check the result and fall back to JPEG.
  const webp = await encode(canvas, 'image/webp', 0.8);
  const blob = webp?.type === 'image/webp' ? webp : await encode(canvas, 'image/jpeg', 0.8);
  if (!blob || blob.size > MAX_BYTES) throw new Error('تعذّر ضغط الصورة، جرّب صورة أخرى');
  return blob;
}

/** A square of the source picture, in its own pixels, as chosen in the photo framer. */
export interface AvatarCrop { sx: number; sy: number; side: number }

// The framed square, at the same size and quality as compressAvatar's centre crop.
export async function cropAvatar(file: Blob, crop: AvatarCrop): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => {
    throw new Error('تعذّر قراءة الصورة');
  });
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_SIDE;
  canvas.height = AVATAR_SIDE;
  const context = canvas.getContext('2d')!;
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, crop.sx, crop.sy, crop.side, crop.side, 0, 0, AVATAR_SIDE, AVATAR_SIDE);
  bitmap.close();
  const webp = await encode(canvas, 'image/webp', 0.85);
  const blob = webp?.type === 'image/webp' ? webp : await encode(canvas, 'image/jpeg', 0.85);
  if (!blob || blob.size > MAX_BYTES) throw new Error('تعذّر ضغط الصورة، جرّب صورة أخرى');
  return blob;
}

const RECEIPT_SIDE = 1800;
const RECEIPT_MAX = 1536 * 1024;

// A photographed receipt, scaled so its longest side is at most 1800px; PDFs pass through as they are.
export async function compressReceipt(file: File): Promise<Blob> {
  if (file.type === 'application/pdf') return file;
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => {
    throw new Error('تعذّر قراءة الصورة');
  });
  const scale = Math.min(1, RECEIPT_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const webp = await encode(canvas, 'image/webp', 0.82);
  const blob = webp?.type === 'image/webp' ? webp : await encode(canvas, 'image/jpeg', 0.82);
  if (!blob || blob.size > RECEIPT_MAX) throw new Error('تعذّر ضغط الصورة، جرّب صورة أوضح أو أصغر');
  return blob;
}

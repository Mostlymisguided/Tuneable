/** Stored profile photos stay under this. Phone exports are resized first. */
export const PROFILE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
/** Largest original we will still upload so the server can resize it. */
const PROFILE_IMAGE_UPLOAD_CEILING_BYTES = 20 * 1024 * 1024;
const MAX_EDGE = 1600;

function isHeic(file: File): boolean {
  const type = (file.type || '').toLowerCase();
  return type === 'image/heic' || type === 'image/heif' || /\.hei[cf]$/i.test(file.name);
}

export function isProbablyImageFile(file: File): boolean {
  const type = (file.type || '').toLowerCase();
  if (type.startsWith('image/')) return true;
  return /\.(jpe?g|png|gif|webp|hei[cf]|bmp|avif)$/i.test(file.name);
}

type DecodedImage = {
  width: number;
  height: number;
  draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void;
  close: () => void;
};

async function decodeImage(file: File): Promise<DecodedImage> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return {
      width: bitmap.width,
      height: bitmap.height,
      draw: (ctx, width, height) => ctx.drawImage(bitmap, 0, 0, width, height),
      close: () => bitmap.close(),
    };
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('Could not read image'));
        el.src = url;
      });
      return {
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
        draw: (ctx, width, height) => ctx.drawImage(img, 0, 0, width, height),
        close: () => URL.revokeObjectURL(url),
      };
    } catch (error) {
      URL.revokeObjectURL(url);
      throw error;
    }
  }
}

function canvasBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

/**
 * iPhone Photos shows the HEIC size (often ~3MB). Safari and the file picker
 * hand over a full-resolution JPEG that is frequently larger than 5MB.
 * Shrink that export before the size check.
 */
async function downscaleToJpeg(file: File): Promise<File> {
  const image = await decodeImage(file);
  try {
    const longest = Math.max(image.width, image.height);
    if (!longest) return file;

    let edge = Math.min(MAX_EDGE, longest);
    let quality = 0.82;
    let best: File | null = null;
    const base = file.name.replace(/\.[^.]+$/, '') || 'profile';

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const scale = edge / longest;
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return best || file;
      image.draw(ctx, width, height);
      const blob = await canvasBlob(canvas, quality);
      if (!blob) return best || file;
      const next = new File([blob], `${base}.jpg`, {
        type: 'image/jpeg',
        lastModified: Date.now(),
      });
      if (!best || next.size < best.size) best = next;
      if (next.size <= PROFILE_IMAGE_MAX_BYTES) return next;
      edge = Math.max(640, Math.round(edge * 0.75));
      quality = Math.max(0.55, quality - 0.1);
    }

    return best || file;
  } finally {
    image.close();
  }
}

export async function prepareProfileImage(file: File): Promise<File> {
  if (!isProbablyImageFile(file)) {
    throw new Error('Please select an image file');
  }

  const alreadySmall = file.size > 0 && file.size <= PROFILE_IMAGE_MAX_BYTES && !isHeic(file);
  if (alreadySmall) return file;

  let prepared = file;
  if (file.size > PROFILE_IMAGE_MAX_BYTES || isHeic(file)) {
    try {
      const shrunk = await downscaleToJpeg(file);
      if (shrunk.size > 0 && (file.size === 0 || shrunk.size <= file.size)) {
        prepared = shrunk;
      }
    } catch {
      prepared = file;
    }
  }

  if (prepared.size > PROFILE_IMAGE_UPLOAD_CEILING_BYTES) {
    throw new Error('Image must be less than 20MB');
  }

  return prepared;
}

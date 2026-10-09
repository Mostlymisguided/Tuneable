/** Stored profile photos stay under this. Phone exports are resized first. */
export const PROFILE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
/** Largest original we will still upload so the server can resize it. */
const PROFILE_IMAGE_UPLOAD_CEILING_BYTES = 20 * 1024 * 1024;
const MAX_EDGE = 1600;
/**
 * iOS Safari draws a blank image when the source is taller or wider than this.
 * A 24MP iPhone photo is 4284×5712, so it has to be scaled while decoding.
 */
const IOS_CANVAS_MAX = 4096;

function isHeic(file: File): boolean {
  const type = (file.type || '').toLowerCase();
  return type === 'image/heic' || type === 'image/heif' || /\.hei[cf]$/i.test(file.name);
}

export function isProbablyImageFile(file: File): boolean {
  const type = (file.type || '').toLowerCase();
  if (type.startsWith('image/')) return true;
  return /\.(jpe?g|png|gif|webp|hei[cf]|bmp|avif)$/i.test(file.name);
}

function fittedSize(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (!longest || longest <= maxEdge) {
    return { width: Math.max(1, width), height: Math.max(1, height) };
  }
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

type DecodedImage = {
  width: number;
  height: number;
  draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void;
  close: () => void;
};

async function bitmapFromFile(file: File): Promise<ImageBitmap> {
  const attempts: ImageBitmapOptions[] = [
    { imageOrientation: 'from-image', resizeWidth: MAX_EDGE, resizeQuality: 'high' },
    { resizeWidth: MAX_EDGE, resizeQuality: 'high' },
    { imageOrientation: 'from-image' },
  ];
  let lastError: unknown;
  for (const options of attempts) {
    try {
      return await createImageBitmap(file, options);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Could not read image');
}

/** Scale an already-decoded bitmap down without drawing a >4096px source on iOS. */
async function limitBitmap(bitmap: ImageBitmap): Promise<ImageBitmap> {
  const longest = Math.max(bitmap.width, bitmap.height);
  if (longest <= MAX_EDGE && longest <= IOS_CANVAS_MAX) return bitmap;

  const fitted = fittedSize(bitmap.width, bitmap.height, Math.min(MAX_EDGE, IOS_CANVAS_MAX));
  try {
    const scaled = await createImageBitmap(bitmap, {
      resizeWidth: fitted.width,
      resizeHeight: fitted.height,
      resizeQuality: 'high',
    });
    if (scaled !== bitmap) bitmap.close();
    return scaled;
  } catch (error) {
    if (longest <= IOS_CANVAS_MAX) return bitmap;
    bitmap.close();
    throw error;
  }
}

async function decodeImage(file: File): Promise<DecodedImage> {
  try {
    const bitmap = await limitBitmap(await bitmapFromFile(file));
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
      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;
      if (Math.max(width, height) > IOS_CANVAS_MAX) {
        URL.revokeObjectURL(url);
        throw new Error('Could not read image');
      }
      return {
        width,
        height,
        draw: (ctx, drawWidth, drawHeight) => ctx.drawImage(img, 0, 0, drawWidth, drawHeight),
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
 * Photos shows the HEIC size (this one is 3.2MB). Safari hands the page a
 * full-resolution JPEG that is often larger than 5MB, and iOS cannot paint
 * a 5712px-tall photo onto a canvas until it has been scaled during decode.
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
      const fitted = fittedSize(image.width, image.height, edge);
      const canvas = document.createElement('canvas');
      canvas.width = fitted.width;
      canvas.height = fitted.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return best || file;
      image.draw(ctx, fitted.width, fitted.height);
      const blob = await canvasBlob(canvas, quality);
      if (!blob) return best || file;
      const next = new File([blob], `${base}.jpg`, {
        type: 'image/jpeg',
        lastModified: Date.now(),
      });
      if (!best || next.size < best.size) best = next;
      if (next.size > 0 && next.size <= PROFILE_IMAGE_MAX_BYTES) return next;
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

  const needsShrink = file.size === 0 || file.size > PROFILE_IMAGE_MAX_BYTES || isHeic(file);
  if (!needsShrink) return file;

  let prepared = file;
  try {
    const shrunk = await downscaleToJpeg(file);
    if (shrunk.size > 0 && (file.size === 0 || shrunk.size < file.size || shrunk.size <= PROFILE_IMAGE_MAX_BYTES)) {
      prepared = shrunk;
    }
  } catch {
    prepared = file;
  }

  if (prepared.size > PROFILE_IMAGE_UPLOAD_CEILING_BYTES) {
    throw new Error('That photo is too large to upload. Try a smaller one.');
  }

  return prepared;
}

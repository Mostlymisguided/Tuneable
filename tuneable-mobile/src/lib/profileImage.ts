import { requireOptionalNativeModule } from 'expo';
import { File } from 'expo-file-system';

/** Stored profile photos stay under this. Phone exports are resized first. */
const PROFILE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
/** Largest original we will still upload so the server can resize it. */
const PROFILE_IMAGE_UPLOAD_CEILING_BYTES = 20 * 1024 * 1024;
const MAX_EDGE = 1600;

export type PickedProfilePhoto = {
  uri: string;
  width?: number;
  height?: number;
  fileSize?: number;
  mimeType?: string | null;
  fileName?: string | null;
};

export type ProfilePhotoUpload = {
  uri: string;
  name: string;
  mimeType: string;
};

function bytesOnDisk(uri: string): number | null {
  try {
    const file = new File(uri);
    if (file.exists && file.size > 0) return file.size;
  } catch {
    // Fall back to the size reported by the image picker.
  }
  return null;
}

function jpegName(fileName?: string | null): string {
  const base = (fileName || 'profile').replace(/\.[^.]+$/, '');
  return `${base || 'profile'}.jpg`;
}

/** True once this install includes the native image resizer. */
export function canResizeOnDevice(): boolean {
  return requireOptionalNativeModule('ExpoImageManipulator') != null;
}

/**
 * Photos shows the HEIC size. The iOS picker re-encodes the crop as a
 * full-resolution JPEG, which is often larger than 5MB for a "3MB" photo.
 */
async function shrinkToJpeg(
  uri: string,
  width: number | undefined,
  height: number | undefined,
  edge: number,
  compress: number
): Promise<{ uri: string; width: number; height: number }> {
  if (!canResizeOnDevice()) {
    throw new Error('resize-unavailable');
  }
  const { manipulateAsync, SaveFormat } = await import('expo-image-manipulator');
  const actions: { resize: { width: number } | { height: number } }[] = [];
  const longest = Math.max(width || 0, height || 0);
  if (longest > edge) {
    if ((width || 0) >= (height || 0)) actions.push({ resize: { width: edge } });
    else actions.push({ resize: { height: edge } });
  }
  return manipulateAsync(uri, actions, { compress, format: SaveFormat.JPEG });
}

export async function prepareProfilePhoto(asset: PickedProfilePhoto): Promise<ProfilePhotoUpload> {
  const reported = asset.fileSize && asset.fileSize > 0 ? asset.fileSize : null;
  let uri = asset.uri;
  let size = bytesOnDisk(uri) ?? reported;
  let mimeType = asset.mimeType || 'image/jpeg';
  let name =
    asset.fileName && /\.(jpe?g|png|webp|hei[cf])$/i.test(asset.fileName)
      ? asset.fileName
      : mimeType.includes('png')
        ? 'profile.png'
        : mimeType.includes('webp')
          ? 'profile.webp'
          : mimeType.includes('heic') || mimeType.includes('heif')
            ? 'profile.heic'
            : 'profile.jpg';

  if (size == null || size > PROFILE_IMAGE_MAX_BYTES) {
    try {
      let result = await shrinkToJpeg(uri, asset.width, asset.height, MAX_EDGE, 0.82);
      let shrunkSize = bytesOnDisk(result.uri);
      if (shrunkSize != null && shrunkSize > PROFILE_IMAGE_MAX_BYTES) {
        result = await shrinkToJpeg(result.uri, result.width, result.height, 1024, 0.7);
        shrunkSize = bytesOnDisk(result.uri);
      }
      if (shrunkSize == null || size == null || shrunkSize < size) {
        uri = result.uri;
        size = shrunkSize ?? size;
        mimeType = 'image/jpeg';
        name = jpegName(asset.fileName);
      }
    } catch {
      // This install may not include the native resizer yet. The server
      // resizes uploads up to the ceiling.
    }
  }

  if (size != null && size > PROFILE_IMAGE_UPLOAD_CEILING_BYTES) {
    throw new Error('Image must be less than 20MB');
  }

  return { uri, name, mimeType };
}

const LOSSLESS_EXTS = ['.wav', '.wave', '.flac'];
const LOSSLESS_MIMES = new Set([
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/vnd.wave',
  'audio/flac',
  'audio/x-flac',
]);

export const LOSSLESS_UPLOAD_COMING_SOON =
  'WAV and FLAC (lossless) uploads are coming in version 1.1.';

/** Document picker types: MP3 plus lossless so we can show the 1.1 gate. */
export const AUDIO_PICKER_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/flac',
  'audio/x-flac',
  'audio/*',
];

export function getAudioUploadRejection(
  fileName: string,
  mimeType?: string | null,
): string | null {
  const name = fileName.toLowerCase();
  const mime = (mimeType || '').toLowerCase();
  const isMp3 =
    name.endsWith('.mp3') || mime === 'audio/mpeg' || mime === 'audio/mp3';
  if (isMp3) return null;

  const isLossless =
    LOSSLESS_EXTS.some((ext) => name.endsWith(ext)) || LOSSLESS_MIMES.has(mime);
  if (isLossless) return LOSSLESS_UPLOAD_COMING_SOON;

  return 'Only MP3 files are supported for now.';
}

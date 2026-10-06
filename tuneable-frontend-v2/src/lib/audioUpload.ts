const MB = 1024 * 1024;
export const MP3_MAX_BYTES = 50 * MB;
export const WAV_MAX_BYTES = 100 * MB;

const WAV_MIMES = new Set([
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/vnd.wave',
  'audio/x-pn-wav',
]);
const FLAC_MIMES = new Set(['audio/flac', 'audio/x-flac']);

export const FLAC_UPLOAD_COMING_SOON =
  'FLAC uploads are coming soon. Please upload MP3 or WAV.';

/** File input accept: MP3 and WAV, plus FLAC so we can show the coming-soon message. */
export const AUDIO_FILE_ACCEPT =
  '.mp3,.wav,.wave,.flac,audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/wave,audio/flac';

export type AudioUploadFormat = 'mp3' | 'wav';

export function getAudioUploadFormat(
  fileName: string,
  mimeType?: string | null,
): AudioUploadFormat | null {
  const name = fileName.toLowerCase();
  const mime = (mimeType || '').toLowerCase();
  if (name.endsWith('.mp3')) return 'mp3';
  if (name.endsWith('.wav') || name.endsWith('.wave')) return 'wav';
  if (mime === 'audio/mpeg' || mime === 'audio/mp3') return 'mp3';
  if (WAV_MIMES.has(mime)) return 'wav';
  return null;
}

export function getAudioUploadRejection(
  fileName: string,
  mimeType?: string | null,
  size?: number | null,
): string | null {
  const format = getAudioUploadFormat(fileName, mimeType);
  if (!format) {
    const name = fileName.toLowerCase();
    const mime = (mimeType || '').toLowerCase();
    if (name.endsWith('.flac') || FLAC_MIMES.has(mime)) return FLAC_UPLOAD_COMING_SOON;
    return 'Only MP3 or WAV files are supported.';
  }

  const maxBytes = format === 'wav' ? WAV_MAX_BYTES : MP3_MAX_BYTES;
  if (size != null && size > maxBytes) {
    return `${format.toUpperCase()} files must be ${maxBytes / MB}MB or smaller.`;
  }
  return null;
}

/** Strip the audio extension so a filename can seed the title field. */
export function titleFromAudioFileName(fileName: string): string {
  return fileName.replace(/\.(mp3|wav|wave)$/i, '');
}

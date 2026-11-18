/**
 * Letter avatars for people who have not uploaded a photo.
 * Keep the palette and hash in sync with the web app and the iOS client.
 */

export const AVATAR_PALETTE = [
  '#7c3aed',
  '#9333ea',
  '#c026d3',
  '#db2777',
  '#e11d48',
  '#ea580c',
  '#b45309',
  '#059669',
  '#0f766e',
  '#0284c7',
  '#4f46e5',
  '#6d28d9',
] as const;

/** Neutral circle for a person we are not allowed to identify. */
export const ANONYMOUS_AVATAR_COLOR = '#4b5563';

function avatarKey(name?: string | null): string {
  return (name || '').trim().replace(/^@+/, '').toLowerCase();
}

export function avatarLetter(name?: string | null): string {
  const trimmed = (name || '').trim().replace(/^@+/, '');
  const first = Array.from(trimmed)[0];
  if (!first) return '?';
  return first.toLocaleUpperCase();
}

export function avatarColor(name?: string | null): string {
  const key = avatarKey(name);
  if (!key) return ANONYMOUS_AVATAR_COLOR;
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

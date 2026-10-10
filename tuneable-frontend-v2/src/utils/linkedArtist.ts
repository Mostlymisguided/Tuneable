export type LinkedProfile = {
  _id: string;
  artistName: string;
  username: string;
  uuid: string;
};

/** Full artist subdocuments. Profile responses put these on `artists` and the display name on `artist`. */
export function getStoredArtistRecords(media: any): any[] {
  const fromArtists = media?.artists;
  if (Array.isArray(fromArtists) && fromArtists.some((entry) => entry && typeof entry === 'object')) {
    return fromArtists;
  }
  const fromArtist = media?.artist;
  if (Array.isArray(fromArtist) && fromArtist.some((entry) => entry && typeof entry === 'object')) {
    return fromArtist;
  }
  return [];
}

export function primaryArtistName(media: any): string {
  const record = getStoredArtistRecords(media)[0];
  if (typeof record?.name === 'string' && record.name.trim()) return record.name;
  if (typeof media?.artist === 'string') return media.artist;
  return '';
}

function idOf(value: any): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return String(value._id || value.id || '');
}

export function linkedProfileFromUser(user: any, fallbackName = ''): LinkedProfile | null {
  if (!user || typeof user !== 'object') return null;
  const id = idOf(user);
  const username = typeof user.username === 'string' ? user.username : '';
  if (!id && !username) return null;
  return {
    _id: id,
    artistName: user.creatorProfile?.artistName || user.artistName || fallbackName || '',
    username,
    uuid: typeof user.uuid === 'string' ? user.uuid : '',
  };
}

/**
 * Read a stored artist→user link.
 * Populated user objects are returned immediately. A bare id is returned as a
 * placeholder plus `userIdToFetch` so the form can still show the link.
 */
export function readStoredArtistLink(artistRecord: any): {
  linked: LinkedProfile | null;
  userIdToFetch: string | null;
} {
  const userRef = artistRecord?.userId;
  if (!userRef) return { linked: null, userIdToFetch: null };

  if (typeof userRef === 'object' && (userRef.username || userRef.uuid || userRef.creatorProfile)) {
    return {
      linked: linkedProfileFromUser(userRef, artistRecord?.name || ''),
      userIdToFetch: null,
    };
  }

  const userId = idOf(userRef);
  if (!userId) return { linked: null, userIdToFetch: null };
  return {
    linked: {
      _id: userId,
      artistName: artistRecord?.name || '',
      username: '',
      uuid: '',
    },
    userIdToFetch: userId,
  };
}

export function formatLinkedProfileLabel(profile: { artistName?: string; username?: string }): string {
  const name = profile.artistName?.trim();
  const username = profile.username?.trim();
  if (name && username) return `Linked to: ${name} (@${username})`;
  if (username) return `Linked to: @${username}`;
  if (name) return `Linked to: ${name}`;
  return 'Linked to Tuneable profile';
}

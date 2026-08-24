/**
 * Library import identity matching (no DB).
 * Run: npx jest tests/mediaIdentity.test.js
 */

const {
  IDENTITY_EXTERNAL_KEYS,
  collectIdentity,
  identityTokens,
  tokensOverlap,
  buildIdentityOrQuery,
  identityAlreadySeen,
  createIdentitySeenSet,
  rememberIdentity,
  spotifyTrackIdFromUrl,
} = require('../utils/mediaIdentity');

describe('collectIdentity / tokens', () => {
  it('uses Spotify track id and normalized ISRC, not album id', () => {
    const identity = collectIdentity({
      title: 'Song',
      artist: 'Artist',
      sourceLabel: 'Spotify Likes',
      id: 'trackAAA',
      externalIds: {
        spotify: 'trackAAA',
        isrc: 'gb-um7-15-05054',
        spotifyAlbum: 'albumZZZ',
      },
    });

    expect(identity.spotify).toBe('trackAAA');
    expect(identity.isrc).toBe('GBUM71505054');
    expect(identityTokens(identity)).toEqual([
      'spotify:trackAAA',
      'isrc:GBUM71505054',
    ]);
    expect(identityTokens(identity).join(' ')).not.toContain('albumZZZ');
  });

  it('treats two Spotify versions with the same ISRC as the same recording', () => {
    const album = collectIdentity({
      sourceLabel: 'Spotify Likes',
      externalIds: { spotify: 'id1', isrc: 'USRC17607839' },
    });
    const single = collectIdentity({
      sourceLabel: 'Spotify Likes',
      externalIds: { spotify: 'id2', isrc: 'US-RC1-76-07839' },
    });
    expect(tokensOverlap(identityTokens(album), identityTokens(single))).toBe(true);
  });

  it('does not treat a title-artist fallback key as a Spotify track id', () => {
    const identity = collectIdentity({
      sourceLabel: 'Spotify Likes',
      id: 'Song-Artist',
      key: 'Song-Artist',
      title: 'Song',
      artist: 'Artist',
    });
    expect(identity.spotify).toBeNull();
    expect(identityTokens(identity)).toEqual([]);
  });

  it('extracts a Spotify track id from a source URL', () => {
    expect(spotifyTrackIdFromUrl('https://open.spotify.com/track/abc123XYZ?si=1')).toBe('abc123XYZ');
    const identity = collectIdentity({
      sources: { spotify: 'https://open.spotify.com/track/abc123XYZ' },
    });
    expect(identity.spotify).toBe('abc123XYZ');
    expect(identityTokens(identity)).toContain('spotify:abc123XYZ');
  });

  it('matches SoundCloud permalinks with/without trailing slash', () => {
    const a = collectIdentity({
      sourceLabel: 'SoundCloud Likes',
      externalIds: { soundcloud: '99' },
      sources: { soundcloud: 'https://soundcloud.com/artist/track/' },
    });
    const b = collectIdentity({
      sources: { soundcloud: 'https://soundcloud.com/artist/track?in=set' },
    });
    expect(tokensOverlap(identityTokens(a), identityTokens(b))).toBe(true);
  });
});

describe('buildIdentityOrQuery', () => {
  it('queries track ids and top-level ISRC, never spotifyAlbum', () => {
    const or = buildIdentityOrQuery(collectIdentity({
      externalIds: {
        spotify: 'trackAAA',
        isrc: 'USRC17607839',
        spotifyAlbum: 'albumZZZ',
      },
      sources: { spotify: 'https://open.spotify.com/track/trackAAA' },
    }));

    const serialized = JSON.stringify(or);
    expect(serialized).toContain('externalIds.spotify');
    expect(serialized).toContain('trackAAA');
    expect(serialized).toContain('"isrc":"USRC17607839"');
    expect(serialized).toContain('externalIds.isrc');
    expect(serialized).not.toContain('spotifyAlbum');
    expect(serialized).not.toContain('albumZZZ');
    expect(IDENTITY_EXTERNAL_KEYS).not.toContain('spotifyAlbum');
    expect(IDENTITY_EXTERNAL_KEYS).not.toContain('isrc');
  });
});

describe('identityAlreadySeen', () => {
  it('skips a second liked version once the first ISRC is remembered', () => {
    const seen = createIdentitySeenSet();
    rememberIdentity(seen, collectIdentity({
      externalIds: { spotify: 'id1', isrc: 'USRC17607839' },
    }), 'media1');

    expect(identityAlreadySeen(seen, collectIdentity({
      externalIds: { spotify: 'id2', isrc: 'USRC17607839' },
    }))).toBe(true);
    expect(identityAlreadySeen(seen, collectIdentity({
      externalIds: { spotify: 'id3', isrc: 'GBUM71505054' },
    }))).toBe(false);
    expect(identityAlreadySeen(seen, collectIdentity({
      externalIds: { spotify: 'other' },
    }), 'media1')).toBe(true);
  });
});

const { parseDeezerUrl, convertDeezerTrack } = require('../services/deezerService');
const { collectIdentity, buildIdentityOrQuery } = require('../utils/mediaIdentity');
const { pickIsrcCandidate } = require('../services/metadataEnrichmentService');

describe('pickIsrcCandidate', () => {
  const recording = {
    id: 'mb-hey-jude',
    title: 'Hey Jude',
    artist: 'The Beatles',
    duration: 431,
  };

  it('auto-applies when title and artist agree (ignoring remaster suffixes)', () => {
    const picked = pickIsrcCandidate(
      { title: 'Hey Jude (Remastered 2015)', artist: 'The Beatles', duration: 429 },
      [recording],
      'GBUM71505902'
    );
    expect(picked.confidence).toBe('high');
    expect(picked.candidate.musicbrainzId).toBe('mb-hey-jude');
    expect(picked.candidate.isrc).toBe('GBUM71505902');
    expect(picked.candidate.matchType).toMatch(/^isrc\+/);
  });

  it('sends a misassigned ISRC to review instead of applying it', () => {
    const picked = pickIsrcCandidate(
      { title: 'Totally Different Song', artist: 'Someone Else', duration: 180 },
      [recording],
      'GBUM71505902'
    );
    expect(picked.confidence).toBe('low');
  });

  it('prefers the closest recording when an ISRC maps to several', () => {
    const picked = pickIsrcCandidate(
      { title: 'Hey Jude', artist: 'The Beatles', duration: 430 },
      [{ id: 'mb-other', title: 'Hey Jude (live)', artist: 'Tribute Band', duration: 300 }, recording],
      'GBUM71505902'
    );
    expect(picked.candidate.musicbrainzId).toBe('mb-hey-jude');
  });

  it('returns null with no recordings so title search can take over', () => {
    expect(pickIsrcCandidate({ title: 'X', artist: 'Y' }, [], 'GBUM71505902')).toBeNull();
  });
});

describe('parseDeezerUrl', () => {
  it('parses playlist URLs with and without locale', () => {
    expect(parseDeezerUrl('https://www.deezer.com/playlist/908622995'))
      .toEqual({ kind: 'playlist', id: '908622995' });
    expect(parseDeezerUrl('https://www.deezer.com/en/playlist/908622995?utm_source=x'))
      .toEqual({ kind: 'playlist', id: '908622995' });
    expect(parseDeezerUrl('https://www.deezer.com/pt-br/playlist/42'))
      .toEqual({ kind: 'playlist', id: '42' });
  });

  it('parses profile URLs as user favourites', () => {
    expect(parseDeezerUrl('https://www.deezer.com/us/profile/2529'))
      .toEqual({ kind: 'user', id: '2529' });
    expect(parseDeezerUrl('https://www.deezer.com/profile/2529/loved'))
      .toEqual({ kind: 'user', id: '2529' });
  });

  it('treats a bare number as a playlist id and rejects junk', () => {
    expect(parseDeezerUrl('908622995')).toEqual({ kind: 'playlist', id: '908622995' });
    expect(parseDeezerUrl('https://www.deezer.com/album/123')).toBeNull();
    expect(parseDeezerUrl('https://open.spotify.com/playlist/abc')).toBeNull();
    expect(parseDeezerUrl('')).toBeNull();
  });
});

describe('convertDeezerTrack', () => {
  const row = {
    id: 3135556,
    title: 'Harder, Better, Faster, Stronger',
    isrc: 'GBDUW0000059',
    duration: 226,
    release_date: '2001-03-12',
    bpm: 0,
    link: 'https://www.deezer.com/track/3135556',
    artist: { name: 'Daft Punk' },
    album: { title: 'Discovery', cover_xl: 'https://cdn-images.dzcdn.net/xl.jpg' },
  };

  it('maps Deezer fields to the import track shape', () => {
    const track = convertDeezerTrack(row, { importSource: 'deezer_playlist', sourceLabel: 'Deezer Playlist' });
    expect(track).toMatchObject({
      id: '3135556',
      title: 'Harder, Better, Faster, Stronger',
      artist: 'Daft Punk',
      album: 'Discovery',
      duration: 226,
      coverArt: 'https://cdn-images.dzcdn.net/xl.jpg',
      releaseDate: '2001-03-12',
      releaseYear: 2001,
      bpm: null,
      importSource: 'deezer_playlist',
      externalIds: { deezer: '3135556', isrc: 'GBDUW0000059' },
      sources: { deezer: 'https://www.deezer.com/track/3135556' },
    });
  });

  it('feeds deezer id and ISRC into catalog identity matching', () => {
    const track = convertDeezerTrack(row, { importSource: 'deezer_likes', sourceLabel: 'Deezer Favourites' });
    const identity = collectIdentity(track, track.importSource);
    expect(identity.deezer).toBe('3135556');
    const serialized = JSON.stringify(buildIdentityOrQuery(identity));
    expect(serialized).toContain('"externalIds.deezer":"3135556"');
    expect(serialized).toContain('"isrc":"GBDUW0000059"');
  });
});

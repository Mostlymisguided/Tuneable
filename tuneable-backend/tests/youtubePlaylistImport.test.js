const {
  parseYouTubePlaylistId,
  parseIso8601Duration,
  stripVideoDecorations,
  classifyYouTubeChannel,
  parseYouTubeTrackIdentity,
} = require('../utils/youtubePlaylistUtils');
const { isSpotifyPublicImport } = require('../services/spotifyImportAccess');

describe('youtubePlaylistUtils', () => {
  it('parses playlist IDs from URLs and raw ids', () => {
    expect(parseYouTubePlaylistId('PLabcdefghijklmnopqrstuv')).toBe('PLabcdefghijklmnopqrstuv');
    expect(parseYouTubePlaylistId('https://www.youtube.com/playlist?list=PLabcDEF1234567890_x'))
      .toBe('PLabcDEF1234567890_x');
    expect(parseYouTubePlaylistId('https://music.youtube.com/watch?v=abcdefghijk&list=PLabcDEF1234567890_x'))
      .toBe('PLabcDEF1234567890_x');
    expect(parseYouTubePlaylistId('not a playlist')).toBeNull();
  });

  it('parses ISO-8601 durations', () => {
    expect(parseIso8601Duration('PT3M26S')).toBe(206);
    expect(parseIso8601Duration('PT1H2M3S')).toBe(3723);
    expect(parseIso8601Duration('')).toBe(0);
  });

  it('strips official-video decorations', () => {
    expect(stripVideoDecorations('Blinding Lights (Official Music Video)')).toBe('Blinding Lights');
    expect(stripVideoDecorations('Song [Official Audio]')).toBe('Song');
    expect(stripVideoDecorations('Song (Lyric Video)')).toBe('Song');
  });

  it('classifies Topic / VEVO / junk channels', () => {
    expect(classifyYouTubeChannel('The Weeknd - Topic')).toEqual({
      quality: 'topic',
      artistHint: 'The Weeknd',
    });
    expect(classifyYouTubeChannel('TheWeekndVEVO')).toEqual({
      quality: 'vevo',
      artistHint: 'TheWeeknd',
    });
    expect(classifyYouTubeChannel('Nightcore Lyrics Video')).toMatchObject({ quality: 'junk' });
  });

  it('parses Topic-channel titles as song-only', () => {
    const parsed = parseYouTubeTrackIdentity({
      title: 'Blinding Lights',
      channelTitle: 'The Weeknd - Topic',
    });
    expect(parsed.status).toBe('parsed');
    expect(parsed.artist).toBe('The Weeknd');
    expect(parsed.title).toBe('Blinding Lights');
  });

  it('parses Artist - Title (Official Video)', () => {
    const parsed = parseYouTubeTrackIdentity({
      title: 'Daft Punk - Around the World (Official Music Video)',
      channelTitle: 'DaftPunkVEVO',
    });
    expect(parsed.status).toBe('parsed');
    expect(parsed.artist).toBe('Daft Punk');
    expect(parsed.title).toBe('Around the World');
  });

  it('skips junk channels even with a parseable title', () => {
    const parsed = parseYouTubeTrackIdentity({
      title: 'Artist - Song (Lyrics)',
      channelTitle: 'Super Lyric Videos',
    });
    expect(parsed.status).toBe('junk');
  });

  it('marks unknown-channel videos without Artist - Title as unparsed', () => {
    const parsed = parseYouTubeTrackIdentity({
      title: 'my summer mix 2024',
      channelTitle: 'randomuploader99',
    });
    expect(parsed.status).toBe('unparsed');
  });
});

describe('spotifyImportAccess', () => {
  const original = process.env.SPOTIFY_PUBLIC_IMPORT;

  afterEach(() => {
    if (original === undefined) delete process.env.SPOTIFY_PUBLIC_IMPORT;
    else process.env.SPOTIFY_PUBLIC_IMPORT = original;
  });

  it('defaults to closed (request/waitlist) unless explicitly public', () => {
    expect(isSpotifyPublicImport({})).toBe(false);
    expect(isSpotifyPublicImport({ SPOTIFY_PUBLIC_IMPORT: 'true' })).toBe(true);
    expect(isSpotifyPublicImport({ SPOTIFY_PUBLIC_IMPORT: '1' })).toBe(true);
    expect(isSpotifyPublicImport({ SPOTIFY_PUBLIC_IMPORT: 'false' })).toBe(false);
  });
});

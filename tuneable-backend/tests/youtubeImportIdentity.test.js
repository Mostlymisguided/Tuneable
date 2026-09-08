/**
 * Run: npx jest tests/youtubeImportIdentity.test.js
 */

const {
  filterYouTubePreviewItems,
  applyAdminConfirmedYoutubeIdentity,
  resolveYoutubeExecuteItem,
  youtubeOnlyExternalIds,
  stripMusicBrainzFromExternal,
} = require('../utils/youtubeImportIdentity');
const { unparsedSkipToImportTrack } = require('../utils/youtubePlaylistUtils');
const { convertPlaylistRows } = require('../services/youtubePlaylistService');

function unmatchedItem(overrides = {}) {
  return {
    key: 'vid1',
    title: 'Song',
    artist: 'Artist',
    matchStatus: 'new',
    identityConfidence: 'unverified',
    selected: false,
    ...overrides,
  };
}

describe('filterYouTubePreviewItems', () => {
  it('drops unmatched rows for regular import', () => {
    const verified = unmatchedItem({
      key: 'v',
      identityConfidence: 'verified',
      matchStatus: 'new',
      selected: true,
    });
    const unmatched = unmatchedItem();
    const possible = unmatchedItem({
      key: 'p',
      matchStatus: 'possible_match',
      identityConfidence: 'likely',
    });

    const out = filterYouTubePreviewItems([verified, unmatched, possible], { keepUnmatched: false });
    expect(out.skippedNoMatch).toBe(1);
    expect(out.needsIdentity).toBe(0);
    expect(out.items.map((i) => i.key)).toEqual(['v', 'p']);
  });

  it('keeps unmatched rows for admin review', () => {
    const unmatched = unmatchedItem({ selected: true });
    const out = filterYouTubePreviewItems([unmatched], { keepUnmatched: true });
    expect(out.skippedNoMatch).toBe(0);
    expect(out.needsIdentity).toBe(1);
    expect(out.items).toHaveLength(1);
    expect(out.items[0].needsIdentity).toBe(true);
    expect(out.items[0].selected).toBe(false);
    expect(out.items[0].manualIdentityConfirmed).toBe(false);
  });
});

describe('applyAdminConfirmedYoutubeIdentity', () => {
  it('rejects non-admins', () => {
    const result = applyAdminConfirmedYoutubeIdentity(
      { ...unmatchedItem(), manualIdentityConfirmed: true },
      { isAdminUser: false }
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('admin_required');
  });

  it('stamps unverified admin_confirmed and strips MusicBrainz', () => {
    const result = applyAdminConfirmedYoutubeIdentity({
      ...unmatchedItem(),
      manualIdentityConfirmed: true,
      mediaId: 'abc',
      matchStatus: 'possible_match',
      externalMedia: {
        title: 'Old',
        artist: 'Old',
        externalIds: { youtube: 'vid1', musicbrainz: 'mbid' },
        identityConfidence: 'likely',
      },
    }, { isAdminUser: true });

    expect(result.ok).toBe(true);
    expect(result.item.identityConfidence).toBe('unverified');
    expect(result.item.identityConfidenceSource).toBe('admin_confirmed');
    expect(result.item.mediaId).toBeNull();
    expect(result.item.matchStatus).toBe('new');
    expect(result.item.externalMedia.externalIds).toEqual({ youtube: 'vid1' });
    expect(result.item.externalMedia.identityConfidenceSource).toBe('admin_confirmed');
  });
});

describe('resolveYoutubeExecuteItem', () => {
  it('skips unverified youtube without a catalog id', () => {
    const out = resolveYoutubeExecuteItem(unmatchedItem(), { isAdminUser: false });
    expect(out.allowed).toBe(false);
    expect(out.reason).toBe('unverified_youtube');
  });

  it('allows a verified MusicBrainz identity', () => {
    const out = resolveYoutubeExecuteItem({
      ...unmatchedItem(),
      identityConfidence: 'verified',
      crossRefStatus: 'musicbrainz_verified',
    }, { isAdminUser: false });
    expect(out.allowed).toBe(true);
  });

  it('allows admin confirm-as-new', () => {
    const out = resolveYoutubeExecuteItem({
      ...unmatchedItem(),
      manualIdentityConfirmed: true,
    }, { isAdminUser: true });
    expect(out.allowed).toBe(true);
    expect(out.item.identityConfidenceSource).toBe('admin_confirmed');
  });

  it('does not let a non-admin spoof confirm-as-new', () => {
    const out = resolveYoutubeExecuteItem({
      ...unmatchedItem(),
      manualIdentityConfirmed: true,
    }, { isAdminUser: false });
    expect(out.allowed).toBe(false);
    expect(out.reason).toBe('unverified_youtube');
  });

  it('skips a rejected fuzzy match unless admin confirms as new', () => {
    const rejected = resolveYoutubeExecuteItem({
      ...unmatchedItem(),
      matchStatus: 'possible_match',
      useSuggestedMatch: false,
      identityConfidence: 'likely',
    }, { isAdminUser: true });
    expect(rejected.allowed).toBe(false);
    expect(rejected.reason).toBe('rejected_youtube_match');

    const confirmed = resolveYoutubeExecuteItem({
      ...unmatchedItem(),
      matchStatus: 'possible_match',
      useSuggestedMatch: false,
      identityConfidence: 'likely',
      manualIdentityConfirmed: true,
    }, { isAdminUser: true });
    expect(confirmed.allowed).toBe(true);
    expect(confirmed.item.matchStatus).toBe('new');
  });
});

describe('youtubeOnlyExternalIds', () => {
  it('keeps only the YouTube id', () => {
    expect(youtubeOnlyExternalIds({ youtube: 'abc', musicbrainz: 'mb', isrc: 'US123' }))
      .toEqual({ youtube: 'abc' });
  });
});

describe('stripMusicBrainzFromExternal', () => {
  it('drops MB ids and unverifies identity', () => {
    const stripped = stripMusicBrainzFromExternal({
      title: 'Song',
      externalIds: { youtube: 'abc', musicbrainz: 'mb' },
      identityConfidence: 'verified',
      identityConfidenceSource: 'musicbrainz',
    });
    expect(stripped.externalIds).toEqual({ youtube: 'abc' });
    expect(stripped.identityConfidence).toBe('unverified');
  });
});

describe('unparsedSkipToImportTrack', () => {
  it('promotes an unparsed skip into an admin identity row', () => {
    const track = unparsedSkipToImportTrack({
      videoId: 'abcd1234567',
      title: 'my summer mix 2024',
      channelTitle: 'randomuploader99',
      coverArt: 'https://img.example/1.jpg',
      duration: 180,
    });
    expect(track.parseStatus).toBe('unparsed');
    expect(track.needsIdentity).toBe(true);
    expect(track.artist).toBe('');
    expect(track.title).toBe('my summer mix 2024');
    expect(track.externalIds.youtube).toBe('abcd1234567');
    expect(track.sources.youtube).toContain('abcd1234567');
  });
});

describe('convertPlaylistRows unparsed skips', () => {
  it('keeps duration and cover art on unparsed skips', () => {
    const { tracks, skipped } = convertPlaylistRows([
      {
        contentDetails: { videoId: 'abcd1234567' },
        snippet: {
          title: 'my summer mix 2024',
          channelTitle: 'randomuploader99',
          thumbnails: { high: { url: 'https://img.example/1.jpg' } },
        },
      },
    ], { abcd1234567: { duration: 180, embeddable: true } }, {
      importSource: 'youtube_playlist',
      sourceLabel: 'YouTube Playlist',
    });

    expect(tracks).toHaveLength(0);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]).toMatchObject({
      reason: 'no_artist',
      duration: 180,
      coverArt: 'https://img.example/1.jpg',
      videoId: 'abcd1234567',
    });
  });
});

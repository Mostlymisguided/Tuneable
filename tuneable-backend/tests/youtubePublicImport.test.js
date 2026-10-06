const {
  parseYouTubeVideoId,
  parseYouTubeImportTarget,
} = require('../utils/youtubePlaylistUtils');
const {
  extractJsonObject,
  collectPlaylistItems,
  normalizeRow,
  parseClockDuration,
} = require('../services/youtubePublicService');
const { convertVideoRows } = require('../services/youtubePlaylistService');

describe('parseYouTubeVideoId', () => {
  it('reads ids from every common video URL form', () => {
    const id = 'dQw4w9WgXcQ';
    expect(parseYouTubeVideoId(id)).toBe(id);
    expect(parseYouTubeVideoId(`https://www.youtube.com/watch?v=${id}&t=42s`)).toBe(id);
    expect(parseYouTubeVideoId(`https://m.youtube.com/watch?v=${id}`)).toBe(id);
    expect(parseYouTubeVideoId(`https://music.youtube.com/watch?v=${id}`)).toBe(id);
    expect(parseYouTubeVideoId(`https://youtu.be/${id}?si=abc`)).toBe(id);
    expect(parseYouTubeVideoId(`https://www.youtube.com/shorts/${id}`)).toBe(id);
    expect(parseYouTubeVideoId(`https://www.youtube.com/embed/${id}`)).toBe(id);
    expect(parseYouTubeVideoId(`youtube.com/watch?v=${id}`)).toBe(id);
  });

  it('rejects non-YouTube hosts and junk', () => {
    expect(parseYouTubeVideoId('https://evil.example/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(parseYouTubeVideoId('https://www.youtube.com/@RickAstleyYT')).toBeNull();
    expect(parseYouTubeVideoId('')).toBeNull();
  });
});

describe('parseYouTubeImportTarget', () => {
  const playlist = 'PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI';

  it('treats playlist URLs and bare playlist ids as playlists', () => {
    expect(parseYouTubeImportTarget(`https://www.youtube.com/playlist?list=${playlist}`))
      .toEqual({ kind: 'playlist', id: playlist });
    expect(parseYouTubeImportTarget(playlist)).toEqual({ kind: 'playlist', id: playlist });
    expect(parseYouTubeImportTarget(`https://music.youtube.com/playlist?list=OLAK5uy_abcdefghijklmnopqrstuvwxyz0123`))
      .toEqual({ kind: 'playlist', id: 'OLAK5uy_abcdefghijklmnopqrstuvwxyz0123' });
  });

  it('prefers the playlist when a watch URL carries one', () => {
    expect(parseYouTubeImportTarget(`https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=${playlist}`))
      .toEqual({ kind: 'playlist', id: playlist });
  });

  it('falls back to the video for mixes and account-private lists', () => {
    expect(parseYouTubeImportTarget('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ'))
      .toEqual({ kind: 'video', id: 'dQw4w9WgXcQ' });
    expect(parseYouTubeImportTarget('https://youtu.be/dQw4w9WgXcQ'))
      .toEqual({ kind: 'video', id: 'dQw4w9WgXcQ' });
    expect(() => parseYouTubeImportTarget('https://www.youtube.com/playlist?list=LL'))
      .toThrow(/private to your account/);
  });

  it('rejects non-YouTube links with a 400', () => {
    expect(() => parseYouTubeImportTarget('https://open.spotify.com/playlist/abc'))
      .toThrow(expect.objectContaining({ status: 400 }));
    expect(() => parseYouTubeImportTarget('')).toThrow(expect.objectContaining({ status: 400 }));
  });
});

describe('youtubePublicService parsing', () => {
  it('extracts embedded JSON even when strings contain braces and "};"', () => {
    const html = '<script>var ytInitialData = {"a":"x};y{","b":{"c":[1,2]}};</script>';
    expect(extractJsonObject(html, 'var ytInitialData')).toEqual({ a: 'x};y{', b: { c: [1, 2] } });
    expect(extractJsonObject('<html></html>', 'var ytInitialData')).toBeNull();
  });

  it('parses clock durations', () => {
    expect(parseClockDuration('3:55')).toBe(235);
    expect(parseClockDuration('1:02:03')).toBe(3723);
    expect(parseClockDuration('LIVE')).toBe(0);
  });

  const lockup = (id, title, channel, badge) => ({
    lockupViewModel: {
      contentId: id,
      contentType: 'LOCKUP_CONTENT_TYPE_VIDEO',
      contentImage: {
        thumbnailViewModel: {
          overlays: [{
            thumbnailBottomOverlayViewModel: {
              badges: [{ thumbnailBadgeViewModel: { text: badge } }],
            },
          }],
        },
      },
      metadata: {
        lockupMetadataViewModel: {
          title: { content: title },
          metadata: {
            contentMetadataViewModel: {
              metadataRows: [{ metadataParts: [{ text: { content: channel } }] }],
            },
          },
        },
      },
    },
  });

  it('collects lockup and legacy playlist rows plus the continuation token', () => {
    const contents = {
      sectionListRenderer: {
        contents: [{
          itemSectionRenderer: {
            contents: [
              lockup('fOT0BUpITw8', 'BELLAKEO (Video Oficial) - Peso Pluma, Anitta', 'Peso Pluma', '3:55'),
              { lockupViewModel: { contentId: 'PLnotavideo', contentType: 'LOCKUP_CONTENT_TYPE_PLAYLIST' } },
              {
                playlistVideoRenderer: {
                  videoId: 'abcdefghijk',
                  title: { runs: [{ text: 'Blinding Lights' }] },
                  shortBylineText: { runs: [{ text: 'The Weeknd - Topic' }] },
                  lengthSeconds: '200',
                },
              },
              {
                continuationItemViewModel: {
                  continuationCommand: {
                    innertubeCommand: { continuationCommand: { token: 'NEXT_PAGE' } },
                  },
                },
              },
            ],
          },
        }],
      },
    };

    const { rows, continuation } = collectPlaylistItems(contents);
    expect(continuation).toBe('NEXT_PAGE');
    expect(rows).toEqual([
      { videoId: 'fOT0BUpITw8', title: 'BELLAKEO (Video Oficial) - Peso Pluma, Anitta', channelTitle: 'Peso Pluma', duration: 235 },
      { videoId: 'abcdefghijk', title: 'Blinding Lights', channelTitle: 'The Weeknd - Topic', duration: 200, unplayable: false },
    ]);
  });

  it('ignores recommendation shelves and their section-level continuation', () => {
    const contents = {
      sectionListRenderer: {
        contents: [
          { itemSectionRenderer: { contents: [lockup('abcdefghijk', 'Artist - Song', 'Artist', '3:00')] } },
          {
            itemSectionRenderer: {
              contents: [{
                horizontalShelfViewModel: { items: [lockup('zzzzzzzzzzz', 'Recommended - Video', 'Other', '4:00')] },
              }],
            },
          },
          { continuationItemRenderer: { continuationEndpoint: { continuationCommand: { token: 'RECOMMENDATIONS' } } } },
        ],
      },
    };
    const { rows, continuation } = collectPlaylistItems(contents);
    expect(rows.map((r) => r.videoId)).toEqual(['abcdefghijk']);
    expect(continuation).toBeNull();
  });

  it('marks private/deleted placeholders unavailable and decodes entities', () => {
    expect(normalizeRow({ videoId: 'aaaaaaaaaaa', title: '[Private video]' }).available).toBe(false);
    const row = normalizeRow({ videoId: 'bbbbbbbbbbb', title: 'Simon &amp; Garfunkel - Mrs. Robinson', channelTitle: 'x' });
    expect(row).toMatchObject({
      available: true,
      title: 'Simon & Garfunkel - Mrs. Robinson',
      coverArt: 'https://i.ytimg.com/vi/bbbbbbbbbbb/hqdefault.jpg',
    });
  });

  it('feeds scraped rows into the shared track converter', () => {
    const { tracks, skipped } = convertVideoRows([
      normalizeRow({ videoId: 'abcdefghijk', title: 'Blinding Lights', channelTitle: 'The Weeknd - Topic', duration: 200 }),
      normalizeRow({ videoId: 'aaaaaaaaaaa', title: '[Deleted video]' }),
    ], { importSource: 'youtube_video', sourceLabel: 'YouTube' });

    expect(tracks).toHaveLength(1);
    expect(tracks[0]).toMatchObject({
      title: 'Blinding Lights',
      artist: 'The Weeknd',
      duration: 200,
      importSource: 'youtube_video',
      externalIds: { youtube: 'abcdefghijk' },
    });
    expect(skipped).toEqual([expect.objectContaining({ videoId: 'aaaaaaaaaaa', reason: 'unavailable' })]);
  });
});

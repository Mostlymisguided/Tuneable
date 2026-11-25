const {
  showImportBatchSize,
  feedBackfillOpen,
  isPlayableRssItem,
  isUnplayableShell,
  nextFreshEpisodes,
} = require('../utils/podcastFeedBatch');
const podcastAdapter = require('../services/podcastAdapter');

describe('show import batches', () => {
  it('starts with the most recent 5 and caps a first import at 10', () => {
    expect(showImportBatchSize()).toBe(5);
    expect(showImportBatchSize({ applyLimit: true, requestedLimit: 5 })).toBe(5);
    expect(showImportBatchSize({ applyLimit: true, requestedLimit: 10 })).toBe(10);
    expect(showImportBatchSize({ applyLimit: true, requestedLimit: 25 })).toBe(10);
  });

  it('loads a larger follow-up batch', () => {
    expect(showImportBatchSize({ loadMore: true, applyLimit: true, requestedLimit: 10 })).toBe(10);
    expect(showImportBatchSize({ loadMore: true, applyLimit: true, requestedLimit: 50 })).toBe(20);
  });
});

describe('feed backfill button', () => {
  it('stays available after a short import and hides once the feed is finished', () => {
    expect(feedBackfillOpen({ flag: 'open', episodeCount: 5, hasFeed: true })).toBe(true);
    expect(feedBackfillOpen({ flag: 'done', episodeCount: 5, hasFeed: true })).toBe(false);
    expect(feedBackfillOpen({ episodeCount: 5, hasFeed: true })).toBe(true);
    expect(feedBackfillOpen({ episodeCount: 40, hasFeed: true })).toBe(false);
    expect(feedBackfillOpen({ episodeCount: 0, hasFeed: true })).toBe(false);
  });
});

describe('playable episodes', () => {
  it('skips untitled rows and rows without an enclosure', () => {
    expect(isPlayableRssItem({ title: 'Untitled Episode', enclosure: { url: 'https://cdn.example/a.mp3' } })).toBe(false);
    expect(isPlayableRssItem({ title: 'Fritz Bauer', enclosure: { url: '' } })).toBe(false);
    expect(isPlayableRssItem({
      title: 'Fritz Bauer',
      enclosure: { url: 'http://open.live.bbc.co.uk/episode.mp3' },
    })).toBe(true);
  });

  it('treats an untitled or show-titled row with no audio as a shell', () => {
    expect(isUnplayableShell({ title: 'Untitled Episode', globalMediaAggregate: 0 }, "History's Heroes")).toBe(true);
    expect(isUnplayableShell({ title: "History's Heroes", sources: {} }, "History's Heroes")).toBe(true);
    expect(isUnplayableShell({
      title: 'Fritz Bauer',
      sources: { audio_direct: 'https://cdn.example/a.mp3' },
    }, "History's Heroes")).toBe(false);
    expect(isUnplayableShell({
      title: 'Untitled Episode',
      globalMediaAggregate: 50,
    }, "History's Heroes")).toBe(false);
  });

  it('takes the next unseen playable episodes and reports when more remain', () => {
    const episodes = [
      { title: 'One', guid: 'a', enclosure: { url: 'https://cdn.example/1.mp3' } },
      { title: 'Two', guid: 'b', enclosure: { url: 'https://cdn.example/2.mp3' } },
      { title: 'Three', guid: 'c', enclosure: { url: 'https://cdn.example/3.mp3' } },
    ];
    const page = nextFreshEpisodes(episodes, {
      titles: new Set(['one']),
      guids: new Set(['a']),
      batchSize: 1,
    });
    expect(page.episodes.map((episode) => episode.title)).toEqual(['Two']);
    expect(page.canImportMore).toBe(true);
  });
});

describe('apple episode adaptation', () => {
  it('keeps the title and audio from the converted lookup shape', () => {
    const episode = podcastAdapter.fromApple({
      title: "History's Secret Heroes - Series 4: Fritz Bauer: Nazi Hunter",
      audioUrl: 'http://open.live.bbc.co.uk/mediaselector/6/redir/version/2.0/mediaset/audio-nondrm-download-rss/proto/http/vpid/p0pg8ycf',
      appleId: '1811468431',
      collectionId: '1689369106',
      guid: 'urn:bbc:podcast:m0033dmm',
      duration: 1807,
    });

    expect(episode.title).toContain('Fritz Bauer');
    expect(episode.sources.get('audio_direct')).toContain('bbc.co.uk');
    expect(episode.externalIds.get('iTunes')).toBe('1811468431');
    expect(episode.externalIds.get('collectionId')).toBeUndefined();
    expect(episode.externalIds.get('rssGuid')).toBe('urn:bbc:podcast:m0033dmm');
  });

  it('does not turn the show record into a playable episode', () => {
    const show = podcastAdapter.fromApple({
      kind: 'podcast',
      trackName: "History's Heroes",
      collectionId: 1689369106,
      collectionName: "History's Heroes",
      feedUrl: 'https://podcasts.files.bbci.co.uk/m001mcbp.rss',
      trackViewUrl: 'https://podcasts.apple.com/gb/podcast/historys-heroes/id1689369106',
    });

    expect(show.sources.get('audio_direct')).toBeUndefined();
    expect(show.externalIds.get('collectionId')).toBeUndefined();
  });
});

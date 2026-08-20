const {
  normalizeCoverArtUrl,
  extractRssItemImage,
  withSeriesCoverArt,
  getSeriesEpisodeSort,
} = require('../utils/podcastCoverArt');

describe('normalizeCoverArtUrl', () => {
  it('keeps http(s) strings', () => {
    expect(normalizeCoverArtUrl('https://cdn.example/art.jpg')).toBe(
      'https://cdn.example/art.jpg'
    );
    expect(normalizeCoverArtUrl('http://cdn.example/art.jpg')).toBe(
      'http://cdn.example/art.jpg'
    );
  });

  it('rejects empty, relative, and stringified objects', () => {
    expect(normalizeCoverArtUrl('')).toBeNull();
    expect(normalizeCoverArtUrl('  ')).toBeNull();
    expect(normalizeCoverArtUrl('/art.jpg')).toBeNull();
    expect(normalizeCoverArtUrl('[object Object]')).toBeNull();
    expect(normalizeCoverArtUrl(null)).toBeNull();
  });

  it('unwraps RSS/iTunes image objects', () => {
    expect(normalizeCoverArtUrl({ href: 'https://cdn.example/a.jpg' })).toBe(
      'https://cdn.example/a.jpg'
    );
    expect(normalizeCoverArtUrl({ url: 'https://cdn.example/b.jpg' })).toBe(
      'https://cdn.example/b.jpg'
    );
  });
});

describe('extractRssItemImage', () => {
  it('reads itunes:image even when itunes:episode is missing', () => {
    expect(
      extractRssItemImage({
        'itunes:image': { href: 'https://cdn.example/ep.jpg' },
      })
    ).toBe('https://cdn.example/ep.jpg');
  });

  it('falls back to item.image', () => {
    expect(
      extractRssItemImage({
        image: { url: 'https://cdn.example/item.jpg' },
      })
    ).toBe('https://cdn.example/item.jpg');
  });
});

describe('withSeriesCoverArt', () => {
  it('fills missing episode art from the series', () => {
    expect(
      withSeriesCoverArt(
        { title: 'Ep', coverArt: null, podcastSeries: { coverArt: '' } },
        'https://cdn.example/show.jpg'
      ).coverArt
    ).toBe('https://cdn.example/show.jpg');
  });

  it('does not replace a valid episode image', () => {
    expect(
      withSeriesCoverArt(
        { coverArt: 'https://cdn.example/ep.jpg' },
        'https://cdn.example/show.jpg'
      ).coverArt
    ).toBe('https://cdn.example/ep.jpg');
  });

  it('replaces invalid stored art with series art', () => {
    expect(
      withSeriesCoverArt(
        { coverArt: '[object Object]' },
        'https://cdn.example/show.jpg'
      ).coverArt
    ).toBe('https://cdn.example/show.jpg');
  });
});

describe('getSeriesEpisodeSort', () => {
  it('defaults to most tipped, then newest', () => {
    expect(getSeriesEpisodeSort()).toEqual({
      globalMediaAggregate: -1,
      releaseDate: -1,
    });
    expect(getSeriesEpisodeSort('mostTipped')).toEqual({
      globalMediaAggregate: -1,
      releaseDate: -1,
    });
  });

  it('maps date and duration sorts', () => {
    expect(getSeriesEpisodeSort('newest')).toEqual({
      releaseDate: -1,
      _id: -1,
    });
    expect(getSeriesEpisodeSort('oldest')).toEqual({
      releaseDate: 1,
      _id: 1,
    });
    expect(getSeriesEpisodeSort('duration')).toEqual({
      duration: -1,
      globalMediaAggregate: -1,
    });
  });
});

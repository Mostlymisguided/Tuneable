/**
 * Creator display fallbacks for mixed media kinds (no DB).
 * Run: npx jest tests/creatorHelpers.test.js
 */

const {
  isPlaceholderCreatorLabel,
  resolveCreatorDisplay,
} = require('../utils/creatorHelpers');

describe('isPlaceholderCreatorLabel', () => {
  it('treats empty and unknown labels as placeholders', () => {
    expect(isPlaceholderCreatorLabel(null)).toBe(true);
    expect(isPlaceholderCreatorLabel('')).toBe(true);
    expect(isPlaceholderCreatorLabel('Unknown Artist')).toBe(true);
    expect(isPlaceholderCreatorLabel('unknown author')).toBe(true);
    expect(isPlaceholderCreatorLabel('Four Tet')).toBe(false);
  });
});

describe('resolveCreatorDisplay', () => {
  it('uses artist/featuring for music', () => {
    expect(
      resolveCreatorDisplay({
        contentForm: ['tune'],
        artist: [{ name: 'Four Tet' }],
        featuring: [{ name: 'Madlib' }],
      })
    ).toBe('Four Tet ft. Madlib');
  });

  it('uses show title for podcast episodes, not host/publisher', () => {
    expect(
      resolveCreatorDisplay({
        contentForm: ['podcastepisode'],
        artist: [],
        host: [{ name: 'NPR' }],
        podcastSeries: { title: 'This American Life' },
      })
    ).toBe('This American Life');
  });

  it('falls back to host when the series title is missing', () => {
    expect(
      resolveCreatorDisplay({
        contentForm: ['podcastepisode'],
        host: [{ name: 'Ira Glass' }],
      })
    ).toBe('Ira Glass');
  });

  it('uses author for books', () => {
    expect(
      resolveCreatorDisplay({
        contentForm: ['book'],
        contentType: ['written'],
        artist: [],
        author: [{ name: 'Ursula K. Le Guin' }],
      })
    ).toBe('Ursula K. Le Guin');
  });

  it('ignores stored Unknown Artist and still finds the show title', () => {
    expect(
      resolveCreatorDisplay({
        contentForm: ['podcastepisode'],
        creatorDisplay: 'Unknown Artist',
        artist: [{ name: 'Unknown Artist' }],
        podcastTitle: 'Serial',
      })
    ).toBe('Serial');
  });

  it('uses publisher/host for a podcast series itself', () => {
    expect(
      resolveCreatorDisplay({
        contentForm: ['podcastseries'],
        title: 'This American Life',
        host: [{ name: 'Ira Glass' }],
      })
    ).toBe('Ira Glass');
  });
});

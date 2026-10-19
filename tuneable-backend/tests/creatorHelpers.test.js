/**
 * Creator display fallbacks for mixed media kinds (no DB).
 * Run: npx jest tests/creatorHelpers.test.js
 */

const {
  isPlaceholderCreatorLabel,
  resolveCreatorDisplay,
  newlyLinkedUserIds,
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

describe('newlyLinkedUserIds', () => {
  it('returns profiles that were not already linked and skips the editor', () => {
    const previous = [{ userId: 'already' }, { userId: { _id: 'kept' } }];
    const next = [
      { userId: 'already' },
      { userId: 'kept' },
      { userId: 'new-one' },
      { userId: 'editor' },
      { userId: { _id: 'new-two' } },
      { userId: 'new-one' },
      { userId: null },
    ];
    expect(newlyLinkedUserIds(previous, next, 'editor')).toEqual(['new-one', 'new-two']);
  });

  it('treats a first save as new links except the person saving', () => {
    expect(newlyLinkedUserIds([], [{ userId: 'uploader' }], 'uploader')).toEqual([]);
    expect(newlyLinkedUserIds(null, [{ userId: 'guest' }], null)).toEqual(['guest']);
  });
});

/**
 * Run: npx jest tests/mediaDisplayLabel.test.js
 */

const { mediaLabelFromBid, primaryCreditName } = require('../utils/mediaDisplayLabel');

describe('mediaLabelFromBid', () => {
  it('prefers the current media title and artist over the tip snapshot', () => {
    const label = mediaLabelFromBid({
      mediaTitle: 'jul - le loup (prod. mh & raaash)',
      mediaArtist: 'mh',
      mediaCoverArt: 'old-cover',
      mediaId: {
        _id: 'media-1',
        uuid: 'uuid-1',
        title: 'Le loup',
        artist: [{ name: 'Jul' }],
        coverArt: 'new-cover',
      },
    });

    expect(label.title).toBe('Le loup');
    expect(label.artist).toBe('Jul');
    expect(label.artists).toEqual([{ name: 'Jul' }]);
    expect(label.coverArt).toBe('new-cover');
    expect(label.uuid).toBe('uuid-1');
  });

  it('keeps the snapshot when the media document is gone', () => {
    const label = mediaLabelFromBid({
      mediaTitle: 'jul - le loup (prod. mh & raaash)',
      mediaArtist: 'mh',
      mediaCoverArt: 'old-cover',
      mediaId: null,
    });

    expect(label.title).toBe('jul - le loup (prod. mh & raaash)');
    expect(label.artist).toBe('mh');
    expect(label.coverArt).toBe('old-cover');
  });
});

describe('primaryCreditName', () => {
  it('uses the first artist, then author, then host', () => {
    expect(primaryCreditName({ artist: [{ name: 'Jul' }] })).toBe('Jul');
    expect(primaryCreditName({ artist: [], author: [{ name: 'Author' }] })).toBe('Author');
    expect(primaryCreditName({ host: ['Host'] })).toBe('Host');
    expect(primaryCreditName(null)).toBe('');
  });
});

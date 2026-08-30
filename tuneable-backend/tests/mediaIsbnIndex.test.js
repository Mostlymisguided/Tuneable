/**
 * ISBN uniqueness must not treat missing/null as a duplicate key.
 * Run: npx jest tests/mediaIsbnIndex.test.js
 */

const Media = require('../models/Media');

describe('media isbn uniqueness', () => {
  it('uses a unique partial index that only includes string ISBNs', () => {
    const isbnIndex = Media.schema.indexes().find(([fields]) => fields.isbn === 1);
    expect(isbnIndex).toBeDefined();
    expect(isbnIndex[1].unique).toBe(true);
    expect(isbnIndex[1].name).toBe('isbn_unique_partial');
    expect(isbnIndex[1].partialFilterExpression).toEqual({ isbn: { $type: 'string' } });
    expect(isbnIndex[1].sparse).toBeFalsy();
  });

  it('does not default isbn to null on new music documents', () => {
    const media = new Media({
      title: 'Sad Movies',
      artist: [{ name: 'Still Corners' }],
      contentType: ['music'],
      contentForm: ['tune'],
      mediaType: ['mp3'],
    });
    expect(media.isbn).toBeUndefined();
  });

  it('exposes repairIsbnUniqueness to drop the old null-indexing unique index', () => {
    expect(typeof Media.repairIsbnUniqueness).toBe('function');
  });
});

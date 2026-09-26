/**
 * Run: npx jest tests/identifierFormat.test.js
 */

const {
  isUuidString,
  isMongoObjectIdString,
  normalizeIdentifier,
} = require('../utils/identifierFormat');
const { buildMediaSlugBase } = require('../utils/mediaSlug');

describe('isUuidString / isMongoObjectIdString', () => {
  it('accepts canonical UUID and 24-hex ObjectIds only', () => {
    expect(isUuidString('0199c0a1-2b3c-4d5e-8f70-1234567890ab')).toBe(true);
    expect(isUuidString('daft-punk-around-the-world')).toBe(false);
    expect(isUuidString('alex')).toBe(false);
    expect(isMongoObjectIdString('507f1f77bcf86cd799439011')).toBe(true);
    expect(isMongoObjectIdString('username12')).toBe(false);
    expect(isMongoObjectIdString('alex')).toBe(false);
  });

  it('decodes URI identifiers', () => {
    expect(normalizeIdentifier('Four%20Tet')).toBe('Four Tet');
    expect(normalizeIdentifier('  alex  ')).toBe('alex');
  });
});

describe('buildMediaSlugBase', () => {
  it('builds artist-title slugs for tunes', () => {
    expect(
      buildMediaSlugBase({
        title: 'Around the World',
        artist: [{ name: 'Daft Punk' }],
        contentForm: ['tune'],
      })
    ).toBe('daft-punk-around-the-world');
  });

  it('uses author for books and series title for episodes', () => {
    expect(
      buildMediaSlugBase({
        title: 'Sapiens',
        author: [{ name: 'Yuval Noah Harari' }],
        contentForm: ['book'],
        contentType: ['written'],
      })
    ).toBe('yuval-noah-harari-sapiens');

    expect(
      buildMediaSlugBase({
        title: 'The Alibi',
        contentForm: ['podcastepisode'],
        podcastSeries: { title: 'Serial' },
      })
    ).toBe('serial-the-alibi');
  });

  it('falls back to untitled', () => {
    expect(buildMediaSlugBase({ title: '', contentForm: ['tune'] })).toBe('untitled');
  });
});

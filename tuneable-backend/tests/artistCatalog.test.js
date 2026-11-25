/**
 * Artist catalog name, slug, and credit-linking rules (no database).
 * Run: npx jest tests/artistCatalog.test.js
 */

const {
  normalizeArtistCatalogName,
  slugifyArtistCatalogName,
  exactNameRegex,
  collectCatalogNames,
  matchedRoles,
  sectionForRoles,
  linkCredits,
  remainingOwnershipPercentage,
  RESERVED_SLUGS,
} = require('../utils/artistCatalog');

describe('artist catalog names', () => {
  it('collapses case and spacing into one key', () => {
    expect(normalizeArtistCatalogName('  Four   Tet ')).toBe('four tet');
  });

  it('keeps a display name and drops placeholder aliases', () => {
    const names = collectCatalogNames('Four Tet', ['four tet', 'Unknown Artist', 'Kieran Hebden']);
    expect(names.name).toBe('Four Tet');
    expect(names.aliases).toEqual(['Kieran Hebden']);
    expect(names.nameKeys).toEqual(['four tet', 'kieran hebden']);
  });

  it('matches a credit only when the whole name matches', () => {
    const regex = exactNameRegex('Four Tet');
    expect(regex.test('Four Tet')).toBe(true);
    expect(regex.test('  four   tet ')).toBe(true);
    expect(regex.test('Four Tet Remix')).toBe(false);
    expect(regex.test('DJ Four Tet')).toBe(false);
  });
});

describe('artist catalog slugs', () => {
  it('builds a url slug and reserves route words', () => {
    expect(slugifyArtistCatalogName('Four Tet & Friends')).toBe('four-tet-and-friends');
    expect(RESERVED_SLUGS.has('admin')).toBe(true);
    expect(slugifyArtistCatalogName('!!!')).toBe('artist');
  });
});

describe('artist catalog roles', () => {
  const media = {
    artist: [{ name: 'Four Tet' }],
    featuring: [{ name: 'Madlib' }],
    producer: [{ name: 'Kieran Hebden' }],
  };

  it('groups primary credits ahead of features and other roles', () => {
    const keys = new Set(['four tet', 'madlib', 'kieran hebden']);
    expect(matchedRoles(media, keys)).toEqual(['artist', 'producer', 'featuring']);
    expect(sectionForRoles(['artist', 'producer'])).toBe('artist');
    expect(sectionForRoles(['featuring'])).toBe('appears');
    expect(sectionForRoles(['producer'])).toBe('credits');
  });

  it('links an empty credit and leaves someone else in place', () => {
    const row = {
      artist: [{ name: 'Four Tet', userId: null, verified: false }],
      featuring: [{ name: 'Four Tet', userId: 'other-user', verified: false }],
      markModified: jest.fn(),
    };
    const result = linkCredits(row, ['four tet'], 'artist-user');
    expect(result).toEqual({ linked: 1, already: 0, heldByOther: 1 });
    expect(row.artist[0].userId).toBe('artist-user');
    expect(row.featuring[0].userId).toBe('other-user');
    expect(row.markModified).toHaveBeenCalledWith('artist');
  });

  it('reports how much ownership is still unassigned', () => {
    expect(remainingOwnershipPercentage({ mediaOwners: [{ percentage: 0 }, { percentage: 40 }] })).toBe(60);
    expect(remainingOwnershipPercentage({ mediaOwners: [{ percentage: 100 }] })).toBe(0);
  });
});

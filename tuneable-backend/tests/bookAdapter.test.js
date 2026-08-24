/**
 * Book adapter mapping + title/author scoring (no DB).
 * Run: npx jest tests/bookAdapter.test.js
 */

const { mapOpenLibraryDoc } = require('../services/openLibraryService');
const { mapGoogleBooksVolume } = require('../services/googleBooksService');
const { scoreTitleAuthor, buildBookDoc } = require('../services/bookAdapter');

describe('mapOpenLibraryDoc', () => {
  it('maps a search doc into a book DTO with ISBN-13 and cover', () => {
    const mapped = mapOpenLibraryDoc({
      key: '/works/OL45883W',
      title: 'The Hobbit',
      author_name: ['J.R.R. Tolkien'],
      isbn: ['9780261103283', '0261103284'],
      cover_i: 12345,
      first_publish_year: 1937,
      publisher: ['HarperCollins'],
      number_of_pages_median: 310,
      subject: ['Fantasy'],
    });
    expect(mapped.title).toBe('The Hobbit');
    expect(mapped.authors).toEqual(['J.R.R. Tolkien']);
    expect(mapped.isbn).toBe('9780261103283');
    expect(mapped.openLibraryKey).toBe('/works/OL45883W');
    expect(mapped.coverArt).toContain('12345-L.jpg');
    expect(mapped.sources.openLibrary).toContain('/works/OL45883W');
  });
});

describe('mapGoogleBooksVolume', () => {
  it('prefers ISBN_13 and https cover URLs', () => {
    const mapped = mapGoogleBooksVolume({
      id: 'abc123',
      volumeInfo: {
        title: 'The Hobbit',
        authors: ['J.R.R. Tolkien'],
        publisher: 'HarperCollins',
        publishedDate: '1937-09-21',
        pageCount: 310,
        industryIdentifiers: [
          { type: 'ISBN_10', identifier: '0261103284' },
          { type: 'ISBN_13', identifier: '9780261103283' },
        ],
        imageLinks: { thumbnail: 'http://books.google.com/cover' },
        infoLink: 'https://books.google.com/books?id=abc123',
      },
    });
    expect(mapped.googleBooksId).toBe('abc123');
    expect(mapped.isbn).toBe('9780261103283');
    expect(mapped.coverArt).toMatch(/^https:/);
    expect(mapped.publishedYear).toBe(1937);
  });
});

describe('scoreTitleAuthor', () => {
  it('scores exact and near matches', () => {
    expect(scoreTitleAuthor('The Hobbit', 'J.R.R. Tolkien', 'The Hobbit', 'J.R.R. Tolkien')).toBe(1);
    expect(
      scoreTitleAuthor('The Hobbit', 'J.R.R. Tolkien', 'The Hobbit', 'JRR Tolkien')
    ).toBeGreaterThanOrEqual(0.88);
    expect(scoreTitleAuthor('The Hobbit', 'Tolkien', 'Dune', 'Herbert')).toBe(0);
  });
});

describe('buildBookDoc', () => {
  it('classifies imported books as written/book/collection', () => {
    const doc = buildBookDoc({
      title: 'Dune',
      authors: ['Frank Herbert'],
      isbn: '9780441172719',
      source: 'openLibrary',
      infoUrl: 'https://openlibrary.org/works/OL893415W',
    }, 'user1');
    expect(doc.contentType).toEqual(['written']);
    expect(doc.contentForm).toEqual(['book']);
    expect(doc.mediaType).toEqual(['collection']);
    expect(doc.author[0].name).toBe('Frank Herbert');
    expect(doc.rightsCleared).toBe(false);
  });

  it('maps Open Library ISO-639-2 language codes so MongoDB text indexes accept them', () => {
    const doc = buildBookDoc({
      title: 'The Hobbit',
      authors: ['J.R.R. Tolkien'],
      language: 'eng',
    }, 'user1');
    expect(doc.language).toBe('en');
  });
});

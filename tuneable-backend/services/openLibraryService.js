/**
 * Map Open Library search docs / edition payloads into a shared book DTO.
 */

const axios = require('axios');
const { firstIsbn, extractIsbns } = require('../utils/isbn');

const OPEN_LIBRARY_SEARCH = 'https://openlibrary.org/search.json';
const USER_AGENT = 'Tuneable/1.0 (https://tuneable.stream; books-catalogue)';

function coverUrlFromDoc(doc) {
  if (doc?.cover_i) return `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`;
  const isbn = firstIsbn(doc?.isbn);
  if (isbn) return `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;
  return null;
}

function workKeyFromDoc(doc) {
  const key = doc?.key || doc?.work_key || '';
  if (typeof key === 'string' && key.startsWith('/works/')) return key;
  if (Array.isArray(doc?.work_key) && doc.work_key[0]) {
    const k = doc.work_key[0];
    return k.startsWith('/works/') ? k : `/works/${k}`;
  }
  return key || null;
}

function infoUrlFromDoc(doc) {
  const key = workKeyFromDoc(doc);
  if (!key) return null;
  return `https://openlibrary.org${key}`;
}

function mapOpenLibraryDoc(doc) {
  if (!doc) return null;
  const isbn = firstIsbn(doc.isbn, doc.isbn_13, doc.isbn_10);
  const authors = Array.isArray(doc.author_name)
    ? doc.author_name.filter(Boolean)
    : doc.author_name
      ? [doc.author_name]
      : [];
  const publishers = Array.isArray(doc.publisher) ? doc.publisher : [];
  const subjects = Array.isArray(doc.subject) ? doc.subject.slice(0, 12) : [];
  const year = doc.first_publish_year ? Number(doc.first_publish_year) : null;
  const openLibraryKey = workKeyFromDoc(doc);
  const infoUrl = infoUrlFromDoc(doc);

  return {
    source: 'openLibrary',
    openLibraryKey,
    googleBooksId: null,
    isbn,
    isbns: extractIsbns(doc.isbn),
    title: doc.title || 'Untitled',
    authors,
    coverArt: coverUrlFromDoc(doc),
    pageCount: doc.number_of_pages_median || doc.number_of_pages || null,
    publisher: publishers[0] || null,
    publishedYear: Number.isFinite(year) ? year : null,
    description: typeof doc.first_sentence === 'string'
      ? doc.first_sentence
      : doc.first_sentence?.value || null,
    subjects,
    language: Array.isArray(doc.language) ? doc.language[0] : doc.language || null,
    infoUrl,
    previewUrl: infoUrl,
    sources: infoUrl ? { openLibrary: infoUrl } : {},
    externalIds: {
      ...(openLibraryKey ? { openLibrary: openLibraryKey } : {}),
      ...(isbn ? { isbn } : {}),
    },
  };
}

async function searchOpenLibrary(query, { limit = 20 } = {}) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];

  const isbn = firstIsbn(q);
  const params = {
    limit: Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50),
    fields: [
      'key',
      'title',
      'author_name',
      'isbn',
      'cover_i',
      'first_publish_year',
      'publisher',
      'number_of_pages_median',
      'language',
      'subject',
      'first_sentence',
    ].join(','),
  };
  if (isbn) params.isbn = isbn;
  else params.q = q;

  const { data } = await axios.get(OPEN_LIBRARY_SEARCH, {
    params,
    timeout: 8000,
    headers: { 'User-Agent': USER_AGENT },
  });

  return (data?.docs || []).map(mapOpenLibraryDoc).filter(Boolean);
}

module.exports = {
  mapOpenLibraryDoc,
  searchOpenLibrary,
  coverUrlFromDoc,
  workKeyFromDoc,
};

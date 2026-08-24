/**
 * Optional Google Books discovery. Disabled when GOOGLE_BOOKS_API_KEY is unset.
 */

const axios = require('axios');
const { firstIsbn, extractIsbns } = require('../utils/isbn');

const GOOGLE_BOOKS_URL = 'https://www.googleapis.com/books/v1/volumes';

function isGoogleBooksEnabled() {
  return Boolean(process.env.GOOGLE_BOOKS_API_KEY);
}

function httpsUrl(url) {
  if (!url || typeof url !== 'string') return null;
  return url.replace(/^http:\/\//i, 'https://');
}

function mapGoogleBooksVolume(item) {
  if (!item) return null;
  const info = item.volumeInfo || {};
  const identifiers = info.industryIdentifiers || [];
  const isbn = firstIsbn(identifiers);
  const authors = Array.isArray(info.authors) ? info.authors.filter(Boolean) : [];
  const yearRaw = info.publishedDate ? parseInt(String(info.publishedDate).slice(0, 4), 10) : null;
  const coverArt = httpsUrl(
    info.imageLinks?.thumbnail
      || info.imageLinks?.smallThumbnail
      || info.imageLinks?.large
      || null
  );
  const infoUrl = info.infoLink || info.canonicalVolumeLink || null;
  const previewUrl = info.previewLink || infoUrl;

  return {
    source: 'googleBooks',
    openLibraryKey: null,
    googleBooksId: item.id || null,
    isbn,
    isbns: extractIsbns(identifiers),
    title: info.title || 'Untitled',
    authors,
    coverArt,
    pageCount: info.pageCount || null,
    publisher: info.publisher || null,
    publishedYear: Number.isFinite(yearRaw) ? yearRaw : null,
    description: info.description || null,
    subjects: Array.isArray(info.categories) ? info.categories.slice(0, 12) : [],
    language: info.language || null,
    infoUrl,
    previewUrl,
    sources: {
      ...(infoUrl ? { googleBooks: infoUrl } : {}),
      ...(previewUrl && previewUrl !== infoUrl ? { googleBooksPreview: previewUrl } : {}),
    },
    externalIds: {
      ...(item.id ? { googleBooks: item.id } : {}),
      ...(isbn ? { isbn } : {}),
    },
  };
}

async function searchGoogleBooks(query, { limit = 20 } = {}) {
  if (!isGoogleBooksEnabled()) {
    return { disabled: true, books: [] };
  }

  const q = String(query || '').trim();
  if (q.length < 2) return { disabled: false, books: [] };

  const isbn = firstIsbn(q);
  const { data } = await axios.get(GOOGLE_BOOKS_URL, {
    params: {
      q: isbn ? `isbn:${isbn}` : q,
      maxResults: Math.min(Math.max(parseInt(limit, 10) || 20, 1), 40),
      printType: 'books',
      key: process.env.GOOGLE_BOOKS_API_KEY,
    },
    timeout: 8000,
  });

  const books = (data?.items || []).map(mapGoogleBooksVolume).filter(Boolean);
  return { disabled: false, books };
}

module.exports = {
  isGoogleBooksEnabled,
  mapGoogleBooksVolume,
  searchGoogleBooks,
};

/**
 * Find-or-create written/book Media rows from Open Library / Google Books DTOs.
 */

const Media = require('../models/Media');
const { normalize, levenshtein } = require('../utils/mediaMatchUtils');
const { firstIsbn } = require('../utils/isbn');
const { normalizeLanguageInput } = require('../utils/language');

const BOOK_CLASSIFICATION = {
  contentType: ['written'],
  contentForm: ['book'],
  mediaType: ['collection'],
};

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function authorList(payload) {
  if (Array.isArray(payload?.authors) && payload.authors.length) {
    return payload.authors.map((a) => (typeof a === 'string' ? a : a?.name)).filter(Boolean);
  }
  if (Array.isArray(payload?.author) && payload.author.length) {
    return payload.author.map((a) => (typeof a === 'string' ? a : a?.name)).filter(Boolean);
  }
  return [];
}

function primaryAuthor(payload) {
  return authorList(payload)[0] || '';
}

function scoreTitleAuthor(leftTitle, leftAuthor, rightTitle, rightAuthor) {
  const t1 = normalize(leftTitle);
  const t2 = normalize(rightTitle);
  const a1 = normalize(leftAuthor);
  const a2 = normalize(rightAuthor);
  if (!t1 || !t2) return 0;
  if (t1 === t2 && a1 && a1 === a2) return 1;

  const titleDist = levenshtein(t1, t2);
  const titleSim = 1 - titleDist / Math.max(t1.length, t2.length, 1);
  const authorOk = !a1 || !a2
    || a1 === a2
    || a1.includes(a2)
    || a2.includes(a1)
    || levenshtein(a1, a2) <= 2;
  if (titleSim >= 0.88 && authorOk) return titleSim;
  return 0;
}

function toAuthorDocs(payload) {
  return authorList(payload).map((name) => ({ name }));
}

function mapToObject(value) {
  if (!value) return {};
  if (value instanceof Map) return Object.fromEntries(value);
  if (typeof value.toObject === 'function') return value.toObject();
  return { ...value };
}

function mergeMaps(existing, incoming) {
  return { ...mapToObject(existing), ...mapToObject(incoming) };
}

async function findExistingBook(payload) {
  const isbn = firstIsbn(payload?.isbn, payload?.isbns, payload?.externalIds?.isbn);
  if (isbn) {
    const byIsbn = await Media.findOne({ isbn, ...BOOK_CLASSIFICATION });
    if (byIsbn) return { media: byIsbn, match: 'isbn' };
  }

  const or = [];
  const openLibraryKey = payload?.openLibraryKey || payload?.externalIds?.openLibrary;
  const googleBooksId = payload?.googleBooksId || payload?.externalIds?.googleBooks;
  if (openLibraryKey) or.push({ 'externalIds.openLibrary': openLibraryKey });
  if (googleBooksId) or.push({ 'externalIds.googleBooks': googleBooksId });
  if (or.length) {
    const byExternal = await Media.findOne({ $or: or, ...BOOK_CLASSIFICATION });
    if (byExternal) return { media: byExternal, match: 'externalId' };
  }

  const title = String(payload?.title || '').trim();
  const author = primaryAuthor(payload);
  if (!title) return null;

  const exact = await Media.findOne({
    ...BOOK_CLASSIFICATION,
    title: new RegExp(`^${escapeRegex(title)}$`, 'i'),
    ...(author ? { 'author.name': new RegExp(`^${escapeRegex(author)}$`, 'i') } : {}),
  });
  if (exact) return { media: exact, match: 'title-author-exact' };

  const fuzzyNeedle = escapeRegex(title).slice(0, Math.min(title.length, 40));
  const fuzzyPool = await Media.find({
    ...BOOK_CLASSIFICATION,
    ...(fuzzyNeedle ? { title: new RegExp(fuzzyNeedle, 'i') } : {}),
  })
    .limit(25)
    .lean();

  let best = null;
  for (const candidate of fuzzyPool) {
    const candidateAuthor = candidate.author?.[0]?.name || '';
    const score = scoreTitleAuthor(title, author, candidate.title, candidateAuthor);
    if (score >= 0.9 && (!best || score > best.score)) {
      best = { media: candidate, score, match: 'title-author-fuzzy' };
    }
  }
  if (best) {
    const hydrated = await Media.findById(best.media._id);
    return hydrated ? { media: hydrated, match: best.match } : null;
  }
  return null;
}

function buildBookDoc(payload, userId) {
  const isbn = firstIsbn(payload?.isbn, payload?.isbns) || undefined;
  const authors = toAuthorDocs(payload);
  const openLibraryKey = payload?.openLibraryKey || payload?.externalIds?.openLibrary || null;
  const googleBooksId = payload?.googleBooksId || payload?.externalIds?.googleBooks || null;
  const infoUrl = payload?.infoUrl || payload?.previewUrl || null;
  const year = payload?.publishedYear != null ? Number(payload.publishedYear) : null;
  const source = payload?.source || 'books';

  const sources = { ...(payload.sources || {}) };
  if (infoUrl && source === 'openLibrary' && !sources.openLibrary) sources.openLibrary = infoUrl;
  if (infoUrl && source === 'googleBooks' && !sources.googleBooks) sources.googleBooks = infoUrl;
  if (payload.previewUrl && payload.previewUrl !== infoUrl) sources.preview = payload.previewUrl;

  return {
    title: String(payload.title || 'Untitled').trim(),
    ...BOOK_CLASSIFICATION,
    author: authors,
    creatorDisplay: authors.map((a) => a.name).join(', ') || null,
    ...(isbn ? { isbn } : {}),
    publisher: payload.publisher || null,
    pages: payload.pageCount || payload.pages || null,
    language: normalizeLanguageInput(payload.language),
    coverArt: payload.coverArt || payload.coverUrl || null,
    description: payload.description || null,
    tags: Array.isArray(payload.subjects) ? payload.subjects.slice(0, 12) : [],
    genres: Array.isArray(payload.subjects) ? payload.subjects.slice(0, 8) : [],
    releaseYear: Number.isFinite(year) ? year : null,
    releaseDate: Number.isFinite(year) ? new Date(`${year}-01-01`) : null,
    sources,
    externalIds: {
      ...(openLibraryKey ? { openLibrary: openLibraryKey } : {}),
      ...(googleBooksId ? { googleBooks: googleBooksId } : {}),
      ...(isbn ? { isbn } : {}),
    },
    identityConfidence: isbn ? 'catalog' : 'unverified',
    identityConfidenceSource: isbn ? 'isbn' : (source || 'none'),
    rightsCleared: false,
    rightsStatus: 'pending',
    addedBy: userId,
    importSource: source,
    importedBy: userId,
  };
}

async function enrichExisting(media, payload) {
  const isbn = firstIsbn(payload?.isbn, payload?.isbns);
  if (isbn && !media.isbn) media.isbn = isbn;
  if (payload.coverArt && !media.coverArt) media.coverArt = payload.coverArt;
  if (payload.description && !media.description) media.description = payload.description;
  if (payload.publisher && !media.publisher) media.publisher = payload.publisher;
  if ((payload.pageCount || payload.pages) && !media.pages) {
    media.pages = payload.pageCount || payload.pages;
  }
  if ((!media.author || media.author.length === 0) && authorList(payload).length) {
    media.author = toAuthorDocs(payload);
  }

  const nextSources = mergeMaps(media.sources, payload.sources);
  if (payload.infoUrl && payload.source === 'openLibrary' && !nextSources.openLibrary) {
    nextSources.openLibrary = payload.infoUrl;
  }
  if (payload.infoUrl && payload.source === 'googleBooks' && !nextSources.googleBooks) {
    nextSources.googleBooks = payload.infoUrl;
  }
  media.sources = nextSources;
  media.externalIds = mergeMaps(media.externalIds, {
    ...(payload.externalIds || {}),
    ...(isbn ? { isbn } : {}),
    ...(payload.openLibraryKey ? { openLibrary: payload.openLibraryKey } : {}),
    ...(payload.googleBooksId ? { googleBooks: payload.googleBooksId } : {}),
  });
  await media.save();
  return media;
}

async function findOrCreateBook(payload, userId) {
  if (!payload || !String(payload.title || '').trim()) {
    const err = new Error('Book title is required');
    err.status = 400;
    throw err;
  }
  if (!userId) {
    const err = new Error('Authentication required to import a book');
    err.status = 401;
    throw err;
  }

  const existing = await findExistingBook(payload);
  if (existing?.media) {
    const media = await enrichExisting(existing.media, payload);
    return { media, created: false, match: existing.match };
  }

  const media = new Media(buildBookDoc(payload, userId));
  await media.save();
  return { media, created: true, match: 'created' };
}

module.exports = {
  BOOK_CLASSIFICATION,
  authorList,
  primaryAuthor,
  scoreTitleAuthor,
  findExistingBook,
  findOrCreateBook,
  buildBookDoc,
};

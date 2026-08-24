const express = require('express');
const mongoose = require('mongoose');
const Media = require('../models/Media');
const Bid = require('../models/Bid');
const User = require('../models/User');
const Party = require('../models/Party');
const authMiddleware = require('../middleware/authMiddleware');
const { firstIsbn } = require('../utils/isbn');
const { BOOK_CATALOG_QUERY } = require('../utils/mediaKinds');
const { toClientMedia } = require('../utils/mediaPlayability');
const { searchOpenLibrary } = require('../services/openLibraryService');
const { searchGoogleBooks, isGoogleBooksEnabled } = require('../services/googleBooksService');
const { findOrCreateBook } = require('../services/bookAdapter');
const { buildBidLocationSnapshot } = require('../utils/locationUtils');
const { getPeriodStartDate } = require('../utils/globalPartyChart');

const router = express.Router();

function mapsToObject(value) {
  if (!value) return {};
  if (value instanceof Map) return Object.fromEntries(value);
  if (typeof value.toObject === 'function') return value.toObject();
  return { ...value };
}

function serializeBook(media) {
  if (!media) return media;
  const raw = typeof media.toObject === 'function' ? media.toObject() : { ...media };
  raw.sources = mapsToObject(raw.sources);
  raw.externalIds = mapsToObject(raw.externalIds);
  const authors = Array.isArray(raw.author)
    ? raw.author.map((a) => (typeof a === 'string' ? a : a?.name)).filter(Boolean)
    : [];
  raw.authors = authors;
  raw.creatorDisplay = raw.creatorDisplay || authors.join(', ');
  return toClientMedia(raw);
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseLimit(value, fallback = 50, max = 200) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, max);
}

router.get('/discovery/open-library/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }
    const books = await searchOpenLibrary(q, { limit: req.query.limit });
    res.json({ source: 'openLibrary', books, count: books.length, query: q });
  } catch (error) {
    console.error('Open Library search failed:', error.message);
    res.status(502).json({ error: 'Open Library search failed' });
  }
});

router.get('/discovery/google-books/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }
    const result = await searchGoogleBooks(q, { limit: req.query.limit });
    if (result.disabled) {
      return res.json({
        source: 'googleBooks',
        disabled: true,
        books: [],
        count: 0,
        query: q,
        message: 'Google Books is not configured',
      });
    }
    res.json({
      source: 'googleBooks',
      disabled: false,
      books: result.books,
      count: result.books.length,
      query: q,
    });
  } catch (error) {
    console.error('Google Books search failed:', error.message);
    res.status(502).json({ error: 'Google Books search failed' });
  }
});

router.get('/discovery/status', (req, res) => {
  res.json({
    openLibrary: true,
    googleBooks: isGoogleBooksEnabled(),
  });
});

router.post('/import', authMiddleware, async (req, res) => {
  try {
    const payload = req.body || {};
    const result = await findOrCreateBook(payload, req.user._id);
    res.status(result.created ? 201 : 200).json({
      created: result.created,
      match: result.match,
      book: serializeBook(result.media),
    });
  } catch (error) {
    console.error('Book import failed:', error);
    res.status(error.status || 500).json({ error: error.message || 'Failed to import book' });
  }
});

router.get('/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }
    const limit = parseLimit(req.query.limit, 50);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const isbn = firstIsbn(q);
    const rx = new RegExp(escapeRegex(q), 'i');
    const searchQuery = {
      ...BOOK_CATALOG_QUERY,
      $or: [
        ...(isbn ? [{ isbn }] : []),
        { title: rx },
        { description: rx },
        { 'author.name': rx },
        { creatorNames: rx },
        { publisher: rx },
        { tags: rx },
      ],
    };

    const total = await Media.countDocuments(searchQuery);
    const books = await Media.find(searchQuery)
      .sort({ globalMediaAggregate: -1, createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .populate('addedBy', 'username')
      .lean();

    res.json({
      books: books.map(serializeBook),
      count: books.length,
      total,
      offset,
      hasMore: offset + books.length < total,
      query: q,
    });
  } catch (error) {
    console.error('Book catalog search failed:', error);
    res.status(500).json({ error: 'Failed to search books' });
  }
});

router.get('/chart', async (req, res) => {
  try {
    const limit = parseLimit(req.query.limit, 50);
    const timePeriod = req.query.timePeriod || req.query.timeRange || 'all-time';
    const locationPlaceId = typeof req.query.locationPlaceId === 'string'
      ? req.query.locationPlaceId.trim()
      : '';
    const tag = typeof req.query.tag === 'string' ? req.query.tag.trim() : '';
    const startDate = getPeriodStartDate(timePeriod);

    const query = { ...BOOK_CATALOG_QUERY };
    if (tag) query.tags = new RegExp(escapeRegex(tag), 'i');
    if (locationPlaceId) {
      query.$or = [
        { 'primaryLocation.placeId': locationPlaceId },
        { 'primaryLocation.ancestorIds': locationPlaceId },
      ];
    }

    let books;
    if (startDate) {
      const catalogIds = await Media.find(query).distinct('_id');
      if (!catalogIds.length) {
        books = [];
      } else {
        const ranked = await Bid.aggregate([
          {
            $match: {
              status: 'active',
              createdAt: { $gte: startDate },
              mediaId: { $in: catalogIds },
            },
          },
          { $group: { _id: '$mediaId', periodTotal: { $sum: '$amount' } } },
          { $sort: { periodTotal: -1 } },
          { $limit: limit },
        ]);
        const ids = ranked.map((row) => row._id);
        const docs = await Media.find({ _id: { $in: ids } }).lean();
        const byId = new Map(docs.map((doc) => [doc._id.toString(), doc]));
        books = ranked
          .map((row) => {
            const doc = byId.get(row._id.toString());
            if (!doc) return null;
            return { ...doc, periodTotal: row.periodTotal };
          })
          .filter(Boolean);
      }
    } else {
      books = await Media.find(query)
        .sort({ globalMediaAggregate: -1, createdAt: -1 })
        .limit(limit)
        .lean();
    }

    res.json({
      books: books.map(serializeBook),
      count: books.length,
      timePeriod,
      locationPlaceId: locationPlaceId || null,
    });
  } catch (error) {
    console.error('Book chart failed:', error);
    res.status(500).json({ error: 'Failed to load books chart' });
  }
});

router.post('/:bookId/boost', authMiddleware, async (req, res) => {
  try {
    const { bookId } = req.params;
    const { amount, currentLocation } = req.body;
    const userId = req.user._id;

    if (!mongoose.isValidObjectId(bookId)) {
      return res.status(400).json({ error: 'Invalid book ID' });
    }
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Boost amount must be greater than 0' });
    }
    if (amount < 0.01) {
      return res.status(400).json({ error: 'Minimum bid is £0.01' });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const bidAmountPence = Math.round(amount * 100);
    if ((user.balance || 0) < bidAmountPence) {
      return res.status(400).json({
        error: 'Insufficient balance',
        required: amount,
        available: (user.balance || 0) / 100,
      });
    }

    const book = await Media.findOne({ _id: bookId, ...BOOK_CATALOG_QUERY });
    if (!book) return res.status(404).json({ error: 'Book not found' });

    const { assertWelcomeMediaSpend, sendPolicyError } = require('../utils/welcomeCreditPolicy');
    try {
      await assertWelcomeMediaSpend({ user, amountPence: bidAmountPence, media: book });
    } catch (policyErr) {
      if (sendPolicyError(res, policyErr)) return;
      throw policyErr;
    }

    const globalParty = await Party.getGlobalPartyForBid();
    if (!globalParty) {
      return res.status(500).json({ error: 'Global party not found' });
    }

    const userBalancePre = user.balance || 0;
    const mediaAggregatePre = book.globalMediaAggregate || 0;
    const userBidsPre = await Bid.find({ userId, status: 'active' }).lean();
    const userAggregatePre = userBidsPre.reduce((sum, b) => sum + (b.amount || 0), 0);

    const { peekWelcomeCreditApplied, applyWalletSpend } = require('../utils/welcomeCreditHelper');
    const bid = new Bid({
      userId,
      partyId: globalParty._id,
      mediaId: book._id,
      amount: bidAmountPence,
      welcomeCreditAppliedPence: peekWelcomeCreditApplied(user, bidAmountPence),
      bidScope: 'global',
      partyType: 'global',
      username: req.user.username,
      partyName: globalParty.name,
      mediaTitle: book.title,
      mediaArtist: book.author?.[0]?.name || '',
      mediaCoverArt: book.coverArt || '',
      mediaContentType: book.contentType,
      mediaContentForm: book.contentForm,
      ...buildBidLocationSnapshot(user, currentLocation),
    });

    await bid.save();
    await Media.findByIdAndUpdate(book._id, { $addToSet: { bids: bid._id } });

    try {
      const tuneableLedgerService = require('../services/tuneableLedgerService');
      await tuneableLedgerService.createTipEntry({
        userId,
        mediaId: book._id,
        partyId: globalParty._id,
        bidId: bid._id,
        amount: bidAmountPence,
        userBalancePre,
        userAggregatePre,
        mediaAggregatePre,
        userTuneBytesPre: null,
        userTuneBytesPost: null,
        referenceTransactionId: bid._id,
        metadata: { bidScope: 'global', platform: 'book-boost' },
      });
    } catch (ledgerError) {
      console.error('Failed to create ledger entry for book boost:', ledgerError);
    }

    applyWalletSpend(user, bidAmountPence);
    await user.save();

    try {
      const artistEscrowService = require('../services/artistEscrowService');
      artistEscrowService.allocateEscrowForBid(bid._id, book._id, bidAmountPence).catch((error) => {
        console.error('Failed to allocate escrow for book boost bid:', bid._id, error);
      });
    } catch (error) {
      console.error('Error setting up escrow allocation:', error);
    }

    try {
      const tuneBytesService = require('../services/tuneBytesService');
      tuneBytesService.awardTuneBytesForBid(bid._id).catch((error) => {
        console.error('Failed to calculate TuneBytes for bid:', bid._id, error);
      });
    } catch (error) {
      console.error('Error setting up TuneBytes calculation:', error);
    }

    const updatedBook = await Media.findById(bookId);
    res.json({
      message: 'Book boosted successfully!',
      book: serializeBook(updatedBook || book),
      updatedBalance: user.balance,
    });
  } catch (error) {
    console.error('Error boosting book:', error);
    const { sendPolicyError } = require('../utils/welcomeCreditPolicy');
    if (sendPolicyError(res, error)) return;
    res.status(error.status || 500).json({ error: error.message || 'Failed to boost book' });
  }
});

router.get('/:bookId', async (req, res) => {
  try {
    const { bookId } = req.params;
    if (!mongoose.isValidObjectId(bookId)) {
      return res.status(400).json({ error: 'Invalid book ID' });
    }
    const book = await Media.findOne({ _id: bookId, ...BOOK_CATALOG_QUERY })
      .populate('addedBy', 'username profilePic uuid');
    if (!book) return res.status(404).json({ error: 'Book not found' });
    res.json({ book: serializeBook(book) });
  } catch (error) {
    console.error('Error loading book:', error);
    res.status(500).json({ error: 'Failed to load book' });
  }
});

module.exports = router;

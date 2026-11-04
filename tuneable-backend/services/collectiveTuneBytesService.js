/**
 * TuneBytes shown for a collective on the places chart, and the media that adds up to it.
 *
 * Founder tips count (including tips on other people's tunes). TuneBytes on media
 * where this collective is credited count too, without counting the same bid twice.
 */

const mongoose = require('mongoose');
const Media = require('../models/Media');
const Bid = require('../models/Bid');
const TuneBytesTransaction = require('../models/TuneBytesTransaction');
const { founderTipWindows, founderTuneByteAwards, attributeCollectiveTuneBytes } = require('../utils/collectiveFounderTips');
const { toClientMedia } = require('../utils/mediaPlayability');
const { loadBidsByMediaId } = require('./relatedMediaService');
const { sumConfirmedTuneBytesByMediaId, tuneBytesFor } = require('../utils/mediaTuneBytes');

const CHART_FIELDS = 'title artist featuring creatorNames coverArt sources globalMediaAggregate tags uuid slug contentType contentForm duration bpm releaseDate releaseYear primaryLocation rightsStatus rightsCleared';

async function loadTuneByteInputs(collectives) {
  const windowsByCollective = new Map();
  const userIds = new Set();
  for (const collective of collectives) {
    const windows = founderTipWindows(collective);
    windowsByCollective.set(String(collective._id), windows);
    for (const window of windows) userIds.add(window.userId);
  }

  const bids = userIds.size
    ? await Bid.find({ status: 'active', userId: { $in: [...userIds] } })
      .select('_id userId mediaId createdAt status')
      .lean()
    : [];
  const bidIds = bids.map((bid) => bid._id);
  const founderTransactions = bidIds.length
    ? await TuneBytesTransaction.find({ bidId: { $in: bidIds } })
      .select('bidId tuneBytesEarned')
      .lean()
    : [];
  const earnedByBid = new Map(
    founderTransactions.map((row) => [String(row.bidId), Number(row.tuneBytesEarned) || 0])
  );
  const tips = bids.map((bid) => ({
    ...bid,
    tuneBytesEarned: earnedByBid.get(String(bid._id)) || 0,
  }));

  const collectiveIds = collectives.map((collective) => collective._id);
  const media = collectiveIds.length
    ? await Media.find({
      $or: [
        { 'artist.collectiveId': { $in: collectiveIds } },
        { 'producer.collectiveId': { $in: collectiveIds } },
        { 'featuring.collectiveId': { $in: collectiveIds } },
      ],
    })
      .select('_id artist.collectiveId producer.collectiveId featuring.collectiveId')
      .lean()
    : [];

  const mediaIds = [];
  const ownersByMedia = new Map();
  for (const item of media) {
    const owners = new Set();
    for (const field of ['artist', 'producer', 'featuring']) {
      const people = Array.isArray(item[field]) ? item[field] : [];
      for (const person of people) {
        if (person && person.collectiveId) owners.add(String(person.collectiveId));
      }
    }
    if (!owners.size) continue;
    mediaIds.push(item._id);
    ownersByMedia.set(String(item._id), owners);
  }

  const mediaTransactions = mediaIds.length
    ? await TuneBytesTransaction.find({ mediaId: { $in: mediaIds } })
      .select('bidId mediaId tuneBytesEarned')
      .lean()
    : [];

  return { windowsByCollective, tips, mediaTransactions, ownersByMedia };
}

function attributeForCollective(collective, inputs) {
  const id = String(collective._id);
  const ownedRows = [];
  for (const row of inputs.mediaTransactions) {
    const owners = inputs.ownersByMedia.get(String(row.mediaId));
    if (owners && owners.has(id)) ownedRows.push(row);
  }
  const awards = founderTuneByteAwards(inputs.windowsByCollective.get(id), inputs.tips);
  return attributeCollectiveTuneBytes(awards, ownedRows);
}

async function tuneBytesTotalsForCollectives(collectives) {
  const totals = new Map();
  if (!collectives.length) return totals;

  const inputs = await loadTuneByteInputs(collectives);
  for (const collective of collectives) {
    totals.set(String(collective._id), attributeForCollective(collective, inputs).total);
  }
  return totals;
}

function refId(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'object' && value._id && value._id !== value) return refId(value._id);
  const asString = typeof value.toString === 'function' ? value.toString() : String(value);
  return asString && asString !== '[object Object]' ? asString : '';
}

function activeMemberUserIds(collective) {
  const ids = [];
  const seen = new Set();
  for (const member of (collective && collective.members) || []) {
    if (!member || member.leftAt) continue;
    const id = refId(member.userId);
    if (!id || seen.has(id) || !mongoose.Types.ObjectId.isValid(id)) continue;
    seen.add(id);
    ids.push(new mongoose.Types.ObjectId(id));
  }
  return ids;
}

function memberOwnsAndIsArtist(doc, memberIds) {
  const members = new Set(memberIds.map((id) => String(id)));
  const ownerIds = new Set();
  for (const owner of doc.mediaOwners || []) {
    const id = refId(owner.userId);
    if (id && members.has(id) && Number(owner.percentage) > 0) ownerIds.add(id);
  }
  if (!ownerIds.size) return false;
  return (doc.artist || []).some((person) => ownerIds.has(refId(person.userId)));
}

/**
 * Tunes a current member both owns and is credited on as artist.
 * A 0% mediaOwners row is a library-import placeholder, not ownership.
 * Library tracks a member merely holds a share in stay off the page.
 * This fills the collective page. It does not change the Places TuneBytes total.
 */
async function memberOwnedMedia(collective) {
  const memberIds = activeMemberUserIds(collective);
  if (!memberIds.length) return [];
  const docs = await Media.find({
    status: { $nin: ['deleted', 'vetoed'] },
    'artist.userId': { $in: memberIds },
    mediaOwners: {
      $elemMatch: {
        userId: { $in: memberIds },
        percentage: { $gt: 0 },
      },
    },
  })
    .select(`${CHART_FIELDS} mediaOwners`)
    .lean();
  return docs.filter((doc) => memberOwnsAndIsArtist(doc, memberIds));
}

async function tuneBytesChartForCollective(collective, { authenticated = false } = {}) {
  if (!collective) return { total: 0, media: [] };

  const inputs = await loadTuneByteInputs([collective]);
  const { total, byMedia } = attributeForCollective(collective, inputs);
  const ranked = [...byMedia.entries()].filter(([, amount]) => amount > 0);
  const scoreIds = new Set(ranked.map(([mediaId]) => String(mediaId)));
  const memberDocs = (await memberOwnedMedia(collective))
    .filter((doc) => doc && doc._id && !scoreIds.has(String(doc._id)));

  const scoreIdList = ranked.map(([mediaId]) => mediaId);
  const memberIdList = memberDocs.map((doc) => doc._id);
  const ids = [...scoreIdList, ...memberIdList];
  if (!ids.length) return { total, media: [] };

  const [scoreDocs, bidsByMediaId, memberTuneBytes] = await Promise.all([
    scoreIdList.length
      ? Media.find({ _id: { $in: scoreIdList } }).select(CHART_FIELDS).lean()
      : [],
    loadBidsByMediaId(ids),
    sumConfirmedTuneBytesByMediaId(memberIdList),
  ]);
  const scoreById = new Map(scoreDocs.map((doc) => [String(doc._id), doc]));
  const memberById = new Map(memberDocs.map((doc) => [String(doc._id), doc]));

  const media = [
    ...ranked.map(([mediaId, tuneBytesEarned]) => {
      const doc = scoreById.get(String(mediaId));
      if (!doc) return null;
      return { doc, tuneBytesEarned };
    }),
    ...memberDocs.map((doc) => ({
      doc: memberById.get(String(doc._id)),
      tuneBytesEarned: tuneBytesFor(memberTuneBytes, doc._id),
    })),
  ]
    .filter((row) => row && row.doc)
    .map((row) => {
      delete row.doc.mediaOwners;
      return toClientMedia(row.doc, {
        bids: bidsByMediaId.get(String(row.doc._id)) || [],
        tuneBytesEarned: row.tuneBytesEarned,
      }, { authenticated });
    })
    .sort(
      (a, b) =>
        (b.tuneBytesEarned || 0) - (a.tuneBytesEarned || 0) ||
        String(a.title || '').localeCompare(String(b.title || ''))
    );

  return { total, media };
}

module.exports = {
  tuneBytesTotalsForCollectives,
  tuneBytesChartForCollective,
};

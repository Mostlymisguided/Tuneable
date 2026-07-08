const Media = require('../models/Media');
const Bid = require('../models/Bid');
const User = require('../models/User');
const { getCanonicalTag } = require('../utils/tagNormalizer');

const DEFAULT_OPTIONS = {
  candidatePoolSize: 120,
  relatedLimit: 12,
  fansAlsoTipLimit: 8,
  topFanPoolSize: 10,
  maxPerPrimaryArtist: 2,
};

const normalizeTags = (tags = []) => {
  return Array.from(
    new Set(
      tags
        .filter(tag => typeof tag === 'string')
        .map(tag => tag.trim())
        .filter(Boolean)
    )
  );
};

const canonicalizeTags = (tags = []) => {
  return Array.from(
    new Set(
      normalizeTags(tags)
        .map(tag => getCanonicalTag(tag))
        .filter(Boolean)
    )
  );
};

const getPrimaryArtistName = (media) => {
  if (!media) return null;
  if (Array.isArray(media.artist) && media.artist.length > 0) {
    return (media.artist[0]?.name || '').trim() || null;
  }
  if (typeof media.artist === 'string') {
    return media.artist.trim() || null;
  }
  return null;
};

const flattenStringMap = (value) => {
  if (!value) return {};
  if (value instanceof Map) {
    return Object.fromEntries(value.entries());
  }
  if (typeof value === 'object') {
    return { ...value };
  }
  return {};
};

const buildTagCountMap = async (sourceTags) => {
  if (!sourceTags.length) return new Map();

  const tagCounts = await Media.aggregate([
    {
      $match: {
        status: 'active',
        tags: { $in: sourceTags },
      },
    },
    { $unwind: '$tags' },
    {
      $match: {
        tags: { $in: sourceTags },
      },
    },
    {
      $group: {
        _id: '$tags',
        count: { $sum: 1 },
      },
    },
  ]);

  const canonicalCountMap = new Map();
  tagCounts.forEach(entry => {
    const canonical = getCanonicalTag(entry._id);
    if (!canonical) return;
    canonicalCountMap.set(canonical, (canonicalCountMap.get(canonical) || 0) + entry.count);
  });

  return canonicalCountMap;
};

const buildRelationshipSet = (media) => {
  const ids = new Set();
  (media.relationships || []).forEach(rel => {
    if (rel?.targetId) ids.add(rel.targetId.toString());
  });
  return ids;
};

const buildCandidateRecord = ({ media, source, sourceCanonicalTags, canonicalTagCounts, sourceRelationshipIds }) => {
  const rawTags = normalizeTags(media.tags || []);
  const candidateCanonicalTags = canonicalizeTags(rawTags);
  const sharedCanonicalTags = candidateCanonicalTags.filter(tag => sourceCanonicalTags.includes(tag));

  if (sharedCanonicalTags.length === 0) {
    return null;
  }

  const sharedDisplayTags = normalizeTags(source.tags || []).filter(tag => {
    const canonical = getCanonicalTag(tag);
    return canonical && sharedCanonicalTags.includes(canonical);
  });

  const fallbackDisplayTags = rawTags.filter(tag => {
    const canonical = getCanonicalTag(tag);
    return canonical && sharedCanonicalTags.includes(canonical);
  });

  const uniqueSharedDisplayTags = Array.from(new Set([
    ...sharedDisplayTags,
    ...fallbackDisplayTags,
  ]));

  const samePrimaryArtist = (
    (getPrimaryArtistName(source) || '').toLowerCase() ===
    (getPrimaryArtistName(media) || '').toLowerCase()
  ) && !!getPrimaryArtistName(source);

  const candidateRelationshipIds = buildRelationshipSet(media);
  const hasDirectRelationship =
    sourceRelationshipIds.has(media._id.toString()) ||
    candidateRelationshipIds.has(source._id.toString());

  const rarityWeight = sharedCanonicalTags.reduce((sum, tag) => {
    const count = canonicalTagCounts.get(tag) || 1;
    return sum + (25 / Math.sqrt(count));
  }, 0);

  const popularityScore = Math.log10((media.globalMediaAggregate || 0) + 10) * 6;
  const sameContentFormBonus = Array.isArray(source.contentForm) && Array.isArray(media.contentForm)
    && source.contentForm.some(form => media.contentForm.includes(form))
    ? 12
    : 0;

  const score =
    (sharedCanonicalTags.length * 100) +
    rarityWeight +
    (samePrimaryArtist ? 24 : 0) +
    (hasDirectRelationship ? 45 : 0) +
    sameContentFormBonus +
    popularityScore;

  const reasons = [`${sharedCanonicalTags.length} shared tag${sharedCanonicalTags.length === 1 ? '' : 's'}`];
  if (samePrimaryArtist) reasons.push('same primary artist');
  if (hasDirectRelationship) reasons.push('directly related release');
  if ((media.globalMediaAggregate || 0) > 0) reasons.push('strong tip support');

  return {
    media,
    score,
    sharedCanonicalTags,
    sharedTags: uniqueSharedDisplayTags.slice(0, 4),
    reasons,
    samePrimaryArtist,
  };
};

const limitPerPrimaryArtist = (records, limit, maxPerPrimaryArtist) => {
  const counts = new Map();
  const selected = [];

  for (const record of records) {
    const artistKey = (getPrimaryArtistName(record.media) || record.media._id.toString()).toLowerCase();
    const current = counts.get(artistKey) || 0;
    if (current >= maxPerPrimaryArtist) continue;

    counts.set(artistKey, current + 1);
    selected.push(record);

    if (selected.length >= limit) break;
  }

  return selected;
};

const formatMediaEntry = (record) => {
  const media = record.media;
  return {
    _id: media._id.toString(),
    uuid: media.uuid,
    title: media.title,
    artist: getPrimaryArtistName(media) || 'Unknown Artist',
    coverArt: media.coverArt || null,
    duration: media.duration || 0,
    globalMediaAggregate: media.globalMediaAggregate || 0,
    tags: media.tags || [],
    sharedTags: record.sharedTags || [],
    reasons: record.reasons || [],
    score: Number((record.score || 0).toFixed(2)),
    sources: flattenStringMap(media.sources),
    contentType: media.contentType || [],
    contentForm: media.contentForm || [],
    creatorDisplay: media.creatorDisplay || null,
    fanContext: record.fanContext || null,
  };
};

const getRelatedPlaylistsForMedia = async (mediaId, options = {}) => {
  const settings = { ...DEFAULT_OPTIONS, ...options };

  const source = await Media.findById(mediaId)
    .select('_id uuid title artist tags contentType contentForm relationships globalMediaAggregate')
    .lean();

  if (!source) {
    throw new Error('Source media not found');
  }

  const sourceTags = normalizeTags(source.tags || []);
  const sourceCanonicalTags = canonicalizeTags(sourceTags);

  if (sourceCanonicalTags.length === 0) {
    return {
      source,
      relatedMedia: [],
      fansAlsoTip: [],
    };
  }

  const canonicalTagCounts = await buildTagCountMap(sourceTags);
  const sourceRelationshipIds = buildRelationshipSet(source);

  const candidateQuery = {
    _id: { $ne: source._id },
    status: 'active',
    tags: { $in: sourceTags },
  };

  if (Array.isArray(source.contentType) && source.contentType.length > 0) {
    candidateQuery.contentType = { $in: source.contentType };
  }

  const candidateMedia = await Media.find(candidateQuery)
    .select('_id uuid title artist coverArt duration globalMediaAggregate tags sources contentType contentForm relationships creatorDisplay')
    .sort({ globalMediaAggregate: -1, playCount: -1, createdAt: -1 })
    .limit(settings.candidatePoolSize)
    .lean();

  const candidateRecords = candidateMedia
    .map(media => buildCandidateRecord({
      media,
      source,
      sourceCanonicalTags,
      canonicalTagCounts,
      sourceRelationshipIds,
    }))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  const relatedMedia = limitPerPrimaryArtist(
    candidateRecords,
    settings.relatedLimit,
    settings.maxPerPrimaryArtist
  ).map(formatMediaEntry);

  if (candidateRecords.length === 0) {
    return {
      source,
      relatedMedia,
      fansAlsoTip: [],
    };
  }

  const topFans = await Bid.aggregate([
    {
      $match: {
        mediaId: source._id,
        status: 'active',
      },
    },
    {
      $group: {
        _id: '$userId',
        totalAmount: { $sum: '$amount' },
        bidCount: { $sum: 1 },
      },
    },
    { $sort: { totalAmount: -1, bidCount: -1 } },
    { $limit: settings.topFanPoolSize },
  ]);

  if (topFans.length === 0) {
    return {
      source,
      relatedMedia,
      fansAlsoTip: [],
    };
  }

  const fanIds = topFans.map(fan => fan._id);
  const fanUsers = await User.find({ _id: { $in: fanIds } })
    .select('_id username profilePic uuid')
    .lean();
  const fanUserMap = new Map(fanUsers.map(user => [user._id.toString(), user]));

  const candidateIdSet = candidateRecords.map(record => record.media._id);
  const fanCandidateBids = await Bid.aggregate([
    {
      $match: {
        userId: { $in: fanIds },
        mediaId: { $in: candidateIdSet },
        status: 'active',
      },
    },
    {
      $group: {
        _id: {
          userId: '$userId',
          mediaId: '$mediaId',
        },
        totalAmount: { $sum: '$amount' },
        bidCount: { $sum: 1 },
      },
    },
    {
      $sort: {
        '_id.userId': 1,
        totalAmount: -1,
        bidCount: -1,
      },
    },
  ]);

  const candidateRecordMap = new Map(
    candidateRecords.map(record => [record.media._id.toString(), record])
  );
  const groupedFanCandidates = new Map();

  fanCandidateBids.forEach(entry => {
    const userKey = entry._id.userId.toString();
    const list = groupedFanCandidates.get(userKey) || [];
    list.push(entry);
    groupedFanCandidates.set(userKey, list);
  });

  const usedMediaIds = new Set();
  const fansAlsoTip = [];

  for (const fan of topFans) {
    const fanKey = fan._id.toString();
    const fanOptions = groupedFanCandidates.get(fanKey) || [];
    const fanUser = fanUserMap.get(fanKey);

    for (const option of fanOptions) {
      const mediaKey = option._id.mediaId.toString();
      if (usedMediaIds.has(mediaKey)) continue;

      const candidateRecord = candidateRecordMap.get(mediaKey);
      if (!candidateRecord) continue;

      usedMediaIds.add(mediaKey);
      fansAlsoTip.push(formatMediaEntry({
        ...candidateRecord,
        score: candidateRecord.score + (option.totalAmount * 0.35) + (option.bidCount * 8),
        reasons: [
          ...(candidateRecord.reasons || []).slice(0, 2),
          `${fanUser?.username || 'A top fan'} strongly supports this`,
        ],
        fanContext: {
          user: fanUser ? {
            _id: fanUser._id.toString(),
            username: fanUser.username,
            profilePic: fanUser.profilePic || null,
            uuid: fanUser.uuid || null,
          } : null,
          totalAmount: option.totalAmount,
          bidCount: option.bidCount,
          sourceSupportTotal: fan.totalAmount,
          sourceSupportBidCount: fan.bidCount,
        },
      }));
      break;
    }

    if (fansAlsoTip.length >= settings.fansAlsoTipLimit) break;
  }

  return {
    source,
    relatedMedia,
    fansAlsoTip,
  };
};

module.exports = {
  getRelatedPlaylistsForMedia,
};

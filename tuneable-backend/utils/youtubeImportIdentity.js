/**
 * YouTube import identity gates: unmatched review, admin confirm-as-new, execute allowlist.
 */

function youtubeItemNeedsIdentity(item) {
  if (!item) return false;
  if (item.identityConfidence === 'verified') return false;
  if (item.matchStatus === 'on_catalog' || item.matchStatus === 'in_library') return false;
  if (item.matchStatus === 'possible_match' && item.useSuggestedMatch !== false) return false;
  if (item.needsIdentity) return true;
  if (item.parseStatus === 'unparsed') return true;
  return item.matchStatus === 'new' && item.identityConfidence !== 'verified';
}

function youtubeOnlyExternalIds(externalIds = {}) {
  const next = {};
  if (externalIds.youtube) next.youtube = String(externalIds.youtube);
  return next;
}

function stripMusicBrainzFromExternal(externalMedia) {
  if (!externalMedia || typeof externalMedia !== 'object') return externalMedia || {};
  return {
    ...externalMedia,
    externalIds: youtubeOnlyExternalIds(externalMedia.externalIds || {}),
    identityConfidence: 'unverified',
    identityConfidenceSource: externalMedia.identityConfidenceSource === 'admin_confirmed'
      ? 'admin_confirmed'
      : 'none',
  };
}

function filterYouTubePreviewItems(items, { keepUnmatched = false } = {}) {
  const kept = [];
  let skippedNoMatch = 0;
  let needsIdentity = 0;
  for (const item of items || []) {
    const unmatchedNew = item.matchStatus === 'new' && item.identityConfidence !== 'verified';
    if (unmatchedNew) {
      skippedNoMatch += 1;
      if (!keepUnmatched) continue;
      needsIdentity += 1;
      kept.push({
        ...item,
        selected: false,
        needsIdentity: true,
        manualIdentityConfirmed: false,
      });
      continue;
    }
    kept.push(item);
  }
  return {
    items: kept,
    skippedNoMatch: keepUnmatched ? 0 : skippedNoMatch,
    needsIdentity,
  };
}

function applyAdminConfirmedYoutubeIdentity(item, { isAdminUser } = {}) {
  const title = String(item?.title || item?.externalMedia?.title || '').trim();
  const artist = String(item?.artist || item?.externalMedia?.artist || '').trim();
  if (!isAdminUser) {
    return { ok: false, reason: 'admin_required', item };
  }
  if (!item?.manualIdentityConfirmed) {
    return { ok: false, reason: 'not_confirmed', item };
  }
  if (!title || !artist) {
    return { ok: false, reason: 'missing_identity', item };
  }

  const prevExt = item.externalMedia && typeof item.externalMedia === 'object'
    ? item.externalMedia
    : {};
  const ext = {
    ...stripMusicBrainzFromExternal(prevExt),
    title,
    artist,
    identityConfidence: 'unverified',
    identityConfidenceSource: 'admin_confirmed',
  };

  return {
    ok: true,
    item: {
      ...item,
      title,
      artist,
      mediaId: null,
      matchStatus: 'new',
      identityConfidence: 'unverified',
      identityConfidenceSource: 'admin_confirmed',
      useSuggestedMatch: false,
      needsIdentity: false,
      manualIdentityConfirmed: true,
      suggestedTitle: null,
      suggestedArtist: null,
      externalMedia: ext,
    },
  };
}

function youtubeIdentityVerified(item) {
  return item?.identityConfidence === 'verified'
    || item?.crossRefStatus === 'musicbrainz_verified'
    || item?.crossRefStatus === 'isrc_verified'
    || item?.matchStatus === 'on_catalog'
    || item?.matchStatus === 'in_library'
    || (item?.matchStatus === 'possible_match' && item?.useSuggestedMatch === true);
}

/**
 * Decide whether a YouTube import row may be created/tipped.
 * Admin confirm-as-new wins over a rejected fuzzy suggestion.
 */
function resolveYoutubeExecuteItem(item, { isAdminUser } = {}) {
  if (item?.manualIdentityConfirmed) {
    const applied = applyAdminConfirmedYoutubeIdentity(item, { isAdminUser });
    if (applied.ok) return { allowed: true, item: applied.item };
    return { allowed: false, reason: applied.reason === 'admin_required' ? 'unverified_youtube' : applied.reason, item };
  }

  const rejectedFuzzy = item?.matchStatus === 'possible_match' && item?.useSuggestedMatch === false;
  if (rejectedFuzzy) {
    return { allowed: false, reason: 'rejected_youtube_match', item };
  }

  if (item?.mediaId || youtubeIdentityVerified(item)) {
    return { allowed: true, item };
  }
  return { allowed: false, reason: 'unverified_youtube', item };
}

module.exports = {
  youtubeItemNeedsIdentity,
  youtubeOnlyExternalIds,
  stripMusicBrainzFromExternal,
  filterYouTubePreviewItems,
  applyAdminConfirmedYoutubeIdentity,
  youtubeIdentityVerified,
  resolveYoutubeExecuteItem,
};

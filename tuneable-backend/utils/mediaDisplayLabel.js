/**
 * Labels stored on tips and ledger rows are a snapshot from bid time.
 * Admin lists should show the media's current title and artist, and only
 * fall back to that snapshot when the media document is gone.
 */

function isPopulatedMedia(value) {
  return Boolean(
    value
    && typeof value === 'object'
    && (typeof value.title === 'string' || Array.isArray(value.artist) || Array.isArray(value.author) || Array.isArray(value.host))
  );
}

function primaryCreditName(media) {
  if (!isPopulatedMedia(media)) return '';
  const lists = [media.artist, media.author, media.host];
  for (const list of lists) {
    if (!Array.isArray(list) || list.length === 0) continue;
    const entry = list[0];
    const name = typeof entry === 'string' ? entry : entry?.name;
    const trimmed = String(name || '').trim();
    if (trimmed) return trimmed;
  }
  return '';
}

function liveMediaTitle(media, fallback = 'Unknown') {
  const title = isPopulatedMedia(media) ? String(media.title || '').trim() : '';
  return title || String(fallback || '').trim() || 'Unknown';
}

function liveMediaArtist(media, fallback = 'Unknown') {
  const name = primaryCreditName(media);
  if (name) return name;
  const fallbackText = String(fallback || '').trim();
  return fallbackText || 'Unknown';
}

function mediaLabelFromBid(bid) {
  const populated = isPopulatedMedia(bid?.mediaId) ? bid.mediaId : null;
  const id = populated?._id || (populated ? null : bid?.mediaId) || null;
  return {
    _id: id,
    uuid: populated?.uuid || bid?.media_uuid || null,
    title: liveMediaTitle(populated, bid?.mediaTitle),
    artist: liveMediaArtist(populated, bid?.mediaArtist),
    artists: Array.isArray(populated?.artist) ? populated.artist : [],
    coverArt: populated?.coverArt || bid?.mediaCoverArt || null,
  };
}

module.exports = {
  isPopulatedMedia,
  primaryCreditName,
  liveMediaTitle,
  liveMediaArtist,
  mediaLabelFromBid,
};

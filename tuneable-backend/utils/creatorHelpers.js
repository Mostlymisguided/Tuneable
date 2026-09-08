/**
 * Utility functions for working with the hybrid creator subdocument structure
 * Creators are stored as: { name: String, userId: ObjectId }
 */

const { formatCreatorDisplay } = require('./artistParser');
const { isPodcastEpisode } = require('./mediaKinds');

/**
 * Convert string or array of strings to creator subdocuments
 * @param {string|string[]} input - Creator name(s)
 * @returns {Array} Array of creator subdocuments
 */
function toCreatorSubdocs(input) {
  if (!input) return [];
  const names = Array.isArray(input) ? input : [input];
  return names.filter(Boolean).map(name => ({
    name: typeof name === 'string' ? name : name.name || 'Unknown',
    userId: name.userId || null,
    verified: name.verified || false
  }));
}

/**
 * Extract creator names from subdocuments
 * @param {Array} creators - Array of creator subdocuments
 * @returns {string[]} Array of creator names
 */
function extractCreatorNames(creators) {
  if (!creators || !Array.isArray(creators)) return [];
  return creators.map(c => c.name).filter(Boolean);
}

/**
 * Get primary creator (first artist)
 * @param {Array} artists - Array of artist subdocuments
 * @returns {string} Primary artist name
 */
function getPrimaryArtist(artists) {
  if (!artists || !Array.isArray(artists) || artists.length === 0) {
    return 'Unknown Artist';
  }
  return artists[0].name || 'Unknown Artist';
}

/**
 * Format multiple artists for display
 * @param {Array} artists - Array of artist subdocuments
 * @param {Array} featuring - Array of featuring subdocuments
 * @returns {string} Formatted artist string
 */
function formatArtists(artists, featuring = []) {
  const artistNames = extractCreatorNames(artists);
  const featNames = extractCreatorNames(featuring);
  
  if (artistNames.length === 0) return 'Unknown Artist';
  
  let formatted = artistNames.join(' & ');
  
  if (featNames.length > 0) {
    formatted += ` feat. ${featNames.join(', ')}`;
  }
  
  return formatted;
}

function isPlaceholderCreatorLabel(value) {
  if (value == null) return true;
  const text = String(value).trim();
  if (!text) return true;
  return /^unknown(\s+(artist|author|podcast))?$/i.test(text);
}

function namesFromCreators(creators) {
  if (!creators) return [];
  if (typeof creators === 'string') {
    const name = creators.trim();
    return name && !isPlaceholderCreatorLabel(name) ? [name] : [];
  }
  if (!Array.isArray(creators)) return [];
  return creators
    .map((creator) => (typeof creator === 'string' ? creator : creator?.name))
    .map((name) => (typeof name === 'string' ? name.trim() : ''))
    .filter((name) => name && !isPlaceholderCreatorLabel(name));
}

function seriesTitleFromMedia(media) {
  if (!media) return '';
  const series = media.podcastSeries;
  if (series && typeof series === 'object' && typeof series.title === 'string') {
    const title = series.title.trim();
    if (title) return title;
  }
  if (typeof media.podcastTitle === 'string' && media.podcastTitle.trim()) {
    return media.podcastTitle.trim();
  }
  return '';
}

/**
 * Display label for mixed lists (library, home, charts).
 * Music uses artist/featuring; podcast episodes prefer the show title;
 * books use author. Does not write into the music `artist` field.
 */
function resolveCreatorDisplay(media, { fallback = 'Unknown Artist' } = {}) {
  if (!media) return fallback;

  if (!isPlaceholderCreatorLabel(media.creatorDisplay)) {
    return String(media.creatorDisplay).trim();
  }

  const fromArtists = formatCreatorDisplay(media.artist || [], media.featuring || []);
  if (fromArtists && !isPlaceholderCreatorLabel(fromArtists)) {
    return fromArtists;
  }

  if (isPodcastEpisode(media)) {
    const showTitle = seriesTitleFromMedia(media);
    if (showTitle) return showTitle;
  }

  const hosts = namesFromCreators(media.host);
  if (hosts.length) return hosts.join(', ');

  const authors = namesFromCreators(media.author);
  if (authors.length) return authors.join(', ');

  return fallback;
}

/**
 * Find creators by user ID
 * @param {Object} media - Media document
 * @param {string} userId - User ObjectId to search for
 * @returns {Array} Array of role/creator pairs where user is credited
 */
function findUserCredits(media, userId) {
  const credits = [];
  const roles = [
    'artist', 'producer', 'featuring', 'songwriter', 'composer',
    'host', 'guest', 'narrator',
    'director', 'cinematographer', 'editor',
    'author', 'label'
  ];
  
  roles.forEach(role => {
    if (media[role] && Array.isArray(media[role])) {
      media[role].forEach(creator => {
        if (creator.userId && creator.userId.toString() === userId.toString()) {
          credits.push({ role, name: creator.name });
        }
      });
    }
  });
  
  return credits;
}

/**
 * Link a creator name to a user ID
 * @param {Object} media - Media document
 * @param {string} creatorName - Name to link
 * @param {string} userId - User ObjectId to link to
 * @returns {number} Number of links created
 */
async function linkCreatorToUser(media, creatorName, userId) {
  let linksCreated = 0;
  const roles = [
    'artist', 'producer', 'featuring', 'songwriter', 'composer',
    'host', 'guest', 'narrator',
    'director', 'cinematographer', 'editor',
    'author', 'label'
  ];
  
  roles.forEach(role => {
    if (media[role] && Array.isArray(media[role])) {
      media[role].forEach(creator => {
        if (creator.name === creatorName && !creator.userId) {
          creator.userId = userId;
          linksCreated++;
        }
      });
    }
  });
  
  if (linksCreated > 0) {
    await media.save();
  }
  
  return linksCreated;
}

/**
 * Get all media where a user is credited
 * @param {string} userId - User ObjectId
 * @param {Object} Media - Media model
 * @returns {Promise<Array>} Array of media documents
 */
async function getMediaByUser(userId, Media) {
  const roles = [
    'artist.userId', 'producer.userId', 'featuring.userId', 
    'songwriter.userId', 'composer.userId',
    'host.userId', 'guest.userId', 'narrator.userId',
    'director.userId', 'cinematographer.userId', 'editor.userId',
    'author.userId'
  ];
  
  const query = {
    $or: roles.map(role => ({ [role]: userId }))
  };
  
  return await Media.find(query);
}

/**
 * Get all media where a creator name appears (regardless of user link)
 * @param {string} creatorName - Name to search for
 * @param {Object} Media - Media model
 * @returns {Promise<Array>} Array of media documents
 */
async function getMediaByCreatorName(creatorName, Media) {
  return await Media.find({
    creatorNames: creatorName
  });
}

module.exports = {
  toCreatorSubdocs,
  extractCreatorNames,
  getPrimaryArtist,
  formatArtists,
  isPlaceholderCreatorLabel,
  namesFromCreators,
  seriesTitleFromMedia,
  resolveCreatorDisplay,
  findUserCredits,
  linkCreatorToUser,
  getMediaByUser,
  getMediaByCreatorName
};


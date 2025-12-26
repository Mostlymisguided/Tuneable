const Party = require('../models/Party');
const Media = require('../models/Media');
const User = require('../models/User');
const mongoose = require('mongoose');
const crypto = require('crypto');
const { getCanonicalTag } = require('../utils/tagNormalizer');

// Configurable threshold from environment variable, default to 3
const TAG_PARTY_THRESHOLD = parseInt(process.env.TAG_PARTY_THRESHOLD || '3', 10);

/**
 * Capitalize the first letter of each word in a tag (title case)
 * Preserves acronyms like UK, DJ, R&B, etc.
 * @param {string} tag - The tag to capitalize
 * @returns {string} - The capitalized tag
 */
const capitalizeTag = (tag) => {
  if (!tag || typeof tag !== 'string') return tag;
  
  // Common acronyms that should be preserved as uppercase
  const acronyms = new Set(['uk', 'dj', 'edm', 'rnb', 'dnb', 'r&b', 'd&b']);
  
  return tag
    .trim()
    .split(/\s+/)
    .map(word => {
      const wordLower = word.toLowerCase();
      // Check if it's a known acronym (including special char variants)
      const isKnownAcronym = acronyms.has(wordLower);
      // Check if it's already in acronym format (all caps, 2-4 letters)
      const isAcronymFormat = /^[A-Z]{2,4}$/.test(word);
      // Check if it has special chars (might be an acronym like R&B, D&B)
      const hasSpecialChars = /[&\/\-]/.test(word);
      // Check if it's stylistically capitalized (camelCase, mixed case like WantTheGanja)
      const isStylized = /^[A-Z][a-z]+[A-Z]/.test(word) || /[a-z][A-Z]/.test(word);
      
      if (isKnownAcronym) {
        // Known acronym: make uppercase (handles both "uk" -> "UK" and "r&b" -> "R&B")
        return wordLower.split('').map((char, i) => {
          if (/[&\/\-]/.test(char)) return char; // Preserve special chars
          return char.toUpperCase();
        }).join('');
      }
      
      if (isAcronymFormat) {
        // Already in acronym format, preserve it
        return word;
      }
      
      if (isStylized) {
        // Stylistically capitalized (camelCase, mixed case), preserve as-is
        return word;
      }
      
      if (hasSpecialChars) {
        // Has special chars but not a known acronym - capitalize properly
        // e.g., "r&b" -> "R&B", "d&b" -> "D&B"
        return word.split('').map((char, i) => {
          if (/[&\/\-]/.test(char)) return char; // Preserve special chars
          if (i === 0 || (i > 0 && /[&\/\-]/.test(word[i-1]))) {
            return char.toUpperCase(); // Capitalize first char and chars after special chars
          }
          return char.toLowerCase();
        }).join('');
      }
      
      // Regular word: capitalize first letter, lowercase rest
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
};

/**
 * Generate a URL-friendly slug from a tag
 * @param {string} tag - The tag to convert to slug
 * @returns {string} - The slug
 */
const generateSlug = (tag) => {
  if (!tag || typeof tag !== 'string') return '';
  
  return tag
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
};

/**
 * Check if a tag party should be created based on threshold
 * Uses fuzzy matching to count all variations of the tag
   * Only counts music media (excludes podcasts and other non-music content)
 * @param {string} tag - The tag to check (will be normalized)
 * @returns {Promise<boolean>} - True if threshold is met
 */
const shouldCreateTagParty = async (tag) => {
  if (!tag || typeof tag !== 'string') return false;
  
  const canonicalTag = getCanonicalTag(tag);
  
  // Podcast-related content forms to exclude
  const podcastForms = ['podcast', 'podcastseries', 'episode', 'podcastepisode'];
  
  // Count only music media with tags that match canonically
  // This handles variations like D&b, Dnb, Drum and Bass, etc.
  // Only includes media where contentType includes 'music' and contentForm does not include podcast forms
  // Note: contentType and contentForm are arrays, so we use $in for matching and $nin for exclusion
  const allMedia = await Media.find({
    tags: { $exists: true, $ne: [] },
    status: { $ne: 'vetoed' },
    contentType: 'music', // MongoDB matches if 'music' is in the array
    contentForm: { $nin: podcastForms } // Exclude any media where contentForm array contains podcast forms
  }).select('tags contentType contentForm').lean();
  
  let count = 0;
  for (const media of allMedia) {
    // Double-check: ensure contentType includes 'music' and contentForm doesn't include podcast forms
    // This is defensive programming in case the query doesn't fully filter
    const isMusic = media.contentType && (
      Array.isArray(media.contentType) 
        ? media.contentType.includes('music')
        : media.contentType === 'music'
    );
    const isPodcast = media.contentForm && (
      Array.isArray(media.contentForm)
        ? media.contentForm.some(form => podcastForms.includes(form))
        : podcastForms.includes(media.contentForm)
    );
    
    // Skip if not music or if it's a podcast
    if (!isMusic || isPodcast) continue;
    
    if (media.tags && Array.isArray(media.tags)) {
      for (const mediaTag of media.tags) {
        if (getCanonicalTag(mediaTag) === canonicalTag) {
          count++;
          break; // Count media once even if it has multiple matching tags
        }
      }
    }
  }
  
  return count >= TAG_PARTY_THRESHOLD;
};

/**
 * Check if a tag party already exists for a given tag (using fuzzy matching)
 * Uses canonicalTag field for fast lookups
 * @param {string} tag - The tag to check (will be normalized)
 * @returns {Promise<Party|null>} - The existing party or null
 */
const getExistingTagParty = async (tag) => {
  if (!tag || typeof tag !== 'string') return null;
  
  const canonicalTag = getCanonicalTag(tag);
  
  // Fast lookup using canonicalTag index
  const party = await Party.findOne({
    type: 'tag',
    canonicalTag: canonicalTag
  });
  
  if (party) return party;
  
  // Fallback: if canonicalTag not set (for old parties), check tags array
  // This handles legacy parties that don't have canonicalTag yet
  const allTagParties = await Party.find({ 
    type: 'tag',
    canonicalTag: { $exists: false } // Only check parties without canonicalTag
  }).select('tags slug').lean();
  
  // Find party where any tag matches canonically
  for (const legacyParty of allTagParties) {
    if (legacyParty.tags && Array.isArray(legacyParty.tags)) {
      for (const partyTag of legacyParty.tags) {
        if (getCanonicalTag(partyTag) === canonicalTag) {
          // Found a match, return full party
          return await Party.findById(legacyParty._id);
        }
      }
    }
  }
  
  return null;
};

/**
 * Generate unique party code from ObjectId
 * @param {mongoose.Types.ObjectId} objectId - The ObjectId to hash
 * @returns {string} - The party code
 */
const deriveCodeFromPartyId = (objectId) => {
  return crypto.createHash('md5').update(objectId.toString()).digest('hex').substring(0, 6).toUpperCase();
};

/**
 * Create a tag party for a given tag
 * @param {string} tag - The tag to create a party for (will be normalized to title case)
 * @returns {Promise<Party>} - The created party
 */
const createTagParty = async (tag) => {
  if (!tag || typeof tag !== 'string') {
    throw new Error('Tag is required to create a tag party');
  }
  
  // Normalize tag to title case
  const normalizedTag = capitalizeTag(tag);
  const slug = generateSlug(normalizedTag);
  
  // Check if party already exists (pass original tag for fuzzy matching)
  const existingParty = await getExistingTagParty(tag);
  if (existingParty) {
    console.log(`ℹ️  Tag party already exists for tag: ${normalizedTag}`);
    return existingParty;
  }
  
  // Get Tuneable user as host
  const tuneableUser = await User.findOne({ username: 'Tuneable' });
  if (!tuneableUser) {
    console.error('❌ Tuneable user not found. Cannot create tag party without host.');
    throw new Error('Tuneable user not found. Cannot create tag party without host.');
  }
  
  // Generate MongoDB ObjectId manually so we can hash it for partyCode
  const objectId = new mongoose.Types.ObjectId();
  const partyCode = deriveCodeFromPartyId(objectId);
  
  // Get canonical tag for fast lookups
  const canonicalTag = getCanonicalTag(tag);
  
  // Create the tag party
  const party = new Party({
    _id: objectId,
    name: `${normalizedTag} Party`, // Party name includes "Party" suffix
    host: tuneableUser._id,
    host_uuid: tuneableUser.uuid,
    partyCode,
    location: 'Global', // Tag parties are global
    mediaSource: 'mixed', // Supports both YouTube and uploads
    minimumBid: 0.01, // 1p default minimum bid
    type: 'tag',
    privacy: 'public', // Tag parties are public by default
    status: 'active', // Tag parties are active immediately
    tags: [normalizedTag], // Store the normalized tag
    slug, // Store the slug for URL access
    canonicalTag, // Store canonical tag for fast fuzzy matching
    description: `Discover and support music tagged with "${normalizedTag}"`,
    startTime: new Date(),
    watershed: true
  });
  
  await party.save();
  console.log(`✅ Created tag party for tag: ${normalizedTag} (slug: ${slug})`);
  
  return party;
};

/**
 * Check and create tag parties for all tags in a media item
 * This is called after media is saved
 * @param {Array<string>} tags - Array of tags from the media
 * @returns {Promise<Array<Party>>} - Array of created/existing tag parties
 */
const checkAndCreateTagParties = async (tags) => {
  if (!tags || !Array.isArray(tags) || tags.length === 0) {
    return [];
  }
  
  const createdParties = [];
  
  // Process each tag
  for (const tag of tags) {
    if (!tag || typeof tag !== 'string') continue;
    
    const normalizedTag = capitalizeTag(tag);
    
    try {
      // Check if threshold is met (pass original tag for fuzzy matching)
      const shouldCreate = await shouldCreateTagParty(tag);
      if (!shouldCreate) {
        console.log(`ℹ️  Tag "${normalizedTag}" does not meet threshold (${TAG_PARTY_THRESHOLD} media items)`);
        continue;
      }
      
      // Check if party already exists (pass original tag for fuzzy matching)
      const existingParty = await getExistingTagParty(tag);
      if (existingParty) {
        console.log(`ℹ️  Tag party already exists for tag: ${normalizedTag}`);
        createdParties.push(existingParty);
        continue;
      }
      
      // Create the tag party
      const party = await createTagParty(normalizedTag);
      createdParties.push(party);
    } catch (error) {
      console.error(`❌ Error processing tag party for "${normalizedTag}":`, error);
      // Continue processing other tags even if one fails
    }
  }
  
  return createdParties;
};

module.exports = {
  shouldCreateTagParty,
  getExistingTagParty,
  createTagParty,
  checkAndCreateTagParties,
  generateSlug,
  capitalizeTag,
  TAG_PARTY_THRESHOLD
};


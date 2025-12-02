const Party = require('../models/Party');
const Media = require('../models/Media');
const User = require('../models/User');
const mongoose = require('mongoose');
const crypto = require('crypto');

const TAG_PARTY_THRESHOLD = 10; // Minimum number of media items with a tag before creating a party

/**
 * Capitalize the first letter of each word in a tag (title case)
 * @param {string} tag - The tag to capitalize
 * @returns {string} - The capitalized tag
 */
const capitalizeTag = (tag) => {
  if (!tag || typeof tag !== 'string') return tag;
  return tag
    .trim()
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
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
 * @param {string} tag - The tag to check (should be normalized to title case)
 * @returns {Promise<boolean>} - True if threshold is met
 */
const shouldCreateTagParty = async (tag) => {
  if (!tag || typeof tag !== 'string') return false;
  
  const normalizedTag = capitalizeTag(tag);
  const lowerTag = normalizedTag.toLowerCase().trim();
  
  // Count media items with this tag (case-insensitive match)
  // Tags in Media are stored as strings, so we need to check if any tag matches (case-insensitive)
  const mediaCount = await Media.countDocuments({
    tags: { 
      $elemMatch: { 
        $regex: new RegExp(`^${lowerTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') 
      } 
    }
  });
  
  return mediaCount >= TAG_PARTY_THRESHOLD;
};

/**
 * Check if a tag party already exists for a given tag
 * @param {string} tag - The tag to check (should be normalized to title case)
 * @returns {Promise<Party|null>} - The existing party or null
 */
const getExistingTagParty = async (tag) => {
  if (!tag || typeof tag !== 'string') return null;
  
  const normalizedTag = capitalizeTag(tag);
  const slug = generateSlug(normalizedTag);
  
  // First try to find by slug (most reliable)
  const partyBySlug = await Party.findOne({ slug, type: 'tag' });
  if (partyBySlug) return partyBySlug;
  
  // Fallback: find by tag match (case-insensitive)
  const lowerTag = normalizedTag.toLowerCase().trim();
  const partyByTag = await Party.findOne({
    type: 'tag',
    tags: { 
      $elemMatch: { 
        $regex: new RegExp(`^${lowerTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') 
      } 
    }
  });
  
  return partyByTag;
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
  
  // Check if party already exists
  const existingParty = await getExistingTagParty(normalizedTag);
  if (existingParty) {
    console.log(`ℹ️  Tag party already exists for tag: ${normalizedTag}`);
    return existingParty;
  }
  
  // Get Tuneable user as host
  const tuneableUser = await User.findOne({ username: 'Tuneable' });
  if (!tuneableUser) {
    throw new Error('Tuneable user not found. Cannot create tag party without host.');
  }
  
  // Generate MongoDB ObjectId manually so we can hash it for partyCode
  const objectId = new mongoose.Types.ObjectId();
  const partyCode = deriveCodeFromPartyId(objectId);
  
  // Create the tag party
  const party = new Party({
    _id: objectId,
    name: normalizedTag, // Party name is the tag itself
    host: tuneableUser._id,
    host_uuid: tuneableUser.uuid,
    partyCode,
    location: 'Global', // Tag parties are global
    mediaSource: 'youtube', // Default media source
    minimumBid: 0.33, // Default minimum bid
    type: 'tag',
    privacy: 'public', // Tag parties are public by default
    status: 'active', // Tag parties are active immediately
    tags: [normalizedTag], // Store the normalized tag
    slug, // Store the slug for URL access
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
      // Check if threshold is met
      const shouldCreate = await shouldCreateTagParty(normalizedTag);
      if (!shouldCreate) {
        console.log(`ℹ️  Tag "${normalizedTag}" does not meet threshold (${TAG_PARTY_THRESHOLD} media items)`);
        continue;
      }
      
      // Check if party already exists
      const existingParty = await getExistingTagParty(normalizedTag);
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


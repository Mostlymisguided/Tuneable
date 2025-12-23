/**
 * Normalize existing tags in Media documents
 * 
 * This script:
 * 1. Finds all Media documents with tags
 * 2. Gets the canonical form of each tag (e.g., "r&b" -> "rnb")
 * 3. Capitalizes it for display (e.g., "rnb" -> "Rnb")
 * 4. Updates the Media document
 * 
 * Usage:
 *   node scripts/normalizeMediaTags.js --dry-run  # Preview changes
 *   node scripts/normalizeMediaTags.js             # Apply changes
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Media = require('../models/Media');
const { getCanonicalTag } = require('../utils/tagNormalizer');
const { capitalizeTag } = require('../services/tagPartyService');

const DRY_RUN = process.argv.includes('--dry-run');

/**
 * Normalize a tag: get canonical form, then capitalize for display
 * @param {string} tag - The tag to normalize
 * @returns {string} - Normalized and capitalized tag
 */
function normalizeTagForStorage(tag) {
  if (!tag || typeof tag !== 'string') return tag;
  
  // Get canonical form (e.g., "r&b" -> "R&B" or "rnb" -> "R&B")
  const canonical = getCanonicalTag(tag);
  
  // If canonical already looks like a display format (has mixed case or special chars),
  // use it as-is. Otherwise capitalize it.
  // Check if it has special characters or mixed case (likely already formatted)
  const hasSpecialChars = /[&\/\-\s]/.test(canonical);
  const hasMixedCase = canonical !== canonical.toLowerCase() && canonical !== canonical.toUpperCase();
  
  if (hasSpecialChars || hasMixedCase) {
    // Already in display format, use as-is
    return canonical;
  }
  
  // Capitalize for display (e.g., "rnb" -> "Rnb", "electronic" -> "Electronic")
  return capitalizeTag(canonical);
}

async function normalizeMediaTags() {
  if (!process.env.MONGODB_URI) {
    console.error('❌ Missing MONGODB_URI environment variable');
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    if (DRY_RUN) {
      console.log('🔍 DRY RUN MODE - No changes will be saved\n');
    }

    const cursor = Media.find({ 
      tags: { $exists: true, $ne: [] } 
    }).cursor();
    
    let processed = 0;
    let updated = 0;
    let tagChanges = new Map(); // Track tag transformations for reporting
    
    for await (const media of cursor) {
      if (!media.tags || !Array.isArray(media.tags) || media.tags.length === 0) {
        continue;
      }
      
      const originalTags = [...media.tags];
      const normalizedTags = media.tags.map(tag => {
        const normalized = normalizeTagForStorage(tag);
        
        // Track transformations for reporting
        if (normalized !== tag) {
          const key = `${tag} -> ${normalized}`;
          tagChanges.set(key, (tagChanges.get(key) || 0) + 1);
        }
        
        return normalized;
      });
      
      // Remove duplicates while preserving order
      const uniqueNormalizedTags = [...new Set(normalizedTags)];
      
      // Check if tags changed
      const tagsChanged = 
        originalTags.length !== uniqueNormalizedTags.length ||
        originalTags.some((tag, index) => tag !== uniqueNormalizedTags[index]);
      
      if (tagsChanged) {
        if (DRY_RUN) {
          console.log(`📝 Would update: "${media.title}" (${media._id})`);
          console.log(`   Before: [${originalTags.join(', ')}]`);
          console.log(`   After:  [${uniqueNormalizedTags.join(', ')}]`);
        } else {
          media.tags = uniqueNormalizedTags;
          await media.save();
        }
        updated++;
      }
      
      processed++;
      
      if (processed % 100 === 0) {
        console.log(`📊 Processed ${processed} media items, updated ${updated}...`);
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total media items processed: ${processed}`);
    console.log(`Media items ${DRY_RUN ? 'that would be' : ''} updated: ${updated}`);
    
    if (tagChanges.size > 0) {
      console.log('\n📋 Tag Transformations:');
      const sortedChanges = Array.from(tagChanges.entries())
        .sort((a, b) => b[1] - a[1]); // Sort by count
      
      sortedChanges.forEach(([transformation, count]) => {
        console.log(`   ${transformation}: ${count} occurrence${count !== 1 ? 's' : ''}`);
      });
    }
    
    if (DRY_RUN) {
      console.log('\n💡 Run without --dry-run to apply these changes');
    } else {
      console.log('\n✅ Tag normalization complete!');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
  }
}

// Run the migration
normalizeMediaTags()
  .then(() => {
    console.log('✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });


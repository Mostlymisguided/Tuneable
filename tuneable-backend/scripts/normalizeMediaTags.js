/**
 * Normalize existing tags in Media documents
 *
 * Uses normalizeTagForStorage (aliases + Title Case) for every media.tags entry.
 *
 * Usage:
 *   node scripts/normalizeMediaTags.js --dry-run  # Preview changes
 *   node scripts/normalizeMediaTags.js             # Apply changes
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Media = require('../models/Media');
const { normalizeTagForStorage, tagsMatch } = require('../utils/tagNormalizer');

const DRY_RUN = process.argv.includes('--dry-run');

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
      tags: { $exists: true, $ne: [] },
    }).cursor();

    let processed = 0;
    let updated = 0;
    const tagChanges = new Map();

    for await (const media of cursor) {
      if (!media.tags || !Array.isArray(media.tags) || media.tags.length === 0) {
        continue;
      }

      const originalTags = [...media.tags];
      const normalizedTags = [];
      for (const tag of media.tags) {
        const normalized = normalizeTagForStorage(tag);
        if (!normalized) continue;

        if (!normalizedTags.some((t) => tagsMatch(t, normalized))) {
          normalizedTags.push(normalized);
        }

        if (tag !== normalized) {
          const key = `${tag} → ${normalized}`;
          tagChanges.set(key, (tagChanges.get(key) || 0) + 1);
        }
      }

      processed++;

      const tagsChanged =
        originalTags.length !== normalizedTags.length ||
        originalTags.some((tag, i) => tag !== normalizedTags[i]);

      if (tagsChanged) {
        if (!DRY_RUN) {
          media.tags = normalizedTags;
          await media.save();
        }
        updated++;
        if (updated <= 20 || updated % 50 === 0) {
          console.log(
            `${DRY_RUN ? '[dry-run] ' : ''}Updated "${media.title}": [${originalTags.join(', ')}] → [${normalizedTags.join(', ')}]`
          );
        }
      }
    }

    console.log(`\n📊 Processed ${processed} media items, ${updated} would be/were updated`);
    if (tagChanges.size > 0) {
      console.log('\nTag transformations:');
      [...tagChanges.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 40)
        .forEach(([change, count]) => console.log(`  ${change} (${count})`));
    }

    console.log('\n✅ Tag normalization complete!');
    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

normalizeMediaTags();

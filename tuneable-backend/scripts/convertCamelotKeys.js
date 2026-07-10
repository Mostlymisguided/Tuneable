/**
 * Normalize Media.key values to long-form standard notation.
 *
 * Examples:
 *   8A / 8m  → "A Minor"
 *   8B / 8d  → "C Major"
 *   Am / amin → "A Minor"
 *   C / Cmaj → "C Major"
 *   F#m      → "F-sharp Minor"
 *   Bb       → "B-flat Major"
 *
 * Usage:
 *   node scripts/convertCamelotKeys.js --dry-run   # Preview changes
 *   node scripts/convertCamelotKeys.js             # Apply changes
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Media = require('../models/Media');
const { toLongFormKey } = require('../utils/keyNormalizer');

const DRY_RUN = process.argv.includes('--dry-run');

async function convertKeysToLongForm() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('❌ Missing MONGO_URI / MONGODB_URI environment variable');
    process.exit(1);
  }

  try {
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    if (DRY_RUN) {
      console.log('🔍 DRY RUN MODE — no changes will be saved\n');
    }

    const cursor = Media.find({
      key: { $exists: true, $nin: [null, ''] },
    })
      .select('_id title key')
      .cursor();

    let processed = 0;
    let updated = 0;
    let skipped = 0;
    let unrecognized = 0;
    /** @type {Map<string, number>} */
    const conversions = new Map();
    /** @type {Map<string, number>} */
    const unrecognizedSamples = new Map();

    for await (const media of cursor) {
      processed++;
      const original = media.key;
      if (!original || typeof original !== 'string') {
        skipped++;
        continue;
      }

      const converted = toLongFormKey(original);
      if (!converted) {
        unrecognized++;
        const sample = String(original).trim();
        unrecognizedSamples.set(sample, (unrecognizedSamples.get(sample) || 0) + 1);
        skipped++;
        continue;
      }

      if (converted === original) {
        skipped++;
        continue;
      }

      const changeKey = `${original} → ${converted}`;
      conversions.set(changeKey, (conversions.get(changeKey) || 0) + 1);

      if (DRY_RUN) {
        console.log(`📝 Would update: "${media.title || '(untitled)'}" (${media._id})`);
        console.log(`   ${original} → ${converted}`);
      } else {
        await Media.updateOne({ _id: media._id }, { $set: { key: converted } });
      }
      updated++;

      if (processed % 100 === 0) {
        console.log(`📊 Processed ${processed}, ${DRY_RUN ? 'would update' : 'updated'} ${updated}...`);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    console.log(`Media with key field: ${processed}`);
    console.log(`Media items ${DRY_RUN ? 'that would be ' : ''}updated: ${updated}`);
    console.log(`Skipped (already long form or empty): ${skipped - unrecognized}`);
    console.log(`Unrecognized key values: ${unrecognized}`);

    if (conversions.size > 0) {
      console.log('\nConversions:');
      [...conversions.entries()]
        .sort((a, b) => b[1] - a[1])
        .forEach(([change, count]) => {
          console.log(`  ${change}  (${count})`);
        });
    } else {
      console.log('\nNo keys needed conversion.');
    }

    if (unrecognizedSamples.size > 0) {
      console.log('\nUnrecognized samples (left unchanged):');
      [...unrecognizedSamples.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 30)
        .forEach(([value, count]) => {
          console.log(`  "${value}"  (${count})`);
        });
    }

    if (DRY_RUN && updated > 0) {
      console.log('\nRe-run without --dry-run to apply these changes.');
    }
  } catch (error) {
    console.error('❌ Conversion error:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
    console.log('👋 Disconnected from MongoDB');
  }
}

convertKeysToLongForm();

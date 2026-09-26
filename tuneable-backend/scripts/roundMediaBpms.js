/**
 * Round Media.bpm values to the nearest whole number.
 *
 * Usage:
 *   node scripts/roundMediaBpms.js --dry-run   # Preview changes
 *   node scripts/roundMediaBpms.js             # Apply changes
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Media = require('../models/Media');
const { roundBpm } = require('../utils/bpm');

const DRY_RUN = process.argv.includes('--dry-run');

async function roundMediaBpms() {
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
      bpm: { $exists: true, $nin: [null, 0] },
    })
      .select('_id title bpm')
      .cursor();

    let processed = 0;
    let updated = 0;
    let skipped = 0;
    /** @type {Map<string, number>} */
    const conversions = new Map();

    for await (const media of cursor) {
      processed++;
      const original = media.bpm;
      const rounded = roundBpm(original);
      if (rounded == null || rounded === original) {
        skipped++;
        continue;
      }

      const changeKey = `${original} → ${rounded}`;
      conversions.set(changeKey, (conversions.get(changeKey) || 0) + 1);

      if (DRY_RUN) {
        console.log(`📝 Would update: "${media.title || '(untitled)'}" (${media._id})  ${changeKey}`);
      } else {
        media.bpm = rounded;
        await media.save();
      }
      updated++;
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    console.log(`Media with BPM: ${processed}`);
    console.log(`Media items ${DRY_RUN ? 'that would be ' : ''}updated: ${updated}`);
    console.log(`Skipped (already whole numbers): ${skipped}`);

    if (conversions.size > 0) {
      console.log('\nConversions:');
      [...conversions.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 40)
        .forEach(([change, count]) => {
          console.log(`  ${change}  (${count})`);
        });
    } else {
      console.log('\nNo BPMs needed rounding.');
    }

    if (DRY_RUN && updated > 0) {
      console.log('\nRe-run without --dry-run to apply these changes.');
    }
  } catch (error) {
    console.error('❌ Rounding error:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
    console.log('👋 Disconnected from MongoDB');
  }
}

roundMediaBpms();

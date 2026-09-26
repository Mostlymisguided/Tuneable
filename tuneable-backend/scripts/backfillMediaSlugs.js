/**
 * Backfill Media.slug for existing documents.
 *
 * Usage:
 *   node scripts/backfillMediaSlugs.js --dry-run
 *   node scripts/backfillMediaSlugs.js --execute --limit 500
 *   node scripts/backfillMediaSlugs.js --execute --production
 *
 * Requires: MONGO_URI (or MONGODB_URI)
 */

const path = require('path');
const args = process.argv.slice(2);
const useProductionEnv = args.includes('--production');

require('dotenv').config({
  path: useProductionEnv
    ? path.join(__dirname, '../.env.production')
    : path.join(__dirname, '../.env'),
});

const mongoose = require('mongoose');
const Media = require('../models/Media');

const DRY_RUN = !args.includes('--execute');
const limitArg = args.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : (args.includes('--limit')
  ? parseInt(args[args.indexOf('--limit') + 1], 10)
  : 0);

async function run() {
  const mongoURI = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoURI) {
    console.error('MONGO_URI is required');
    process.exit(1);
  }

  await mongoose.connect(mongoURI);
  console.log(`Connected. ${DRY_RUN ? 'DRY RUN' : 'EXECUTE'}`);

  const query = {
    $or: [{ slug: { $exists: false } }, { slug: null }, { slug: '' }],
  };
  const total = await Media.countDocuments(query);
  console.log(`Media missing slug: ${total}`);

  const cursor = Media.find(query)
    .select('title artist author host creatorDisplay contentForm podcastSeries uuid')
    .populate('podcastSeries', 'title')
    .cursor();
  let updated = 0;
  let failed = 0;

  for await (const media of cursor) {
    if (LIMIT && updated >= LIMIT) break;
    try {
      const slug = await Media.generateUniqueSlug(media);
      if (DRY_RUN) {
        console.log(`would set ${media._id} (${media.title}) → ${slug}`);
      } else {
        await Media.updateOne({ _id: media._id }, { $set: { slug } });
      }
      updated += 1;
      if (updated % 100 === 0) console.log(`... ${updated}`);
    } catch (err) {
      failed += 1;
      console.error(`failed ${media._id}:`, err.message);
    }
  }

  console.log(`Done. ${DRY_RUN ? 'Would update' : 'Updated'} ${updated}. Failed ${failed}.`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

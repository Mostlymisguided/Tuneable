/**
 * Give artist-title slugs back to the live tune when a deleted duplicate still holds them.
 *
 * Usage:
 *   node scripts/repairDeletedSlugs.js --dry-run --production
 *   node scripts/repairDeletedSlugs.js --execute --production
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
const {
  previewDeletedSlugHandoff,
  handoffDeletedSlug,
} = require('../services/mediaSlugHandoff');

const DRY_RUN = !args.includes('--execute');

async function run() {
  const mongoURI = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoURI) {
    console.error('MONGO_URI is required');
    process.exit(1);
  }

  await mongoose.connect(mongoURI);
  console.log(DRY_RUN ? 'DRY RUN' : 'EXECUTE');

  const deleted = await Media.find({
    status: 'deleted',
    slug: { $exists: true, $nin: [null, ''] },
  }).select('_id title artist slug status uuid');

  console.log(`Deleted media still holding a slug: ${deleted.length}`);

  let handed = 0;
  let skipped = 0;

  for (const media of deleted) {
    // eslint-disable-next-line no-await-in-loop
    const successor = await previewDeletedSlugHandoff(Media, media);
    if (!successor) {
      skipped += 1;
      console.log(`skip ${media.slug} (${media.title}) — no single live successor`);
      continue;
    }
    console.log(`${media.slug}  →  ${successor.slug}  (${successor.title})`);
    if (!DRY_RUN) {
      // eslint-disable-next-line no-await-in-loop
      const result = await handoffDeletedSlug(Media, media);
      if (!result) {
        console.error(`failed ${media.slug}`);
        skipped += 1;
        continue;
      }
    }
    handed += 1;
  }

  console.log(`${DRY_RUN ? 'Would hand off' : 'Handed off'} ${handed}. Skipped ${skipped}.`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

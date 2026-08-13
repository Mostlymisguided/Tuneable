/**
 * Mark library-imported / operator-seeded uploads as rights pending
 * so they are not playable until a verified claim.
 *
 * Dry run by default. Pass --execute to write.
 *
 *   node scripts/gateLibraryImportPlayback.js
 *   node scripts/gateLibraryImportPlayback.js --execute
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Media = require('../models/Media');

const LIBRARY_SOURCES = [
  'library_import',
  'library_import_curator',
  'bulk_library_import',
  'rekordbox',
  'itunes_library',
  'itunes',
];

const LIBRARY_METHODS = [
  'library_import_curator',
  'bulk_library_import',
];

function isExecute() {
  return process.argv.includes('--execute');
}

async function run() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error('MONGO_URI is required');
  }

  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  const query = {
    'sources.upload': { $exists: true, $nin: [null, ''] },
    $or: [
      { importSource: { $in: LIBRARY_SOURCES } },
      { importedBy: { $ne: null } },
      { 'mediaOwners.verificationSource': { $in: LIBRARY_SOURCES } },
      { 'mediaOwners.verificationMethod': { $in: LIBRARY_METHODS } },
    ],
  };

  const matches = await Media.find(query)
    .select('title artist rightsStatus rightsCleared importSource importedBy sources.upload')
    .lean();

  const toUpdate = matches.filter(
    (m) => m.rightsStatus !== 'pending' || m.rightsCleared === true
  );

  console.log(`Library-imported uploads: ${matches.length}`);
  console.log(`Need rightsStatus=pending / rightsCleared=false: ${toUpdate.length}`);
  toUpdate.slice(0, 25).forEach((m) => {
    const artist = Array.isArray(m.artist) && m.artist[0]?.name ? m.artist[0].name : m.artist;
    console.log(`  - ${artist} – ${m.title} [${m.rightsStatus}/${m.rightsCleared}] import=${m.importSource || ''}`);
  });
  if (toUpdate.length > 25) console.log(`  …and ${toUpdate.length - 25} more`);

  if (!isExecute()) {
    console.log('\nDry run. Re-run with --execute to write.');
    await mongoose.disconnect();
    return;
  }

  const ids = toUpdate.map((m) => m._id);
  if (ids.length === 0) {
    console.log('Nothing to update.');
    await mongoose.disconnect();
    return;
  }

  const result = await Media.updateMany(
    { _id: { $in: ids } },
    {
      $set: {
        rightsStatus: 'pending',
        rightsCleared: false,
      },
    }
  );

  console.log(`Updated ${result.modifiedCount} media documents.`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

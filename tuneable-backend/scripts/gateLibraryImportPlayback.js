/**
 * Mark hosted music that is not a verified original upload as rights pending
 * so it is not playable until a verified claim.
 *
 * Dry run by default. Pass --execute to write.
 *
 *   node scripts/gateLibraryImportPlayback.js
 *   node scripts/gateLibraryImportPlayback.js --execute
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Media = require('../models/Media');
const { shouldGateHostedMusic, pendingRightsFields } = require('../utils/mediaRights');

function isExecute() {
  return process.argv.includes('--execute');
}

function ownerMethod(media) {
  const owner = (media.mediaOwners || [])[0];
  return owner?.verificationMethod || 'none';
}

async function run() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error('MONGO_URI is required');
  }

  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  const matches = await Media.find({
    status: { $ne: 'deleted' },
    'sources.upload': { $exists: true, $nin: [null, ''] },
  })
    .select('title artist rightsStatus rightsCleared importSource importedBy contentForm contentType mediaOwners sources.upload')
    .lean();

  const toUpdate = matches.filter(shouldGateHostedMusic);
  const leaveUnchanged = matches.length - toUpdate.length;

  const byImport = {};
  const byMethod = {};
  for (const m of toUpdate) {
    const src = m.importSource || '(none)';
    const method = ownerMethod(m);
    byImport[src] = (byImport[src] || 0) + 1;
    byMethod[method] = (byMethod[method] || 0) + 1;
  }

  console.log(`Hosted uploads: ${matches.length}`);
  console.log(`Leave unchanged: ${leaveUnchanged}`);
  console.log(`Gate to pending: ${toUpdate.length}`);
  console.log('By importSource:', byImport);
  console.log('By verificationMethod:', byMethod);

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
    { $set: pendingRightsFields() }
  );

  console.log(`Updated ${result.modifiedCount} media documents.`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

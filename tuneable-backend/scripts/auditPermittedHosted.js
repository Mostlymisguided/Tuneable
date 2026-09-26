/**
 * List hosted music marked permitted (playable on the default chart).
 *
 * A row is kept when an owner note, ownership-history note, or rights-case
 * note actually describes the off-platform permission. The stock attach stamp
 * does not count. Uncertain rows are listed on a dry run and set back to
 * pending with --execute. Listings and escrow are not refunded or removed.
 *
 *   node scripts/auditPermittedHosted.js
 *   node scripts/auditPermittedHosted.js --execute
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Media = require('../models/Media');
const RightsCase = require('../models/RightsCase');
const { pendingRightsFields } = require('../utils/mediaRights');
const { isPodcastLike, isWrittenMedia } = require('../utils/mediaPlayability');
const { describePermittedPermission } = require('../utils/permittedAudit');

const AUDIT_NOTE = 'App review audit: permitted without a describable off-platform permission note; playback returned to pending. Listing and escrow unchanged.';

function isExecute() {
  return process.argv.includes('--execute');
}

function artistLabel(media) {
  const names = (media.artist || [])
    .map((person) => (typeof person === 'string' ? person : person?.name))
    .filter(Boolean);
  return names.join(', ') || '(no artist)';
}

function mongoUri() {
  return process.env.MONGO_URI || process.env.MONGODB_URI || '';
}

async function run() {
  const uri = mongoUri();
  if (!uri) {
    throw new Error('MONGO_URI or MONGODB_URI is required');
  }

  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  const matches = await Media.find({
    status: { $ne: 'deleted' },
    rightsStatus: 'permitted',
    'sources.upload': { $exists: true, $nin: [null, ''] },
  })
    .select('title artist rightsStatus rightsCleared contentForm contentType mediaOwners ownershipHistory uuid')
    .lean();

  const hostedMusic = matches.filter((media) => !isPodcastLike(media) && !isWrittenMedia(media));
  const cases = hostedMusic.length
    ? await RightsCase.find({ mediaId: { $in: hostedMusic.map((media) => media._id) } })
      .select('mediaId status notes outreach.direction outreach.body')
      .lean()
    : [];
  const casesByMedia = new Map();
  for (const rightsCase of cases) {
    const key = String(rightsCase.mediaId);
    const list = casesByMedia.get(key) || [];
    list.push(rightsCase);
    casesByMedia.set(key, list);
  }

  const kept = [];
  const uncertain = [];
  for (const media of hostedMusic) {
    const decision = describePermittedPermission(media, casesByMedia.get(String(media._id)) || []);
    const row = {
      id: String(media._id),
      uuid: media.uuid || '',
      title: media.title || '(untitled)',
      artist: artistLabel(media),
      permissionNote: decision.permissionNote,
    };
    if (decision.documented) kept.push(row);
    else uncertain.push(row);
  }

  console.log(`Permitted + hosted music: ${hostedMusic.length}`);
  console.log(`Keep (permission note): ${kept.length}`);
  console.log(`Uncertain (return to pending): ${uncertain.length}`);

  for (const row of kept) {
    console.log(`KEEP\t${row.title}\t${row.artist}\t${row.permissionNote}`);
  }
  for (const row of uncertain) {
    console.log(`PENDING\t${row.title}\t${row.artist}\t${row.uuid}`);
  }

  if (!isExecute()) {
    console.log('\nDry run. Re-run with --execute to set uncertain rows to pending.');
    await mongoose.disconnect();
    return { kept, uncertain, wrote: false };
  }

  let modified = 0;
  for (const row of uncertain) {
    const result = await Media.updateOne(
      { _id: row.id, rightsStatus: 'permitted' },
      {
        $set: pendingRightsFields(),
        $push: {
          ownershipHistory: {
            action: 'rights_status_pending',
            timestamp: new Date(),
            note: AUDIT_NOTE,
            diff: [{ field: 'rightsStatus', from: 'permitted', to: 'pending' }],
          },
        },
      }
    );
    modified += result.modifiedCount || 0;
  }

  console.log(`Updated ${modified} media documents to pending.`);
  await mongoose.disconnect();
  return { kept, uncertain, wrote: true, modified };
}

if (require.main === module) {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { run, AUDIT_NOTE };

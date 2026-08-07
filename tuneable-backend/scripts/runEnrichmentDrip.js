/**
 * One-shot / cron-friendly drip for media tags + primaryLocation coverage.
 *
 * Usage:
 *   node scripts/runEnrichmentDrip.js --dry-run
 *   node scripts/runEnrichmentDrip.js --execute
 *   node scripts/runEnrichmentDrip.js --execute --tags-only --tag-limit 20
 *   node scripts/runEnrichmentDrip.js --execute --locations-only --location-limit 15
 *   node scripts/runEnrichmentDrip.js --execute --production
 *
 * Env (when started via server cron — see enrichmentDripService.startEnrichmentDripCron):
 *   ENRICHMENT_DRIP_ENABLED=true
 *   ENRICHMENT_DRIP_CRON — six-field cron; default every 15 minutes
 *   ENRICHMENT_DRIP_TAG_LIMIT=25
 *   ENRICHMENT_DRIP_LOCATION_LIMIT=25
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
const { runEnrichmentDrip } = require('../services/enrichmentDripService');

function getMongoUri() {
  return process.env.MONGO_URI || process.env.MONGODB_URI;
}

function argValue(flag) {
  const idx = args.indexOf(flag);
  if (idx < 0) return null;
  const raw = args[idx + 1];
  if (raw == null || raw.startsWith('--')) return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

async function main() {
  const uri = getMongoUri();
  if (!uri) {
    console.error('MONGO_URI / MONGODB_URI required');
    process.exit(1);
  }

  const execute = args.includes('--execute');
  if (!execute && !args.includes('--dry-run')) {
    console.log('Pass --dry-run or --execute (defaulting to dry-run)');
  }

  await mongoose.connect(uri);
  console.log('   connected');

  const result = await runEnrichmentDrip({
    dryRun: !execute,
    skipTags: args.includes('--locations-only'),
    skipLocations: args.includes('--tags-only'),
    tagLimit:
      argValue('--tag-limit') ??
      (Number(process.env.ENRICHMENT_DRIP_TAG_LIMIT) || 25),
    locationLimit:
      argValue('--location-limit') ??
      (Number(process.env.ENRICHMENT_DRIP_LOCATION_LIMIT) || 25),
    unlinkedTagLimit: argValue('--unlinked-tag-limit') ?? 10,
    tagMode: args.includes('--supplement') ? 'supplement' : 'untagged',
    tagLinkage: args.includes('--unlinked')
      ? 'unlinked'
      : args.includes('--any-linkage')
        ? 'any'
        : 'linked',
    nameSearch: args.includes('--name-search'),
    upgradeInferred: args.includes('--upgrade-inferred'),
    delayMs: argValue('--delay-ms') ?? 150,
    mbDelayMs: argValue('--mb-delay-ms') ?? 1200,
    includeCoverage: !args.includes('--no-coverage'),
  });

  console.log('\n📦 Result JSON');
  console.log(JSON.stringify(result, null, 2));

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch (_) {
    /* ignore */
  }
  process.exit(1);
});

/**
 * Expire due welcome-credit promo artist escrow.
 *
 *   node tuneable-backend/scripts/expireWelcomePromoEscrow.js
 *   node tuneable-backend/scripts/expireWelcomePromoEscrow.js --limit 500
 *   node tuneable-backend/scripts/expireWelcomePromoEscrow.js --production
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
const { expireDuePromoEscrow } = require('../services/welcomePromoEscrowService');

function getMongoUri() {
  return process.env.MONGO_URI || process.env.MONGODB_URI;
}

async function main() {
  const limitArg = args.find((a) => a.startsWith('--limit='));
  const limitFlagIdx = args.indexOf('--limit');
  const limit = limitArg
    ? Number(limitArg.split('=')[1])
    : limitFlagIdx >= 0
      ? Number(args[limitFlagIdx + 1])
      : 500;

  const uri = getMongoUri();
  if (!uri) {
    throw new Error('MONGO_URI or MONGODB_URI is required');
  }

  await mongoose.connect(uri);
  const result = await expireDuePromoEscrow({ limit });
  console.log(result);
  await mongoose.connection.close();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.connection.close();
  } catch (_) {
    // ignore
  }
  process.exit(1);
});

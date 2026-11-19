/**
 * Backfill waveform peaks for tunes that already have hosted audio.
 *
 *   node scripts/scanWaveformPeaks.js --limit=20
 *   node scripts/scanWaveformPeaks.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Media = require('../models/Media');
const { scanWaveformPeaks } = require('../utils/waveformScan');

function uploadUrl(sources) {
  if (!sources) return null;
  if (typeof sources.get === 'function') return sources.get('upload') || null;
  return sources.upload || null;
}

function failureDetail(error) {
  const cause = error?.cause;
  const code = cause?.code || cause?.message;
  return code ? `${error.message} (${code})` : error.message;
}

async function downloadAudio(url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(20 * 60 * 1000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }
  throw lastError;
}

async function main() {
  const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.split('=')[1]) : 0;
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) throw new Error('MONGO_URI is not set');

  await mongoose.connect(mongoUri);
  let query = Media.find({
    'sources.upload': { $exists: true, $nin: [null, ''] },
    $or: [
      { waveformPeaks: { $exists: false } },
      { waveformPeaks: { $size: 0 } },
    ],
  }).select('title sources waveformPeaks');
  if (limit > 0) query = query.limit(limit);
  const docs = await query;
  console.log(`queue ${docs.length}`);

  let scanned = 0;
  let skipped = 0;
  for (const media of docs) {
    const url = uploadUrl(media.sources);
    if (!url) {
      skipped += 1;
      continue;
    }
    try {
      console.log(`scanning  ${media.title}`);
      const buffer = await downloadAudio(url);
      const peaks = await scanWaveformPeaks(buffer, url);
      if (!peaks) {
        skipped += 1;
        console.log(`no peaks  ${media.title}`);
        continue;
      }
      media.waveformPeaks = peaks;
      await media.save();
      scanned += 1;
      console.log(`scanned   ${media.title}`);
    } catch (error) {
      skipped += 1;
      console.log(`failed    ${media.title}: ${failureDetail(error)}`);
    }
  }

  console.log(`done. scanned=${scanned} skipped=${skipped}`);
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

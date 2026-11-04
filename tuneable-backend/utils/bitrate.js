/**
 * Canonical bitrate for storage and display: kilobits per second.
 * music-metadata reports bits per second (320 kbps → 320000).
 * Rekordbox and manual edits are already kbps (320).
 * Anything at or above 20,000 is bits/second — no real audio bitrate is 20,000 kbps.
 *
 * @param {unknown} value
 * @returns {number|null}
 */
function bitrateToKbps(value) {
  if (value === undefined || value === null || value === '') return null;
  const num = typeof value === 'number' ? value : parseFloat(String(value).trim());
  if (!Number.isFinite(num) || num <= 0) return null;
  const kbps = num >= 20000 ? num / 1000 : num;
  const rounded = Math.round(kbps);
  return rounded > 0 ? rounded : null;
}

module.exports = { bitrateToKbps };

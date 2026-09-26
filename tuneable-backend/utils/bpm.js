/**
 * Canonical BPM for storage and display: nearest whole number.
 * Empty / non-positive values become null.
 *
 * @param {unknown} value
 * @returns {number|null}
 */
function roundBpm(value) {
  if (value === undefined || value === null || value === '') return null;
  const num = typeof value === 'number' ? value : parseFloat(String(value).trim());
  if (!Number.isFinite(num) || num <= 0) return null;
  const rounded = Math.round(num);
  return rounded > 0 ? rounded : null;
}

module.exports = { roundBpm };

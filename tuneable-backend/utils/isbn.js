/**
 * ISBN-10 / ISBN-13 normalize + extract helpers (no I/O).
 * Canonical stored form is ISBN-13 (digits only).
 */

function digitsAndX(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^0-9X]/g, '');
}

function isbn13Checksum(d12) {
  let sum = 0;
  for (let i = 0; i < 12; i += 1) {
    sum += Number(d12[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return String((10 - (sum % 10)) % 10);
}

function isValidIsbn10(raw) {
  if (!/^\d{9}[\dX]$/.test(raw)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i += 1) {
    const n = raw[i] === 'X' ? 10 : Number(raw[i]);
    sum += n * (10 - i);
  }
  return sum % 11 === 0;
}

function isValidIsbn13(raw) {
  if (!/^\d{13}$/.test(raw)) return false;
  return isbn13Checksum(raw.slice(0, 12)) === raw[12];
}

function isbn10To13(isbn10) {
  const d12 = `978${isbn10.slice(0, 9)}`;
  return d12 + isbn13Checksum(d12);
}

/**
 * Normalize a single ISBN-like value to ISBN-13 digits, or null if invalid.
 */
function normalizeIsbn(value) {
  if (value == null) return null;
  const raw = digitsAndX(value);
  if (!raw) return null;
  if (raw.length === 13 && isValidIsbn13(raw)) return raw;
  if (raw.length === 10 && isValidIsbn10(raw)) return isbn10To13(raw);
  return null;
}

/**
 * Collect unique normalized ISBN-13s from mixed string/array input.
 */
function extractIsbns(...values) {
  const found = [];
  const seen = new Set();

  const visit = (value) => {
    if (value == null) return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value === 'object') {
      if (value.identifier) visit(value.identifier);
      if (value.isbn) visit(value.isbn);
      if (value.type && value.identifier) visit(value.identifier);
      return;
    }
    const text = String(value);
    const chunks = text.split(/[\s,;|/]+/).filter(Boolean);
    const candidates = chunks.length ? chunks : [text];
    for (const chunk of candidates) {
      const isbn = normalizeIsbn(chunk);
      if (isbn && !seen.has(isbn)) {
        seen.add(isbn);
        found.push(isbn);
      }
    }
  };

  values.forEach(visit);
  return found;
}

function firstIsbn(...values) {
  return extractIsbns(...values)[0] || null;
}

module.exports = {
  digitsAndX,
  isbn13Checksum,
  isValidIsbn10,
  isValidIsbn13,
  isbn10To13,
  normalizeIsbn,
  extractIsbns,
  firstIsbn,
};

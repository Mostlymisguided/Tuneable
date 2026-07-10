/**
 * Musical key normalization → long-form standard notation.
 *
 * Accepts Camelot (8A), Open Key (5m), short classical (Am, C, F#m),
 * and already-long forms with messy casing/spacing → "A Minor", "C Major".
 */

/** @type {Record<string, string>} */
const CAMELOT_TO_STANDARD = {
  '1A': 'A-flat Minor',
  '1B': 'B Major',
  '2A': 'E-flat Minor',
  '2B': 'F-sharp Major',
  '3A': 'B-flat Minor',
  '3B': 'D-flat Major',
  '4A': 'F Minor',
  '4B': 'A-flat Major',
  '5A': 'C Minor',
  '5B': 'E-flat Major',
  '6A': 'G Minor',
  '6B': 'B-flat Major',
  '7A': 'D Minor',
  '7B': 'F Major',
  '8A': 'A Minor',
  '8B': 'C Major',
  '9A': 'E Minor',
  '9B': 'G Major',
  '10A': 'B Minor',
  '10B': 'D Major',
  '11A': 'F-sharp Minor',
  '11B': 'A Major',
  '12A': 'D-flat Minor',
  '12B': 'E Major',
};

/**
 * Open Key notation (Beatport / Traktor style): Nd = major, Nm = minor.
 * @type {Record<string, string>}
 */
const OPEN_KEY_TO_CAMELOT = {
  '1d': '1B',
  '1m': '1A',
  '2d': '2B',
  '2m': '2A',
  '3d': '3B',
  '3m': '3A',
  '4d': '4B',
  '4m': '4A',
  '5d': '5B',
  '5m': '5A',
  '6d': '6B',
  '6m': '6A',
  '7d': '7B',
  '7m': '7A',
  '8d': '8B',
  '8m': '8A',
  '9d': '9B',
  '9m': '9A',
  '10d': '10B',
  '10m': '10A',
  '11d': '11B',
  '11m': '11A',
  '12d': '12B',
  '12m': '12A',
};

const CAMELOT_RE = /^0?([1-9]|1[0-2])\s*([ABab])$/;
const OPEN_KEY_RE = /^0?([1-9]|1[0-2])\s*([dDmM])$/;

/**
 * @param {string} value
 * @returns {string|null}
 */
function parseCamelotToken(value) {
  if (!value || typeof value !== 'string') return null;
  const match = String(value).trim().match(CAMELOT_RE);
  if (!match) return null;
  return `${match[1]}${match[2].toUpperCase()}`;
}

/**
 * @param {string} value
 * @returns {string|null}
 */
function parseOpenKeyToCamelot(value) {
  if (!value || typeof value !== 'string') return null;
  const match = String(value).trim().match(OPEN_KEY_RE);
  if (!match) return null;
  const token = `${match[1]}${match[2].toLowerCase()}`;
  return OPEN_KEY_TO_CAMELOT[token] || null;
}

/**
 * @param {string} value
 * @returns {string|null}
 */
function camelotToStandard(value) {
  if (!value || typeof value !== 'string') return null;
  const camelot = parseCamelotToken(value) || parseOpenKeyToCamelot(value);
  if (!camelot) return null;
  return CAMELOT_TO_STANDARD[camelot] || null;
}

/**
 * Collapse whitespace and unicode accidentals for classical parsing.
 * @param {string} value
 * @returns {string}
 */
function prepClassicalInput(value) {
  return String(value)
    .trim()
    .replace(/[♯]/g, '#')
    .replace(/[♭]/g, 'b')
    .replace(/\s+/g, ' ');
}

/**
 * Parse accidental from a classical key string after the root letter.
 * @param {string} rest
 * @returns {{ accidental: ''|'sharp'|'flat', rest: string }}
 */
function takeAccidental(rest) {
  const s = rest.trimStart();
  if (!s) return { accidental: '', rest: '' };

  if (s[0] === '#') return { accidental: 'sharp', rest: s.slice(1) };
  // Lone "b" accidental only when followed by mode/end (not "B" as a second root)
  if (s[0] === 'b' || s[0] === 'B') {
    const after = s.slice(1);
    // "Bb", "Bbm", "Bb major", "b minor" after root — treat leading b as flat
    // when next char is not a letter that would make a word other than mode,
    // or when it's end / whitespace / mode start.
    if (
      after === '' ||
      /^[\s\-]*(?:m(?:in(?:or)?)?|M(?:aj(?:or)?)?)?$/i.test(after) ||
      /^\s/.test(after) ||
      after[0] === '-'
    ) {
      return { accidental: 'flat', rest: after };
    }
  }

  const sharpWord = s.match(/^(?:-?\s*)sharp\b/i);
  if (sharpWord) return { accidental: 'sharp', rest: s.slice(sharpWord[0].length) };

  const flatWord = s.match(/^(?:-?\s*)flat\b/i);
  if (flatWord) return { accidental: 'flat', rest: s.slice(flatWord[0].length) };

  return { accidental: '', rest: s };
}

/**
 * @param {string} rest
 * @returns {'Major'|'Minor'|null}
 */
function takeMode(rest) {
  const s = rest.trim().replace(/^-+/, '').trim();
  if (!s) return 'Major'; // bare root (C, F#) ⇒ Major

  // Single-letter: m = minor, M = major (case-sensitive)
  if (s === 'm') return 'Minor';
  if (s === 'M') return 'Major';

  if (/^(?:minor|min)$/i.test(s)) return 'Minor';
  if (/^(?:major|maj)$/i.test(s)) return 'Major';
  return null;
}

/**
 * Build canonical long-form root label.
 * @param {string} letter
 * @param {''|'sharp'|'flat'} accidental
 * @returns {string}
 */
function formatRoot(letter, accidental) {
  const L = letter.toUpperCase();
  if (accidental === 'sharp') return `${L}-sharp`;
  if (accidental === 'flat') return `${L}-flat`;
  return L;
}

/**
 * Convert classical / short / messy long-form keys to canonical long form.
 * Returns null if unrecognized.
 * @param {string} value
 * @returns {string|null}
 */
function classicalToLongForm(value) {
  if (!value || typeof value !== 'string') return null;

  const prepared = prepClassicalInput(value);
  // Reject Camelot/Open Key here — handled separately
  if (parseCamelotToken(prepared) || parseOpenKeyToCamelot(prepared)) return null;

  // Already long-ish: "A Minor", "F-sharp Major", "A flat minor"
  const longMatch = prepared.match(
    /^([A-Ga-g])(?:\s*-?\s*(sharp|flat))?\s+(major|minor|maj|min)$/i
  );
  if (longMatch) {
    const root = formatRoot(longMatch[1], (longMatch[2] || '').toLowerCase());
    const mode = /^min/i.test(longMatch[3]) ? 'Minor' : 'Major';
    return `${root} ${mode}`;
  }

  // Compact: Am, C, F#m, Bbm, Cmaj, Amin, F#maj, etc.
  const rootMatch = prepared.match(/^([A-Ga-g])(.*)$/);
  if (!rootMatch) return null;

  const letter = rootMatch[1];
  const { accidental, rest } = takeAccidental(rootMatch[2]);
  const mode = takeMode(rest);
  if (!mode) return null;

  // Disambiguate: lone "B" is B Major; "Bb" is B-flat Major.
  // takeAccidental already handles Bb vs B.
  const root = formatRoot(letter, accidental);
  return `${root} ${mode}`;
}

/**
 * Convert any supported key notation to long form ("A Minor", "C Major").
 * Returns null if the value cannot be recognized.
 * @param {string} value
 * @returns {string|null}
 */
function toLongFormKey(value) {
  if (!value || typeof value !== 'string') return null;
  const str = String(value).trim();
  if (!str) return null;

  return camelotToStandard(str) || classicalToLongForm(str);
}

/**
 * True if value can be normalized to a different long-form key.
 * @param {string} value
 * @returns {boolean}
 */
function needsKeyNormalization(value) {
  const long = toLongFormKey(value);
  if (!long) return false;
  return long !== String(value).trim();
}

/**
 * Normalize a key to long form when possible; otherwise return trimmed original.
 * @param {string|null|undefined} value
 * @returns {string|null}
 */
function normalizeKey(value) {
  if (value === undefined || value === null) return null;
  const str = String(value).trim();
  if (!str) return null;
  return toLongFormKey(str) || str;
}

function isCamelotOrOpenKey(value) {
  return Boolean(parseCamelotToken(value) || parseOpenKeyToCamelot(value));
}

module.exports = {
  CAMELOT_TO_STANDARD,
  camelotToStandard,
  classicalToLongForm,
  isCamelotOrOpenKey,
  needsKeyNormalization,
  normalizeKey,
  parseCamelotToken,
  toLongFormKey,
};

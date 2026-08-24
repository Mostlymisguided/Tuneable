/**
 * Normalize Media.language for storage.
 *
 * MongoDB text indexes default to using a `language` field as a stemming
 * override. They accept ISO 639-1 (`en`) or names (`english`), but not
 * ISO 639-2/3 MARC codes like Open Library's `eng`.
 */

const LANGUAGE_NAMES = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  ru: 'Russian',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese',
  ar: 'Arabic',
  hi: 'Hindi',
  tr: 'Turkish',
  pl: 'Polish',
  nl: 'Dutch',
  sv: 'Swedish',
  no: 'Norwegian',
  da: 'Danish',
  fi: 'Finnish',
  el: 'Greek',
  he: 'Hebrew',
  th: 'Thai',
  vi: 'Vietnamese',
  id: 'Indonesian',
  ms: 'Malay',
  cs: 'Czech',
  hu: 'Hungarian',
  ro: 'Romanian',
  uk: 'Ukrainian',
  bg: 'Bulgarian',
  hr: 'Croatian',
  sr: 'Serbian',
  sk: 'Slovak',
  sl: 'Slovenian',
  et: 'Estonian',
  lv: 'Latvian',
  lt: 'Lithuanian',
  ga: 'Irish',
  cy: 'Welsh',
  mt: 'Maltese',
  sw: 'Swahili',
  af: 'Afrikaans',
  sq: 'Albanian',
  az: 'Azerbaijani',
  be: 'Belarusian',
  bn: 'Bengali',
  bs: 'Bosnian',
  ca: 'Catalan',
  eu: 'Basque',
  fa: 'Persian',
  gl: 'Galician',
  is: 'Icelandic',
  mk: 'Macedonian',
  ml: 'Malayalam',
  mr: 'Marathi',
  ne: 'Nepali',
  pa: 'Punjabi',
  si: 'Sinhala',
  ta: 'Tamil',
  te: 'Telugu',
  ur: 'Urdu',
  zu: 'Zulu',
};

const ISO3_LANGUAGE_MAP = {
  eng: 'en',
  spa: 'es', esn: 'es',
  fra: 'fr', fre: 'fr',
  deu: 'de', ger: 'de',
  ita: 'it',
  por: 'pt',
  rus: 'ru',
  jpn: 'ja',
  zho: 'zh', chi: 'zh', cmn: 'zh',
  kor: 'ko',
  ara: 'ar',
  hin: 'hi',
  tur: 'tr',
  pol: 'pl',
  nld: 'nl', dut: 'nl',
  swe: 'sv',
  nor: 'no',
  dan: 'da',
  fin: 'fi',
  ell: 'el', gre: 'el',
  heb: 'he',
  tha: 'th',
  vie: 'vi',
  ind: 'id',
  msa: 'ms', may: 'ms',
  ces: 'cs', cze: 'cs',
  hun: 'hu',
  ron: 'ro', rum: 'ro',
  ukr: 'uk',
  bul: 'bg',
  hrv: 'hr',
  srp: 'sr',
  slk: 'sk', slo: 'sk',
  slv: 'sl',
  est: 'et',
  lav: 'lv',
  lit: 'lt',
  gle: 'ga',
  cym: 'cy', wel: 'cy',
  mlt: 'mt',
  swa: 'sw',
  afr: 'af',
  alb: 'sq',
  aze: 'az',
  bel: 'be',
  ben: 'bn',
  bos: 'bs',
  cat: 'ca',
  eus: 'eu',
  fas: 'fa', per: 'fa',
  glg: 'gl',
  isl: 'is',
  mkd: 'mk',
  mal: 'ml',
  mar: 'mr',
  nep: 'ne',
  pan: 'pa',
  sin: 'si',
  tam: 'ta',
  tel: 'te',
  urd: 'ur',
  zul: 'zu',
};

function normalizeLanguageInput(value) {
  if (!value && value !== 0) return 'en';

  const str = value.toString().trim();
  if (!str) return 'en';

  const lower = str.toLowerCase();

  if (LANGUAGE_NAMES[lower]) {
    return lower;
  }

  for (const [code, name] of Object.entries(LANGUAGE_NAMES)) {
    if (lower === name.toLowerCase()) {
      return code;
    }
  }

  if (lower.includes('-')) {
    const base = lower.split('-')[0];
    if (LANGUAGE_NAMES[base]) {
      return base;
    }
  }

  if (ISO3_LANGUAGE_MAP[lower]) {
    return ISO3_LANGUAGE_MAP[lower];
  }

  // Two-letter codes are what MongoDB text indexes accept (`en`, not `eng`).
  if (lower.length === 2) {
    return lower;
  }

  return 'en';
}

module.exports = {
  LANGUAGE_NAMES,
  ISO3_LANGUAGE_MAP,
  normalizeLanguageInput,
};

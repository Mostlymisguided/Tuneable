/**
 * Element vocabulary + tip-chip classification.
 *
 * Elements are musical content (instruments, sonic ingredients) — more intrinsic
 * than discovery tags (genre / mood / setting). Tip UI accepts both; we split here.
 *
 * Match keys reuse the same normalization as tags (lowercase, strip punctuation/spaces).
 */

const {
  normalizeTagForMatching,
  normalizeTagForStorage,
  capitalizeTag,
  tagsMatch,
} = require('./tagNormalizer');

/**
 * Element aliases — keys must be match keys (normalizeTagForMatching).
 * Values are canonical display forms stored on Media.elements.
 */
const ELEMENT_ALIASES = {
  // Vocals
  vocals: 'Vocals',
  vocal: 'Vocals',
  voice: 'Vocals',
  singing: 'Vocals',
  malevocals: 'Male Vocals',
  femalevocals: 'Female Vocals',
  choir: 'Choir',
  harmonies: 'Harmonies',
  harmony: 'Harmonies',
  rapvocals: 'Rap Vocals',
  rapping: 'Rap Vocals',

  // Guitar family
  guitar: 'Guitar',
  guitars: 'Guitar',
  gtar: 'Guitar',
  acousticguitar: 'Acoustic Guitar',
  electricguitar: 'Electric Guitar',
  eguitar: 'Electric Guitar',
  classicalguitar: 'Classical Guitar',
  slideguitar: 'Slide Guitar',
  steelguitar: 'Steel Guitar',

  // Bass
  bass: 'Bass',
  bassguitar: 'Bass',
  electricbass: 'Bass',
  uprightbass: 'Upright Bass',
  doublebass: 'Upright Bass',
  standupbass: 'Upright Bass',
  synthbass: 'Synth Bass',
  bassynth: 'Synth Bass',

  // Keys / piano
  piano: 'Piano',
  acousticpiano: 'Piano',
  grandpiano: 'Piano',
  electricpiano: 'Electric Piano',
  epiano: 'Electric Piano',
  rhodes: 'Rhodes',
  wurlitzer: 'Wurlitzer',
  wurli: 'Wurlitzer',
  organ: 'Organ',
  hammond: 'Hammond',
  hammondorgan: 'Hammond',
  keys: 'Keys',
  keyboards: 'Keys',
  keyboard: 'Keys',
  mellotron: 'Mellotron',
  clavinet: 'Clavinet',
  harpsichord: 'Harpsichord',

  // Synths / electronic sound sources (heard content, not production credit)
  synth: 'Synth',
  synths: 'Synth',
  synthesizer: 'Synth',
  synthesizers: 'Synth',
  leadsynth: 'Lead Synth',
  pads: 'Pads',
  pad: 'Pads',
  arpeggio: 'Arpeggio',
  arpeggiator: 'Arpeggio',
  arp: 'Arpeggio',
  tb303: 'TB-303',
  303: 'TB-303',
  acidbass: 'TB-303',
  moog: 'Moog',
  prophet: 'Prophet',
  juno: 'Juno',
  dx7: 'DX7',

  // Drums / percussion
  drums: 'Drums',
  drum: 'Drums',
  livedrums: 'Live Drums',
  acousticdrums: 'Live Drums',
  drummachine: 'Drum Machine',
  drummachines: 'Drum Machine',
  '808': '808s',
  '808s': '808s',
  eightoeight: '808s',
  '909': '909s',
  '909s': '909s',
  percussion: 'Percussion',
  congas: 'Congas',
  bongos: 'Bongos',
  shaker: 'Shaker',
  shakers: 'Shaker',
  hihat: 'Hi-Hat',
  hats: 'Hi-Hat',
  snare: 'Snare',
  kick: 'Kick',
  kickdrum: 'Kick',
  claps: 'Claps',
  clap: 'Claps',
  cymbals: 'Cymbals',
  timpani: 'Timpani',

  // Strings
  strings: 'Strings',
  stringsection: 'Strings',
  violin: 'Violin',
  viola: 'Viola',
  cello: 'Cello',
  harp: 'Harp',

  // Brass / woodwind
  brass: 'Brass',
  horns: 'Horns',
  trumpet: 'Trumpet',
  trombone: 'Trombone',
  saxophone: 'Saxophone',
  sax: 'Saxophone',
  altosax: 'Saxophone',
  tenorsax: 'Saxophone',
  flute: 'Flute',
  clarinet: 'Clarinet',
  oboe: 'Oboe',

  // Other instruments / ingredients
  banjo: 'Banjo',
  ukulele: 'Ukulele',
  uke: 'Ukulele',
  mandolin: 'Mandolin',
  harmonica: 'Harmonica',
  accordion: 'Accordion',
  turntables: 'Turntables',
  scratching: 'Scratching',
  scratch: 'Scratching',
  samples: 'Samples',
  sample: 'Samples',
  sampling: 'Samples',
  fieldrecording: 'Field Recording',
  whistle: 'Whistle',
  whistling: 'Whistle',
  beatboxing: 'Beatboxing',
  beatbox: 'Beatboxing',
};

/**
 * When a chip matches both a genre-ish tag and an element, prefer tags.
 * Keep empty unless we intentionally put ambiguous words in ELEMENT_ALIASES.
 */
const PREFER_TAG_MATCH_KEYS = new Set([
  // e.g. 'house' if ever added as an element alias
]);

/**
 * @param {string} value
 * @returns {string}
 */
function normalizeElementForMatching(value) {
  return normalizeTagForMatching(value);
}

/**
 * @param {string} value
 * @returns {string}
 */
function normalizeElementForStorage(value) {
  if (!value || typeof value !== 'string') return '';

  const trimmed = value.trim();
  if (!trimmed) return '';

  const key = normalizeElementForMatching(trimmed);
  const canonical = ELEMENT_ALIASES[key];
  if (canonical) return canonical;

  return capitalizeTag(trimmed);
}

/**
 * @param {string} value
 * @returns {boolean}
 */
function isKnownElement(value) {
  if (!value || typeof value !== 'string') return false;
  const key = normalizeElementForMatching(value);
  return Boolean(key && ELEMENT_ALIASES[key]);
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function elementsMatch(a, b) {
  const keyA = normalizeElementForMatching(normalizeElementForStorage(a) || a);
  const keyB = normalizeElementForMatching(normalizeElementForStorage(b) || b);
  return Boolean(keyA && keyB && keyA === keyB);
}

/**
 * Split tip/confirmation chips into discovery tags vs musical elements.
 * Known elements are stored only as elements (not dual-written to tags).
 *
 * @param {string[]} chips
 * @returns {{ tags: string[], elements: string[] }}
 */
function classifyTipChips(chips) {
  const tags = [];
  const elements = [];

  if (!Array.isArray(chips)) {
    return { tags, elements };
  }

  for (const raw of chips) {
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;

    const matchKey = normalizeElementForMatching(trimmed);
    const preferTag = PREFER_TAG_MATCH_KEYS.has(matchKey);

    if (!preferTag && isKnownElement(trimmed)) {
      const element = normalizeElementForStorage(trimmed);
      if (element && !elements.some((e) => elementsMatch(e, element))) {
        elements.push(element);
      }
      continue;
    }

    const tag = normalizeTagForStorage(trimmed);
    if (tag && !tags.some((t) => tagsMatch(t, tag))) {
      tags.push(tag);
    }
  }

  return { tags, elements };
}

/**
 * Merge incoming strings into an existing list with normalize + match helpers.
 * @param {string[]} existing
 * @param {string[]} incoming
 * @param {(v: string) => string} normalize
 * @param {(a: string, b: string) => boolean} match
 * @returns {{ list: string[], didAdd: boolean }}
 */
function mergeNormalizedList(existing, incoming, normalize, match) {
  const list = Array.isArray(existing)
    ? existing.map((v) => normalize(v)).filter(Boolean)
    : [];
  let didAdd = false;

  (incoming || []).forEach((raw) => {
    const value = normalize(raw);
    if (!value) return;
    if (!list.some((item) => match(item, value))) {
      list.push(value);
      didAdd = true;
    }
  });

  return { list, didAdd };
}

/**
 * Apply tip chips to media tag + element arrays (in-memory; caller saves).
 * @param {{ tags?: string[], elements?: string[] }} media
 * @param {string[]} chips
 * @returns {{ tags: string[], elements: string[], didAddTag: boolean, didAddElement: boolean }}
 */
function applyTipChipsToMedia(media, chips) {
  const { tags: newTags, elements: newElements } = classifyTipChips(chips);

  const tagMerge = mergeNormalizedList(
    media?.tags,
    newTags,
    normalizeTagForStorage,
    tagsMatch
  );
  const elementMerge = mergeNormalizedList(
    media?.elements,
    newElements,
    normalizeElementForStorage,
    elementsMatch
  );

  return {
    tags: tagMerge.list,
    elements: elementMerge.list,
    didAddTag: tagMerge.didAdd,
    didAddElement: elementMerge.didAdd,
  };
}

/**
 * Normalize a freeform elements array (edit forms / API updates).
 * @param {unknown} value
 * @returns {string[]}
 */
function normalizeElementList(value) {
  let items = [];
  if (Array.isArray(value)) {
    items = value;
  } else if (typeof value === 'string') {
    items = value.split(',');
  }

  const result = [];
  for (const raw of items) {
    if (typeof raw !== 'string') continue;
    const normalized = normalizeElementForStorage(raw);
    if (normalized && !result.some((e) => elementsMatch(e, normalized))) {
      result.push(normalized);
    }
  }
  return result;
}

module.exports = {
  ELEMENT_ALIASES,
  PREFER_TAG_MATCH_KEYS,
  normalizeElementForMatching,
  normalizeElementForStorage,
  isKnownElement,
  elementsMatch,
  classifyTipChips,
  applyTipChipsToMedia,
  normalizeElementList,
};

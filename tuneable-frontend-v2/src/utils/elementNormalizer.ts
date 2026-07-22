/**
 * Element vocabulary + tip-chip classification.
 * Mirrors tuneable-backend/utils/elementNormalizer.js
 */

import {
  normalizeTagForMatching,
  normalizeTagForStorage,
  capitalizeTag,
  tagsMatch,
} from './tagNormalizer';

const ELEMENT_ALIASES: Record<string, string> = {
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

  guitar: 'Guitar',
  guitars: 'Guitar',
  gtar: 'Guitar',
  acousticguitar: 'Acoustic Guitar',
  electricguitar: 'Electric Guitar',
  eguitar: 'Electric Guitar',
  classicalguitar: 'Classical Guitar',
  slideguitar: 'Slide Guitar',
  steelguitar: 'Steel Guitar',

  bass: 'Bass',
  bassguitar: 'Bass',
  electricbass: 'Bass',
  uprightbass: 'Upright Bass',
  doublebass: 'Upright Bass',
  standupbass: 'Upright Bass',
  synthbass: 'Synth Bass',
  bassynth: 'Synth Bass',

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
  '303': 'TB-303',
  acidbass: 'TB-303',
  moog: 'Moog',
  prophet: 'Prophet',
  juno: 'Juno',
  dx7: 'DX7',

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

  strings: 'Strings',
  stringsection: 'Strings',
  violin: 'Violin',
  viola: 'Viola',
  cello: 'Cello',
  harp: 'Harp',

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

const PREFER_TAG_MATCH_KEYS = new Set<string>([]);

export function normalizeElementForMatching(value: string): string {
  return normalizeTagForMatching(value);
}

export function normalizeElementForStorage(value: string): string {
  if (!value || typeof value !== 'string') return '';

  const trimmed = value.trim();
  if (!trimmed) return '';

  const key = normalizeElementForMatching(trimmed);
  const canonical = ELEMENT_ALIASES[key];
  if (canonical) return canonical;

  return capitalizeTag(trimmed);
}

export function isKnownElement(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  const key = normalizeElementForMatching(value);
  return Boolean(key && ELEMENT_ALIASES[key]);
}

export function elementsMatch(a: string, b: string): boolean {
  const keyA = normalizeElementForMatching(normalizeElementForStorage(a) || a);
  const keyB = normalizeElementForMatching(normalizeElementForStorage(b) || b);
  return Boolean(keyA && keyB && keyA === keyB);
}

export function classifyTipChips(chips: string[]): { tags: string[]; elements: string[] } {
  const tags: string[] = [];
  const elements: string[] = [];

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

/** Normalize a freeform chip for tip modal display (element or tag). */
export function normalizeTipChipForDisplay(chip: string): string {
  if (!chip || typeof chip !== 'string') return '';
  const trimmed = chip.trim();
  if (!trimmed) return '';
  if (isKnownElement(trimmed)) {
    return normalizeElementForStorage(trimmed);
  }
  return normalizeTagForStorage(trimmed);
}

export { ELEMENT_ALIASES, PREFER_TAG_MATCH_KEYS };

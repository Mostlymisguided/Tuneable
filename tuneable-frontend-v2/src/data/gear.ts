// Production equipment catalog + shared types for the Media productionStack.
// These lists power autocomplete only — users can always enter custom values,
// so the lists don't need to be exhaustive. Keep in sync with the enums in
// tuneable-backend/models/Media.js (productionStack).

export type DawRole = 'primary' | 'mix' | 'master' | 'collab';

export type PluginCategory =
  | 'synth'
  | 'sampler'
  | 'drum_machine'
  | 'fx'
  | 'eq'
  | 'compressor'
  | 'reverb'
  | 'delay'
  | 'mastering'
  | 'utility'
  | 'other';

export type PluginRole = 'instrument' | 'sound_design' | 'mix' | 'master' | 'processing';

export type HardwareCategory =
  | 'synth'
  | 'drum_machine'
  | 'sampler'
  | 'controller'
  | 'interface'
  | 'outboard'
  | 'monitor'
  | 'mic'
  | 'other';

export type HardwareRole = 'instrument' | 'control' | 'recording' | 'monitoring' | 'processing';

export interface DawEntry {
  name: string;
  version?: string;
  role?: DawRole | null;
  gearId?: string | null;
  slug?: string | null;
}

export interface PluginEntry {
  name: string;
  manufacturer?: string;
  category?: PluginCategory;
  role?: PluginRole | null;
  gearId?: string | null;
  slug?: string | null;
}

export interface HardwareEntry {
  name: string;
  manufacturer?: string;
  category?: HardwareCategory;
  role?: HardwareRole | null;
  gearId?: string | null;
  slug?: string | null;
}

export interface ProductionStack {
  daws: DawEntry[];
  plugins: PluginEntry[];
  hardware: HardwareEntry[];
}

export const EMPTY_PRODUCTION_STACK: ProductionStack = {
  daws: [],
  plugins: [],
  hardware: [],
};

// ---- Human-readable labels for the enum values (for dropdowns/display) ----

export const DAW_ROLE_LABELS: Record<DawRole, string> = {
  primary: 'Primary',
  mix: 'Mixing',
  master: 'Mastering',
  collab: 'Collaboration',
};

export const PLUGIN_CATEGORY_LABELS: Record<PluginCategory, string> = {
  synth: 'Synth',
  sampler: 'Sampler',
  drum_machine: 'Drum Machine',
  fx: 'FX',
  eq: 'EQ',
  compressor: 'Compressor',
  reverb: 'Reverb',
  delay: 'Delay',
  mastering: 'Mastering',
  utility: 'Utility',
  other: 'Other',
};

export const PLUGIN_ROLE_LABELS: Record<PluginRole, string> = {
  instrument: 'Instrument',
  sound_design: 'Sound Design',
  mix: 'Mixing',
  master: 'Mastering',
  processing: 'Processing',
};

export const HARDWARE_CATEGORY_LABELS: Record<HardwareCategory, string> = {
  synth: 'Synth',
  drum_machine: 'Drum Machine',
  sampler: 'Sampler',
  controller: 'Controller',
  interface: 'Audio Interface',
  outboard: 'Outboard',
  monitor: 'Monitor',
  mic: 'Microphone',
  other: 'Other',
};

export const HARDWARE_ROLE_LABELS: Record<HardwareRole, string> = {
  instrument: 'Instrument',
  control: 'Control',
  recording: 'Recording',
  monitoring: 'Monitoring',
  processing: 'Processing',
};

// ---- Curated catalogs (autocomplete suggestions) ----

export const DAW_CATALOG: string[] = [
  'Ableton Live',
  'FL Studio',
  'Logic Pro',
  'Pro Tools',
  'Cubase',
  'Studio One',
  'Reaper',
  'Bitwig Studio',
  'GarageBand',
  'Reason',
  'Nuendo',
  'Digital Performer',
  'Cakewalk',
  'Ardour',
  'LMMS',
  'Renoise',
  'BandLab',
  'Soundtrap',
];

export interface CatalogPlugin {
  name: string;
  manufacturer: string;
  category: PluginCategory;
}

export const PLUGIN_CATALOG: CatalogPlugin[] = [
  // Synths
  { name: 'Serum', manufacturer: 'Xfer Records', category: 'synth' },
  { name: 'Vital', manufacturer: 'Vital Audio', category: 'synth' },
  { name: 'Massive', manufacturer: 'Native Instruments', category: 'synth' },
  { name: 'Massive X', manufacturer: 'Native Instruments', category: 'synth' },
  { name: 'Omnisphere', manufacturer: 'Spectrasonics', category: 'synth' },
  { name: 'Sylenth1', manufacturer: 'LennarDigital', category: 'synth' },
  { name: 'Diva', manufacturer: 'u-he', category: 'synth' },
  { name: 'Serum 2', manufacturer: 'Xfer Records', category: 'synth' },
  { name: 'Pigments', manufacturer: 'Arturia', category: 'synth' },
  { name: 'Spire', manufacturer: 'Reveal Sound', category: 'synth' },
  { name: 'Nexus', manufacturer: 'reFX', category: 'synth' },
  { name: 'Sytrus', manufacturer: 'Image-Line', category: 'synth' },
  { name: 'Wavetable', manufacturer: 'Ableton', category: 'synth' },
  { name: 'Phase Plant', manufacturer: 'Kilohearts', category: 'synth' },
  // Samplers / instruments
  { name: 'Kontakt', manufacturer: 'Native Instruments', category: 'sampler' },
  { name: 'EXS24', manufacturer: 'Apple', category: 'sampler' },
  { name: 'Sampler', manufacturer: 'Ableton', category: 'sampler' },
  { name: 'Keyscape', manufacturer: 'Spectrasonics', category: 'sampler' },
  { name: 'Trilian', manufacturer: 'Spectrasonics', category: 'sampler' },
  // Drums
  { name: 'Battery', manufacturer: 'Native Instruments', category: 'drum_machine' },
  { name: 'Addictive Drums 2', manufacturer: 'XLN Audio', category: 'drum_machine' },
  { name: 'Superior Drummer 3', manufacturer: 'Toontrack', category: 'drum_machine' },
  { name: 'EZdrummer 3', manufacturer: 'Toontrack', category: 'drum_machine' },
  { name: 'Drumaxx', manufacturer: 'Image-Line', category: 'drum_machine' },
  // FX / processing
  { name: 'FabFilter Pro-Q 3', manufacturer: 'FabFilter', category: 'eq' },
  { name: 'FabFilter Pro-C 2', manufacturer: 'FabFilter', category: 'compressor' },
  { name: 'FabFilter Pro-L 2', manufacturer: 'FabFilter', category: 'mastering' },
  { name: 'FabFilter Pro-R', manufacturer: 'FabFilter', category: 'reverb' },
  { name: 'Valhalla VintageVerb', manufacturer: 'Valhalla DSP', category: 'reverb' },
  { name: 'Valhalla Room', manufacturer: 'Valhalla DSP', category: 'reverb' },
  { name: 'Valhalla Delay', manufacturer: 'Valhalla DSP', category: 'delay' },
  { name: 'EchoBoy', manufacturer: 'Soundtoys', category: 'delay' },
  { name: 'Decapitator', manufacturer: 'Soundtoys', category: 'fx' },
  { name: 'Little Plate', manufacturer: 'Soundtoys', category: 'reverb' },
  { name: 'Serato Sample', manufacturer: 'Serato', category: 'fx' },
  { name: 'Gullfoss', manufacturer: 'Soundtheory', category: 'eq' },
  { name: 'Soothe2', manufacturer: 'oeksound', category: 'eq' },
  { name: 'CLA-76', manufacturer: 'Waves', category: 'compressor' },
  { name: 'SSL G-Master Buss Compressor', manufacturer: 'Waves', category: 'compressor' },
  { name: 'RVerb', manufacturer: 'Waves', category: 'reverb' },
  { name: 'H-Delay', manufacturer: 'Waves', category: 'delay' },
  // Mastering
  { name: 'Ozone', manufacturer: 'iZotope', category: 'mastering' },
  { name: 'Ozone 11', manufacturer: 'iZotope', category: 'mastering' },
  { name: 'Neutron', manufacturer: 'iZotope', category: 'utility' },
  { name: 'RX', manufacturer: 'iZotope', category: 'utility' },
  { name: 'LANDR', manufacturer: 'LANDR', category: 'mastering' },
];

export interface CatalogHardware {
  name: string;
  manufacturer: string;
  category: HardwareCategory;
}

export const HARDWARE_CATALOG: CatalogHardware[] = [
  // Synths
  { name: 'Moog Subsequent 37', manufacturer: 'Moog', category: 'synth' },
  { name: 'Minimoog Model D', manufacturer: 'Moog', category: 'synth' },
  { name: 'Prophet-6', manufacturer: 'Sequential', category: 'synth' },
  { name: 'Prophet-5', manufacturer: 'Sequential', category: 'synth' },
  { name: 'Juno-106', manufacturer: 'Roland', category: 'synth' },
  { name: 'Jupiter-8', manufacturer: 'Roland', category: 'synth' },
  { name: 'MicroFreak', manufacturer: 'Arturia', category: 'synth' },
  { name: 'MiniFreak', manufacturer: 'Arturia', category: 'synth' },
  { name: 'Nord Lead A1', manufacturer: 'Nord', category: 'synth' },
  { name: 'Korg Minilogue', manufacturer: 'Korg', category: 'synth' },
  { name: 'Behringer Model D', manufacturer: 'Behringer', category: 'synth' },
  // Drum machines / grooveboxes
  { name: 'Roland TR-808', manufacturer: 'Roland', category: 'drum_machine' },
  { name: 'Roland TR-909', manufacturer: 'Roland', category: 'drum_machine' },
  { name: 'Elektron Digitakt', manufacturer: 'Elektron', category: 'drum_machine' },
  { name: 'Elektron Analog Rytm', manufacturer: 'Elektron', category: 'drum_machine' },
  { name: 'Akai MPC One', manufacturer: 'Akai', category: 'sampler' },
  { name: 'Akai MPC Live II', manufacturer: 'Akai', category: 'sampler' },
  { name: 'Teenage Engineering OP-1', manufacturer: 'Teenage Engineering', category: 'sampler' },
  // Controllers
  { name: 'Ableton Push 3', manufacturer: 'Ableton', category: 'controller' },
  { name: 'Novation Launchkey', manufacturer: 'Novation', category: 'controller' },
  { name: 'Novation Launchpad', manufacturer: 'Novation', category: 'controller' },
  { name: 'Akai MPK Mini', manufacturer: 'Akai', category: 'controller' },
  { name: 'Native Instruments Komplete Kontrol', manufacturer: 'Native Instruments', category: 'controller' },
  { name: 'Arturia KeyLab', manufacturer: 'Arturia', category: 'controller' },
  // Interfaces
  { name: 'Focusrite Scarlett 2i2', manufacturer: 'Focusrite', category: 'interface' },
  { name: 'Universal Audio Apollo Twin', manufacturer: 'Universal Audio', category: 'interface' },
  { name: 'Universal Audio Volt', manufacturer: 'Universal Audio', category: 'interface' },
  { name: 'RME Babyface Pro', manufacturer: 'RME', category: 'interface' },
  { name: 'Audient iD44', manufacturer: 'Audient', category: 'interface' },
  // Monitors
  { name: 'Yamaha HS8', manufacturer: 'Yamaha', category: 'monitor' },
  { name: 'KRK Rokit 7', manufacturer: 'KRK', category: 'monitor' },
  { name: 'Genelec 8040', manufacturer: 'Genelec', category: 'monitor' },
  { name: 'Adam Audio A7V', manufacturer: 'Adam Audio', category: 'monitor' },
  // Mics
  { name: 'Shure SM7B', manufacturer: 'Shure', category: 'mic' },
  { name: 'Neumann U87', manufacturer: 'Neumann', category: 'mic' },
  { name: 'AKG C414', manufacturer: 'AKG', category: 'mic' },
  { name: 'Rode NT1', manufacturer: 'Rode', category: 'mic' },
  // Outboard
  { name: 'Universal Audio 1176', manufacturer: 'Universal Audio', category: 'outboard' },
  { name: 'Neve 1073', manufacturer: 'Neve', category: 'outboard' },
];

// Convenience: returns true when the productionStack has any entries.
export function hasProductionStack(stack?: ProductionStack | null): boolean {
  if (!stack) return false;
  return (
    (stack.daws?.length || 0) +
      (stack.plugins?.length || 0) +
      (stack.hardware?.length || 0) >
    0
  );
}

export type GearType = 'daw' | 'plugin' | 'hardware';

/** URL-safe slug (matches backend Gear.slug generation) */
export function slugifyGearName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Path to a gear profile page — prefers canonical slug when available */
export function getGearProfilePath(
  entry: { name: string; slug?: string | null },
  type: GearType
): string {
  if (entry.slug) return `/gear/${entry.slug}`;
  const slug = slugifyGearName(entry.name);
  if (slug) return `/gear/${slug}`;
  return `/gear/${encodeURIComponent(entry.name)}?type=${type}`;
}

// AI tool catalog + shared types for Media.aiUsage.
// These lists power autocomplete only — users can always enter custom values.
// Keep category enum in sync with tuneable-backend/models/Media.js (aiUsage.tools).

export type AiToolCategory =
  | 'generation'
  | 'enhancement'
  | 'mixing'
  | 'mastering'
  | 'composition'
  | 'lyrics'
  | 'other';

export type AiDisclosure = 'none' | 'partial' | 'full';

export interface AiToolEntry {
  category: AiToolCategory;
  name: string;
  provider: string;
}

export interface AiUsage {
  used: boolean;
  disclosure: AiDisclosure;
  tools: AiToolEntry[];
  notes?: string;
}

export const AI_TOOL_CATEGORY_LABELS: Record<AiToolCategory, string> = {
  generation: 'Generation',
  enhancement: 'Enhancement',
  mixing: 'Mixing',
  mastering: 'Mastering',
  composition: 'Composition',
  lyrics: 'Lyrics',
  other: 'Other',
};

export const AI_TOOL_CATALOG: Array<{ name: string; provider: string; category: AiToolCategory }> = [
  { name: 'Suno', provider: 'Suno AI', category: 'generation' },
  { name: 'Udio', provider: 'Udio', category: 'generation' },
  { name: 'Stable Audio', provider: 'Stability AI', category: 'generation' },
  { name: 'MusicGen', provider: 'Meta', category: 'generation' },
  { name: 'AIVA', provider: 'AIVA Technologies', category: 'generation' },
  { name: 'Soundraw', provider: 'Soundraw', category: 'generation' },
  { name: 'Boomy', provider: 'Boomy', category: 'generation' },
  { name: 'ChatGPT', provider: 'OpenAI', category: 'lyrics' },
  { name: 'Claude', provider: 'Anthropic', category: 'lyrics' },
  { name: 'Gemini', provider: 'Google', category: 'lyrics' },
  { name: 'LANDR', provider: 'LANDR', category: 'mastering' },
  { name: 'iZotope Ozone', provider: 'iZotope', category: 'mastering' },
  { name: 'RipX', provider: 'Hit\'n\'Mix', category: 'enhancement' },
  { name: 'Lalal.ai', provider: 'Lalal.ai', category: 'enhancement' },
  { name: 'Adobe Podcast Enhance', provider: 'Adobe', category: 'enhancement' },
  { name: 'Splice AI', provider: 'Splice', category: 'composition' },
  { name: 'Amper Music', provider: 'Amper', category: 'generation' },
  { name: 'Mubert', provider: 'Mubert', category: 'generation' },
];

export const EMPTY_AI_USAGE: AiUsage = {
  used: false,
  disclosure: 'none',
  tools: [],
  notes: '',
};

/** Derive disclosure level from checkbox + structured data (no manual dropdown). */
export const deriveAiDisclosure = (
  used: boolean,
  tools: AiToolEntry[],
  notes?: string
): AiDisclosure => {
  if (!used) return 'none';
  const hasTools = tools.some((t) => t.name?.trim());
  if (hasTools) return 'full';
  if (notes?.trim()) return 'partial';
  return 'partial';
};

export const hasAiUsage = (aiUsage?: AiUsage | null): boolean =>
  !!(aiUsage?.used);

export const cleanAiTools = (tools: AiToolEntry[]): AiToolEntry[] =>
  tools.filter((t) => t.name?.trim());

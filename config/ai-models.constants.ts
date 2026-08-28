/**
 * AI model catalogues for the assistant.
 * ======================================
 * Mirror of dehubweb's `src/constants/{chat,image,video,voice}-models.constants.ts`
 * and `ai-tools.constants.ts`. The ids are the contract with the edge functions
 * — `generate-image`, `generate-video` and `fal-ai-tools` look each one up in
 * their own tables, and `_shared/ai-pricing.ts` prices the job from the same
 * key, so an id that drifts is rejected as an unknown model rather than
 * quietly falling back.
 *
 * Every `baseCostUsd` here is DISPLAY ONLY. The server quotes the real charge
 * (see `quoteAiJob` in services/ai.service.ts) and debits it itself, so these
 * figures only ever populate the "from" price in a model picker. They still
 * have to be kept in step with web by hand.
 */

/* ── Pricing helpers (display only) ──────────────────────────────────────── */

/**
 * Matches the gateway peg web uses in `use-ai-quote.ts`. Display only — used
 * for the indicative per-model figures in a picker, never for a charge.
 */
export const DHB_USD_PEG = 0.001;

/** Markup web applies for display. The server applies its own. */
export const AI_MARKUP = 0.2;

export const withMarkup = (baseCostUsd: number): number => baseCostUsd * (1 + AI_MARKUP);

/** Indicative DHB price at the peg, rounded up like the server does. */
export const indicativeDhb = (baseCostUsd: number, quantity = 1): number =>
  Math.ceil((withMarkup(baseCostUsd) * quantity) / DHB_USD_PEG);

/** Shared formatting so every price reads the same as web's. */
export function formatDhb(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(2)}M`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(1)}K`;
  return Math.round(amount).toLocaleString();
}

/* ── Chat models ─────────────────────────────────────────────────────────── */

export interface ChatModelOption {
  id: string;
  name: string;
  description: string;
  emoji: string;
}

export const CHAT_MODEL_OPTIONS: ChatModelOption[] = [
  { id: 'auto', name: 'Auto', description: 'DeHub trained model', emoji: '✨' },
  { id: 'gemini-2.5-flash', name: 'Gemini Flash', description: 'Fast & free', emoji: '⚡' },
  { id: 'gemini-2.5-pro', name: 'Gemini Pro', description: 'Best reasoning $$', emoji: '💎' },
  { id: 'gpt-5-mini', name: 'GPT-5 Mini', description: 'OpenAI $', emoji: '🧠' },
  { id: 'grok-4', name: 'Grok 4', description: 'xAI flagship $$$', emoji: '🔮' },
];

export const DEFAULT_CHAT_MODEL = 'auto';

/* ── Image models ────────────────────────────────────────────────────────── */

export interface ImageModel {
  id: string;
  name: string;
  description: string;
  emoji: string;
  tier: 'premium' | 'standard' | 'fast';
  baseCostUsd: number;
  /**
   * Whether the model can take an attached image as an edit reference.
   * Defaults to true. The ones set false have no edit endpoint at all, so
   * generate-image rejects the request — which, without this, only happened
   * after the payment had already been taken.
   */
  supportsEdit?: boolean;
}

export const imageModelSupportsEdit = (model: ImageModel): boolean =>
  model.supportsEdit !== false;

export const IMAGE_MODELS: Record<string, ImageModel> = {
  'gemini-2.5-flash': {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    description: 'Fast, balanced quality',
    emoji: '⚡',
    tier: 'fast',
    baseCostUsd: 0.02,
  },
  'gemini-3.1-flash-image': {
    id: 'gemini-3.1-flash-image',
    name: 'Nano Banana 2',
    description: 'Fast brand image generation',
    emoji: '🍌',
    tier: 'fast',
    baseCostUsd: 0.01,
  },
  'gemini-3-pro-image': {
    id: 'gemini-3-pro-image',
    name: 'Gemini 3 Pro',
    description: 'Latest, highest quality',
    emoji: '✨',
    tier: 'premium',
    baseCostUsd: 0.08,
  },
  'grok-2-image': {
    id: 'grok-2-image',
    name: 'Grok Aurora',
    description: 'xAI image generation',
    emoji: '🔮',
    tier: 'premium',
    baseCostUsd: 0.06,
  },
  'nano-banana-pro': {
    id: 'nano-banana-pro',
    name: 'Nano Banana Pro',
    description: 'Best-in-class text and diagrams',
    emoji: '🍌',
    tier: 'premium',
    baseCostUsd: 0.09,
  },
  'nano-banana-2': {
    id: 'nano-banana-2',
    name: 'Nano Banana 2',
    description: 'Fast, photoreal, very versatile',
    emoji: '🍌',
    tier: 'standard',
    baseCostUsd: 0.06,
  },
  'seedream-v4.5': {
    id: 'seedream-v4.5',
    name: 'Seedream 4.5',
    description: 'Precise control and transformations',
    emoji: '🌊',
    tier: 'standard',
    baseCostUsd: 0.0325,
  },
  'flux-2-pro': {
    id: 'flux-2-pro',
    name: 'FLUX.2 Pro',
    description: 'Exceptional prompt adherence',
    emoji: '⚡',
    tier: 'standard',
    baseCostUsd: 0.025,
  },
  'flux-kontext-max': {
    id: 'flux-kontext-max',
    name: 'FLUX Kontext Max',
    description: 'Context-aware editing and style transfer',
    emoji: '🎛️',
    tier: 'premium',
    baseCostUsd: 0.08,
  },
  'flux-2-flex': {
    id: 'flux-2-flex',
    name: 'FLUX.2 Flex',
    description: 'Tunable steps and guidance for fine control',
    emoji: '🎚️',
    tier: 'standard',
    baseCostUsd: 0.05,
    supportsEdit: false,
  },
  'z-image-turbo': {
    id: 'z-image-turbo',
    name: 'Z-Image Turbo',
    description: 'Near-instant drafts at the lowest price here',
    emoji: '🪄',
    tier: 'fast',
    baseCostUsd: 0.006,
    supportsEdit: false,
  },
  'recraft-v4.1': {
    id: 'recraft-v4.1',
    name: 'Recraft V4.1',
    description: 'Brand-grade illustration and layout',
    emoji: '🎨',
    tier: 'standard',
    baseCostUsd: 0.035,
    supportsEdit: false,
  },
  'recraft-v4.1-vector': {
    id: 'recraft-v4.1-vector',
    name: 'Recraft Vector',
    description: 'True SVG logos and icons',
    emoji: '📐',
    tier: 'standard',
    baseCostUsd: 0.08,
    supportsEdit: false,
  },
  'ideogram-v3': {
    id: 'ideogram-v3',
    name: 'Ideogram V3',
    description: 'Strongest typography in a poster',
    emoji: '🔤',
    tier: 'standard',
    baseCostUsd: 0.06,
  },
  'qwen-image': {
    id: 'qwen-image',
    name: 'Qwen Image',
    description: 'Cheapest solid all-rounder',
    emoji: '🪶',
    tier: 'fast',
    baseCostUsd: 0.02,
  },
  'grok-imagine': {
    id: 'grok-imagine',
    name: 'Grok Imagine',
    description: 'Expressive, high-contrast, bold',
    emoji: '🔮',
    tier: 'fast',
    baseCostUsd: 0.02,
  },
};

export const IMAGE_MODEL_OPTIONS = Object.values(IMAGE_MODELS);
export type ImageModelKey = string;

export const DEFAULT_IMAGE_MODEL: ImageModelKey = 'gemini-2.5-flash';

/** The model the DeHub poster studio composites the wordmark with. */
export const DEHUB_BRAND_IMAGE_MODEL: ImageModelKey = 'gemini-3.1-flash-image';

/* ── Video models ────────────────────────────────────────────────────────── */

export type VideoDirection = 'text-to-video' | 'image-to-video';

export interface VideoModel {
  id: string;
  name: string;
  description: string;
  emoji: string;
  tier: 'premium' | 'standard' | 'fast';
  baseCostUsd: number;
  /** Per-second rate where the provider bills by duration. */
  perSecondCostUsd?: number;
  supports: VideoDirection[];
  hasAudio?: boolean;
  defaultDuration?: number;
  maxDuration?: number;
}

/**
 * Web's full catalogue. This used to carry only the five models the original
 * spec listed, which meant fifteen models that already work server-side — every
 * Seedance, both Veos, all three Klings — could not be picked from a phone.
 */
export const VIDEO_MODELS: Record<string, VideoModel> = {
  'seedance-2.5': {
    id: 'seedance-2.5',
    name: 'Seedance 2.5',
    description: 'ByteDance flagship — 30s takes, best prompt adherence',
    emoji: '🌊',
    tier: 'premium',
    baseCostUsd: 1.575,
    perSecondCostUsd: 0.315,
    supports: ['text-to-video', 'image-to-video'],
    hasAudio: true,
    defaultDuration: 5,
    maxDuration: 30,
  },
  'veo-3.1': {
    id: 'veo-3.1',
    name: 'Veo 3.1',
    description: 'Google flagship, ultra-realistic with audio',
    emoji: '🎥',
    tier: 'premium',
    baseCostUsd: 1.275,
    supports: ['text-to-video', 'image-to-video'],
    hasAudio: true,
    defaultDuration: 4,
    maxDuration: 8,
  },
  'kling-2.6-pro': {
    id: 'kling-2.6-pro',
    name: 'Kling 2.6 Pro',
    description: 'Top-tier cinematic with native audio',
    emoji: '🎬',
    tier: 'premium',
    baseCostUsd: 1.1,
    supports: ['text-to-video', 'image-to-video'],
    hasAudio: true,
    defaultDuration: 5,
    maxDuration: 10,
  },
  'seedance-2.0-fast': {
    id: 'seedance-2.0-fast',
    name: 'Seedance 2.0 Fast',
    description: 'Faster generation, slightly lower quality',
    emoji: '⚡',
    tier: 'standard',
    baseCostUsd: 0.8,
    perSecondCostUsd: 0.16,
    supports: ['text-to-video', 'image-to-video'],
    hasAudio: true,
    defaultDuration: 5,
    maxDuration: 15,
  },
  'seedance-2.0': {
    id: 'seedance-2.0',
    name: 'Seedance 2.0',
    description: 'Latest ByteDance model, superior quality & audio',
    emoji: '🌊',
    tier: 'premium',
    baseCostUsd: 0.825,
    perSecondCostUsd: 0.165,
    supports: ['text-to-video', 'image-to-video'],
    hasAudio: true,
    defaultDuration: 5,
    maxDuration: 15,
  },
  'kling-3.0': {
    id: 'kling-3.0',
    name: 'Kling 3.0 Pro',
    description: 'Multi-shot, audio sync, long takes',
    emoji: '🎞️',
    tier: 'premium',
    baseCostUsd: 0.675,
    perSecondCostUsd: 0.135,
    supports: ['text-to-video', 'image-to-video'],
    hasAudio: true,
    defaultDuration: 5,
    maxDuration: 15,
  },
  'luma-ray2': {
    id: 'luma-ray2',
    name: 'Luma Ray 2',
    description: 'Photorealistic, dreamy aesthetic (720p)',
    emoji: '✨',
    tier: 'premium',
    baseCostUsd: 0.65,
    supports: ['text-to-video'],
  },
  'seedance-1.5-pro': {
    id: 'seedance-1.5-pro',
    name: 'Seedance 1.5 Pro',
    description: 'ByteDance cinematic with native audio',
    emoji: '🌊',
    tier: 'premium',
    baseCostUsd: 0.65,
    supports: ['text-to-video', 'image-to-video'],
    hasAudio: true,
    defaultDuration: 5,
    maxDuration: 12,
  },
  'wan-2.6': {
    id: 'wan-2.6',
    name: 'Wan 2.6',
    description: 'Character-consistent with synced audio',
    emoji: '🎭',
    tier: 'premium',
    baseCostUsd: 0.525,
    perSecondCostUsd: 0.105,
    supports: ['image-to-video'],
    hasAudio: true,
    defaultDuration: 5,
    maxDuration: 15,
  },
  'runway-gen4': {
    id: 'runway-gen4',
    name: 'Runway Gen-4 Turbo',
    description: 'Animate images (requires image)',
    emoji: '🚀',
    tier: 'premium',
    baseCostUsd: 0.5,
    supports: ['image-to-video'],
    defaultDuration: 10,
    maxDuration: 10,
  },
  'kling-3.0-standard': {
    id: 'kling-3.0-standard',
    name: 'Kling 3.0 Standard',
    description: 'Same model, lighter render tier',
    emoji: '🎬',
    tier: 'standard',
    baseCostUsd: 0.5,
    perSecondCostUsd: 0.1,
    supports: ['text-to-video', 'image-to-video'],
    hasAudio: true,
    defaultDuration: 5,
    maxDuration: 15,
  },
  'wan-2.5': {
    id: 'wan-2.5',
    name: 'Wan 2.5',
    description: 'Open-weight, stylised and experimental',
    emoji: '🌈',
    tier: 'standard',
    baseCostUsd: 0.5,
    perSecondCostUsd: 0.1,
    supports: ['text-to-video', 'image-to-video'],
    defaultDuration: 5,
    maxDuration: 10,
  },
  'hailuo-2.3': {
    id: 'hailuo-2.3',
    name: 'MiniMax Hailuo 2.3',
    description: 'Natural physics and facial emotion',
    emoji: '🌀',
    tier: 'premium',
    baseCostUsd: 0.49,
    supports: ['text-to-video', 'image-to-video'],
  },
  'hailuo-2.3-fast': {
    id: 'hailuo-2.3-fast',
    name: 'Hailuo 2.3 Fast',
    description: 'Quicker, cheaper Hailuo',
    emoji: '💨',
    tier: 'standard',
    baseCostUsd: 0.33,
    supports: ['image-to-video'],
  },
  'veo-3.1-fast': {
    id: 'veo-3.1-fast',
    name: 'Veo 3.1 Fast',
    description: 'Veo look, a quarter of the price',
    emoji: '⚡',
    tier: 'standard',
    baseCostUsd: 0.325,
    supports: ['text-to-video', 'image-to-video'],
    hasAudio: true,
    defaultDuration: 4,
    maxDuration: 8,
  },
  'minimax-video': {
    id: 'minimax-video',
    name: 'Minimax Video-01',
    description: 'Fast generation, great quality',
    emoji: '⚡',
    tier: 'standard',
    baseCostUsd: 0.22,
    supports: ['text-to-video', 'image-to-video'],
  },
  'kling-2.5-turbo': {
    id: 'kling-2.5-turbo',
    name: 'Kling 2.5 Turbo Pro',
    description: 'Fluid motion and tight prompt precision, no audio',
    emoji: '🌪️',
    tier: 'standard',
    baseCostUsd: 0.21,
    perSecondCostUsd: 0.042,
    supports: ['text-to-video', 'image-to-video'],
    defaultDuration: 5,
    maxDuration: 10,
  },
  'luma-ray2-flash': {
    id: 'luma-ray2-flash',
    name: 'Luma Ray 2 Flash',
    description: 'Dreamy Luma aesthetic, budget tier',
    emoji: '✨',
    tier: 'fast',
    baseCostUsd: 0.2,
    supports: ['text-to-video', 'image-to-video'],
    defaultDuration: 5,
    maxDuration: 9,
  },
  'pixverse-v5': {
    id: 'pixverse-v5',
    name: 'PixVerse V5',
    description: 'Stylised and anime-leaning motion',
    emoji: '🎨',
    tier: 'standard',
    baseCostUsd: 0.2,
    supports: ['text-to-video', 'image-to-video'],
    defaultDuration: 5,
    maxDuration: 8,
  },
  'ltx-13b': {
    id: 'ltx-13b',
    name: 'LTX Video 13B',
    description: 'Cheapest per second, fast drafts',
    emoji: '🪶',
    tier: 'fast',
    baseCostUsd: 0.1,
    perSecondCostUsd: 0.02,
    supports: ['text-to-video', 'image-to-video'],
    defaultDuration: 5,
    maxDuration: 10,
  },
  'ltx-video': {
    id: 'ltx-video',
    name: 'LTX Video',
    description: 'Fast and efficient',
    emoji: '💨',
    tier: 'fast',
    baseCostUsd: 0.085,
    supports: ['text-to-video', 'image-to-video'],
  },
};

export const VIDEO_MODEL_OPTIONS = Object.values(VIDEO_MODELS);
export type VideoModelKey = string;

export const DEFAULT_VIDEO_MODEL: VideoModelKey = 'kling-2.6-pro';

export const videoSupportsText = (model: VideoModel): boolean =>
  model.supports.includes('text-to-video');

export const videoSupportsImage = (model: VideoModel): boolean =>
  model.supports.includes('image-to-video');

/**
 * Indicative USD for a run. Per-second models scale with duration, matching
 * web's `getVideoCostUsd` — a flat figure would understate a 30s Seedance by 6×.
 */
export const videoCostUsd = (model: VideoModel, durationSeconds?: number): number => {
  if (model.perSecondCostUsd && durationSeconds) {
    return withMarkup(model.perSecondCostUsd * durationSeconds);
  }
  return withMarkup(model.baseCostUsd);
};

/* ── fal.ai tools ────────────────────────────────────────────────────────── */

export type AiToolCategory =
  | 'music'
  | 'tts'
  | 'background-removal'
  | 'upscale'
  | 'speech-to-text';

export interface AiToolModel {
  id: string;
  /** Edge-function tool key. Same as `id` for every tool we ship. */
  tool: string;
  name: string;
  description: string;
  emoji: string;
  category: AiToolCategory;
  tier: 'premium' | 'standard' | 'fast';
  baseCostUsd: number;
  requiresImage?: boolean;
  requiresAudio?: boolean;
}

export const AI_TOOL_MODELS: Record<string, AiToolModel> = {
  'minimax-music': {
    id: 'minimax-music',
    tool: 'minimax-music',
    name: 'MiniMax Music 2.0',
    description: 'Full songs with lyrics & vocals',
    emoji: '🎵',
    category: 'music',
    tier: 'premium',
    baseCostUsd: 0.165,
  },
  'ace-step': {
    id: 'ace-step',
    tool: 'ace-step',
    name: 'ACE-Step',
    description: 'Fast music, great for instrumentals',
    emoji: '🎶',
    category: 'music',
    tier: 'standard',
    baseCostUsd: 0.05,
  },
  'dia-tts': {
    id: 'dia-tts',
    tool: 'dia-tts',
    name: 'Dia TTS',
    description: 'Ultra-realistic dialogue & speech',
    emoji: '🗣️',
    category: 'tts',
    tier: 'premium',
    baseCostUsd: 0.04,
  },
  birefnet: {
    id: 'birefnet',
    tool: 'birefnet',
    name: 'BiRefNet',
    description: 'Professional background removal',
    emoji: '✂️',
    category: 'background-removal',
    tier: 'fast',
    baseCostUsd: 0.02,
    requiresImage: true,
  },
  'creative-upscaler': {
    id: 'creative-upscaler',
    tool: 'creative-upscaler',
    name: 'Creative Upscaler',
    description: 'AI-enhanced upscaling with detail',
    emoji: '🔍',
    category: 'upscale',
    tier: 'premium',
    baseCostUsd: 0.08,
    requiresImage: true,
  },
  'aura-sr': {
    id: 'aura-sr',
    tool: 'aura-sr',
    name: 'AuraSR',
    description: 'Fast 4x upscale',
    emoji: '⚡',
    category: 'upscale',
    tier: 'fast',
    baseCostUsd: 0.04,
    requiresImage: true,
  },
  whisper: {
    id: 'whisper',
    tool: 'whisper',
    name: 'Whisper',
    description: 'Speech transcription & translation',
    emoji: '📝',
    category: 'speech-to-text',
    tier: 'standard',
    baseCostUsd: 0.03,
    requiresAudio: true,
  },
};

export const AI_TOOL_OPTIONS = Object.values(AI_TOOL_MODELS);

export const getToolsByCategory = (category: AiToolCategory): AiToolModel[] =>
  AI_TOOL_OPTIONS.filter((t) => t.category === category);

export const CATEGORY_LABELS: Record<AiToolCategory, { label: string; emoji: string }> = {
  music: { label: 'Music Generation', emoji: '🎵' },
  tts: { label: 'Text-to-Speech', emoji: '🗣️' },
  'background-removal': { label: 'Background Removal', emoji: '✂️' },
  upscale: { label: 'Image Upscaling', emoji: '🔍' },
  'speech-to-text': { label: 'Speech-to-Text', emoji: '📝' },
};

/** Which tool a detected request defaults to before the user changes it. */
export const DEFAULT_TOOL_FOR_CATEGORY: Record<AiToolCategory, string> = {
  music: 'minimax-music',
  tts: 'dia-tts',
  'background-removal': 'birefnet',
  upscale: 'creative-upscaler',
  'speech-to-text': 'whisper',
};

/* ── Voice ───────────────────────────────────────────────────────────────── */

/**
 * Voice presets. Web maps these onto Web Speech API voice names; there is no
 * such registry on a device, so the id is passed to `elevenlabs-tts` / Dia as
 * a gender hint and the label is what the settings sheet shows.
 */
export interface VoicePreference {
  id: string;
  name: string;
  description: string;
  emoji: string;
}

export const VOICE_PREFERENCES: Record<string, VoicePreference> = {
  female: { id: 'female', name: 'Female', description: 'Warmer, higher register', emoji: '👩' },
  male: { id: 'male', name: 'Male', description: 'Lower register', emoji: '👨' },
  neutral: { id: 'neutral', name: 'Neutral', description: 'System default voice', emoji: '🤖' },
};

export const VOICE_PREFERENCE_OPTIONS = Object.values(VOICE_PREFERENCES);
export type VoicePreferenceKey = string;

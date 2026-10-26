import { translateCopy as _translateCopy } from '../i18n/copy';
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

import { CREATOR_FAL_IMAGE_MODELS, CREATOR_FAL_VIDEO_MODELS } from './creator-fal-catalog';

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
  { id: 'auto', name: 'Auto', get description() { return _translateCopy("copy.4a9fd15a895c", { defaultValue: "DeHub trained model" }); }, emoji: '✨' },
  { id: 'gemini-2.5-flash', name: 'Gemini Flash', get description() { return _translateCopy("copy.98f96a4d8578", { defaultValue: "Fast & free" }); }, emoji: '⚡' },
  { id: 'gemini-2.5-pro', name: 'Gemini Pro', get description() { return _translateCopy("copy.6157bb4bd99f", { defaultValue: "Best reasoning $$" }); }, emoji: '💎' },
  { id: 'gpt-5-mini', name: 'GPT-5 Mini', get description() { return _translateCopy("copy.af4707aebdfa", { defaultValue: "OpenAI $" }); }, emoji: '🧠' },
  { id: 'grok-4', name: 'Grok 4', get description() { return _translateCopy("copy.362058144c4a", { defaultValue: "xAI flagship $$$" }); }, emoji: '🔮' },
];

export const DEFAULT_CHAT_MODEL = 'auto';

/* ── Image models ────────────────────────────────────────────────────────── */

export interface ImageModel {
  id: string;
  requiresImage?: boolean;
  outpaint?: boolean;
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
  ...CREATOR_FAL_IMAGE_MODELS,
  'gemini-2.5-flash': {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    get description() { return _translateCopy("copy.f4af9ded2e84", { defaultValue: "Fast, balanced quality" }); },
    emoji: '⚡',
    tier: 'fast',
    baseCostUsd: 0.02,
  },
  'gemini-3.1-flash-image': {
    id: 'gemini-3.1-flash-image',
    name: 'Nano Banana 2',
    get description() { return _translateCopy("copy.7a403d743104", { defaultValue: "Fast brand image generation" }); },
    emoji: '🍌',
    tier: 'fast',
    baseCostUsd: 0.01,
  },
  'gemini-3-pro-image': {
    id: 'gemini-3-pro-image',
    name: 'Gemini 3 Pro',
    get description() { return _translateCopy("copy.cdb1f3a5c747", { defaultValue: "Latest, highest quality" }); },
    emoji: '✨',
    tier: 'premium',
    baseCostUsd: 0.08,
  },
  'grok-2-image': {
    id: 'grok-2-image',
    name: 'Grok Aurora',
    get description() { return _translateCopy("copy.e7f08f1acc2a", { defaultValue: "xAI image generation" }); },
    emoji: '🔮',
    tier: 'premium',
    baseCostUsd: 0.06,
  },
  'nano-banana-pro': {
    id: 'nano-banana-pro',
    name: 'Nano Banana Pro',
    get description() { return _translateCopy("copy.674c9031cb7a", { defaultValue: "Best-in-class text and diagrams" }); },
    emoji: '🍌',
    tier: 'premium',
    baseCostUsd: 0.09,
  },
  'nano-banana-2': {
    id: 'nano-banana-2',
    name: 'Nano Banana 2',
    get description() { return _translateCopy("copy.6e8213cac3d3", { defaultValue: "Fast, photoreal, very versatile" }); },
    emoji: '🍌',
    tier: 'standard',
    baseCostUsd: 0.06,
  },
  'seedream-v4.5': {
    id: 'seedream-v4.5',
    name: 'Seedream 4.5',
    get description() { return _translateCopy("copy.85cad149b522", { defaultValue: "Precise control and transformations" }); },
    emoji: '🌊',
    tier: 'standard',
    baseCostUsd: 0.0325,
  },
  'flux-2-pro': {
    id: 'flux-2-pro',
    name: 'FLUX.2 Pro',
    get description() { return _translateCopy("copy.a52e8253b78b", { defaultValue: "Exceptional prompt adherence" }); },
    emoji: '⚡',
    tier: 'standard',
    baseCostUsd: 0.025,
  },
  'flux-kontext-max': {
    id: 'flux-kontext-max',
    name: 'FLUX Kontext Max',
    get description() { return _translateCopy("copy.b3de46c00525", { defaultValue: "Context-aware editing and style transfer" }); },
    emoji: '🎛️',
    tier: 'premium',
    baseCostUsd: 0.08,
  },
  'flux-2-flex': {
    id: 'flux-2-flex',
    name: 'FLUX.2 Flex',
    get description() { return _translateCopy("copy.8f7918a80c26", { defaultValue: "Tunable steps and guidance for fine control" }); },
    emoji: '🎚️',
    tier: 'standard',
    baseCostUsd: 0.05,
    supportsEdit: false,
  },
  'z-image-turbo': {
    id: 'z-image-turbo',
    name: 'Z-Image Turbo',
    get description() { return _translateCopy("copy.7f05ce754d0e", { defaultValue: "Near-instant drafts at the lowest price here" }); },
    emoji: '🪄',
    tier: 'fast',
    baseCostUsd: 0.006,
    supportsEdit: false,
  },
  'recraft-v4.1': {
    id: 'recraft-v4.1',
    name: 'Recraft V4.1',
    get description() { return _translateCopy("copy.b9bc1ba02125", { defaultValue: "Brand-grade illustration and layout" }); },
    emoji: '🎨',
    tier: 'standard',
    baseCostUsd: 0.035,
    supportsEdit: false,
  },
  'recraft-v4.1-vector': {
    id: 'recraft-v4.1-vector',
    name: 'Recraft Vector',
    get description() { return _translateCopy("copy.0f2a22d8a443", { defaultValue: "True SVG logos and icons" }); },
    emoji: '📐',
    tier: 'standard',
    baseCostUsd: 0.08,
    supportsEdit: false,
  },
  'ideogram-v3': {
    id: 'ideogram-v3',
    name: 'Ideogram V3',
    get description() { return _translateCopy("copy.b5893515b61f", { defaultValue: "Strongest typography in a poster" }); },
    emoji: '🔤',
    tier: 'standard',
    baseCostUsd: 0.06,
  },
  'qwen-image': {
    id: 'qwen-image',
    name: 'Qwen Image',
    get description() { return _translateCopy("copy.fc6ec390be63", { defaultValue: "Cheapest solid all-rounder" }); },
    emoji: '🪶',
    tier: 'fast',
    baseCostUsd: 0.02,
  },
  'grok-imagine': {
    id: 'grok-imagine',
    name: 'Grok Imagine',
    get description() { return _translateCopy("copy.0459220de3f8", { defaultValue: "Expressive, high-contrast, bold" }); },
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
  supportsSeed?: boolean;
  supportsNegativePrompt?: boolean;
  supportsEndFrame?: boolean;
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
  requiresVideoInput?: boolean;
  supportsVideoInput?: boolean;
  maxReferenceImages?: number;
  referenceMode?: 'edit' | 'motion' | 'extend';
  maxSourceDuration?: number;
  defaultDuration?: number;
  maxDuration?: number;
}

/**
 * Web's full catalogue. This used to carry only the five models the original
 * spec listed, which meant fifteen models that already work server-side — every
 * Seedance, both Veos, all three Klings — could not be picked from a phone.
 */
export const VIDEO_MODELS: Record<string, VideoModel> = {
  ...CREATOR_FAL_VIDEO_MODELS,
  'seedance-2.5': {
    id: 'seedance-2.5',
    supportsNegativePrompt: false,
    supportsEndFrame: true,
    supportsSeed: true,
    name: 'Seedance 2.5',
    get description() { return _translateCopy("copy.b8c339f21031", { defaultValue: "ByteDance flagship — 30s takes, best prompt adherence" }); },
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
    get description() { return _translateCopy("copy.8e831aaaa051", { defaultValue: "Google flagship, ultra-realistic with audio" }); },
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
    supportsNegativePrompt: true,
    supportsSeed: true,
    name: 'Kling 2.6 Pro',
    get description() { return _translateCopy("copy.4bddb1751509", { defaultValue: "Top-tier cinematic with native audio" }); },
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
    supportsNegativePrompt: true,
    supportsEndFrame: true,
    supportsSeed: true,
    name: 'Seedance 2.0 Fast',
    get description() { return _translateCopy("copy.f4a56d3cb00f", { defaultValue: "Faster generation, slightly lower quality" }); },
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
    supportsNegativePrompt: true,
    supportsEndFrame: true,
    supportsSeed: true,
    name: 'Seedance 2.0',
    get description() { return _translateCopy("copy.c5a1d3b9268d", { defaultValue: "Latest ByteDance model, superior quality & audio" }); },
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
    supportsNegativePrompt: true,
    name: 'Kling 3.0 Pro',
    get description() { return _translateCopy("copy.e2741c299499", { defaultValue: "Multi-shot, audio sync, long takes" }); },
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
    get description() { return _translateCopy("copy.897e18877075", { defaultValue: "Photorealistic, dreamy aesthetic (720p)" }); },
    emoji: '✨',
    tier: 'premium',
    baseCostUsd: 0.65,
    supports: ['text-to-video'],
  },
  'seedance-1.5-pro': {
    id: 'seedance-1.5-pro',
    supportsNegativePrompt: true,
    supportsSeed: true,
    name: 'Seedance 1.5 Pro',
    get description() { return _translateCopy("copy.ee76a220959c", { defaultValue: "ByteDance cinematic with native audio" }); },
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
    get description() { return _translateCopy("copy.cc65f4a45ebf", { defaultValue: "Character-consistent with synced audio" }); },
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
    get description() { return _translateCopy("copy.3385bf19ecf6", { defaultValue: "Animate images (requires image)" }); },
    emoji: '🚀',
    tier: 'premium',
    baseCostUsd: 0.5,
    supports: ['image-to-video'],
    defaultDuration: 10,
    maxDuration: 10,
  },
  'kling-3.0-standard': {
    id: 'kling-3.0-standard',
    supportsNegativePrompt: true,
    name: 'Kling 3.0 Standard',
    get description() { return _translateCopy("copy.b50840a8facb", { defaultValue: "Same model, lighter render tier" }); },
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
    supportsNegativePrompt: true,
    name: 'Wan 2.5',
    get description() { return _translateCopy("copy.a525541f3e90", { defaultValue: "Open-weight, stylised and experimental" }); },
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
    get description() { return _translateCopy("copy.c1cc166082bf", { defaultValue: "Natural physics and facial emotion" }); },
    emoji: '🌀',
    tier: 'premium',
    baseCostUsd: 0.49,
    supports: ['text-to-video', 'image-to-video'],
  },
  'hailuo-2.3-fast': {
    id: 'hailuo-2.3-fast',
    name: 'Hailuo 2.3 Fast',
    get description() { return _translateCopy("copy.970971377727", { defaultValue: "Quicker, cheaper Hailuo" }); },
    emoji: '💨',
    tier: 'standard',
    baseCostUsd: 0.33,
    supports: ['image-to-video'],
  },
  'veo-3.1-fast': {
    id: 'veo-3.1-fast',
    name: 'Veo 3.1 Fast',
    get description() { return _translateCopy("copy.d593de2ed999", { defaultValue: "Veo look, a quarter of the price" }); },
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
    get description() { return _translateCopy("copy.f508a0cf129e", { defaultValue: "Fast generation, great quality" }); },
    emoji: '⚡',
    tier: 'standard',
    baseCostUsd: 0.22,
    supports: ['text-to-video', 'image-to-video'],
  },
  'kling-2.5-turbo': {
    id: 'kling-2.5-turbo',
    supportsNegativePrompt: true,
    name: 'Kling 2.5 Turbo Pro',
    get description() { return _translateCopy("copy.ea5e0b780f7b", { defaultValue: "Fluid motion and tight prompt precision, no audio" }); },
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
    get description() { return _translateCopy("copy.18ecea8f32e4", { defaultValue: "Dreamy Luma aesthetic, budget tier" }); },
    emoji: '✨',
    tier: 'fast',
    baseCostUsd: 0.2,
    supports: ['text-to-video', 'image-to-video'],
    defaultDuration: 5,
    maxDuration: 9,
  },
  'pixverse-v5': {
    id: 'pixverse-v5',
    supportsNegativePrompt: true,
    name: 'PixVerse V5',
    get description() { return _translateCopy("copy.b19b2e83cbb1", { defaultValue: "Stylised and anime-leaning motion" }); },
    emoji: '🎨',
    tier: 'standard',
    baseCostUsd: 0.2,
    supports: ['text-to-video', 'image-to-video'],
    defaultDuration: 5,
    maxDuration: 8,
  },
  'ltx-13b': {
    id: 'ltx-13b',
    supportsSeed: true,
    supportsNegativePrompt: true,
    name: 'LTX Video 13B',
    get description() { return _translateCopy("copy.d2847c1435c7", { defaultValue: "Cheapest per second, fast drafts" }); },
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
    supportsSeed: true,
    supportsNegativePrompt: true,
    name: 'LTX Video',
    get description() { return _translateCopy("copy.8884959c3902", { defaultValue: "Fast and efficient" }); },
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
    get description() { return _translateCopy("copy.3356505b6f4d", { defaultValue: "Full songs with lyrics & vocals" }); },
    emoji: '🎵',
    category: 'music',
    tier: 'premium',
    baseCostUsd: 0.165,
  },
  'ace-step': {
    id: 'ace-step',
    tool: 'ace-step',
    name: 'ACE-Step',
    get description() { return _translateCopy("copy.fab618372ef2", { defaultValue: "Fast music, great for instrumentals" }); },
    emoji: '🎶',
    category: 'music',
    tier: 'standard',
    baseCostUsd: 0.05,
  },
  'dia-tts': {
    id: 'dia-tts',
    tool: 'dia-tts',
    name: 'Dia TTS',
    get description() { return _translateCopy("copy.1edd473d8b41", { defaultValue: "Ultra-realistic dialogue & speech" }); },
    emoji: '🗣️',
    category: 'tts',
    tier: 'premium',
    baseCostUsd: 0.04,
  },
  birefnet: {
    id: 'birefnet',
    tool: 'birefnet',
    name: 'BiRefNet',
    get description() { return _translateCopy("copy.48e13842b229", { defaultValue: "Professional background removal" }); },
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
    get description() { return _translateCopy("copy.1429fb35f906", { defaultValue: "AI-enhanced upscaling with detail" }); },
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
    get description() { return _translateCopy("copy.a335fa862609", { defaultValue: "Fast 4x upscale" }); },
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
    get description() { return _translateCopy("copy.358036e013da", { defaultValue: "Speech transcription & translation" }); },
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
  music: { get label() { return _translateCopy("copy.36d88ed6cc91", { defaultValue: "Music Generation" }); }, emoji: '🎵' },
  tts: { get label() { return _translateCopy("copy.06a2701c2a41", { defaultValue: "Text-to-Speech" }); }, emoji: '🗣️' },
  'background-removal': { get label() { return _translateCopy("copy.f9d28d822e34", { defaultValue: "Background Removal" }); }, emoji: '✂️' },
  upscale: { get label() { return _translateCopy("copy.dfd86b92431f", { defaultValue: "Image Upscaling" }); }, emoji: '🔍' },
  'speech-to-text': { get label() { return _translateCopy("copy.abfe6d40e5fc", { defaultValue: "Speech-to-Text" }); }, emoji: '📝' },
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
  female: { id: 'female', name: 'Female', get description() { return _translateCopy("copy.08c66888e11d", { defaultValue: "Warmer, higher register" }); }, emoji: '👩' },
  male: { id: 'male', name: 'Male', get description() { return _translateCopy("copy.797f7ab11966", { defaultValue: "Lower register" }); }, emoji: '👨' },
  neutral: { id: 'neutral', name: 'Neutral', get description() { return _translateCopy("copy.eaf77b782bcb", { defaultValue: "System default voice" }); }, emoji: '🤖' },
};

export const VOICE_PREFERENCE_OPTIONS = Object.values(VOICE_PREFERENCES);
export type VoicePreferenceKey = string;

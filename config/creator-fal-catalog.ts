/** Creator catalogue checked against fal's public schemas on 7 October 2026.
 * Prices use the ceiling of the exposed options and exclude temporary discounts.
 * The browser imports this metadata too; keep it free of runtime dependencies.
 */
export interface CreatorFalVideoModel {
  id: string;
  name: string;
  description: string;
  vendor: string;
  emoji: string;
  tier: 'premium' | 'standard' | 'fast';
  provider: 'fal';
  supports: ('text-to-video' | 'image-to-video')[];
  duration: string;
  defaultDuration: number;
  minDuration: number;
  maxDuration: number;
  allowedDurations?: number[];
  resolutions: string[];
  supportsResolution: boolean;
  aspectRatios: string[];
  baseCostUsd: number;
  perSecondCostUsd: number;
  hasAudio?: boolean;
  supportsSeed?: boolean;
  supportsNegativePrompt?: boolean;
  supportsEndFrame?: boolean;
  supportsReferenceImages?: boolean;
  maxReferenceImages?: number;
  supportsAudioInput?: boolean;
  supportsVideoInput?: boolean;
  requiresVideoInput?: boolean;
  referenceMode?: 'edit' | 'motion';
  maxPromptLength?: number;
  family: 'klingturbo' | 'viduq3' | 'flux3' | 'omni' | 'h3' | 'grok' | 'wan3' | 'horse' | 'klingo3' | 'ray3' | 'pixverse6' | 'ltx23' | 'klingedit' | 'klingmotion';
  falTextModel: string;
  falImageModel: string;
  falEndFrameModel?: string;
}

const WIDE_ASPECTS = ['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'];
const BOTH: ('text-to-video' | 'image-to-video')[] = ['text-to-video', 'image-to-video'];
type VideoSpec = Omit<CreatorFalVideoModel, 'provider' | 'supports' | 'duration' | 'baseCostUsd' | 'supportsResolution'>;
function video(spec: VideoSpec): CreatorFalVideoModel {
  return {
    ...spec, provider: 'fal', supports: BOTH,
    duration: `${spec.minDuration}-${spec.maxDuration}s`,
    baseCostUsd: spec.perSecondCostUsd * spec.defaultDuration,
    supportsResolution: spec.resolutions.length > 1,
  };
}

export const CREATOR_FAL_VIDEO_MODELS: Record<string, CreatorFalVideoModel> = {
  'kling-3-turbo-pro': video({
    id: 'kling-3-turbo-pro', name: 'Kling 3 Turbo Pro', vendor: 'Kling', emoji: '⚡', tier: 'fast',
    description: 'Faster Kling motion with synchronized sound',
    family: 'klingturbo', falTextModel: 'fal-ai/kling-video/v3/turbo/pro/text-to-video', falImageModel: 'fal-ai/kling-video/v3/turbo/pro/image-to-video',
    minDuration: 3, maxDuration: 15, defaultDuration: 5, perSecondCostUsd: 0.14,
    resolutions: ['1080p'], aspectRatios: ['16:9', '9:16', '1:1'], hasAudio: true, maxPromptLength: 3072,
  }),
  'kling-3-turbo-standard': video({
    id: 'kling-3-turbo-standard', name: 'Kling 3 Turbo Standard', vendor: 'Kling', emoji: '⚡', tier: 'fast',
    description: 'Faster Kling motion with synchronized sound',
    family: 'klingturbo', falTextModel: 'fal-ai/kling-video/v3/turbo/standard/text-to-video', falImageModel: 'fal-ai/kling-video/v3/turbo/standard/image-to-video',
    minDuration: 3, maxDuration: 15, defaultDuration: 5, perSecondCostUsd: 0.112,
    resolutions: ['720p'], aspectRatios: ['16:9', '9:16', '1:1'], hasAudio: true, maxPromptLength: 3072,
  }),
  'vidu-q3': video({
    id: 'vidu-q3', name: 'Vidu Q3', vendor: 'Vidu', emoji: '🎬', tier: 'premium',
    description: 'Video with sound and start-to-end frame transitions',
    family: 'viduq3', falTextModel: 'fal-ai/vidu/q3/text-to-video', falImageModel: 'fal-ai/vidu/q3/image-to-video',
    minDuration: 1, maxDuration: 16, defaultDuration: 5, perSecondCostUsd: 0.154,
    resolutions: ['540p', '720p', '1080p'], aspectRatios: ['16:9', '9:16', '4:3', '3:4', '1:1'],
    hasAudio: true, supportsSeed: true, supportsEndFrame: true, maxPromptLength: 2000,
  }),
  'vidu-q3-turbo': video({
    id: 'vidu-q3-turbo', name: 'Vidu Q3 Turbo', vendor: 'Vidu', emoji: '🎬', tier: 'fast',
    description: 'Video with sound and start-to-end frame transitions',
    family: 'viduq3', falTextModel: 'fal-ai/vidu/q3/text-to-video/turbo', falImageModel: 'fal-ai/vidu/q3/image-to-video/turbo',
    minDuration: 1, maxDuration: 16, defaultDuration: 5, perSecondCostUsd: 0.077,
    resolutions: ['540p', '720p', '1080p'], aspectRatios: ['16:9', '9:16', '4:3', '3:4', '1:1'],
    hasAudio: true, supportsSeed: true, supportsEndFrame: true, maxPromptLength: 2000,
  }),
  'kling-o3-edit': {
    ...video({
      id: 'kling-o3-edit', name: 'Kling O3 Character Swap', vendor: 'Kling', emoji: '🎭', tier: 'premium',
      description: 'Swap characters, products or scenery into your clip using up to four images',
      family: 'klingedit', falTextModel: 'fal-ai/kling-video/o3/pro/video-to-video/edit',
      falImageModel: 'fal-ai/kling-video/o3/pro/video-to-video/edit',
      minDuration: 3, maxDuration: 15, defaultDuration: 5, perSecondCostUsd: 0.168,
      resolutions: ['1080p'], aspectRatios: ['16:9', '9:16', '1:1'],
      supportsVideoInput: true, requiresVideoInput: true, referenceMode: 'edit',
      supportsReferenceImages: true, maxReferenceImages: 4, hasAudio: true,
    }), supports: ['image-to-video'],
  },
  'kling-3-motion': {
    ...video({
      id: 'kling-3-motion', name: 'Kling 3 Motion Control', vendor: 'Kling', emoji: '💃', tier: 'premium',
      description: 'Your character performs the movement and expressions from a reference clip',
      family: 'klingmotion', falTextModel: 'fal-ai/kling-video/v3/pro/motion-control',
      falImageModel: 'fal-ai/kling-video/v3/pro/motion-control',
      minDuration: 3, maxDuration: 30, defaultDuration: 5, perSecondCostUsd: 0.168,
      resolutions: ['1080p'], aspectRatios: ['16:9', '9:16', '1:1'],
      supportsVideoInput: true, requiresVideoInput: true, referenceMode: 'motion',
      maxReferenceImages: 1, hasAudio: true,
    }), supports: ['image-to-video'],
  },
  'flux-3-video': video({
    id: 'flux-3-video', name: 'FLUX 3', vendor: 'Black Forest Labs', emoji: '🌲', tier: 'premium',
    description: 'Video and sound from text, images, or start and end frames',
    maxPromptLength?: number;
  family: 'klingturbo' | 'viduq3' | 'flux3', falTextModel: 'blackforestlabs/flux-3/text-to-video',
    falImageModel: 'blackforestlabs/flux-3/image-to-video',
    falEndFrameModel: 'blackforestlabs/flux-3/first-last-frame-to-video',
    minDuration: 5, maxDuration: 20, defaultDuration: 5, perSecondCostUsd: 0.29,
    resolutions: ['720p', '1080p'], aspectRatios: ['21:9', '2:1', '16:9', '4:3', '1:1', '3:4', '9:16'],
    hasAudio: true, supportsEndFrame: true,
  }),
  'flux-3-draft': video({
    id: 'flux-3-draft', name: 'FLUX 3 Draft', vendor: 'Black Forest Labs', emoji: '⚡', tier: 'fast',
    description: 'Affordable 720p previews with native sound',
    maxPromptLength?: number;
  family: 'klingturbo' | 'viduq3' | 'flux3', falTextModel: 'blackforestlabs/flux-3/text-to-video/draft',
    falImageModel: 'blackforestlabs/flux-3/image-to-video/draft',
    falEndFrameModel: 'blackforestlabs/flux-3/first-last-frame-to-video/draft',
    minDuration: 5, maxDuration: 20, defaultDuration: 5, perSecondCostUsd: 0.06,
    resolutions: ['720p'], aspectRatios: ['21:9', '2:1', '16:9', '4:3', '1:1', '3:4', '9:16'],
    hasAudio: true, supportsEndFrame: true,
  }),
  'gemini-omni': video({
    id: 'gemini-omni', name: 'Gemini Omni', vendor: 'Google', emoji: '✨', tier: 'premium',
    description: 'Google video generation with synchronized sound',
    family: 'omni', falTextModel: 'google/gemini-omni-flash', falImageModel: 'google/gemini-omni-flash/image-to-video',
    minDuration: 3, maxDuration: 10, defaultDuration: 8, perSecondCostUsd: 0.125,
    resolutions: ['720p'], aspectRatios: ['16:9', '9:16'], hasAudio: true,
  }),
  'minimax-h3': video({
    id: 'minimax-h3', name: 'MiniMax H3', vendor: 'MiniMax', emoji: '🎬', tier: 'premium',
    description: 'Natural motion, native audio, and up to 4K output',
    family: 'h3', falTextModel: 'minimax/h3/text-to-video', falImageModel: 'minimax/h3/image-to-video',
    minDuration: 5, maxDuration: 15, defaultDuration: 5, perSecondCostUsd: 0.16,
    resolutions: ['480p', '768p', '2K', '4K'], aspectRatios: WIDE_ASPECTS,
    hasAudio: true, supportsSeed: true, supportsEndFrame: true, supportsAudioInput: true,
  }),
  'minimax-h3-max': video({
    id: 'minimax-h3-max', name: 'MiniMax H3 Max', vendor: 'MiniMax', emoji: '🎬', tier: 'premium',
    description: 'Strong prompt adherence and expressive motion with sound',
    family: 'h3', falTextModel: 'minimax/h3-max/text-to-video', falImageModel: 'minimax/h3-max/image-to-video',
    minDuration: 3, maxDuration: 15, defaultDuration: 5, perSecondCostUsd: 0.16,
    resolutions: ['480p', '768p', '1080p'], aspectRatios: WIDE_ASPECTS,
    hasAudio: true, supportsSeed: true, supportsEndFrame: true, supportsAudioInput: true,
  }),
  'minimax-h3-max-turbo': video({
    id: 'minimax-h3-max-turbo', name: 'MiniMax H3 Max Turbo', vendor: 'MiniMax', emoji: '⚡', tier: 'fast',
    description: 'Faster H3 Max for affordable iterations with sound',
    family: 'h3', falTextModel: 'minimax/h3-max-turbo/text-to-video', falImageModel: 'minimax/h3-max-turbo/image-to-video',
    minDuration: 3, maxDuration: 15, defaultDuration: 5, perSecondCostUsd: 0.08,
    resolutions: ['480p', '768p', '1080p'], aspectRatios: WIDE_ASPECTS,
    hasAudio: true, supportsSeed: true, supportsEndFrame: true, supportsAudioInput: true,
  }),
  'grok-video-1.5': video({
    id: 'grok-video-1.5', name: 'Grok Imagine Video 1.5', vendor: 'xAI', emoji: '🔮', tier: 'premium',
    description: 'Cinematic motion and synchronized audio',
    family: 'grok', falTextModel: 'xai/grok-imagine-video/v1.5/text-to-video', falImageModel: 'xai/grok-imagine-video/v1.5/image-to-video',
    minDuration: 1, maxDuration: 15, defaultDuration: 6, perSecondCostUsd: 0.25,
    resolutions: ['480p', '720p', '1080p'], aspectRatios: ['16:9', '4:3', '3:2', '1:1', '2:3', '3:4', '9:16'], hasAudio: true,
  }),
  'grok-video-1.5-lite': video({
    id: 'grok-video-1.5-lite', name: 'Grok Imagine Video 1.5 Lite', vendor: 'xAI', emoji: '⚡', tier: 'fast',
    description: 'Budget Grok video with native sound',
    family: 'grok', falTextModel: 'xai/grok-imagine-video/v1.5/lite/text-to-video', falImageModel: 'xai/grok-imagine-video/v1.5/lite/image-to-video',
    minDuration: 1, maxDuration: 15, defaultDuration: 6, perSecondCostUsd: 0.14,
    resolutions: ['480p', '720p', '1080p'], aspectRatios: ['16:9', '4:3', '3:2', '1:1', '2:3', '3:4', '9:16'], hasAudio: true,
  }),
  'wan-3.0': video({
    id: 'wan-3.0', name: 'Wan 3.0', vendor: 'Alibaba', emoji: '🌊', tier: 'premium',
    description: 'Long takes, coherent motion, and native sound',
    family: 'wan3', falTextModel: 'alibaba/wan-3.0/text-to-video', falImageModel: 'alibaba/wan-3.0/image-to-video',
    minDuration: 5, maxDuration: 30, defaultDuration: 5, perSecondCostUsd: 0.2,
    resolutions: ['480p', '720p', '1080p'], aspectRatios: ['16:9', '4:3', '1:1', '3:4', '9:16'],
    hasAudio: true, supportsSeed: true, supportsEndFrame: true,
  }),
  'happy-horse-1.1': video({
    id: 'happy-horse-1.1', name: 'Happy Horse 1.1', vendor: 'Alibaba', emoji: '🐎', tier: 'premium',
    description: 'Detailed, expressive video from a prompt or still',
    family: 'horse', falTextModel: 'alibaba/happy-horse/v1.1/text-to-video', falImageModel: 'alibaba/happy-horse/v1.1/image-to-video',
    minDuration: 3, maxDuration: 15, defaultDuration: 5, perSecondCostUsd: 0.18,
    resolutions: ['720p', '1080p'], aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', '9:21', '5:4', '4:5'], supportsSeed: true,
  }),
  'kling-o3-pro': video({
    id: 'kling-o3-pro', name: 'Kling O3 Pro', vendor: 'Kling', emoji: '🎞️', tier: 'premium',
    description: 'Cinematic video and sound with start and end frames',
    family: 'klingo3', falTextModel: 'fal-ai/kling-video/o3/pro/text-to-video', falImageModel: 'fal-ai/kling-video/o3/pro/image-to-video',
    minDuration: 3, maxDuration: 15, defaultDuration: 5, perSecondCostUsd: 0.14,
    resolutions: ['1080p'], aspectRatios: ['16:9', '9:16', '1:1'], hasAudio: true, supportsEndFrame: true,
  }),
  'kling-o3-standard': video({
    id: 'kling-o3-standard', name: 'Kling O3 Standard', vendor: 'Kling', emoji: '🎬', tier: 'standard',
    description: 'Affordable O3 motion with synchronized sound',
    family: 'klingo3', falTextModel: 'fal-ai/kling-video/o3/standard/text-to-video', falImageModel: 'fal-ai/kling-video/o3/standard/image-to-video',
    minDuration: 3, maxDuration: 15, defaultDuration: 5, perSecondCostUsd: 0.112,
    resolutions: ['720p'], aspectRatios: ['16:9', '9:16', '1:1'], hasAudio: true, supportsEndFrame: true,
  }),
  'luma-ray3.2': video({
    id: 'luma-ray3.2', name: 'Luma Ray 3.2', vendor: 'Luma', emoji: '✨', tier: 'premium',
    description: 'Photorealistic shots and controlled frame transitions',
    family: 'ray3', falTextModel: 'luma/agent/ray/v3.2/text-to-video', falImageModel: 'luma/agent/ray/v3.2/image-to-video',
    minDuration: 5, maxDuration: 10, allowedDurations: [5, 10], defaultDuration: 5, perSecondCostUsd: 0.4,
    resolutions: ['540p', '720p', '1080p'], aspectRatios: WIDE_ASPECTS, supportsEndFrame: true,
  }),
  'pixverse-v6': video({
    id: 'pixverse-v6', name: 'PixVerse V6', vendor: 'PixVerse', emoji: '🎨', tier: 'standard',
    description: 'Stylized motion with native audio and longer clips',
    family: 'pixverse6', falTextModel: 'fal-ai/pixverse/v6/text-to-video', falImageModel: 'fal-ai/pixverse/v6/image-to-video',
    minDuration: 1, maxDuration: 15, defaultDuration: 5, perSecondCostUsd: 0.115,
    resolutions: ['360p', '540p', '720p', '1080p'], aspectRatios: ['16:9', '4:3', '1:1', '3:4', '9:16', '2:3', '3:2', '21:9'],
    hasAudio: true, supportsSeed: true, supportsNegativePrompt: true,
  }),
  'ltx-2.3': video({
    id: 'ltx-2.3', name: 'LTX 2.3 Pro', vendor: 'Lightricks', emoji: '🎬', tier: 'premium',
    description: 'Video and audio at up to 2160p',
    family: 'ltx23', falTextModel: 'fal-ai/ltx-2.3/text-to-video', falImageModel: 'fal-ai/ltx-2.3/image-to-video',
    minDuration: 6, maxDuration: 10, allowedDurations: [6, 8, 10], defaultDuration: 6, perSecondCostUsd: 0.32,
    resolutions: ['1080p', '1440p', '2160p'], aspectRatios: ['16:9', '9:16'], hasAudio: true, supportsEndFrame: true,
  }),
  'ltx-2.3-fast': video({
    id: 'ltx-2.3-fast', name: 'LTX 2.3 Fast', vendor: 'Lightricks', emoji: '⚡', tier: 'fast',
    description: 'Fast 1080p video with sound, up to 20 seconds',
    family: 'ltx23', falTextModel: 'fal-ai/ltx-2.3/text-to-video/fast', falImageModel: 'fal-ai/ltx-2.3/image-to-video/fast',
    minDuration: 6, maxDuration: 20, allowedDurations: [6, 8, 10, 12, 14, 16, 18, 20], defaultDuration: 6, perSecondCostUsd: 0.06,
    resolutions: ['1080p'], aspectRatios: ['16:9', '9:16'], hasAudio: true, supportsEndFrame: true,
  }),
};

export interface CreatorFalImageModel {
  id: string;
  name: string;
  vendor: string;
  description: string;
  emoji: string;
  tier: 'premium' | 'standard' | 'fast';
  baseCostUsd: number;
  supportsEdit: boolean;
  text: string;
  edit?: string;
  sizing: 'image_size' | 'aspect_ratio';
  /** Explicit dimensions below one megapixel, preserving the selected ratio. */
  exactImageSize?: boolean;
  maxPromptLength?: number;
  maxReferenceImages?: number;
  editImageField?: 'reference_image_urls';
  editUsesPlural?: boolean;
  extra?: Record<string, unknown>;
  editExtra?: Record<string, unknown>;
  omitNumImages?: boolean;
  aspectRatios?: string[];
}
export const CREATOR_FAL_IMAGE_MODELS: Record<string, CreatorFalImageModel> = {
  'flux-schnell': {
    id: 'flux-schnell', name: 'FLUX.1 Schnell', vendor: 'Black Forest Labs', emoji: '🎨', tier: 'fast',
    description: 'Near-instant compositions and inexpensive drafts', baseCostUsd: 0.003, supportsEdit: false,
    text: 'fal-ai/flux/schnell',
    sizing: 'image_size', exactImageSize: true,
  },
  'flux-dev': {
    id: 'flux-dev', name: 'FLUX.1 Dev', vendor: 'Black Forest Labs', emoji: '🎨', tier: 'standard',
    description: 'Detailed photography and reliable prompt following', baseCostUsd: 0.025, supportsEdit: false,
    text: 'fal-ai/flux/dev',
    sizing: 'image_size', exactImageSize: true,
  },
  'flux-krea': {
    id: 'flux-krea', name: 'FLUX.1 Krea', vendor: 'Black Forest Labs', emoji: '🎨', tier: 'standard',
    description: 'Natural photographic texture and expressive portraits', baseCostUsd: 0.025, supportsEdit: false,
    text: 'fal-ai/flux/krea',
    sizing: 'image_size', exactImageSize: true,
  },
  'flux-2-dev': {
    id: 'flux-2-dev', name: 'FLUX.2 Dev', vendor: 'Black Forest Labs', emoji: '🎨', tier: 'standard',
    description: 'Detailed compositions and accurate colour direction', baseCostUsd: 0.012, supportsEdit: false,
    text: 'fal-ai/flux-2',
    sizing: 'image_size', exactImageSize: true,
  },
  'flux-2-turbo': {
    id: 'flux-2-turbo', name: 'FLUX.2 Turbo', vendor: 'Black Forest Labs', emoji: '🎨', tier: 'fast',
    description: 'Quick iterations with FLUX.2 detail', baseCostUsd: 0.008, supportsEdit: false,
    text: 'fal-ai/flux-2/turbo',
    sizing: 'image_size', exactImageSize: true,
  },
  'flux-2-flash': {
    id: 'flux-2-flash', name: 'FLUX.2 Flash', vendor: 'Black Forest Labs', emoji: '🎨', tier: 'fast',
    description: 'Low-cost FLUX.2 previews', baseCostUsd: 0.005, supportsEdit: false,
    text: 'fal-ai/flux-2/flash',
    sizing: 'image_size', exactImageSize: true,
  },
  'flux-2-klein-4b': {
    id: 'flux-2-klein-4b', name: 'FLUX.2 Klein 4B', vendor: 'Black Forest Labs', emoji: '🎨', tier: 'fast',
    description: 'Fast generation and edits with multiple references', baseCostUsd: 0.01, supportsEdit: true,
    text: 'fal-ai/flux-2/klein/4b', edit: 'fal-ai/flux-2/klein/4b/edit', editUsesPlural: true,
    sizing: 'image_size', exactImageSize: true,
  },
  'flux-2-klein-9b': {
    id: 'flux-2-klein-9b', name: 'FLUX.2 Klein 9B', vendor: 'Black Forest Labs', emoji: '🎨', tier: 'standard',
    description: 'Sharper text, realism and reference image editing', baseCostUsd: 0.011, supportsEdit: true,
    text: 'fal-ai/flux-2/klein/9b', edit: 'fal-ai/flux-2/klein/9b/edit', editUsesPlural: true,
    sizing: 'image_size', exactImageSize: true,
  },
  'flux-2-klein-4b-base': {
    id: 'flux-2-klein-4b-base', name: 'FLUX.2 Klein 4B Base', vendor: 'Black Forest Labs', emoji: '🎨', tier: 'standard',
    description: 'Full sampling for deliberate visual compositions', baseCostUsd: 0.009, supportsEdit: false,
    text: 'fal-ai/flux-2/klein/4b/base',
    sizing: 'image_size', exactImageSize: true,
  },
  'flux-2-klein-9b-base': {
    id: 'flux-2-klein-9b-base', name: 'FLUX.2 Klein 9B Base', vendor: 'Black Forest Labs', emoji: '🎨', tier: 'standard',
    description: 'Detailed base model for complex scenes', baseCostUsd: 0.011, supportsEdit: false,
    text: 'fal-ai/flux-2/klein/9b/base',
    sizing: 'image_size', exactImageSize: true,
  },
  'hidream-i1-full': {
    id: 'hidream-i1-full', name: 'HiDream I1 Full', vendor: 'HiDream', emoji: '🎨', tier: 'premium',
    description: 'Detailed illustration and faithful compositions', baseCostUsd: 0.05, supportsEdit: false,
    text: 'fal-ai/hidream-i1-full',
    sizing: 'image_size', exactImageSize: true,
  },
  'hidream-i1-dev': {
    id: 'hidream-i1-dev', name: 'HiDream I1 Dev', vendor: 'HiDream', emoji: '🎨', tier: 'standard',
    description: 'Balanced illustration and photographic detail', baseCostUsd: 0.03, supportsEdit: false,
    text: 'fal-ai/hidream-i1-dev',
    sizing: 'image_size', exactImageSize: true,
  },
  'hidream-i1-fast': {
    id: 'hidream-i1-fast', name: 'HiDream I1 Fast', vendor: 'HiDream', emoji: '🎨', tier: 'fast',
    description: 'Fast visual exploration at a lower cost', baseCostUsd: 0.01, supportsEdit: false,
    text: 'fal-ai/hidream-i1-fast',
    sizing: 'image_size', exactImageSize: true,
  },
  'hidream-o1': {
    id: 'hidream-o1', name: 'HiDream O1', vendor: 'HiDream', emoji: '🎨', tier: 'standard',
    description: 'Create and combine subjects from reference images', baseCostUsd: 0.01, supportsEdit: true,
    text: 'fal-ai/hidream-o1-image', edit: 'fal-ai/hidream-o1-image', editUsesPlural: true,
    sizing: 'image_size', exactImageSize: true,
    editImageField: 'reference_image_urls',
  },
  'sd-3.5-large': {
    id: 'sd-3.5-large', name: 'Stable Diffusion 3.5 Large', vendor: 'Stability AI', emoji: '🎨', tier: 'premium',
    description: 'Rich detail across photography and illustration', baseCostUsd: 0.065, supportsEdit: false,
    text: 'fal-ai/stable-diffusion-v35-large',
    sizing: 'image_size', exactImageSize: true,
  },
  'sd-3.5-medium': {
    id: 'sd-3.5-medium', name: 'Stable Diffusion 3.5 Medium', vendor: 'Stability AI', emoji: '🎨', tier: 'standard',
    description: 'Versatile styles and accessible creative drafts', baseCostUsd: 0.02, supportsEdit: false,
    text: 'fal-ai/stable-diffusion-v35-medium',
    sizing: 'image_size', exactImageSize: true,
  },
  'sd-3.5-turbo': {
    id: 'sd-3.5-turbo', name: 'Stable Diffusion 3.5 Turbo', vendor: 'Stability AI', emoji: '🎨', tier: 'fast',
    description: 'Rapid four-step image generation', baseCostUsd: 0.015, supportsEdit: false,
    text: 'fal-ai/stable-diffusion-v35-large/turbo',
    sizing: 'image_size', exactImageSize: true,
  },
  'sana': {
    id: 'sana', name: 'Sana', vendor: 'NVIDIA', emoji: '🎨', tier: 'fast',
    description: 'Efficient generation for inexpensive concept sketches', baseCostUsd: 0.001, supportsEdit: false,
    text: 'fal-ai/sana',
    sizing: 'image_size', exactImageSize: true,
  },
  'lumina-2': {
    id: 'lumina-2', name: 'Lumina Image 2', vendor: 'Alpha-VLLM', emoji: '🎨', tier: 'premium',
    description: 'Expressive scenes with strong prompt alignment', baseCostUsd: 0.075, supportsEdit: false,
    text: 'fal-ai/lumina-image/v2',
    sizing: 'image_size', exactImageSize: true,
  },
  'qwen-image-2512': {
    id: 'qwen-image-2512', name: 'Qwen Image 2512', vendor: 'Alibaba', emoji: '🎨', tier: 'standard',
    description: 'Natural detail and multilingual text rendering', baseCostUsd: 0.02, supportsEdit: false,
    text: 'fal-ai/qwen-image-2512',
    sizing: 'image_size', exactImageSize: true,
  },
  'qwen-image-max': {
    id: 'qwen-image-max', name: 'Qwen Image Max', vendor: 'Alibaba', emoji: '🎨', tier: 'premium',
    description: 'Polished typography and reference image edits', baseCostUsd: 0.075, supportsEdit: true,
    text: 'fal-ai/qwen-image-max/text-to-image', edit: 'fal-ai/qwen-image-max/edit', editUsesPlural: true,
    sizing: 'image_size', exactImageSize: true,
    maxPromptLength: 800, maxReferenceImages: 3,
  },
  'nucleus-image': {
    id: 'nucleus-image', name: 'Nucleus Image', vendor: 'Nucleus', emoji: '🎨', tier: 'fast',
    description: 'Affordable detailed scenes in common formats', baseCostUsd: 0.02, supportsEdit: false,
    text: 'fal-ai/nucleus-image',
    sizing: 'aspect_ratio', aspectRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'],
  },
  'flux-3-image': {
    id: 'flux-3-image', name: 'FLUX 3 Image', vendor: 'Black Forest Labs', emoji: '🌲', tier: 'premium',
    description: 'Detailed generation and precise image editing', baseCostUsd: 0.048, supportsEdit: true,
    text: 'blackforestlabs/flux-3/text-to-image', edit: 'blackforestlabs/flux-3/edit-image',
    sizing: 'aspect_ratio', editUsesPlural: true, omitNumImages: true, extra: { resolution: '1k' },
  },
  'gpt-image-2.5-flare': {
    id: 'gpt-image-2.5-flare', name: 'GPT Image 2.5 Flare', vendor: 'OpenAI', emoji: '✨', tier: 'premium',
    description: 'Fast, detailed images and precise editing', baseCostUsd: 0.09, supportsEdit: true,
    text: 'openai/gpt-image-2.5/flare/text-to-image', edit: 'openai/gpt-image-2.5/flare/edit',
    sizing: 'image_size', editUsesPlural: true, extra: { quality: 'medium' },
  },
  'gpt-image-2.5-sunburst': {
    id: 'gpt-image-2.5-sunburst', name: 'GPT Image 2.5 Sunburst', vendor: 'OpenAI', emoji: '☀️', tier: 'premium',
    description: 'Intricate detail and controlled image edits', baseCostUsd: 0.09, supportsEdit: true,
    text: 'openai/gpt-image-2.5/sunburst/text-to-image', edit: 'openai/gpt-image-2.5/sunburst/edit',
    sizing: 'image_size', editUsesPlural: true, extra: { quality: 'medium' },
  },
  'gpt-image-2': {
    id: 'gpt-image-2', name: 'GPT Image 2', vendor: 'OpenAI', emoji: '🖼️', tier: 'premium',
    description: 'Photorealistic images and accurate text', baseCostUsd: 0.09, supportsEdit: true,
    text: 'openai/gpt-image-2', edit: 'openai/gpt-image-2/edit',
    sizing: 'image_size', editUsesPlural: true, extra: { quality: 'medium' },
  },
  'seedream-v5-pro': {
    id: 'seedream-v5-pro', name: 'Seedream 5.0 Pro', vendor: 'ByteDance', emoji: '🎨', tier: 'premium',
    description: 'Dense layouts, multilingual text, and precise edits', baseCostUsd: 0.0675, supportsEdit: true,
    text: 'bytedance/seedream/v5/pro/text-to-image', edit: 'bytedance/seedream/v5/pro/edit', sizing: 'image_size', editUsesPlural: true,
  },
  'seedream-v5-lite': {
    id: 'seedream-v5-lite', name: 'Seedream 5.0 Lite', vendor: 'ByteDance', emoji: '⚡', tier: 'fast',
    description: 'Affordable Seedream generation and editing', baseCostUsd: 0.035, supportsEdit: true,
    text: 'fal-ai/bytedance/seedream/v5/lite/text-to-image', edit: 'fal-ai/bytedance/seedream/v5/lite/edit', sizing: 'image_size', editUsesPlural: true,
  },
  'ideogram-v4': {
    id: 'ideogram-v4', name: 'Ideogram 4', vendor: 'Ideogram', emoji: '✍️', tier: 'standard',
    description: 'Typography, graphic design, and detailed layouts', baseCostUsd: 0.063, supportsEdit: false,
    text: 'ideogram/v4', sizing: 'image_size', extra: { rendering_speed: 'BALANCED', expansion_model: 'None' },
  },
  'ideogram-v4.5': {
    id: 'ideogram-v4.5', name: 'Ideogram 4.5', vendor: 'Ideogram', emoji: '✍️', tier: 'premium',
    description: 'Sharper typography with image editing', baseCostUsd: 0.06, supportsEdit: true,
    text: 'ideogram/v4.5', edit: 'ideogram/v4.5/edit', sizing: 'image_size',
    extra: { quality: 'medium', enable_prompt_expansion: false }, editExtra: { quality: 'medium' },
  },
  'krea-2-medium': {
    id: 'krea-2-medium', name: 'Krea 2 Medium', vendor: 'Krea', emoji: '🎨', tier: 'standard',
    description: 'Expressive illustration, painting, and experimental looks', baseCostUsd: 0.03, supportsEdit: false,
    text: 'krea/v2/medium/text-to-image', sizing: 'aspect_ratio', omitNumImages: true,
    aspectRatios: ['1:1', '4:3', '3:2', '16:9', '2.35:1', '4:5', '2:3', '9:16'],
  },
  'krea-2-large': {
    id: 'krea-2-large', name: 'Krea 2 Large', vendor: 'Krea', emoji: '🎨', tier: 'premium',
    description: 'Photorealism, texture, and aesthetic control', baseCostUsd: 0.06, supportsEdit: false,
    text: 'krea/v2/large/text-to-image', sizing: 'aspect_ratio', omitNumImages: true,
    aspectRatios: ['1:1', '4:3', '3:2', '16:9', '2.35:1', '4:5', '2:3', '9:16'],
  },
  'qwen-image-3': {
    id: 'qwen-image-3', name: 'Qwen Image 3', vendor: 'Alibaba', emoji: '🖼️', tier: 'premium',
    description: 'Long prompts, multilingual text, and identity-preserving edits', baseCostUsd: 0.04, supportsEdit: true,
    text: 'alibaba/qwen-image-3/text-to-image', edit: 'alibaba/qwen-image-3/edit', sizing: 'image_size', editUsesPlural: true,
  },
};

/** Both pickers expose only ratios supported by the selected endpoint. */
export function creatorFalImageAspects(modelId: string): string[] {
  return CREATOR_FAL_IMAGE_MODELS[modelId]?.aspectRatios ?? ['1:1', '4:5', '16:9', '9:16', '3:2', '2:3', '21:9'];
}

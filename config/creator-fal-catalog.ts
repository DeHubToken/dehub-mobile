/** Creator catalogue checked against fal's public schemas on 4 October 2026.
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
  family: 'flux3' | 'omni' | 'h3' | 'grok' | 'wan3' | 'horse' | 'klingo3' | 'ray3' | 'pixverse6' | 'ltx23' | 'klingedit' | 'klingmotion';
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
    family: 'flux3', falTextModel: 'blackforestlabs/flux-3/text-to-video',
    falImageModel: 'blackforestlabs/flux-3/image-to-video',
    falEndFrameModel: 'blackforestlabs/flux-3/first-last-frame-to-video',
    minDuration: 5, maxDuration: 20, defaultDuration: 5, perSecondCostUsd: 0.29,
    resolutions: ['720p', '1080p'], aspectRatios: ['21:9', '2:1', '16:9', '4:3', '1:1', '3:4', '9:16'],
    hasAudio: true, supportsEndFrame: true,
  }),
  'flux-3-draft': video({
    id: 'flux-3-draft', name: 'FLUX 3 Draft', vendor: 'Black Forest Labs', emoji: '⚡', tier: 'fast',
    description: 'Affordable 720p previews with native sound',
    family: 'flux3', falTextModel: 'blackforestlabs/flux-3/text-to-video/draft',
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
  editUsesPlural?: boolean;
  extra?: Record<string, unknown>;
  editExtra?: Record<string, unknown>;
  omitNumImages?: boolean;
  aspectRatios?: string[];
}
export const CREATOR_FAL_IMAGE_MODELS: Record<string, CreatorFalImageModel> = {
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

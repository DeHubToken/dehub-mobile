import { IMAGE_MODELS, VIDEO_MODELS, AI_TOOL_MODELS, imageModelSupportsEdit } from '../config/ai-models.constants';
import { CREATOR_FAL_IMAGE_MODELS, CREATOR_FAL_VIDEO_MODELS, creatorFalImageAspects } from '../config/creator-fal-catalog';
import { MODEL3D_MODELS } from '../config/model3d-models.constants';
import { CREATOR_VIDEO_RULES } from '../config/creator-video-rules';
import { applyTemplate, type CreatorTemplate } from './creatorTemplates';
import { generationDraft, type GenerationDraft } from './editor/generationDraft';
import { VIRAL_EFFECTS, VIRAL_EFFECT_MODEL } from '../config/viral-effects';
import { appendCinemaDirection, normalizeCinemaDirection, type CinemaDirection } from './cinemaDirection';
import type { CreatorAudioSettings } from './creatorAudio';

export type CreatorMode = 'image' | 'video' | 'audio' | '3d';
export interface CreatorReferenceAsset {
  uri: string; label: string; kind: 'image' | 'video'; seconds?: number; posterUrl?: string; sourceClipId?: string;
}
export interface CreatorStudioSettings {
  audioSettings?: CreatorAudioSettings;
  effect?: string;
  referenceAssets?: CreatorReferenceAsset[];
  endFrame?: CreatorReferenceAsset;
  seed?: string;
  negativePrompt?: string;
  imageBatch?: number;
  cinemaDirection?: CinemaDirection;
  mode: CreatorMode;
  model: string;
  aspect: string;
  durationSeconds: number;
  resolution: string;
  textureQuality: 'none' | 'standard' | 'HD';
}
export const CREATOR_MODE_KEYS: Record<CreatorMode, string> = {
  image: 'creator.navImage', video: 'creator.navVideo', audio: 'creator.navAudio', '3d': 'creator.door3d',
};
export const CREATOR_DEFAULTS: Record<CreatorMode, CreatorStudioSettings> = {
  image: { mode: 'image', model: 'gemini-3.1-flash-image', aspect: '1:1', durationSeconds: 5, resolution: '720p', textureQuality: 'none' },
  video: { mode: 'video', model: 'kling-2.5-turbo', aspect: '16:9', durationSeconds: 5, resolution: '720p', textureQuality: 'none' },
  audio: { mode: 'audio', model: 'ace-step', aspect: '1:1', durationSeconds: 5, resolution: '720p', textureQuality: 'none' },
  '3d': { mode: '3d', model: 'tripo-2.5', aspect: '1:1', durationSeconds: 5, resolution: '720p', textureQuality: 'none' },
};
export const creatorModels = (mode: CreatorMode) => Object.values(
  mode === 'image' ? IMAGE_MODELS : mode === 'video' ? VIDEO_MODELS : mode === '3d' ? MODEL3D_MODELS : AI_TOOL_MODELS,
).filter((model) => mode !== 'audio' || ('category' in model && (model.category === 'music' || model.category === 'tts')));

export function creatorDurations(model: string): number[] {
  const rules = CREATOR_VIDEO_RULES[model];
  if (rules?.allowedDurations?.length) return rules.allowedDurations;
  const min = rules?.minDuration ?? 5;
  const max = rules?.maxDuration ?? min;
  return Array.from({ length: max - min + 1 }, (_, i) => min + i);
}
export function creatorAspects(settings: CreatorStudioSettings): string[] {
  return settings.mode === 'video'
    ? CREATOR_VIDEO_RULES[settings.model]?.aspectRatios ?? ['16:9', '9:16', '1:1']
    : creatorFalImageAspects(settings.model);
}
export function normalizeCreatorSettings(settings: CreatorStudioSettings): CreatorStudioSettings {
  const models = creatorModels(settings.mode);
  const model = models.some((entry) => entry.id === settings.model) ? settings.model : CREATOR_DEFAULTS[settings.mode].model;
  const next = { ...settings, model };
  next.cinemaDirection = normalizeCinemaDirection(settings.cinemaDirection);
  next.imageBatch = next.mode === 'image' ? Math.min(4, Math.max(1, Math.round(Number(next.imageBatch) || 1))) : 1;
  const advanced = VIDEO_MODELS[model];
  if (next.mode !== 'video' || !advanced?.supportsEndFrame) next.endFrame = undefined;
  if (next.mode !== 'video' || !advanced?.supportsSeed) next.seed = undefined;
  if (next.mode !== 'video' || !advanced?.supportsNegativePrompt) next.negativePrompt = undefined;
  if (next.mode === 'video') {
    const clip = next.referenceAssets?.find(asset => asset.kind === 'video');
    const durations = creatorDurations(model);
    const eligible = durations.filter((value) => value <= settings.durationSeconds);
    next.durationSeconds = eligible.length ? Math.max(...eligible) : durations[0];
    if (VIDEO_MODELS[model]?.requiresVideoInput && VIDEO_MODELS[model]?.referenceMode !== 'extend' && clip?.seconds) next.durationSeconds = Math.ceil(clip.seconds);
    const resolutions = CREATOR_VIDEO_RULES[model]?.resolutions ?? ['480p', '720p', '1080p'];
    if (!resolutions.includes(next.resolution)) next.resolution = resolutions.includes('720p') ? '720p' : resolutions[0];
  }
  const aspects = creatorAspects(next);
  if (!aspects.includes(next.aspect)) next.aspect = aspects[0];
  if (next.mode === '3d' && next.textureQuality === 'HD' && !MODEL3D_MODELS[model]?.hdMultiplier) next.textureQuality = 'standard';
  return next;
}

export function creatorSettingsForEditorDraft(value: unknown): { settings: CreatorStudioSettings; draft: GenerationDraft } | null {
  const draft = generationDraft(value);
  if (!draft) return null;
  const mode: CreatorMode = draft.kind === 'voice' ? 'audio' : draft.kind;
  return { draft, settings: normalizeCreatorSettings({ ...CREATOR_DEFAULTS[mode],
    ...(draft.kind === 'voice' ? { model: 'dia-tts' } : {}),
    ...(draft.aspect ? { aspect: draft.aspect } : {}),
    ...(draft.references ? { referenceAssets: draft.references.map(reference => ({ uri: reference.url, label: reference.label, kind: 'image' as const })) } : {}),
    ...(draft.cinemaDirection ? { cinemaDirection: draft.cinemaDirection } : {}),
    ...(draft.durationSeconds ? { durationSeconds: draft.durationSeconds } : {}),
  }) };
}

export function creatorVideoOptions(settings: CreatorStudioSettings) {
  const normalized = normalizeCreatorSettings(settings);
  const images = normalized.referenceAssets?.filter(a => a.kind === 'image').map(a => a.uri) ?? [];
  const clips = normalized.referenceAssets?.filter(a => a.kind === 'video').map(a => a.uri) ?? [];
  return { duration: `${normalized.durationSeconds}s`, aspectRatio: normalized.aspect, resolution: normalized.resolution,
    ...(normalized.endFrame ? { endFrameUrl: normalized.endFrame.uri } : {}),
    ...(normalized.seed?.trim() ? { seed: Number(normalized.seed) } : {}),
    ...(normalized.negativePrompt?.trim() ? { negativePrompt: normalized.negativePrompt.trim() } : {}),
    ...(normalized.model === 'pixverse-effects' ? { effect: normalized.effect } : {}),
    ...(images.length > 1 || VIDEO_MODELS[normalized.model]?.referenceMode === 'edit' ? { referenceImageUrls: images } : {}),
    ...(clips.length ? { videoUrls: clips } : {}) };
}

/** The selected medium decides routing; words such as "video" in an image brief do not. */
export function prepareCreatorPrompt(text: string, preset?: CreatorTemplate, settings?: CreatorStudioSettings): string {
  const compatiblePreset = settings?.mode === 'video' && VIDEO_MODELS[settings.model]?.referenceMode === 'extend' ? undefined : preset;
  const prompt = compatiblePreset ? applyTemplate(compatiblePreset, text) : text.trim();
  return settings ? appendCinemaDirection(prompt, settings.cinemaDirection, settings.mode) : prompt;
}
export function creatorPromptLimit(settings: CreatorStudioSettings): number | undefined {
  return settings.mode === 'image' ? CREATOR_FAL_IMAGE_MODELS[settings.model]?.maxPromptLength ?? 4000
    : settings.mode === 'video' ? CREATOR_FAL_VIDEO_MODELS[settings.model]?.maxPromptLength : undefined;
}
export function creatorInputIssue(settings: CreatorStudioSettings, hasImage: boolean, preset?: CreatorTemplate, text?: string): string | null {
  if (settings.mode === 'image' && IMAGE_MODELS[settings.model]?.requiresImage && !hasImage) return 'creator.studioNeedsImage';
  if (settings.mode === 'image' && IMAGE_MODELS[settings.model]?.outpaint && text !== undefined && /[^\x09\x0a\x0d\x20-\x7e]/.test(text)) return 'creator.expandEnglishOnly';
  const assets = settings.referenceAssets ?? [];
  const images = assets.filter(a => a.kind === 'image');
  const clip = assets.find(a => a.kind === 'video');
  if (settings.mode === 'image' && images.length > (CREATOR_FAL_IMAGE_MODELS[settings.model]?.maxReferenceImages ?? 4)) return 'creator.referenceTooMany';
  if (settings.mode === 'image' && images.length > 1 && !CREATOR_FAL_IMAGE_MODELS[settings.model]?.editUsesPlural) return 'creator.referenceMultiModel';
  if (settings.mode === 'video') {
    const model = VIDEO_MODELS[settings.model];
    if (settings.seed?.trim() && (!/^\d+$/.test(settings.seed.trim()) || !Number.isSafeInteger(Number(settings.seed)) || Number(settings.seed) > 2147483647)) return 'creator.invalidSeed';
    if (settings.endFrame && !hasImage) return 'creator.endFrameNeedsStart';
    if (settings.model === VIRAL_EFFECT_MODEL && !VIRAL_EFFECTS.some(effect => effect.name === settings.effect)) return 'viralTemplates.chooseFirst';
    if (model?.referenceMode === 'extend' && !clip) return 'creator.extensionNeedsClip';
    if (model?.requiresVideoInput && model.referenceMode !== 'extend' && (!clip || !hasImage)) return 'creator.referenceNeedsClip';
    if (model?.referenceMode === 'extend' && hasImage) return 'creator.referenceTooMany';
    if (clip && !model?.requiresVideoInput) return 'creator.referenceVideoModel';
    if (images.length > (model?.maxReferenceImages ?? 1)) return 'creator.referenceTooMany';
    if (clip?.seconds && clip.seconds > (model?.maxSourceDuration ?? model?.maxDuration ?? 15)) return 'creator.referenceClipLength';
  }
  if (preset?.requiresImage && !hasImage && !(settings.mode === 'video' && VIDEO_MODELS[settings.model]?.referenceMode === 'extend')) return 'creator.studioNeedsImage';
  if (settings.mode === 'image' && hasImage && (!IMAGE_MODELS[settings.model] || !imageModelSupportsEdit(IMAGE_MODELS[settings.model]))) return 'creator.studioCannotEdit';
  if (settings.mode === 'video' && !VIDEO_MODELS[settings.model]?.supports.includes(hasImage ? 'image-to-video' : 'text-to-video')) return hasImage ? 'creator.studioCannotAnimate' : 'creator.studioNeedsImage';
  if (settings.mode === '3d' && !MODEL3D_MODELS[settings.model]?.supports.includes(hasImage ? 'image-to-3d' : 'text-to-3d')) return 'creator.studioNeedsImage';
  return null;
}

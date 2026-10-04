import { IMAGE_MODELS, VIDEO_MODELS, AI_TOOL_MODELS, imageModelSupportsEdit } from '../config/ai-models.constants';
import { CREATOR_FAL_IMAGE_MODELS } from '../config/creator-fal-catalog';
import { MODEL3D_MODELS } from '../config/model3d-models.constants';
import { CREATOR_VIDEO_RULES } from '../config/creator-video-rules';
import { applyTemplate, type CreatorTemplate } from './creatorTemplates';

export type CreatorMode = 'image' | 'video' | 'audio' | '3d';
export interface CreatorReferenceAsset {
  uri: string; label: string; kind: 'image' | 'video'; seconds?: number; posterUrl?: string;
}
export interface CreatorStudioSettings {
  referenceAssets?: CreatorReferenceAsset[];
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
    : ['1:1', '4:5', '16:9', '9:16', '3:2', '2:3', '21:9'];
}
export function normalizeCreatorSettings(settings: CreatorStudioSettings): CreatorStudioSettings {
  const models = creatorModels(settings.mode);
  const model = models.some((entry) => entry.id === settings.model) ? settings.model : CREATOR_DEFAULTS[settings.mode].model;
  const next = { ...settings, model };
  if (next.mode === 'video') {
    const clip = next.referenceAssets?.find(asset => asset.kind === 'video');
    const durations = creatorDurations(model);
    const eligible = durations.filter((value) => value <= settings.durationSeconds);
    next.durationSeconds = eligible.length ? Math.max(...eligible) : durations[0];
    if (VIDEO_MODELS[model]?.requiresVideoInput && clip?.seconds) next.durationSeconds = Math.ceil(clip.seconds);
    const resolutions = CREATOR_VIDEO_RULES[model]?.resolutions ?? ['480p', '720p', '1080p'];
    if (!resolutions.includes(next.resolution)) next.resolution = resolutions.includes('720p') ? '720p' : resolutions[0];
  }
  const aspects = creatorAspects(next);
  if (!aspects.includes(next.aspect)) next.aspect = aspects[0];
  if (next.mode === '3d' && next.textureQuality === 'HD' && !MODEL3D_MODELS[model]?.hdMultiplier) next.textureQuality = 'standard';
  return next;
}

export function creatorVideoOptions(settings: CreatorStudioSettings) {
  const normalized = normalizeCreatorSettings(settings);
  const images = normalized.referenceAssets?.filter(a => a.kind === 'image').map(a => a.uri) ?? [];
  const clips = normalized.referenceAssets?.filter(a => a.kind === 'video').map(a => a.uri) ?? [];
  return { duration: `${normalized.durationSeconds}s`, aspectRatio: normalized.aspect, resolution: normalized.resolution,
    ...(images.length > 1 || VIDEO_MODELS[normalized.model]?.referenceMode === 'edit' ? { referenceImageUrls: images } : {}),
    ...(clips.length ? { videoUrls: clips } : {}) };
}

/** The selected medium decides routing; words such as "video" in an image brief do not. */
export function prepareCreatorPrompt(text: string, preset?: CreatorTemplate): string {
  return preset ? applyTemplate(preset, text) : text.trim();
}
export function creatorInputIssue(settings: CreatorStudioSettings, hasImage: boolean, preset?: CreatorTemplate): string | null {
  const assets = settings.referenceAssets ?? [];
  const images = assets.filter(a => a.kind === 'image');
  const clip = assets.find(a => a.kind === 'video');
  if (settings.mode === 'image' && images.length > 1 && !CREATOR_FAL_IMAGE_MODELS[settings.model]?.editUsesPlural) return 'creator.referenceMultiModel';
  if (settings.mode === 'video') {
    const model = VIDEO_MODELS[settings.model];
    if (model?.requiresVideoInput && (!clip || !hasImage)) return 'creator.referenceNeedsClip';
    if (clip && !model?.requiresVideoInput) return 'creator.referenceVideoModel';
    if (images.length > (model?.maxReferenceImages ?? 1)) return 'creator.referenceTooMany';
    if (clip?.seconds && clip.seconds > (model?.maxDuration ?? 15)) return 'creator.referenceClipLength';
  }
  if (preset?.requiresImage && !hasImage) return 'creator.studioNeedsImage';
  if (settings.mode === 'image' && hasImage && (!IMAGE_MODELS[settings.model] || !imageModelSupportsEdit(IMAGE_MODELS[settings.model]))) return 'creator.studioCannotEdit';
  if (settings.mode === 'video' && !VIDEO_MODELS[settings.model]?.supports.includes(hasImage ? 'image-to-video' : 'text-to-video')) return hasImage ? 'creator.studioCannotAnimate' : 'creator.studioNeedsImage';
  if (settings.mode === '3d' && !MODEL3D_MODELS[settings.model]?.supports.includes(hasImage ? 'image-to-3d' : 'text-to-3d')) return 'creator.studioNeedsImage';
  return null;
}

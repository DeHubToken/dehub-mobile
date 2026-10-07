import { CREATOR_FAL_VIDEO_MODELS, CREATOR_FAL_IMAGE_MODELS, creatorFalImageAspects } from '../../config/creator-fal-catalog';
import { CREATOR_DEFAULTS, creatorModels, creatorDurations, creatorVideoOptions, normalizeCreatorSettings, creatorPromptLimit } from '../../libs/creatorStudio';

describe('new creator video options', () => {
  it('preserves FLUX 20-second requests and snaps below its minimum', () => {
    const settings = { mode: 'video' as const, model: 'flux-3-video', aspect: '16:9', durationSeconds: 20, resolution: '1080p', textureQuality: 'none' as const };
    expect(creatorVideoOptions(settings)).toEqual({ duration: '20s', aspectRatio: '16:9', resolution: '1080p' });
    expect(normalizeCreatorSettings({ ...settings, durationSeconds: 2 }).durationSeconds).toBe(5);
    expect(creatorDurations('flux-3-video')).toContain(20);
  });

  it('switching from an old model normalizes new resolution and duration constraints', () => {
    for (const model of Object.values(CREATOR_FAL_VIDEO_MODELS)) {
      const next = normalizeCreatorSettings({ mode: 'video', model: model.id, aspect: '4:5', durationSeconds: 5, resolution: '720p', textureQuality: 'none' });
      expect(creatorDurations(model.id)).toContain(next.durationSeconds);
      expect(model.resolutions).toContain(next.resolution);
      expect(model.aspectRatios).toContain(next.aspect);
    }
  });

  it('exposes every shared model and normalizes restricted image formats', () => {
    for (const model of Object.values(CREATOR_FAL_IMAGE_MODELS)) {
      expect(creatorModels('image').some(entry => entry.id === model.id)).toBe(true);
      const next = normalizeCreatorSettings({ ...CREATOR_DEFAULTS.image, model: model.id, aspect: '21:9' });
      expect(creatorFalImageAspects(model.id)).toContain(next.aspect);
    }
    expect(creatorPromptLimit({ ...CREATOR_DEFAULTS.image, model: 'qwen-image-max' })).toBe(800);
    expect(creatorPromptLimit({ ...CREATOR_DEFAULTS.video, model: 'vidu-q3' })).toBe(2000);
    expect(creatorDurations('vidu-q3-turbo')).toContain(16);
  });
});

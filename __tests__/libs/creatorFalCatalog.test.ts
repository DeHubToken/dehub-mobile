import { CREATOR_FAL_VIDEO_MODELS } from '../../config/creator-fal-catalog';
import { creatorDurations, creatorVideoOptions, normalizeCreatorSettings } from '../../libs/creatorStudio';

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
});

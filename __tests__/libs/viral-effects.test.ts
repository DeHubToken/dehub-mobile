import { creatorInputIssue, creatorVideoOptions, CREATOR_DEFAULTS } from '../../libs/creatorStudio';
import { VIRAL_EFFECTS, VIRAL_EFFECT_MODEL } from '../../config/viral-effects';

describe('video effect request', () => {
  const settings = { ...CREATOR_DEFAULTS.video, model: VIRAL_EFFECT_MODEL, effect: 'Earth Zoom' };
  it('keeps the exact effect in the generation request', () => {
    expect(VIRAL_EFFECTS.length).toBeGreaterThanOrEqual(100);
    expect(creatorVideoOptions(settings)).toMatchObject({ effect: 'Earth Zoom', duration: '5s', resolution: '720p' });
  });
  it('requires a real effect and a photo before opening payment', () => {
    expect(creatorInputIssue(settings, false)).toBe('creator.studioNeedsImage');
    expect(creatorInputIssue(settings, true)).toBeNull();
    expect(creatorInputIssue({ ...settings, effect: 'invented' }, true)).toBe('viralTemplates.chooseFirst');
  });
});

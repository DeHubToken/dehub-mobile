import { VIDEO_MODELS } from '../../config/ai-models.constants';
import { CREATOR_VIDEO_RULES } from '../../config/creator-video-rules';
import { CREATOR_DEFAULTS, creatorDurations, creatorInputIssue, creatorVideoOptions, normalizeCreatorSettings, prepareCreatorPrompt, creatorSettingsForEditorDraft } from '../../libs/creatorStudio';
import { getTemplate } from '../../libs/creatorTemplates';

describe('native Creator jobs', () => {
  it('submits zero seeds and end frames, and clears incompatible options on model switches', () => {
    const endFrame = { uri: 'https://example.com/end.jpg', label: 'Finish', kind: 'image' as const };
    const settings = normalizeCreatorSettings({ ...CREATOR_DEFAULTS.video, model: 'seedance-2.0', seed: '0', negativePrompt: 'blur', endFrame });
    expect(creatorVideoOptions(settings)).toMatchObject({ seed: 0, negativePrompt: 'blur', endFrameUrl: endFrame.uri });
    expect(creatorInputIssue(settings, false)).toBe('creator.endFrameNeedsStart');
    expect(creatorInputIssue(settings, true)).toBeNull();
    const switched = normalizeCreatorSettings({ ...settings, model: 'minimax-video' });
    expect(switched.seed).toBeUndefined();
    expect(switched.negativePrompt).toBeUndefined();
    expect(switched.endFrame).toBeUndefined();
    for (const seed of ['-1', '1.2', '12abc', '2147483648']) {
      expect(creatorInputIssue({ ...settings, seed }, true)).toBe('creator.invalidSeed');
    }
  });
  it('normalizes batches and applies direction once without modifying the stored brief', () => {
    const settings = normalizeCreatorSettings({ ...CREATOR_DEFAULTS.image, imageBatch: 99, cinemaDirection: { era: '1980s' } });
    expect(settings.imageBatch).toBe(4);
    const brief = 'A person carrying a red umbrella';
    const resolved = prepareCreatorPrompt(brief, undefined, settings);
    expect(resolved).toContain('Era: 1980s.');
    expect(prepareCreatorPrompt(resolved, undefined, settings)).toBe(resolved);
    expect(brief).toBe('A person carrying a red umbrella');
    expect(normalizeCreatorSettings({ ...settings, mode: 'audio', model: CREATOR_DEFAULTS.audio.model }).imageBatch).toBe(1);
  });
  it('opens editor voice drafts with speech rather than the default music model', () => {
    const prepared = creatorSettingsForEditorDraft({ kind: 'voice', prompt: 'Hello. Keep this last sentence.' });
    expect(prepared).toMatchObject({ settings: { mode: 'audio', model: 'dia-tts' }, draft: { prompt: 'Hello. Keep this last sentence.' } });
    expect(creatorSettingsForEditorDraft({ kind: 'video', prompt: 'Sky', aspect: '9:16' })?.settings).toMatchObject({ mode: 'video', aspect: '9:16' });
    expect(creatorSettingsForEditorDraft({ kind: 'music', prompt: 'ambient' })).toBeNull();
  });
  it('preserves a reference clip duration and forwards every named image', () => {
    const referenceAssets = [{ uri: 'character.png', label: 'Character', kind: 'image' as const }, { uri: 'outfit.png', label: 'Outfit', kind: 'image' as const }, { uri: 'clip.mp4', label: 'Clip', kind: 'video' as const, seconds: 8.25 }];
    const settings = normalizeCreatorSettings({ ...CREATOR_DEFAULTS.video, model: 'kling-o3-edit', referenceAssets });
    expect(settings.durationSeconds).toBe(9);
    expect(creatorVideoOptions(settings)).toMatchObject({ duration: '9s', referenceImageUrls: ['character.png', 'outfit.png'], videoUrls: ['clip.mp4'] });
    expect(creatorInputIssue(settings, true)).toBeNull();
    expect(creatorInputIssue({ ...settings, model: 'kling-3-motion' }, true)).toBe('creator.referenceTooMany');
    expect(creatorInputIssue({ ...settings, referenceAssets: [] }, true)).toBe('creator.referenceNeedsClip');
    expect(creatorInputIssue({ ...settings, model: 'flux-3-video' }, true)).toBe('creator.referenceVideoModel');
  });

  it('validates multiple references before preparing an image payment', () => {
    const referenceAssets = ['character.png', 'setting.png'].map(uri => ({ uri, label: uri, kind: 'image' as const }));
    expect(creatorInputIssue({ ...CREATOR_DEFAULTS.image, referenceAssets }, true)).toBe('creator.referenceMultiModel');
    expect(creatorInputIssue({ ...CREATOR_DEFAULTS.image, model: 'flux-3-image', referenceAssets }, true)).toBeNull();
    expect(getTemplate('reference-character-swap')?.model).toBe('kling-o3-edit');
  });
  it('prices and submits the same chosen clip length and framing', () => {
    const settings = normalizeCreatorSettings({ ...CREATOR_DEFAULTS.video, durationSeconds: 10, aspect: '9:16' });
    expect(settings.durationSeconds).toBe(10);
    expect(creatorVideoOptions(settings)).toEqual({ duration: '10s', aspectRatio: '9:16', resolution: '720p' });
    const fixed = normalizeCreatorSettings({ ...settings, model: 'minimax-video', durationSeconds: 10 });
    expect(fixed.durationSeconds).toBe(6);
    expect(creatorVideoOptions(fixed).duration).toBe('6s');
  });

  it('has provider limits for every selectable video model', () => {
    for (const model of Object.keys(VIDEO_MODELS)) {
      expect(CREATOR_VIDEO_RULES[model]).toBeDefined();
      expect(creatorDurations(model).every((value) => Number.isFinite(value) && value > 0)).toBe(true);
    }
  });

  it('validates direction before presenting a payment', () => {
    expect(creatorInputIssue({ ...CREATOR_DEFAULTS.image, model: 'gemini-3.1-flash-image' }, true)).toBeNull();
    const textOnly = Object.values(VIDEO_MODELS).find((model) => !model.supports.includes('image-to-video'))!;
    expect(creatorInputIssue({ ...CREATOR_DEFAULTS.video, model: textOnly.id }, true)).toBe('creator.studioCannotAnimate');
    expect(creatorInputIssue({ ...CREATOR_DEFAULTS['3d'], model: 'trellis' }, false)).toBe('creator.studioNeedsImage');
  });

  it('keeps the selected medium and stored settings independent of prompt keywords', () => {
    const settings = normalizeCreatorSettings(CREATOR_DEFAULTS.image);
    expect(prepareCreatorPrompt('a video camera on a desk')).toBe('a video camera on a desk');
    expect(settings.mode).toBe('image');
    const preset = getTemplate('open-record-whip-pan')!;
    expect(prepareCreatorPrompt('', preset)).toBe('Whip pan from a spinning record to a dancer mid-turn, tungsten glow, heavy motion blur');
  });
});

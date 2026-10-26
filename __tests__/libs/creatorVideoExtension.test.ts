import { VIDEO_MODELS, videoCostUsd } from '../../config/ai-models.constants';
import { CREATOR_DEFAULTS, creatorInputIssue, creatorVideoOptions, normalizeCreatorSettings, prepareCreatorPrompt } from '../../libs/creatorStudio';
import { getTemplate } from '../../libs/creatorTemplates';

it('keeps source duration separate from the fixed new footage and prepares only a source clip', () => {
  for (const model of ['ltx-extend-forward', 'ltx-extend-backward']) {
    const source = { kind: 'video' as const, uri: 'https://media.test/source.mp4', label: 'Original', seconds: 25 };
    const settings = normalizeCreatorSettings({ ...CREATOR_DEFAULTS.video, model, durationSeconds: 25, aspect: '9:16', resolution: '1080p', referenceAssets: [source] });
    expect(settings.durationSeconds).toBe(4);
    expect(settings.resolution).toBe('720p');
    expect(settings.referenceAssets).toEqual([source]);
    expect(creatorInputIssue(settings, false)).toBeNull();
    expect(creatorVideoOptions(settings)).toMatchObject({ duration: '4s', aspectRatio: '9:16', videoUrls: [source.uri] });
    expect(videoCostUsd(VIDEO_MODELS[model], 4)).toBeCloseTo(0.324);
    expect(creatorInputIssue({ ...settings, referenceAssets: [] }, false)).toBe('creator.extensionNeedsClip');
    expect(creatorInputIssue(settings, true)).toBe('creator.referenceTooMany');
    expect(creatorInputIssue({ ...settings, referenceAssets: [{ ...source, seconds: 31 }] }, false)).toBe('creator.referenceClipLength');
  }
});

it('switches an existing motion or character swap draft with only its clip into extension without stale preset or hidden options', () => {
  for (const previous of ['kling-3-motion', 'kling-o3-edit']) {
    const preset = getTemplate(previous === 'kling-3-motion' ? 'reference-copy-motion' : 'reference-character-swap');
    expect(preset?.requiresImage).toBe(true);
    const existing = { ...CREATOR_DEFAULTS.video, model: previous, durationSeconds: 12, seed: '42', negativePrompt: 'old exclusions',
      endFrame: { kind: 'image' as const, uri: 'https://media.test/end.png', label: 'End' },
      referenceAssets: [{ kind: 'video' as const, uri: 'https://media.test/source.mp4', label: 'Source', seconds: 12 }] };
    expect(creatorInputIssue({ ...existing, endFrame: undefined }, false, preset)).toBe('creator.referenceNeedsClip');
    const changed = normalizeCreatorSettings({ ...existing, model: 'ltx-extend-forward' });
    expect(creatorInputIssue(changed, false, preset)).toBeNull();
    expect(prepareCreatorPrompt('Continue the coast shot', preset, changed)).toBe('Continue the coast shot');
    const options = creatorVideoOptions(changed);
    expect(options).toMatchObject({ duration: '4s', videoUrls: ['https://media.test/source.mp4'] });
    expect(options).not.toHaveProperty('seed');
    expect(options).not.toHaveProperty('negativePrompt');
    expect(options).not.toHaveProperty('endFrameUrl');
  }
});

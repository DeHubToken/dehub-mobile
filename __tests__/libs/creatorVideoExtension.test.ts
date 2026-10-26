import { VIDEO_MODELS, videoCostUsd } from '../../config/ai-models.constants';
import { CREATOR_DEFAULTS, creatorInputIssue, creatorVideoOptions, normalizeCreatorSettings } from '../../libs/creatorStudio';

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

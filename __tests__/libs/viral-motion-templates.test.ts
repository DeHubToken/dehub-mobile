import { MOTION_TEMPLATE_PROMPT, TEMPLATE_FEATURED_IDS, VIRAL_MOTION_TEMPLATES, VIRAL_TEMPLATES } from '../../config/viral-templates';
import { creatorVideoOptions, normalizeCreatorSettings } from '../../libs/creatorStudio';

describe('motion template handoff', () => {
  it('resolves every featured video and preserves the source clip in generation options', () => {
    for (const id of TEMPLATE_FEATURED_IDS) expect(VIRAL_TEMPLATES.find(template => template.id === id)?.preview).toMatch(/^https:/);
    for (const template of VIRAL_MOTION_TEMPLATES) {
      const settings = normalizeCreatorSettings({ mode: 'video', model: 'kling-3-motion', aspect: '9:16', resolution: '1080p',
        durationSeconds: Math.ceil(template.motionSeconds!), textureQuality: 'standard', referenceAssets: [
          { kind: 'image', uri: 'https://example.com/person.jpg', label: 'Person' },
          { kind: 'video', uri: template.preview!, label: template.name, seconds: template.motionSeconds },
        ] });
      const options = creatorVideoOptions(settings);
      expect(options.videoUrls).toEqual([template.preview]);
      expect(options.effect).toBeUndefined();
      expect(settings.durationSeconds).toBe(Math.ceil(template.motionSeconds!));
    }
    expect(MOTION_TEMPLATE_PROMPT).toContain('reference video');
  });
});

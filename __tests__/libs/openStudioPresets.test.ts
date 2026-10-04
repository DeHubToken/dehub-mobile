import { IMAGE_MODELS, VIDEO_MODELS, videoSupportsText } from '../../config/ai-models.constants';
import { CREATOR_TEMPLATES, applyTemplate, getTemplate, templatesFor } from '../../libs/creatorTemplates';
import { OPEN_STUDIO_PRESETS } from '../../libs/openStudioPresets';

describe('published studio presets', () => {
  it('routes every published recipe through the existing mobile catalog', () => {
    expect(OPEN_STUDIO_PRESETS).toHaveLength(24);
    expect(OPEN_STUDIO_PRESETS.filter((p) => p.kind === 'image')).toHaveLength(12);
    expect(OPEN_STUDIO_PRESETS.filter((p) => p.kind === 'video')).toHaveLength(12);
    expect(new Set(CREATOR_TEMPLATES.map((p) => p.id)).size).toBe(CREATOR_TEMPLATES.length);
    for (const preset of OPEN_STUDIO_PRESETS) {
      expect(getTemplate(preset.id)).toBe(preset);
      expect(templatesFor(preset.kind)).toContain(preset);
      expect(preset.requiresImage).not.toBe(true);
      if (preset.kind === 'image') expect(IMAGE_MODELS[preset.model!]).toBeDefined();
      else {
        expect(VIDEO_MODELS[preset.model!]).toBeDefined();
        expect(videoSupportsText(VIDEO_MODELS[preset.model!])).toBe(true);
      }
      expect(preset.template.match(/\{subject\}/g)).toHaveLength(1);
      expect(applyTemplate(preset, '  a red bicycle  ')).toContain('a red bicycle');
      expect(applyTemplate(preset, ' ')).not.toContain('{subject}');
    }
  });

  it('retains the source shot instructions while replacing only the subject', () => {
    const preset = getTemplate('open-record-whip-pan')!;
    expect(applyTemplate(preset, '')).toBe('Whip pan from a spinning record to a dancer mid-turn, tungsten glow, heavy motion blur');
    expect(applyTemplate(preset, 'a piano to a singer')).toBe('Whip pan from a piano to a singer, tungsten glow, heavy motion blur');
  });
});

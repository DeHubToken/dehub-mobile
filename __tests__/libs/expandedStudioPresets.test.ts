import { IMAGE_MODELS, VIDEO_MODELS, videoSupportsText } from '../../config/ai-models.constants';
import { CREATOR_VIDEO_RULES } from '../../config/creator-video-rules';
import { CREATOR_TEMPLATES, TEMPLATE_GROUP_KEYS, applyTemplate, getTemplate, templatesFor } from '../../libs/creatorTemplates';
import { EXPANDED_STUDIO_PRESETS } from '../../libs/expandedStudioPresets';
import en from '../../i18n/locales/en.json';
import fr from '../../i18n/locales/fr.json';

describe('expanded studio catalog', () => {
  it('makes every new recipe selectable with a supported generation model and framing', () => {
    expect(EXPANDED_STUDIO_PRESETS).toHaveLength(100);
    expect(EXPANDED_STUDIO_PRESETS.filter((preset) => preset.kind === 'image')).toHaveLength(60);
    expect(EXPANDED_STUDIO_PRESETS.filter((preset) => preset.kind === 'video')).toHaveLength(40);
    expect(new Set(CREATOR_TEMPLATES.map((preset) => preset.id)).size).toBe(CREATOR_TEMPLATES.length);
    for (const preset of EXPANDED_STUDIO_PRESETS) {
      expect(getTemplate(preset.id)).toBe(preset);
      expect(templatesFor(preset.kind)).toContain(preset);
      expect(TEMPLATE_GROUP_KEYS[preset.group]).toBeDefined();
      if (preset.kind === 'image') expect(IMAGE_MODELS[preset.model!]).toBeDefined();
      else {
        const model = VIDEO_MODELS[preset.model!];
        expect(CREATOR_VIDEO_RULES[preset.model!].aspectRatios).toContain(preset.aspect);
        if (preset.requiresImage) expect(model.supports).toContain('image-to-video');
        else expect(videoSupportsText(model)).toBe(true);
      }
      expect(preset.template.match(/\{subject\}/g)).toHaveLength(1);
      expect(applyTemplate(preset, '  a red bicycle  ')).toContain('a red bicycle');
      expect(applyTemplate(preset, '')).toContain(preset.sample);
      expect(applyTemplate(preset, '')).not.toContain('{subject}');
    }
  });

  it('requires a reference for every recipe that asks to animate an attached image', () => {
    const referenced = EXPANDED_STUDIO_PRESETS.filter((preset) => /attached/i.test(preset.template));
    expect(referenced).toHaveLength(6);
    expect(referenced.every((preset) => preset.requiresImage && preset.kind === 'video')).toBe(true);
    expect(EXPANDED_STUDIO_PRESETS.filter((preset) => preset.requiresImage)).toEqual(referenced);
  });

  it('provides distinct translated names and usable hints for the enlarged picker', () => {
    for (const locale of [en, fr]) {
      const creator: Record<string, unknown> = locale.creator;
      const names = EXPANDED_STUDIO_PRESETS.map((preset) => creator[preset.nameKey.split('.')[1]]);
      expect(names.every((name) => typeof name === 'string' && name.length > 0)).toBe(true);
      expect(new Set(names).size).toBe(EXPANDED_STUDIO_PRESETS.length);
      for (const preset of EXPANDED_STUDIO_PRESETS) expect(creator[preset.hintKey.split('.')[1]]).toBeTruthy();
    }
  });
});

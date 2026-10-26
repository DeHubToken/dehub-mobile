import { VIDEO_MODELS, IMAGE_MODELS } from '../config/ai-models.constants';
import { CREATOR_FAL_IMAGE_MODELS, CREATOR_FAL_VIDEO_MODELS } from '../config/creator-fal-catalog';
import index from './fixtures/provider-capability-index.json';

describe('public provider schemas versus native advertised controls', () => {
  for (const [id, model] of Object.entries(VIDEO_MODELS)) {
    const record = index.find(entry => entry.kind === 'video' && entry.id === id);
    const fields = record?.routes.flatMap(route => route.properties) ?? [];
    if (!fields.length) continue; // Non-fal account entitlements remain separately unverified.
    it(`${id} advertises only controls present on its configured fal routes`, () => {
      const metadata = model as unknown as Record<string, unknown>;
      if (metadata.supportsSeed) expect(fields).toContain('seed');
      if (metadata.supportsNegativePrompt) expect(fields).toContain('negative_prompt');
      if (metadata.supportsEndFrame) expect(fields.some(field => /end.*(?:image|frame)|(?:image|frame).*end|last.*(?:image|frame)|tail.*image|keyframe/.test(field))).toBe(true);
    });
  }
  it('keeps every shared image and video route in the independently captured schema index', () => {
    for (const model of [...Object.values(CREATOR_FAL_IMAGE_MODELS), ...Object.values(CREATOR_FAL_VIDEO_MODELS)]) {
      const record = index.find(entry => entry.id === model.id);
      expect(record?.routes.length).toBeGreaterThan(0);
      expect(record?.entitlement).toBe('Not verified');
      expect(record?.output).toBe('No inference performed');
    }
    for (const model of Object.values(CREATOR_FAL_IMAGE_MODELS)) expect(IMAGE_MODELS[model.id]).toBeDefined();
  });
});

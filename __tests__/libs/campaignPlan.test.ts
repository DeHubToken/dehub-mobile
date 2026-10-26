import { CAMPAIGN_VARIANT_LIMIT, campaignVariantDraft, normalizeCampaignPlan } from '../../libs/campaignPlan';
import { EMPTY_MARKETING_BRIEF } from '../../libs/marketingBrief';

const brief = { ...EMPTY_MARKETING_BRIEF, product: 'Loose tea', description: 'Whole leaves in a reusable tin', brand: 'Tea House', headline: 'Original headline', cta: 'Explore' };
const first = { id: 'first', format: 'story', title: 'Morning', hook: 'A quiet ritual', language: 'Spanish', headline: 'Make time', cta: 'Brew now', script: 'Open the tin, steep the tea, pour.' };
it('uses the same reviewed product and continuity notes while isolating each variant copy and format', () => {
  const plan = { title: 'Daily rituals', continuity: 'Same calm presenter and warm palette', variants: [first, { ...first, id: 'second', format: 'video', headline: 'Slow down', hook: 'Evening ritual', script: '' }] };
  const a = campaignVariantDraft(brief, plan, 'first'), b = campaignVariantDraft(brief, plan, 'second');
  expect(a).toMatchObject({ kind: 'image', aspect: '9:16' });
  expect(b).toMatchObject({ kind: 'video', aspect: '9:16' });
  expect(a?.prompt).toContain('Approved headline: "Make time"');
  expect(b?.prompt).toContain('Approved headline: "Slow down"');
  expect(b?.prompt).not.toContain(first.script);
  for (const draft of [a, b]) {
    expect(draft?.prompt).toContain('Product: "Loose tea"');
    expect(draft?.prompt).toContain('Shared continuity instructions: "Same calm presenter and warm palette"');
    expect(draft?.prompt).toContain('"Spanish"');
    expect(draft).not.toHaveProperty('referenceImageUrls');
    expect(draft).not.toHaveProperty('jobId');
  }
  expect(campaignVariantDraft(brief, plan, 'missing')).toBeNull();
  expect(campaignVariantDraft({}, plan, 'first')).toBeNull();
});
it('bounds saved plans and removes duplicate, malformed and unsupported entries', () => {
  const variants = Array.from({ length: 30 }, (_, index) => ({ ...first, id: `v-${index}`, script: 'a'.repeat(900) }));
  const plan = normalizeCampaignPlan({ title: 'x'.repeat(300), continuity: 'y'.repeat(800), privateUrl: 'file:///secret', variants: [{ ...first, format: 'unsupported' }, first, first, ...variants] });
  expect(plan.variants).toHaveLength(CAMPAIGN_VARIANT_LIMIT);
  expect(new Set(plan.variants.map(item => item.id)).size).toBe(CAMPAIGN_VARIANT_LIMIT);
  expect(plan.title).toHaveLength(180);
  expect(plan.continuity).toHaveLength(500);
  expect(plan.variants[1].script).toHaveLength(800);
  expect(plan).not.toHaveProperty('privateUrl');
  expect(normalizeCampaignPlan(null).variants).toEqual([]);
});


import { EMPTY_MARKETING_BRIEF, MARKETING_FORMATS, marketingGenerationDraft, normalizeMarketingBrief } from '../../libs/marketingBrief';

describe('marketing campaign draft', () => {
  it('requires reviewed product facts and a supported output format', () => {
    expect(marketingGenerationDraft({}, 'square')).toBeNull();
    expect(marketingGenerationDraft({ product: 'Tea', description: '   ' }, 'square')).toBeNull();
    expect(marketingGenerationDraft({ product: 'Tea', description: 'Loose leaf' }, 'unknown')).toBeNull();
  });
  it('keeps approved copy across ratio variants without adding unsupplied claims', () => {
    for (const format of MARKETING_FORMATS) {
      const draft = marketingGenerationDraft({ product: 'Tea', description: 'Loose leaf', brand: 'North', headline: 'A quiet moment', cta: 'Explore the range' }, format.id);
      expect(draft).toMatchObject({ kind: format.kind, aspect: format.aspect });
      expect(draft?.prompt).toContain('Approved headline: "A quiet moment"');
      expect(draft?.prompt).toContain('Call to action: "Explore the range"');
      expect(draft?.prompt).not.toContain('Price:');
    }
  });
  it('rejects malformed saved values and bounds user fields', () => {
    expect(normalizeMarketingBrief(null)).toEqual(EMPTY_MARKETING_BRIEF);
    expect(normalizeMarketingBrief({ product: 7, cta: false, arbitrary: 'private' })).toEqual(EMPTY_MARKETING_BRIEF);
    const brief = normalizeMarketingBrief({ product: 'x'.repeat(500), description: 'y'.repeat(2000), headline: 'Hello\u0000world' });
    expect(brief.product).toHaveLength(180);
    expect(brief.description).toHaveLength(1000);
    expect(brief.headline).toBe('Helloworld');
  });
});

import type { GenerationDraft } from './editor/generationDraft';

export const MARKETING_FIELDS = ['product', 'description', 'brand', 'audience', 'benefit', 'voice', 'palette', 'headline', 'cta'] as const;
export type MarketingField = typeof MARKETING_FIELDS[number];
export type MarketingBrief = Record<MarketingField, string> & { sourceUrl: string };
export const EMPTY_MARKETING_BRIEF: MarketingBrief = {
  product: '', description: '', brand: '', audience: '', benefit: '', voice: '', palette: '', headline: '', cta: '', sourceUrl: '',
};
export const MARKETING_FORMATS = [
  { id: 'square', kind: 'image', aspect: '1:1' },
  { id: 'portrait', kind: 'image', aspect: '4:5' },
  { id: 'story', kind: 'image', aspect: '9:16' },
  { id: 'video', kind: 'video', aspect: '9:16' },
] as const;
export type MarketingFormat = typeof MARKETING_FORMATS[number]['id'];
export const marketingFieldLimit = (field: MarketingField) => field === 'description' ? 1000 : 180;

/** Drafts are local account data; unknown fields and malformed old values are discarded. */
export function normalizeMarketingBrief(value: unknown): MarketingBrief {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return { ...Object.fromEntries(MARKETING_FIELDS.map((field) => [field, typeof input[field] === 'string'
    ? input[field].replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, marketingFieldLimit(field)) : ''])),
    sourceUrl: typeof input.sourceUrl === 'string' && input.sourceUrl.startsWith('https://') ? input.sourceUrl.slice(0, 4096) : '' } as MarketingBrief;
}

/** Preparing a campaign variant never starts a generation or changes its price. */
export function marketingGenerationDraft(value: unknown, formatId: string): GenerationDraft | null {
  const brief = normalizeMarketingBrief(value);
  const format = MARKETING_FORMATS.find((entry) => entry.id === formatId);
  if (!brief.product.trim() || !brief.description.trim() || !format) return null;
  const labels: Record<MarketingField, string> = { product: 'Product', description: 'Product description', brand: 'Brand', audience: 'Audience', benefit: 'Key benefit', voice: 'Brand voice', palette: 'Color palette', headline: 'Approved headline', cta: 'Call to action' };
  const fields = MARKETING_FIELDS.filter((field) => brief[field].trim()).map((field) => `${labels[field]}: ${JSON.stringify(brief[field].trim())}`);
  const direction = format.kind === 'video'
    ? 'Create a vertical product advertisement with a clear opening hook, one product benefit and a closing call to action. Keep the product and brand consistent throughout.'
    : `Create a ${format.aspect} product advertisement with a clear product hero, a readable headline and a call to action. Keep the product silhouette and brand styling consistent.`;
  return { kind: format.kind, aspect: format.aspect, prompt: [direction, 'Use only the supplied product facts and approved copy. Do not invent prices, discounts, reviews or performance claims.', ...fields].join('\n') };
}

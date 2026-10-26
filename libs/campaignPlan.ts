import { MARKETING_FORMATS, marketingGenerationDraft, normalizeMarketingBrief, type MarketingFormat } from './marketingBrief';
import type { GenerationDraft } from './editor/generationDraft';

export const CAMPAIGN_VARIANT_LIMIT = 12;
export const CAMPAIGN_VARIANT_FIELDS = ['title', 'hook', 'language', 'headline', 'cta', 'script'] as const;
export type CampaignVariantField = typeof CAMPAIGN_VARIANT_FIELDS[number];
export interface CampaignVariant extends Record<CampaignVariantField, string> { id: string; format: MarketingFormat }
export interface CampaignPlan { version: 1; title: string; continuity: string; variants: CampaignVariant[] }
export const EMPTY_CAMPAIGN_PLAN: CampaignPlan = { version: 1, title: '', continuity: '', variants: [] };
export const campaignFieldLimit = (field: CampaignVariantField) => field === 'script' ? 800 : field === 'language' ? 60 : 180;
const clean = (value: unknown, limit: number) => typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, limit) : '';

export function normalizeCampaignPlan(value: unknown): CampaignPlan {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...EMPTY_CAMPAIGN_PLAN, variants: [] };
  const input = value as Record<string, unknown>, seen = new Set<string>();
  const variants: CampaignVariant[] = [];
  for (const entry of Array.isArray(input.variants) ? input.variants : []) {
    if (!entry || typeof entry !== 'object') continue;
    const item = entry as Record<string, unknown>;
    if (typeof item.id !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(item.id) || seen.has(item.id) || !MARKETING_FORMATS.some(format => format.id === item.format)) continue;
    seen.add(item.id);
    variants.push({ id: item.id, format: item.format as MarketingFormat,
      ...Object.fromEntries(CAMPAIGN_VARIANT_FIELDS.map(field => [field, clean(item[field], campaignFieldLimit(field))])) } as CampaignVariant);
    if (variants.length >= CAMPAIGN_VARIANT_LIMIT) break;
  }
  return { version: 1, title: clean(input.title, 180), continuity: clean(input.continuity, 500), variants };
}

/** Each reviewed item opens one existing quoted job; this never starts or aggregates payments. */
export function campaignVariantDraft(briefValue: unknown, planValue: unknown, id: string): GenerationDraft | null {
  const brief = normalizeMarketingBrief(briefValue), plan = normalizeCampaignPlan(planValue), variant = plan.variants.find(item => item.id === id);
  if (!variant) return null;
  const draft = marketingGenerationDraft({ ...brief, headline: variant.headline.trim() || brief.headline, cta: variant.cta.trim() || brief.cta }, variant.format);
  if (!draft) return null;
  const direction = [
    plan.title.trim() && `Campaign or series: ${JSON.stringify(plan.title.trim())}`,
    plan.continuity.trim() && `Shared continuity instructions: ${JSON.stringify(plan.continuity.trim())}`,
    variant.title.trim() && `Variant or episode: ${JSON.stringify(variant.title.trim())}`,
    variant.hook.trim() && `Opening hook: ${JSON.stringify(variant.hook.trim())}`,
    variant.language.trim() && `Write visible copy and spoken dialogue in this language: ${JSON.stringify(variant.language.trim())}. Keep brand names unchanged.`,
    variant.script.trim() && `Approved script or scene sequence: ${JSON.stringify(variant.script.trim())}`,
  ].filter(Boolean);
  return { ...draft, prompt: [draft.prompt, ...direction].join('\n') };
}

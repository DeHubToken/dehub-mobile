import catalog from '../config/ai-plan-offers.json';

export type AiPlanBilling = 'monthly' | 'annual';
export type AiPlanTier = 'creator' | 'ultra' | 'team' | 'scale';

export function aiPlanPolicyVersion(priceId: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(catalog.offers, priceId) ? catalog.version : undefined;
}

export function getAiPlanOffer(tier: AiPlanTier, billing: AiPlanBilling) {
  return catalog.offers[`${tier}_${billing}` as keyof typeof catalog.offers];
}

export function aiPlanBreakdownVars(
  key: string,
  tier: AiPlanTier,
  billing: AiPlanBilling,
  vars?: Record<string, string | number>,
): Record<string, string | number> | undefined {
  const allowance = getAiPlanOffer(tier, billing).monthlyAllowanceDhb;
  if (key === 'pricing.dhbPerMonth' || key === 'pricing.dhbPerSeat') {
    return { amount: allowance.toLocaleString('en-US') };
  }
  if (key === 'pricing.equivalence') {
    const creator = tier === 'creator';
    return {
      videos: Math.floor(allowance / (creator ? catalog.examplePricesDhb.veoFast : catalog.examplePricesDhb.veo)),
      videoModel: creator ? 'Veo 3.1 Fast' : 'Veo 3.1',
      images: Math.floor(allowance / catalog.examplePricesDhb.nanoBananaPro).toLocaleString('en-US'),
      imageModel: 'Nano Banana Pro',
    };
  }
  return vars;
}

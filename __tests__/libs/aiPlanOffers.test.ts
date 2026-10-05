import { aiPlanBreakdownVars, getAiPlanOffer } from '../../libs/aiPlanOffers';
import catalog from '../../config/ai-plan-offers.json';

describe('subscription offers', () => {
  it('matches the verified monthly and annual USD prices', () => {
    expect(getAiPlanOffer('creator', 'monthly').displayPriceUsd).toBe(19);
    expect(getAiPlanOffer('creator', 'annual').displayPriceUsd * 12).toBe(180);
    expect(getAiPlanOffer('ultra', 'monthly').displayPriceUsd).toBe(129);
    expect(getAiPlanOffer('ultra', 'annual').displayPriceUsd * 12).toBe(1188);
    expect(getAiPlanOffer('team', 'monthly').displayPriceUsd).toBe(79);
    expect(getAiPlanOffer('team', 'annual').displayPriceUsd * 12).toBe(780);
    expect(getAiPlanOffer('scale', 'monthly').displayPriceUsd).toBe(215);
    expect(getAiPlanOffer('scale', 'annual').displayPriceUsd * 12).toBe(1800);
  });

  it('shows the allowance and examples for the selected billing schedule', () => {
    expect(aiPlanBreakdownVars('pricing.dhbPerMonth', 'creator', 'monthly')).toEqual({ amount: '15,000' });
    expect(aiPlanBreakdownVars('pricing.dhbPerMonth', 'creator', 'annual')).toEqual({ amount: '12,000' });
    expect(aiPlanBreakdownVars('pricing.equivalence', 'creator', 'annual')?.images).toBe('111');
    expect(aiPlanBreakdownVars('pricing.dhbPerSeat', 'scale', 'annual')).toEqual({ amount: '120,000' });
  });

  it('keeps every offer within the provider budget at the lowest markup', () => {
    for (const offer of Object.values(catalog.offers)) {
      expect(offer.monthlyAllowanceDhb * 0.001 / 1.1).toBeLessThanOrEqual(offer.displayPriceUsd * 0.75);
    }
  });
});

// Kept in step with dehubweb supabase/functions/_shared/social-pricing.ts, which is enforced.

export const PRICE_PER_POST_USD = 0.10;

export const BUNDLE_STOPS = [10, 25, 50, 100, 250, 500, 1000] as const;

export function bundleDiscount(posts: number): number {
  if (posts >= 500) return 0.40;
  if (posts >= 250) return 0.30;
  if (posts >= 100) return 0.20;
  if (posts >= 25) return 0.10;
  return 0;
}

export function bundlePriceUsd(posts: number): number {
  return Math.round(posts * PRICE_PER_POST_USD * (1 - bundleDiscount(posts)) * 100) / 100;
}

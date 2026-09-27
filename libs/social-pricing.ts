// Kept in step with dehubweb supabase/functions/_shared/social-pricing.ts, which is enforced.

export const CREDIT_PRICE_USD = 0.10;

export const DEFAULT_PLATFORM_CREDITS = 3;
export const PLATFORM_CREDITS: Record<string, number> = { twitter: 7, farcaster: 1 };

export function creditsFor(platform: string): number {
  return PLATFORM_CREDITS[platform] ?? DEFAULT_PLATFORM_CREDITS;
}

export const BUNDLE_STOPS = [30, 100, 300, 600, 1000, 2500, 5000] as const;

export function bundleDiscount(credits: number): number {
  if (credits >= 2500) return 0.40;
  if (credits >= 1000) return 0.30;
  if (credits >= 300) return 0.20;
  if (credits >= 100) return 0.10;
  return 0;
}

export function bundlePriceUsd(credits: number): number {
  return Math.round(credits * CREDIT_PRICE_USD * (1 - bundleDiscount(credits)) * 100) / 100;
}

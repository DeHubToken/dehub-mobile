/**
 * Badge valuation while DHB liquidity is unavailable.
 *
 * The published calculation price is $0.001. Both the ladder and its dollar
 * estimates must use it: a persisted market quote must not alter the tier
 * requirement or the badge info slider. Restore live pricing here when the
 * fixed-price policy is lifted.
 *
 * BadgeLadderSync publishes the same scale for non-hook consumers such as
 * feed mappers and quota calculations.
 */
import { useEffect } from "react";
import { badgeScaleForPrice, setActiveBadgeScale } from "../libs/misc";

export const BADGE_PREVIEW_DHB_PRICE_USD = 0.001;

export function useBadgeLadderScale(): number {
  const scale = badgeScaleForPrice(BADGE_PREVIEW_DHB_PRICE_USD);
  useEffect(() => {
    setActiveBadgeScale(scale);
  }, [scale]);
  return scale;
}

export function useBadgeScale(): number {
  return badgeScaleForPrice(BADGE_PREVIEW_DHB_PRICE_USD);
}

export function useBadgeLadderPrice(): number {
  return BADGE_PREVIEW_DHB_PRICE_USD;
}

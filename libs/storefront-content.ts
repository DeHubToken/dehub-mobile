import type { StreamAccessResult } from './validators.util';

/** Visibility follows the viewer's access, rather than a post's original price. */
export function isPostHiddenByStorefront(
  purchasesEnabled: boolean,
  access: StreamAccessResult,
  hasBounty: boolean,
  locallyUnlocked = false,
): boolean {
  if (purchasesEnabled) return false;
  return hasBounty || !!access.streamStatus?.isLockedWithSubscription ||
    (!!access.streamStatus?.isLockedWithPPV && !locallyUnlocked);
}

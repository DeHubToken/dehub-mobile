/**
 * BadgeLadderSync — owns the badge ladder's scale.
 *
 * Renders nothing. Mounted once in App.tsx so exactly one query reads the DHB
 * price; every badge on screen resolves against the module-level scale it
 * publishes (see `hooks/useBadgeScale`).
 *
 * Sits outside AuthProvider on purpose: badges draw on feeds, chat rows and
 * leaderboards for signed-out viewers too, and all of them need the ladder.
 */

import { useBadgeLadderScale } from "../../hooks/useBadgeScale";

export function BadgeLadderSync() {
  useBadgeLadderScale();
  return null;
}

export default BadgeLadderSync;

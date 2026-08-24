/**
 * What the signed-in viewer's own view or reaction counts for
 * ===========================================================
 * The badge multiplier for *me* — 1 with no badge, 2 at Crab, up to 14 at
 * Meglodon. Used to move an optimistic count by the right amount instead of by
 * one and then snapping when the server's number lands.
 *
 * Reads the same balance and the same lock every badge in the app draws from,
 * through `resolveBadgeBalance` / `resolveBadgeLock`. The ladder scale comes
 * from module state, which `useBadgeScale` publishes once per sync, so this
 * costs nothing on a feed.
 *
 * A lent badge counts for what it draws, so `resolveBadgeBalance` — the number
 * every badge here already resolves from — is the right one to price off; the
 * API prices from the same rendered figure.
 *
 * **Advisory, not authoritative.** The cached account row here can be a beat
 * behind the one the API priced from. Both vote endpoints return the weight
 * they actually applied — settle against that.
 *
 * Mirror of dehubweb's `hooks/use-engagement-weight.ts`.
 */

import { useMemo } from "react";
import { useUser } from "../context/AuthContext";
import { resolveBadgeBalance, resolveBadgeLock } from "../libs/misc";
import {
  engagementWeight,
  NO_BADGE_ENGAGEMENT_WEIGHT,
} from "../libs/engagement-weight";

export function useEngagementWeight(): number {
  const user = useUser();

  const balance = resolveBadgeBalance(user as any);
  const lock = resolveBadgeLock(user as any);

  return useMemo(() => {
    if (!balance) return NO_BADGE_ENGAGEMENT_WEIGHT;
    return engagementWeight(balance, { lock });
  }, [balance, lock?.tier, lock?.requirement]);
}

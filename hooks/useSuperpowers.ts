/**
 * SuperPowers — allowance, ladder and the feed's boost slot
 * =========================================================
 * Mirror of web's `use-superpowers.ts`. Three queries with three cache windows,
 * because they answer three different kinds of question.
 *
 * `useSuperpowers` is the holder's own allowance and has to be right the
 * instant a boost is spent, so it is short-lived and invalidated on every
 * write. `useSuperpowerLadder` is a published table that changes on deploys.
 *
 * `useBoostSlot` is the interesting one. The server deals a fresh weighted draw
 * on every call, so **the cache window here IS the rotation** — five minutes
 * means a viewer sees one boost, then a different one after a refresh. Cache it
 * for the session and one holder owns that viewer's slot until the app is
 * killed; drop the cache and the slot changes under someone mid-scroll. Five
 * minutes is a product decision, not a performance one, and it must stay in
 * step with web's.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  bookBoost,
  cancelBoost,
  fetchBoostSlot,
  fetchSuperpowerStatus,
  fetchSuperpowerTiers,
  type SuperPowerKey,
  type SuperPowerStatus,
} from '../services/superpower.service';
import { useUser } from '../context/AuthContext';

export const SUPERPOWERS_KEY = ['superpowers', 'status'] as const;
export const SUPERPOWERS_SLOT_KEY = ['superpowers', 'slot'] as const;
export const SUPERPOWERS_TIERS_KEY = ['superpowers', 'tiers'] as const;

/** How long a viewer keeps the boost they were dealt. See the note above. */
const SLOT_ROTATION_MS = 5 * 60 * 1000;

/** This account's tier, allowance and bookings. Inert while signed out. */
export function useSuperpowers() {
  const user = useUser();
  const address = (user?.walletAddress || user?.address || '') as string;

  return useQuery<SuperPowerStatus>({
    queryKey: SUPERPOWERS_KEY,
    queryFn: fetchSuperpowerStatus,
    enabled: Boolean(address),
    staleTime: 30_000,
    retry: 1,
  });
}

/** The published ladder. Public, and safe to render signed out. */
export function useSuperpowerLadder() {
  return useQuery({
    queryKey: SUPERPOWERS_TIERS_KEY,
    queryFn: fetchSuperpowerTiers,
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });
}

/**
 * The boosted post for this viewer, or null when nothing is running.
 *
 * Deliberately not gated on being signed in: a signed-out viewer sees boosts
 * too. That is most of the audience on a shared link, and a boost that only
 * reaches signed-in users is worth a fraction of what the holder was promised.
 */
export function useBoostSlot(enabled = true) {
  return useQuery({
    queryKey: SUPERPOWERS_SLOT_KEY,
    queryFn: fetchBoostSlot,
    enabled,
    staleTime: SLOT_ROTATION_MS,
    gcTime: SLOT_ROTATION_MS,
    refetchOnWindowFocus: false,
    // The feed must not wait on this, and must not break without it.
    retry: false,
  });
}

/** Spend a boost, then refresh the allowance and re-deal the slot. */
export function useBookBoost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      tokenId,
      power = 'boost',
      startAt,
      targetAccount,
      targetTiers,
    }: {
      tokenId: number;
      power?: SuperPowerKey;
      startAt?: string;
      /** precision_strike: whose followers to reach. */
      targetAccount?: string;
      /** harpoon: badge tier NAMES to aim at. */
      targetTiers?: string[];
    }) => bookBoost(tokenId, power, startAt, { targetAccount, targetTiers }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SUPERPOWERS_KEY });
      // So the holder can see their own boost land, rather than waiting out the
      // rotation window wondering whether it worked.
      queryClient.invalidateQueries({ queryKey: SUPERPOWERS_SLOT_KEY });
    },
  });
}

/** Cancel a boost. The allowance comes back only if it had not started. */
export function useCancelBoost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (bookingId: string) => cancelBoost(bookingId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SUPERPOWERS_KEY });
      queryClient.invalidateQueries({ queryKey: SUPERPOWERS_SLOT_KEY });
    },
  });
}

/** True when this account's tier reaches a power and the power is built. */
export function canSpend(status: SuperPowerStatus | null | undefined, key: SuperPowerKey): boolean {
  if (!status) return false;
  const power = status.powers.find(p => p.key === key);
  return Boolean(power?.unlocked) && Boolean(power?.available) && status.boostsLeft > 0;
}

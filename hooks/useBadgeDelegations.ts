/**
 * The signed-in account's delegation slots, and the two mutations on them.
 *
 * Mirror of web's `use-badge-delegations.ts`. Kept apart from the badge
 * balance hooks, which answer "what badge does this account render" for every
 * row of a feed and are tuned to be nearly free — this is a settings-panel
 * query, and it runs when someone opens the panel.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchMyDelegations,
  grantDelegation,
  revokeDelegation,
  type BadgeDelegationSummary,
} from '../services/badge-delegation.service';
import { useUser } from '../context/AuthContext';
import { toastError, toastSuccess } from '../libs/toast';

export const BADGE_DELEGATIONS_KEY = ['badge-delegations'] as const;

export function useBadgeDelegations() {
  const user = useUser();
  const address = (user?.walletAddress || user?.address || '') as string;

  return useQuery<BadgeDelegationSummary>({
    queryKey: BADGE_DELEGATIONS_KEY,
    queryFn: fetchMyDelegations,
    enabled: Boolean(address),
    staleTime: 30_000,
    retry: false,
  });
}

/**
 * Grant and revoke, both invalidating the summary and the badge caches.
 *
 * The badge invalidation matters as much as the summary one: a delegation
 * changes what draws next to a name, and badges are cached per account all
 * over the app. Without it, the person you just lent a badge to keeps drawing
 * their old one until that cache expires.
 */
export function useGrantDelegation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (to: string) => grantDelegation(to),
    onSuccess: (result, to) => {
      toastSuccess(`${to} is now wearing your ${result.tier} badge`);
      queryClient.invalidateQueries({ queryKey: BADGE_DELEGATIONS_KEY });
      queryClient.invalidateQueries({ queryKey: ['badge-balance'] });
    },
    onError: (error: Error) => {
      toastError(error?.message || 'Could not lend your badge');
    },
  });
}

export function useRevokeDelegation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (counterparty: string) => revokeDelegation(counterparty),
    onSuccess: () => {
      toastSuccess('Delegation ended');
      queryClient.invalidateQueries({ queryKey: BADGE_DELEGATIONS_KEY });
      queryClient.invalidateQueries({ queryKey: ['badge-balance'] });
    },
    onError: (error: Error) => {
      toastError(error?.message || 'Could not end the delegation');
    },
  });
}

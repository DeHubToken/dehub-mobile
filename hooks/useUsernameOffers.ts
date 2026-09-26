/**
 * Username offer data layer
 * =========================
 * Native port of web's `use-username-offers.ts`, against the same
 * `/username_market/offers/*` endpoints.
 *
 * The one rule worth stating up front, because every screen that uses this has
 * to keep saying it: **making an offer costs nothing and commits nothing**. No
 * DHB moves, no balance is checked, nothing is held. The money only leaves
 * when an accepted offer is paid for, and that runs through `useBuyUsername`
 * in `useUsernameMarket` like any other purchase — an accepted offer carries
 * the `listingId` to hand it.
 *
 * Every mutation drops the listing caches alongside the offer caches, because
 * accepting an offer converts the owner's listing into a reservation and
 * declining one cancels it. A stale sell tab showing a listing that is now
 * promised to somebody is the bug this avoids.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useIsScreenFocused } from './useFocusedInterval';
import { toastError, toastSuccess } from '../libs/toast';
import {
  usernameOffersService,
  type MyUsernameOffers,
  type UsernameOffer,
} from '../services/username-offers.service';

/**
 * Write the server's answer into the list straight away, so the row flips
 * (Accept → Withdraw acceptance) the moment the call returns instead of after
 * the refetch. Without it a second tap on a still-visible Accept was possible.
 */
function applyOffer(qc: ReturnType<typeof useQueryClient>, offer: UsernameOffer) {
  qc.setQueryData<MyUsernameOffers>(['username-offers-mine'], (prev) =>
    prev
      ? {
          incoming: prev.incoming.map((o) => (o.id === offer.id ? { ...o, ...offer } : o)),
          outgoing: prev.outgoing.map((o) => (o.id === offer.id ? { ...o, ...offer } : o)),
        }
      : prev,
  );
}

/** Offers touch two surfaces, and answering one changes both. */
function invalidateMarket(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['username-offers-mine'] });
  qc.invalidateQueries({ queryKey: ['username-offers-for'] });
  qc.invalidateQueries({ queryKey: ['username-market-mine'] });
  qc.invalidateQueries({ queryKey: ['username-market-browse'] });
  // An answered offer is a row in the tray, and its badge is wrong until this
  // is dropped.
  qc.invalidateQueries({ queryKey: ['notifications'] });
}

export function useMyUsernameOffers(enabled: boolean) {
  const focused = useIsScreenFocused();
  return useQuery<MyUsernameOffers>({
    queryKey: ['username-offers-mine'],
    queryFn: () => usernameOffersService.mine(),
    enabled,
    // The other side acts from another device: an owner accepting has to reach
    // the bidder's screen quickly, and a paid offer has to leave it.
    staleTime: 5 * 1000,
    refetchInterval: focused ? 30 * 1000 : false,
  });
}

/** Live bids for one handle — what it would take to outbid the room. */
export function useOffersForUsername(username: string | null | undefined) {
  return useQuery({
    queryKey: ['username-offers-for', username || ''],
    queryFn: () => usernameOffersService.forUsername(username as string),
    enabled: !!username,
    staleTime: 30 * 1000,
  });
}

export function useCreateUsernameOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: usernameOffersService.create,
    onSuccess: (offer) => {
      invalidateMarket(qc);
      toastSuccess(`Offer sent for @${offer.username}`);
    },
    onError: (err) => toastError(err, 'Could not make that offer'),
  });
}

export function useAcceptUsernameOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ offerId, replacementUsername }: { offerId: string; replacementUsername: string }) =>
      usernameOffersService.accept(offerId, { replacementUsername }),
    onSuccess: (offer) => {
      applyOffer(qc, offer);
      invalidateMarket(qc);
      // Said as a next step rather than as a completion: the owner still holds
      // the handle, and will until the buyer actually pays for it.
      toastSuccess(`Offer accepted — @${offer.username} is held for them until they pay`);
    },
    onError: (err) => toastError(err, 'Could not accept that offer'),
  });
}

export function useDeclineUsernameOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: usernameOffersService.decline,
    onSuccess: (offer) => {
      applyOffer(qc, offer);
      invalidateMarket(qc);
      toastSuccess('Offer declined');
    },
    onError: (err) => toastError(err, 'Could not decline that offer'),
  });
}

export function useWithdrawUsernameOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: usernameOffersService.withdraw,
    onSuccess: (offer) => {
      applyOffer(qc, offer);
      invalidateMarket(qc);
      toastSuccess('Offer withdrawn');
    },
    onError: (err) => toastError(err, 'Could not withdraw that offer'),
  });
}

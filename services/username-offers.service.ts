/**
 * Username offers — bidding for handles that are not for sale
 * ===========================================================
 * The listings service next door covers handles whose owners have put them up
 * for sale. This covers the other direction: naming a price for a handle
 * somebody else is wearing and has never offered to anybody, which is most of
 * the handles worth having.
 *
 * Two things to know before wiring a button to this:
 *
 * **Making an offer moves no money and locks none.** It is a stated intention.
 * Nothing is escrowed and the balance is not even checked, so any screen that
 * implies funds are committed is lying to the reader.
 *
 * **Accepting does not transfer a handle either.** It returns an `accepted`
 * offer carrying `listingId`, and the buyer pays for it through the ordinary
 * quote → pay → claim path in `username-market.service.ts`. There is exactly
 * one code path that moves a username and this is not a second one.
 *
 * Mirrors web's `src/lib/api/dehub/username-offers.ts`. As everywhere in this
 * app, `env.API_URL` already ends in `/api`, so the paths here carry no `/api`
 * prefix — copying one across from web verbatim gives `/api/api/…`.
 */

import { apiClient } from '../libs/api.client';

export type UsernameOfferStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'withdrawn'
  | 'completed'
  | 'expired';

export interface UsernameOffer {
  id: string;
  username: string;
  ownerAddress: string;
  buyerAddress: string;
  /** The offer. Fixed for its lifetime, like an asking price. */
  priceUsd: number;
  /** What settling it would cost in tokens right now. */
  priceDhb: number;
  /** What it was worth when it was made. */
  offeredDhb: number;
  message: string | null;
  status: UsernameOfferStatus;
  /** Set once accepted: the reserved listing to buy through. */
  listingId: string | null;
  replacementUsername: string | null;
  expiresAt: string;
  respondedAt: string | null;
  createdAt: string | null;
  counterparty: {
    address: string;
    username: string | null;
    displayName: string | null;
    avatarUrl: string | null;
    badgeBalance: number;
  } | null;
}

export interface MyUsernameOffers {
  /** Bids for the handle I am wearing. */
  incoming: UsernameOffer[];
  /** Bids I have made for other people's. */
  outgoing: UsernameOffer[];
}

interface Envelope<T> {
  status: boolean;
  result: T;
}

export const usernameOffersService = {
  async mine(): Promise<MyUsernameOffers> {
    const res = await apiClient.fetch<Envelope<MyUsernameOffers>>('/username_market/offers');
    return res.result;
  },

  /** Live bids for one handle. Public, and without the private notes. */
  async forUsername(username: string): Promise<{ username: string; offers: UsernameOffer[] }> {
    const res = await apiClient.fetch<Envelope<{ username: string; offers: UsernameOffer[] }>>(
      `/username_market/offers/${encodeURIComponent(username)}`,
      { isAuthRequired: false },
    );
    return res.result;
  },

  /**
   * Offer for a handle, or raise an offer already made.
   *
   * Offering again for the same handle updates the existing bid rather than
   * opening a second one, so this is both "make" and "raise".
   */
  async create(input: {
    username: string;
    priceUsd: number;
    message?: string;
  }): Promise<UsernameOffer> {
    const res = await apiClient.fetch<Envelope<UsernameOffer>>('/username_market/offers', {
      method: 'POST',
      body: input,
    });
    return res.result;
  },

  /**
   * Say yes.
   *
   * `replacementUsername` is where the owner lands when it sells, validated
   * now rather than at the moment of payment — the same rule listing a handle
   * follows, for the same reason.
   */
  async accept(offerId: string, input: { replacementUsername: string }): Promise<UsernameOffer> {
    const res = await apiClient.fetch<Envelope<UsernameOffer>>(
      `/username_market/offers/${offerId}/accept`,
      { method: 'POST', body: input },
    );
    return res.result;
  },

  /** Say no — or take back a yes, any time before the buyer pays. */
  async decline(offerId: string): Promise<UsernameOffer> {
    const res = await apiClient.fetch<Envelope<UsernameOffer>>(
      `/username_market/offers/${offerId}/decline`,
      { method: 'POST' },
    );
    return res.result;
  },

  /** Pull an offer back. Allowed after acceptance too. */
  async withdraw(offerId: string): Promise<UsernameOffer> {
    const res = await apiClient.fetch<Envelope<UsernameOffer>>(
      `/username_market/offers/${offerId}`,
      { method: 'DELETE' },
    );
    return res.result;
  },
};

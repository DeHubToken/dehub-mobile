/**
 * Username marketplace — buying and selling handles for DHB
 * =========================================================
 * A profile lives at `dehub.io/:username` and there is exactly one of each, so
 * a good handle is the only genuinely scarce thing on DeHub. This is the rail
 * for trading them.
 *
 * Two things about the buy path that are not obvious from the endpoint names:
 *
 * **The client never prices anything and never writes a sale.** `quote()`
 * returns the asking price and the seller's address, the wallet sends DHB
 * straight to the seller, and `claim()` hands the server a hash it verifies
 * against Base or BSC itself. Everything on screen before that is display.
 *
 * **`claim` is safe to repeat, and has to be.** The payment is already on chain
 * by the time it runs, so giving up on a dropped response would strand a real
 * transfer. It answers `pending: true` while the receipt is still catching up —
 * retry, do not restart.
 *
 * Mirrors web's `src/lib/api/dehub/username-market.ts`, but note the paths
 * differ by an `/api` prefix. `env.API_URL` already ends in `/api`, so
 * endpoints here are written without it, the way every other service in this
 * app writes them. Copying a path across from web verbatim gives `/api/api/…`,
 * which 404s on every call.
 */

import { apiClient } from '../libs/api.client';

export interface UsernameMarketConfig {
  minPriceDhb: number;
  maxPriceDhb: number;
  maxDescriptionLength: number;
  usernameMaxLength: number;
  /** USD per DHB. Display only — every price here is denominated in DHB. */
  dhbUsdPeg: number;
  chains: { chainId: number; tokenAddress: string }[];
}

export interface UsernameListing {
  id: string;
  username: string;
  priceDhb: number;
  priceUsd: number;
  description: string | null;
  length: number;
  isNumeric: boolean;
  seller: {
    address: string;
    displayName: string | null;
    avatarUrl: string | null;
    badgeBalance: number;
  };
  createdAt: string | null;
}

/** What the exact searched-for handle actually is. */
export type HandleState = 'available' | 'listed' | 'taken' | 'reserved';

export interface BrowseUsernamesResult {
  listings: UsernameListing[];
  total: number;
  page: number;
  limit: number;
  exact: { username: string; state: HandleState } | null;
}

export interface MyUsernameListing {
  id: string;
  username: string;
  priceDhb: number;
  priceUsd: number;
  replacementUsername: string;
  description: string | null;
  status: 'active' | 'sold' | 'cancelled';
  cancelReason: string | null;
  soldForDhb: number | null;
  soldAt: string | null;
  createdAt: string | null;
  /** False once the seller has renamed away from what they listed. */
  live: boolean;
}

export interface UsernameSale {
  id: string;
  username: string;
  priceDhb: number;
  paidDhb: number;
  priceUsd: number;
  sellerAddress: string;
  buyerAddress: string;
  txHash: string;
  chainId: number;
  status: 'completed' | 'failed';
  failureReason: string | null;
  createdAt: string | null;
}

export interface MyUsernameMarket {
  currentUsername: string | null;
  listings: MyUsernameListing[];
  sold: UsernameSale[];
  bought: UsernameSale[];
}

export interface UsernameQuote {
  listingId: string;
  username: string;
  priceDhb: number;
  priceUsd: number;
  sellerAddress: string;
  /** What the buyer is giving up. Worth showing before they commit. */
  currentUsername: string | null;
  chains: { chainId: number; tokenAddress: string }[];
}

export type ClaimResult =
  | { pending: true; username: string }
  | {
      pending: false;
      username: string;
      previousUsername: string | null;
      paidDhb: number;
      txHash: string;
    };

/** Every endpoint answers `{ status, result }`; this unwraps it. */
interface Envelope<T> {
  status: boolean;
  result: T;
}

export type UsernameSort = 'newest' | 'price_asc' | 'price_desc' | 'shortest';

export const usernameMarketService = {
  async config(): Promise<UsernameMarketConfig> {
    const res = await apiClient.fetch<Envelope<UsernameMarketConfig>>(
      '/username_market/config',
      { isAuthRequired: false },
    );
    return res.result;
  },

  async browse(params: {
    search?: string;
    sort?: UsernameSort;
    minPriceDhb?: number;
    maxPriceDhb?: number;
    page?: number;
    limit?: number;
  }): Promise<BrowseUsernamesResult> {
    const res = await apiClient.fetch<Envelope<BrowseUsernamesResult>>(
      '/username_market/listings',
      {
        isAuthRequired: false,
        params: {
          search: params.search || undefined,
          sort: params.sort,
          minPriceDhb: params.minPriceDhb,
          maxPriceDhb: params.maxPriceDhb,
          page: params.page,
          limit: params.limit,
        },
      },
    );
    return res.result;
  },

  async mine(): Promise<MyUsernameMarket> {
    const res = await apiClient.fetch<Envelope<MyUsernameMarket>>('/username_market/mine');
    return res.result;
  },

  /**
   * List the handle this account is currently wearing.
   *
   * There is no `username` field on purpose: you can only sell what you hold,
   * so the server reads it off the account. `replacementUsername` is where you
   * land when it sells, and it is validated now rather than at the moment of
   * sale — being told your new name is invalid while somebody is paying you is
   * not a recoverable position.
   */
  async createListing(input: {
    priceDhb: number;
    replacementUsername: string;
    description?: string;
  }): Promise<{ id: string; username: string; priceDhb: number; replacementUsername: string }> {
    const res = await apiClient.fetch<
      Envelope<{ id: string; username: string; priceDhb: number; replacementUsername: string }>
    >('/username_market/listings', { method: 'POST', body: input });
    return res.result;
  },

  async cancelListing(listingId: string): Promise<void> {
    await apiClient.fetch<Envelope<unknown>>(`/username_market/listings/${listingId}`, {
      method: 'DELETE',
    });
  },

  async quote(listingId: string): Promise<UsernameQuote> {
    const res = await apiClient.fetch<Envelope<UsernameQuote>>('/username_market/quote', {
      method: 'POST',
      body: { listingId },
    });
    return res.result;
  },

  async claim(input: {
    listingId: string;
    txHash: string;
    chainId: number;
  }): Promise<ClaimResult> {
    const res = await apiClient.fetch<Envelope<ClaimResult>>('/username_market/claim', {
      method: 'POST',
      body: input,
    });
    return res.result;
  },
};

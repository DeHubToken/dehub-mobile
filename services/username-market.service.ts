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
  minPriceUsd: number;
  maxPriceUsd: number;
  minPriceDhb: number;
  maxPriceDhb: number;
  maxDescriptionLength: number;
  usernameMaxLength: number;
  /** Current USD per token. Listing dollar prices stay fixed. */
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

/**
 * One username this account owns, whether or not it is wearing it.
 *
 * Ownership stopped being the same thing as `account.username` when buying a
 * handle started keeping the one you had. `active` is the handle the profile
 * actually answers on; the rest are held, and every one of them can be resold.
 */
export interface UsernameHolding {
  username: string;
  length: number;
  isNumeric: boolean;
  active: boolean;
  /**
   * `purchase` — bought here. `retained` — what you were wearing when you
   * bought another one. `original` — the free name you have never paid for;
   * rename away from it and it goes back in the pool. There is at most one, and
   * it is always the active handle.
   */
  acquiredVia: 'purchase' | 'retained' | 'original';
  paidDhb: number | null;
  acquiredAt: string | null;
  /** Filled when this name is already on the market. */
  listing: { id: string; priceUsd: number; priceDhb: number } | null;
}

export interface MyUsernameListing {
  id: string;
  username: string;
  priceDhb: number;
  priceUsd: number;
  /** Null on a vault listing — the seller is not moving anywhere. */
  replacementUsername: string | null;
  /** True when the seller is selling a held name rather than the one they wear. */
  fromVault: boolean;
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
  /** Everything this account owns, active handle first. */
  held: UsernameHolding[];
  listings: MyUsernameListing[];
  sold: UsernameSale[];
  bought: UsernameSale[];
}

export interface UsernameQuote {
  quoteId: string;
  expiresAt: string;
  listingId: string;
  username: string;
  priceDhb: number;
  priceUsd: number;
  sellerAddress: string;
  /**
   * The handle the buyer is wearing now. Not what they are giving up — they
   * keep it, as a held name — but worth showing, because the purchase moves
   * their profile onto the name they are buying.
   */
  currentUsername: string | null;
  chains: { chainId: number; tokenAddress: string }[];
}

export type ClaimResult =
  | { pending: true; username: string }
  | {
      pending: false;
      username: string;
      previousUsername: string | null;
      /**
       * The handle they were wearing, now held rather than gone. Same string as
       * `previousUsername` — separate so the client can say "you keep @bob"
       * without having to know the retention rule.
       */
      retainedUsername: string | null;
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
    minPriceUsd?: number;
    maxPriceUsd?: number;
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
          minPriceUsd: params.minPriceUsd,
          maxPriceUsd: params.maxPriceUsd,
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

  /** Every username this account owns, active handle first. */
  async holdings(): Promise<UsernameHolding[]> {
    const res = await apiClient.fetch<Envelope<{ held: UsernameHolding[] }>>(
      '/username_market/holdings',
    );
    return res.result.held || [];
  },

  /**
   * Wear one of the names this account owns.
   *
   * Free and reversible — the vault is the same size afterwards. The name being
   * left is kept if it was bought and released if it was the free signup
   * handle, which the server decides and reports as `releasedUsername`.
   */
  async activateHolding(
    username: string,
  ): Promise<{ username: string; previousUsername: string | null; releasedUsername: string | null }> {
    const res = await apiClient.fetch<
      Envelope<{ username: string; previousUsername: string | null; releasedUsername: string | null }>
    >('/username_market/holdings/activate', { method: 'POST', body: { username } });
    return res.result;
  },

  /** Give a held name back to the pool. Irreversible, and never the active one. */
  async releaseHolding(username: string): Promise<void> {
    await apiClient.fetch<Envelope<unknown>>(
      `/username_market/holdings/${encodeURIComponent(username)}`,
      { method: 'DELETE' },
    );
  },

  /**
   * List a username this account owns.
   *
   * `username` defaults to the handle being worn, which is the only thing this
   * could sell before the vault existed. Naming a held name instead is the
   * resale path, and it needs no `replacementUsername`: the seller is not
   * living in it, so a sale never touches their profile. Selling the worn
   * handle still does, and the replacement is validated now rather than at the
   * moment of sale — being told your new name is invalid while somebody is
   * paying you is not a recoverable position.
   */
  async createListing(input: {
    username?: string;
    priceUsd: number;
    replacementUsername?: string;
    description?: string;
  }): Promise<{
    id: string;
    username: string;
    priceUsd: number;
    priceDhb: number;
    replacementUsername: string | null;
    fromVault: boolean;
  }> {
    const res = await apiClient.fetch<
      Envelope<{ id: string; username: string; priceUsd: number; priceDhb: number; replacementUsername: string | null; fromVault: boolean }>
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
    quoteId: string;
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

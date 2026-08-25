/**
 * Account marketplace — buying and selling whole accounts for DHB
 * ===============================================================
 * The bigger sibling of the username market: what trades here is the account
 * itself — handle, posts, followers, tips history, badge entitlements — not
 * just the name on it. Same payment discipline: the server quotes, the wallet
 * pays the seller directly, and `claim()` hands over a hash the server reads
 * back off Base or BSC itself.
 *
 * Two things make this market different from handles:
 *
 * **Delivery goes to a vacant wallet that has signed in once.** The account is
 * an address re-key server-side, so it has to land somewhere — a fresh wallet
 * the buyer controls, proven by one prior sign-in (a typo'd address has never
 * signed in, so it can never take delivery). `quote.selfReceivable` says the
 * paying wallet itself qualifies; otherwise `checkReceive` vets a named
 * address BEFORE any DHB moves.
 *
 * **A 409 from `claim` means "retry to resume", never "lost".** The transfer
 * spans dozens of collections and is a resumable state machine server-side;
 * re-claiming the same tx drives it to completion. That is the opposite of
 * the username market, where a 409 is final.
 *
 * Mirrors web's `src/lib/api/dehub/account-market.ts`, but the paths differ by
 * an `/api` prefix: `env.API_URL` already ends in `/api`, so endpoints here
 * are written without it. Copying a path across from web verbatim gives
 * `/api/api/…`, which 404s on every call.
 */

import { apiClient } from '../libs/api.client';

export interface AccountMarketConfig {
  minPriceDhb: number;
  maxPriceDhb: number;
  maxDescriptionLength: number;
  /** USD per DHB. Display only — every price here is denominated in DHB. */
  dhbUsdPeg: number;
  chains: { chainId: number; tokenAddress: string }[];
}

export interface AccountListing {
  id: string;
  username: string;
  priceDhb: number;
  priceUsd: number;
  description: string | null;
  seller: {
    address: string;
    displayName: string | null;
    avatarUrl: string | null;
    badgeBalance: number;
    followers: number;
    uploads: number;
    /** When the account was created — age is part of what is being sold. */
    accountCreatedAt: string | null;
  };
  createdAt: string | null;
}

export interface BrowseAccountsResult {
  listings: AccountListing[];
  total: number;
  page: number;
  limit: number;
}

export interface MyAccountListing {
  id: string;
  username: string;
  priceDhb: number;
  priceUsd: number;
  description: string | null;
  status: 'active' | 'sold' | 'cancelled';
  cancelReason: string | null;
  soldForDhb: number | null;
  soldAt: string | null;
  createdAt: string | null;
}

export interface AccountSale {
  id: string;
  username: string;
  priceDhb: number;
  paidDhb: number;
  priceUsd: number;
  sellerAddress: string;
  buyerAddress: string;
  receiveAddress: string;
  txHash: string;
  chainId: number;
  /** `transferring`/`failed` sales are resumable — retry the claim. */
  status: 'transferring' | 'completed' | 'failed';
  failureReason: string | null;
  createdAt: string | null;
}

export interface MyAccountMarket {
  listings: MyAccountListing[];
  sold: AccountSale[];
  bought: AccountSale[];
}

export interface AccountQuote {
  listingId: string;
  username: string;
  priceDhb: number;
  priceUsd: number;
  sellerAddress: string;
  /** Can the wallet that is paying also take delivery? */
  selfReceivable: boolean;
  chains: { chainId: number; tokenAddress: string }[];
}

export interface ReceiveCheck {
  receiveAddress: string;
  ok: boolean;
  /** Written for the buyer — show it verbatim. */
  problem: string | null;
}

export type AccountClaimResult =
  | { pending: true; username: string }
  | {
      pending: false;
      username: string;
      receiveAddress: string;
      paidDhb: number;
      txHash: string;
    };

/** Every endpoint answers `{ status, result }`; this unwraps it. */
interface Envelope<T> {
  status: boolean;
  result: T;
}

export type AccountSort = 'newest' | 'price_asc' | 'price_desc' | 'followers' | 'uploads';

export const accountMarketService = {
  async config(): Promise<AccountMarketConfig> {
    const res = await apiClient.fetch<Envelope<AccountMarketConfig>>(
      '/account_market/config',
      { isAuthRequired: false },
    );
    return res.result;
  },

  async browse(params: {
    search?: string;
    sort?: AccountSort;
    minPriceDhb?: number;
    maxPriceDhb?: number;
    page?: number;
    limit?: number;
  }): Promise<BrowseAccountsResult> {
    const res = await apiClient.fetch<Envelope<BrowseAccountsResult>>(
      '/account_market/listings',
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

  async mine(): Promise<MyAccountMarket> {
    const res = await apiClient.fetch<Envelope<MyAccountMarket>>('/account_market/mine');
    return res.result;
  },

  /**
   * Put the account you are signed in as on the market.
   *
   * There is no field naming the account on purpose: you can only sell what
   * you are, so the server reads it off the token. Unlike a handle listing
   * there is no replacement to choose — after the sale this wallet signs in
   * to a brand-new, blank account.
   */
  async createListing(input: {
    priceDhb: number;
    description?: string;
  }): Promise<{ id: string; username: string; priceDhb: number }> {
    const res = await apiClient.fetch<
      Envelope<{ id: string; username: string; priceDhb: number }>
    >('/account_market/listings', { method: 'POST', body: input });
    return res.result;
  },

  async updateListing(
    listingId: string,
    input: { priceDhb?: number; description?: string },
  ): Promise<{ id: string; priceDhb: number }> {
    const res = await apiClient.fetch<Envelope<{ id: string; priceDhb: number }>>(
      `/account_market/listings/${listingId}`,
      { method: 'PATCH', body: input },
    );
    return res.result;
  },

  async cancelListing(listingId: string): Promise<void> {
    await apiClient.fetch<Envelope<unknown>>(`/account_market/listings/${listingId}`, {
      method: 'DELETE',
    });
  },

  async quote(listingId: string): Promise<AccountQuote> {
    const res = await apiClient.fetch<Envelope<AccountQuote>>('/account_market/quote', {
      method: 'POST',
      body: { listingId },
    });
    return res.result;
  },

  /**
   * Would this wallet be accepted as the delivery address? Runs exactly the
   * checks `claim` will run, before any money moves — paying first and asking
   * questions later is the one ordering the buy sheet must never allow.
   */
  async checkReceive(input: {
    listingId: string;
    receiveAddress: string;
  }): Promise<ReceiveCheck> {
    const res = await apiClient.fetch<Envelope<ReceiveCheck>>('/account_market/check_receive', {
      method: 'POST',
      body: input,
    });
    return res.result;
  },

  async claim(input: {
    listingId: string;
    txHash: string;
    chainId: number;
    /** Omitted only when the paying wallet is itself vacant (`selfReceivable`). */
    receiveAddress?: string;
  }): Promise<AccountClaimResult> {
    const res = await apiClient.fetch<Envelope<AccountClaimResult>>('/account_market/claim', {
      method: 'POST',
      body: input,
    });
    return res.result;
  },
};

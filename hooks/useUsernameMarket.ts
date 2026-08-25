/**
 * Username marketplace data layer
 * ===============================
 * Native port of web's `use-username-market.ts`, against the same
 * `/username_market/*` endpoints on the DeHub API — not Supabase. Handles live
 * in the accounts collection, so the marketplace lives with them.
 *
 * The buy path is the part with rules, and all three exist because the money
 * moves before the handle does:
 *
 * - **Nothing is priced here.** The server quotes the asking price and names
 *   the seller; the wallet sends exactly that, to exactly them. The USD figure
 *   beside it is decoration. Note this is the opposite of `useStores`, which
 *   still derives DHB from `useTokenPrices` in the browser.
 * - **The transfer must come from the account you are signed in as.** On Base
 *   and BNB that is the Safe, and `writeContractAA` sends from it — which is
 *   why the server matches the ERC-20 `Transfer` event's `from` rather than
 *   `tx.from`, the bundler. Any other chain signs as the owner EOA, a
 *   different backend account, so those chains are not offered.
 * - **The claim is retried, never abandoned.** Once the transfer is broadcast
 *   the buyer has paid, so a dropped response or a receipt the node has not
 *   caught up with cannot end the flow. The endpoint is idempotent precisely
 *   so this loop is safe.
 */

import { useCallback, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ethers } from 'ethers';
import { useAuthActions, useUser } from '../context/AuthContext';
import { useERC20Contract, useWeb3Provider } from './use-web3';
import { writeContractAA } from '../libs/aa.write';
import { toastError, toastSuccess } from '../libs/toast';
import { createLogger } from '../libs/logger';
import { ChainId, DHB_ADDRESSESS } from '../config/constants';
import {
  usernameMarketService,
  type BrowseUsernamesResult,
  type UsernameQuote,
  type UsernameSort,
} from '../services/username-market.service';

const log = createLogger('useUsernameMarket');

/**
 * Chains a handle may be paid for on here.
 *
 * The server accepts Base and BNB. Both are also the only chains where
 * `AA_CHAIN_CONFIGS` gives the account a Safe — on anything else the same
 * wallet acts as its owner EOA, which is a different backend account, so the
 * payment would come from an address the server does not know as the buyer.
 */
export const PAYABLE_CHAIN_IDS: number[] = [ChainId.BASE_MAINNET, ChainId.BSC_MAINNET];

export const USERNAME_SORTS: { value: UsernameSort; labelKey: string }[] = [
  { value: 'newest', labelKey: 'newest' },
  { value: 'price_asc', labelKey: 'priceAsc' },
  { value: 'price_desc', labelKey: 'priceDesc' },
  { value: 'shortest', labelKey: 'shortest' },
];

/** How long the claim loop keeps asking before it hands the buyer the hash. */
const CLAIM_ATTEMPTS = 12;
const CLAIM_INTERVAL_MS = 3000;

export interface BrowseParams {
  search?: string;
  sort?: UsernameSort;
  minPriceDhb?: number;
  maxPriceDhb?: number;
}

/** Price floor, DHB contracts and the peg — read once, cached for the session. */
export function useUsernameMarketConfig() {
  return useQuery({
    queryKey: ['username-market-config'],
    queryFn: () => usernameMarketService.config(),
    staleTime: 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  });
}

export function useBrowseUsernames(params: BrowseParams) {
  return useQuery<BrowseUsernamesResult>({
    queryKey: [
      'username-market-browse',
      params.search || '',
      params.sort || 'newest',
      params.minPriceDhb ?? null,
      params.maxPriceDhb ?? null,
    ],
    queryFn: () => usernameMarketService.browse({ ...params, limit: 48 }),
    // Typing in the search box keeps the current grid on screen rather than
    // flashing an empty state between keystrokes.
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
  });
}

export function useMyUsernameMarket(enabled: boolean) {
  return useQuery({
    queryKey: ['username-market-mine'],
    queryFn: () => usernameMarketService.mine(),
    enabled,
    staleTime: 30 * 1000,
  });
}

export function useCreateUsernameListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: usernameMarketService.createListing,
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['username-market-mine'] });
      qc.invalidateQueries({ queryKey: ['username-market-browse'] });
      toastSuccess(`@${result.username} is on the market`);
    },
    onError: (err) => toastError(err, 'Could not create that listing'),
  });
}

export function useCancelUsernameListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: usernameMarketService.cancelListing,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['username-market-mine'] });
      qc.invalidateQueries({ queryKey: ['username-market-browse'] });
      toastSuccess('Listing withdrawn');
    },
    onError: (err) => toastError(err, 'Could not withdraw that listing'),
  });
}

export type BuyStage = 'idle' | 'quoting' | 'paying' | 'confirming';

/**
 * quote → pay → claim, for one listing.
 *
 * Exposed as a stage rather than a boolean because the three steps fail in
 * very different ways and the buyer needs to know which one they are in: a
 * failure while quoting has cost them nothing, and a failure while confirming
 * has already cost them the handle's price.
 */
export function useBuyUsername() {
  const qc = useQueryClient();
  const user = useUser() as any;
  const { refreshUser } = useAuthActions();
  const { chainId } = useWeb3Provider();
  const [stage, setStage] = useState<BuyStage>('idle');

  // The chain the wallet is actually on. Switching is a full re-auth on this
  // app, so the buyer pays on the chain they are already signed in for rather
  // than being bounced through sign-in mid-purchase.
  const activeChainId = Number(chainId) || ChainId.BASE_MAINNET;
  const canPayHere = PAYABLE_CHAIN_IDS.includes(activeChainId);
  const tokenAddress = DHB_ADDRESSESS[activeChainId];
  const tokenContract = useERC20Contract(canPayHere ? tokenAddress : undefined);

  const getQuote = useMutation<UsernameQuote, Error, string>({
    mutationFn: async (listingId) => {
      setStage('quoting');
      try {
        return await usernameMarketService.quote(listingId);
      } finally {
        setStage('idle');
      }
    },
  });

  const buy = useMutation({
    mutationFn: async (quote: UsernameQuote) => {
      if (!canPayHere) {
        throw new Error('Switch to Base or BNB Chain in Settings to buy a handle.');
      }
      if (!tokenContract) throw new Error('Your wallet is not ready yet — try again in a moment.');
      if (!quote.chains.some((c) => c.chainId === activeChainId)) {
        throw new Error('DHB cannot be sent on this network.');
      }

      const amountWei = ethers.utils.parseUnits(String(quote.priceDhb), 18);

      // Fail before signing if the balance cannot cover it, the same preflight
      // the transfer sheet runs — an opaque on-chain revert is a bad payment UX.
      try {
        const signerAddr = await tokenContract.signer?.getAddress?.();
        const bal = await tokenContract.balanceOf(signerAddr);
        if (bal && bal.lt(amountWei)) {
          throw new Error(`You need ${quote.priceDhb.toLocaleString('en-US')} DHB to buy this handle.`);
        }
      } catch (err: any) {
        // Only a real shortfall stops the flow; an unreadable balance is advisory.
        if (String(err?.message || '').startsWith('You need')) throw err;
      }

      setStage('paying');
      const res = await writeContractAA(
        tokenContract,
        'transfer',
        [quote.sellerAddress, amountWei],
        { context: 'username-purchase' },
      );

      let txHash: string = res?.hash ?? '';
      if (!txHash) {
        try {
          const receipt = await res?.wait?.(1);
          txHash = receipt?.transactionHash ?? '';
        } catch {
          // Fall through — with no hash there is nothing to claim against.
        }
      }
      if (!txHash) throw new Error('The payment was not submitted.');

      // Past this line the buyer has paid. Giving up would strand a real
      // transfer with no handle behind it, so the loop runs to the end and then
      // hands them the hash rather than swallowing it.
      setStage('confirming');
      for (let attempt = 0; attempt < CLAIM_ATTEMPTS; attempt++) {
        try {
          const result = await usernameMarketService.claim({
            listingId: quote.listingId,
            txHash,
            chainId: activeChainId,
          });
          if (!result.pending) return result;
        } catch (err: any) {
          // A refusal from the server is final — underpaid, wrong chain, sold
          // to somebody else. Only a missing receipt is worth waiting on.
          log.warn('claim attempt failed', err?.message);
          throw new Error(`${err?.message || 'Could not confirm the payment'} (transaction ${txHash})`);
        }
        await new Promise((resolve) => setTimeout(resolve, CLAIM_INTERVAL_MS));
      }

      throw new Error(
        `Your payment went through but the handle is still confirming. Reopen this listing in a minute to finish claiming it (transaction ${txHash}).`,
      );
    },
    onSuccess: async (result) => {
      setStage('idle');
      if (result.pending) return;

      toastSuccess(`You are now @${result.username}`);

      // The signed-in user's own handle just changed. Everything that renders
      // it off a cache has to be told, or the profile tab and every rendered
      // @mention of yourself keep showing a name this account no longer owns.
      await refreshUser().catch(() => {});
      qc.invalidateQueries({ queryKey: ['username-market-browse'] });
      qc.invalidateQueries({ queryKey: ['username-market-mine'] });
      qc.invalidateQueries({ queryKey: ['account'] });
      qc.invalidateQueries({ queryKey: ['profile'] });
    },
    onError: (err) => {
      setStage('idle');
      toastError(err, 'Could not complete that purchase');
    },
  });

  const reset = useCallback(() => setStage('idle'), []);

  return {
    getQuote,
    buy,
    stage,
    reset,
    activeChainId,
    canPayHere,
    myAddress: String(user?.walletAddress || user?.address || '').toLowerCase(),
  };
}

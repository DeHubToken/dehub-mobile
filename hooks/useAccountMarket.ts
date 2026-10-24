import { useTranslation as _useCopy } from 'react-i18next';
import { translateCopy as _translateCopy } from '../i18n/copy';
/**
 * Account marketplace data layer
 * ==============================
 * Native port of web's `use-account-market.ts`, against the same
 * `/account_market/*` endpoints on the DeHub API — not Supabase. Accounts ARE
 * rows in Mongo's accounts collection, so the marketplace lives with them.
 *
 * The buy path is the part with rules, and all of them exist because the money
 * moves before the account does:
 *
 * - **Nothing is priced here.** The server quotes the asking price and names
 *   the seller; the wallet sends exactly that, to exactly them. The USD figure
 *   beside it is decoration.
 * - **The transfer must come from the account you are signed in as.** On Base
 *   and BNB that is the Safe, and `writeContractAA` sends from it — which is
 *   why the server matches the ERC-20 `Transfer` event's `from` rather than
 *   `tx.from`, the bundler. Any other chain signs as the owner EOA, a
 *   different backend account, so those chains are not offered.
 * - **Delivery goes to a vacant wallet, validated first.** `check_receive`
 *   vets the address BEFORE any DHB leaves.
 * - **The claim is retried, never abandoned — including through a 409.** Once
 *   the transfer is broadcast the buyer has paid. `pending: true` means the
 *   receipt is still catching up; a 409 means the payment landed but the
 *   account transfer was interrupted, and retrying the claim RESUMES it
 *   server-side. Both keep the loop going. Only any other refusal is final.
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
  accountMarketService,
  type AccountClaimResult,
  type AccountQuote,
  type AccountSort,
  type BrowseAccountsResult,
} from '../services/account-market.service';

const log = createLogger('useAccountMarket');

/**
 * Chains an account may be paid for on here.
 *
 * The server accepts Base and BNB. Both are also the only chains where
 * `AA_CHAIN_CONFIGS` gives the account a Safe — on anything else the same
 * wallet acts as its owner EOA, which is a different backend account, so the
 * payment would come from an address the server does not know as the buyer.
 */
export const PAYABLE_CHAIN_IDS: number[] = [ChainId.BASE_MAINNET, ChainId.BSC_MAINNET];

export const ACCOUNT_SORTS: { value: AccountSort; labelKey: string }[] = [
  { value: 'newest', labelKey: 'newest' },
  { value: 'price_asc', labelKey: 'priceAsc' },
  { value: 'price_desc', labelKey: 'priceDesc' },
  { value: 'followers', labelKey: 'followers' },
  { value: 'uploads', labelKey: 'uploads' },
];

/** How long the claim loop keeps asking before it hands the buyer the hash. */
const CLAIM_ATTEMPTS = 12;
const CLAIM_INTERVAL_MS = 3000;
/** Extra attempts granted when the server says "interrupted, retry to resume". */
const CLAIM_RESUME_ATTEMPTS = 5;

export interface BrowseParams {
  search?: string;
  sort?: AccountSort;
  minPriceDhb?: number;
  maxPriceDhb?: number;
}

/** Price limits, DHB contracts and the peg — read once, cached for the session. */
export function useAccountMarketConfig() {
  return useQuery({
    queryKey: ['account-market-config'],
    queryFn: () => accountMarketService.config(),
    staleTime: 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  });
}

export function useBrowseAccounts(params: BrowseParams) {
  return useQuery<BrowseAccountsResult>({
    queryKey: [
      'account-market-browse',
      params.search || '',
      params.sort || 'newest',
      params.minPriceDhb ?? null,
      params.maxPriceDhb ?? null,
    ],
    queryFn: () => accountMarketService.browse({ ...params, limit: 48 }),
    // Typing in the search box keeps the current list on screen rather than
    // flashing an empty state between keystrokes.
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
  });
}

export function useMyAccountMarket(enabled: boolean) {
  return useQuery({
    queryKey: ['account-market-mine'],
    queryFn: () => accountMarketService.mine(),
    enabled,
    staleTime: 30 * 1000,
  });
}

export function useCreateAccountListing() {
  const { t: _copy } = _useCopy();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: accountMarketService.createListing,
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['account-market-mine'] });
      qc.invalidateQueries({ queryKey: ['account-market-browse'] });
      toastSuccess(_copy("copy.134ed133424c", { defaultValue: "@{{value1}} is on the market", value1: result.username }));
    },
    onError: (err) => toastError(err, _copy("copy.c7d6eda2cce9", { defaultValue: "Could not create that listing" })),
  });
}

export function useCancelAccountListing() {
  const { t: _copy } = _useCopy();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: accountMarketService.cancelListing,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['account-market-mine'] });
      qc.invalidateQueries({ queryKey: ['account-market-browse'] });
      toastSuccess(_copy("copy.fecd0f90ada2", { defaultValue: "Listing withdrawn" }));
    },
    onError: (err) => toastError(err, _copy("copy.9a0d8a96317a", { defaultValue: "Could not withdraw that listing" })),
  });
}

/** Debounce-friendly validation of a delivery wallet. */
export function useCheckReceiveAddress() {
  return useMutation({ mutationFn: accountMarketService.checkReceive });
}

/**
 * The shared claim loop. `pending: true` and a 409 both mean "ask again";
 * anything else thrown is final. Returns the completed claim or throws with
 * the transaction hash in the message so the buyer never loses it.
 */
async function runClaimLoop(input: {
  listingId: string;
  txHash: string;
  chainId: number;
  receiveAddress?: string;
}): Promise<Extract<AccountClaimResult, { pending: false }>> {
  let lastError = _translateCopy("copy.50c1bea5bfee", { defaultValue: "Could not confirm the payment" });
  let resumeBudget = CLAIM_RESUME_ATTEMPTS;

  for (let attempt = 0; attempt < CLAIM_ATTEMPTS + CLAIM_RESUME_ATTEMPTS; attempt++) {
    try {
      const result = await accountMarketService.claim(input);
      if (result.pending === false) return result;
      lastError = _translateCopy("copy.b59f0a649761", { defaultValue: "The payment is still confirming on-chain" });
    } catch (err: any) {
      // 409: the payment landed but the account transfer was interrupted.
      // Retrying the claim resumes the transfer server-side, so this is a
      // reason to continue, not to stop. The api client attaches the HTTP
      // status as `err.status`.
      if (err?.status === 409 && resumeBudget > 0) {
        resumeBudget--;
        lastError = _translateCopy("copy.a664800e5f5a", { defaultValue: "The transfer was interrupted and is being resumed" });
        log.warn('claim hit 409, retrying to resume', err?.message);
      } else {
        // Any other refusal is final — underpaid, wrong chain, sold to
        // somebody else, or a 409 that would not clear.
        log.warn('claim attempt failed', err?.message);
        throw new Error(_translateCopy("copy.7df7a5aaeb96", { defaultValue: "{{value1}} (transaction {{value2}})", value1: err?.message || lastError, value2: input.txHash }));
      }
    }
    await new Promise((resolve) => setTimeout(resolve, CLAIM_INTERVAL_MS));
  }

  throw new Error(
    _translateCopy("copy.662d445e61e0", { defaultValue: "{{value1}}. Your payment went through — reopen this listing in a minute to finish claiming it (transaction {{value2}}).", value1: lastError, value2: input.txHash }),
  );
}

export type BuyStage = 'idle' | 'quoting' | 'paying' | 'confirming';

/**
 * quote → pay → claim, for one listing.
 *
 * Exposed as a stage rather than a boolean because the three steps fail in
 * very different ways and the buyer needs to know which one they are in: a
 * failure while quoting has cost them nothing, and a failure while confirming
 * has already cost them the account's price.
 */
export function useBuyAccount() {
  const { t: _copy } = _useCopy();
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

  const getQuote = useMutation<AccountQuote, Error, string>({
    mutationFn: async (listingId) => {
      setStage('quoting');
      try {
        return await accountMarketService.quote(listingId);
      } finally {
        setStage('idle');
      }
    },
  });

  const buy = useMutation({
    mutationFn: async ({
      quote,
      receiveAddress,
    }: {
      quote: AccountQuote;
      /** Omitted only when the paying wallet is itself vacant (`selfReceivable`). */
      receiveAddress?: string;
    }) => {
      if (!canPayHere) {
        throw new Error(_copy("copy.01865a3dfdca", { defaultValue: "Switch to Base or BNB Chain in Settings to buy an account." }));
      }
      if (!tokenContract) throw new Error(_copy("copy.652a874aec99", { defaultValue: "Your wallet is not ready yet — try again in a moment." }));
      if (!quote.chains.some((c) => c.chainId === activeChainId)) {
        throw new Error(_copy("copy.d37ad7829165", { defaultValue: "DHB cannot be sent on this network." }));
      }

      const amountWei = ethers.utils.parseUnits(String(quote.priceDhb), 18);

      // Fail before signing if the balance cannot cover it, the same preflight
      // the transfer sheet runs — an opaque on-chain revert is a bad payment UX.
      const shortfallMessage = _copy("copy.3eff4d981d60", { defaultValue: "You need {{value1}} DHB to buy this account.", value1: quote.priceDhb.toLocaleString('en-US') });
      try {
        const signerAddr = await tokenContract.signer?.getAddress?.();
        const bal = await tokenContract.balanceOf(signerAddr);
        if (bal && bal.lt(amountWei)) {
          throw new Error(shortfallMessage);
        }
      } catch (err: any) {
        // Only a real shortfall stops the flow; an unreadable balance is advisory.
        if (String(err?.message || '') === shortfallMessage) throw err;
      }

      setStage('paying');
      const res = await writeContractAA(
        tokenContract,
        'transfer',
        [quote.sellerAddress, amountWei],
        { context: 'account-purchase' },
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
      if (!txHash) throw new Error(_copy("copy.f819def8e607", { defaultValue: "The payment was not submitted." }));

      // Past this line the buyer has paid. Giving up would strand a real
      // transfer with no account behind it, so the loop runs to the end and
      // then hands them the hash rather than swallowing it.
      setStage('confirming');
      return runClaimLoop({
        listingId: quote.listingId,
        txHash,
        chainId: activeChainId,
        receiveAddress,
      });
    },
    onSuccess: async (result) => {
      setStage('idle');

      toastSuccess(_copy("copy.c98b19605efc", { defaultValue: "@{{value1}} is yours — delivered to {{value2}}", value1: result.username, value2: shortAddress(result.receiveAddress) }));

      // If delivery went to the wallet signed in here, this session's identity
      // just changed wholesale — refresh it and drop every profile-shaped
      // cache with it. Harmless when delivery went elsewhere.
      await refreshUser().catch(() => {});
      qc.invalidateQueries({ queryKey: ['account-market-browse'] });
      qc.invalidateQueries({ queryKey: ['account-market-mine'] });
      qc.invalidateQueries({ queryKey: ['account'] });
      qc.invalidateQueries({ queryKey: ['profile'] });
    },
    onError: (err) => {
      setStage('idle');
      toastError(err, _copy("copy.dc1d3da1f19d", { defaultValue: "Could not complete that purchase" }));
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

/**
 * Re-run the claim for a purchase whose transfer failed after payment. The
 * sale row in `mine.bought` carries everything the server needs — the stored
 * txHash, chain and receive address — so this is the "Resume transfer" button.
 */
export function useResumeAccountClaim() {
  const { t: _copy } = _useCopy();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { listingId: string; txHash: string; chainId: number; receiveAddress?: string }) =>
      runClaimLoop(input),
    onSuccess: (result) => {
      toastSuccess(_copy("copy.397a647c19dd", { defaultValue: "@{{value1}} delivered to {{value2}}", value1: result.username, value2: shortAddress(result.receiveAddress) }));
      qc.invalidateQueries({ queryKey: ['account-market-mine'] });
      qc.invalidateQueries({ queryKey: ['account-market-browse'] });
    },
    onError: (err) => toastError(err, _copy("copy.7ee9e63278f0", { defaultValue: "Could not resume that transfer" })),
  });
}

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

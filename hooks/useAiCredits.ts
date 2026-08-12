/**
 * AI credits, denominated in DHB.
 * ===============================
 * Mirror of dehubweb's `use-ai-credits.ts` + `lib/ai-payg.ts`.
 *
 * Balance and prices both come from the server. This deliberately does not
 * work out what a generation costs: the edge function that debits the balance
 * is the one that prices the job, so the number a paywall shows is the number
 * that gets charged.
 *
 * That replaces what this app was doing until now — computing a price from a
 * local table, transferring DHB to the treasury from the paywall sheet, and
 * then calling a generate function that (a) never saw the payment and (b)
 * answered 401 because no auth header was attached. The money left the wallet
 * and nothing was generated.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import * as ethersImport from 'ethers';
import { useUser } from '../context/AuthContext';
import { useWeb3Provider, useERC20Contract } from './use-web3';
import { writeContractAA } from '../libs/aa.write';
import { DHB_ADDRESSESS, ChainId } from '../config/constants';
import {
  claimAiCreditTopUp,
  getAiCreditBalance,
  quoteAiJob,
  type AiQuoteRequest,
} from '../services/ai.service';
import { createLogger } from '../libs/logger';

const log = createLogger('useAiCredits');

/**
 * The AI treasury. Same address as web's `AI_TREASURY` and the edge function's
 * `AI_TREASURY_ADDRESS` default — a transfer anywhere else cannot be claimed.
 */
export const AI_TREASURY = '0xbf3039b0bb672b268e8384e30d81b1e6a8a43b2c';

/** Chains the AI treasury's top-up verifier looks at. Anything else is unclaimable. */
export const CREDIT_CHAIN_IDS: number[] = [ChainId.BASE_MAINNET, ChainId.BSC_MAINNET];

const CHAIN_LABELS: Record<number, string> = {
  [ChainId.BASE_MAINNET]: 'Base',
  [ChainId.BSC_MAINNET]: 'BNB Chain',
};

/**
 * Alchemy indexes a transfer a beat after it is mined, so the first claim can
 * legitimately 404. Retry briefly before giving up — the alternative is telling
 * somebody who has already paid that nothing happened.
 */
const CLAIM_ATTEMPTS = 6;
const CLAIM_DELAY_MS = 2500;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Current credit balance in DHB.
 *
 * `enabled` exists because three paywall sheets sit mounted in the assistant
 * tree at once, each returning null until opened. Without it, opening the
 * screen fired three balance lookups nobody asked for.
 */
export function useAiCredits(enabled = true) {
  const user = useUser();
  const wallet = user?.walletAddress || user?.address || null;
  const [balanceDhb, setBalanceDhb] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!wallet) {
      setBalanceDhb(0);
      return 0;
    }
    setIsLoading(true);
    try {
      const res = await getAiCreditBalance(wallet);
      if (alive.current) setBalanceDhb(res.balanceDhb ?? 0);
      return res.balanceDhb ?? 0;
    } catch (err) {
      log.error('balance lookup failed:', err);
      return 0;
    } finally {
      if (alive.current) setIsLoading(false);
    }
  }, [wallet]);

  useEffect(() => {
    if (enabled) refresh();
  }, [refresh, enabled]);

  return { balanceDhb, isLoading, refresh };
}

/**
 * Server quote for a job, re-run whenever anything that moves the price
 * changes. `enabled` exists so a closed paywall does not quote.
 */
export function useJobQuote(request: AiQuoteRequest | null, enabled = true) {
  const user = useUser();
  const wallet = user?.walletAddress || user?.address || null;
  const [priceDhb, setPriceDhb] = useState(0);
  const [priceUsd, setPriceUsd] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const key = request
    ? [
        request.kind,
        request.modelId,
        request.durationSeconds ?? '',
        request.quality ?? '',
        request.quantity ?? 1,
      ].join('|')
    : '';

  useEffect(() => {
    if (!enabled || !request?.modelId) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    quoteAiJob(request, wallet)
      .then((res) => {
        if (cancelled) return;
        setPriceDhb(res.priceDhb ?? 0);
        setPriceUsd(res.priceUsd ?? 0);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Could not price this run');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // `key` collapses every price-moving field; `request` itself is a new
    // object each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, wallet]);

  return { priceDhb, priceUsd, isLoading, error };
}

export interface PaygState {
  /** DHB held on the connected chain, or 0 while unknown. */
  walletDhb: number;
  isLoading: boolean;
  /** Null when the connected chain is one the treasury verifies. */
  unsupportedChain: string | null;
  /** Pay `amountDhb` to the treasury and have it credited. Returns the new balance. */
  payAsYouGo: (amountDhb: number) => Promise<number>;
  refresh: () => void;
}

/**
 * Pay-as-you-go: a just-in-time top-up of exactly the shortfall.
 *
 * Not a second money path — the user signs one transfer, it is credited, and
 * the generation immediately debits it. So somebody with no credit still signs
 * once per job as before, but the payment is now verified on chain instead of
 * being taken on trust by a function that never checked.
 *
 * One deliberate difference from web: web picks Base or BNB by balance and
 * switches the wallet's chain. There is no chain-switch path in this app's
 * provider, so this pays on whichever of the two chains is already connected
 * and says so plainly when it is neither, rather than signing a transfer the
 * top-up verifier will never find.
 */
export function usePayAsYouGo(enabled = true): PaygState {
  const user = useUser();
  const { account, chainId } = useWeb3Provider();
  const wallet = user?.walletAddress || user?.address || null;
  const dhbAddress = chainId ? DHB_ADDRESSESS[chainId] : undefined;
  const tokenContract = useERC20Contract(dhbAddress);

  const [walletDhb, setWalletDhb] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const supported = !!chainId && CREDIT_CHAIN_IDS.includes(chainId);
  const unsupportedChain = supported
    ? null
    : `Switch to ${CHAIN_LABELS[ChainId.BASE_MAINNET]} or ${CHAIN_LABELS[ChainId.BSC_MAINNET]} to pay for this run.`;

  const refresh = useCallback(async () => {
    if (!tokenContract || !account || !supported || !enabled) {
      setWalletDhb(0);
      return;
    }
    setIsLoading(true);
    try {
      const raw = await tokenContract.balanceOf(account);
      const ethers = (ethersImport as any).ethers || ethersImport;
      setWalletDhb(Number(ethers.utils.formatUnits(raw, 18)));
    } catch (err) {
      // A flaky RPC reads as "no balance" rather than aborting the paywall.
      log.error('wallet DHB lookup failed:', err);
      setWalletDhb(0);
    } finally {
      setIsLoading(false);
    }
  }, [tokenContract, account, supported, enabled]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /**
   * Claim the transfer as credit, retrying only while the answer is "not
   * indexed yet". Anything else is terminal — retrying a rejected claim just
   * delays the error.
   */
  const claim = useCallback(
    async (txHash: string): Promise<number> => {
      let lastError = 'Could not credit the transfer.';
      for (let attempt = 0; attempt < CLAIM_ATTEMPTS; attempt++) {
        try {
          const res = await claimAiCreditTopUp(txHash, wallet);
          if (typeof res.balanceDhb === 'number') return res.balanceDhb;
          lastError = 'Could not credit the transfer.';
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          // Already credited is a success from here: the money is on the
          // balance, this is just a duplicate claim.
          if (message.includes('already credited')) return NaN;
          lastError = message || lastError;
          if (!message.includes('not found on-chain')) break;
        }
        await wait(CLAIM_DELAY_MS);
      }
      throw new Error(lastError);
    },
    [wallet],
  );

  const payAsYouGo = useCallback(
    async (amountDhb: number): Promise<number> => {
      if (!supported) throw new Error(unsupportedChain || 'Unsupported chain.');
      if (!tokenContract || !account) throw new Error('Connect your wallet to pay for a generation.');
      if (!Number.isFinite(amountDhb) || amountDhb <= 0) throw new Error('Nothing to pay.');

      // Round up: the treasury must receive at least the shortfall, and being a
      // fraction short would leave the balance one unit under the price.
      const amount = Math.ceil(amountDhb);
      const ethers = (ethersImport as any).ethers || ethersImport;
      const amountWei = ethers.utils.parseUnits(String(amount), 18);

      const tx = await writeContractAA(tokenContract, 'transfer', [AI_TREASURY, amountWei], {
        context: 'AI generation payment',
      });
      // wait() resolves with status 0 for a REVERTED transaction rather than
      // throwing, so ignoring the receipt would claim a transfer that failed.
      const receipt = await tx.wait(1);
      if (receipt && receipt.status !== undefined && receipt.status !== 1) {
        throw new Error('The DHB transfer did not go through. Nothing has been charged.');
      }
      const txHash: string | undefined = receipt?.transactionHash || receipt?.hash || tx.hash;
      if (!txHash) throw new Error('The transfer went through but its hash is unknown — contact support.');

      const balance = await claim(txHash);
      refresh();
      return balance;
    },
    [supported, unsupportedChain, tokenContract, account, claim, refresh],
  );

  return { walletDhb, isLoading, unsupportedChain, payAsYouGo, refresh };
}

/**
 * Paying for a generation, in live DHB.
 * =====================================
 * Mirror of dehubweb's `hooks/use-ai-quote.ts` + `lib/ai-payment.ts`.
 *
 * There is one way to pay: sign a DHB transfer to the treasury for what the
 * job costs, and hand the hash to the generation function, which confirms it
 * on chain before it spends anything with a provider.
 *
 * What this replaces was a credit balance that could be filled three ways — an
 * on-chain top-up, a Stripe plan grant, or a free daily allowance minted out of
 * nothing. Two of those three created spendable value with no token behind it,
 * so the balance was a second currency living alongside DHB.
 *
 * Prices still come from the server. The client deliberately does not work out
 * what a generation costs: the function that takes the money is the one that
 * quotes it, so the number a paywall shows is the number that gets charged.
 */

import { useCallback, useEffect, useState } from 'react';
import * as ethersImport from 'ethers';
import { useWeb3Provider, useERC20Contract } from './use-web3';
import { writeContractAA } from '../libs/aa.write';
import { DHB_ADDRESSESS, ChainId } from '../config/constants';
import {
  quoteAiJob,
  recordAiPayment,
  listUnspentAiPayments,
  type AiQuoteRequest,
} from '../services/ai.service';
import { createLogger } from '../libs/logger';

const log = createLogger('useAiPayment');

/**
 * The AI treasury. Same address as web's `AI_TREASURY` and the edge function's
 * `AI_TREASURY_ADDRESS` default — a transfer anywhere else cannot be verified.
 */
export const AI_TREASURY = '0xbf3039b0bb672b268e8384e30d81b1e6a8a43b2c';

/** Chains the payment verifier looks at. Anything else is unverifiable. */
export const PAYMENT_CHAIN_IDS: number[] = [ChainId.BASE_MAINNET, ChainId.BSC_MAINNET];

const CHAIN_LABELS: Record<number, string> = {
  [ChainId.BASE_MAINNET]: 'Base',
  [ChainId.BSC_MAINNET]: 'BNB Chain',
};

/**
 * Server quote for a job, re-run whenever anything that moves the price
 * changes. `enabled` exists so a closed paywall does not quote.
 */
export function useJobQuote(request: AiQuoteRequest | null, enabled = true) {
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
    quoteAiJob(request)
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
  }, [key, enabled]);

  return { priceDhb, priceUsd, isLoading, error };
}

export interface JobPaymentState {
  /** DHB held on the connected chain, or 0 while unknown. */
  walletDhb: number;
  isLoading: boolean;
  /** Null when the connected chain is one the verifier reads. */
  unsupportedChain: string | null;
  /** Pay `priceDhb` for the job about to run. Returns the transfer hash. */
  payForJob: (priceDhb: number) => Promise<string>;
  refresh: () => void;
}

/**
 * Pay for one job on chain.
 *
 * One deliberate difference from web: web picks Base or BNB by balance and
 * switches the wallet's chain. There is no chain-switch path in this app's
 * provider, so this pays on whichever of the two chains is already connected
 * and says so plainly when it is neither, rather than signing a transfer the
 * verifier will never find.
 */
export function useJobPayment(enabled = true): JobPaymentState {
  const { account, chainId } = useWeb3Provider();
  const dhbAddress = chainId ? DHB_ADDRESSESS[chainId] : undefined;
  const tokenContract = useERC20Contract(dhbAddress);

  const [walletDhb, setWalletDhb] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const supported = !!chainId && PAYMENT_CHAIN_IDS.includes(chainId);
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

  const payForJob = useCallback(
    async (priceDhb: number): Promise<string> => {
      if (!supported) throw new Error(unsupportedChain || 'Unsupported chain.');
      if (!tokenContract || !account) throw new Error('Connect your wallet to pay for a generation.');
      if (!Number.isFinite(priceDhb) || priceDhb <= 0) throw new Error('Nothing to pay.');

      // Money already sent for a job that never ran is spent before asking for
      // more. The server is the record — not this device — so a payment
      // survives the app being killed, reinstalled or opened on another phone.
      try {
        const banked = (await listUnspentAiPayments(account)).find(
          (p) => p.purpose !== 'voice' && p.remainingDhb >= priceDhb,
        );
        if (banked) return banked.txHash.toLowerCase();
      } catch (err) {
        // A ledger that cannot be read must not block a payment that can be
        // made. Worst case the user pays again and the old receipt keeps its
        // balance for next time.
        log.warn('could not read banked payments:', err);
      }

      // Round up: the treasury must receive at least the price, and being a
      // fraction short would leave the transfer one unit under it.
      const amount = Math.ceil(priceDhb);
      const ethers = (ethersImport as any).ethers || ethersImport;
      const amountWei = ethers.utils.parseUnits(String(amount), 18);

      const tx = await writeContractAA(tokenContract, 'transfer', [AI_TREASURY, amountWei], {
        context: 'AI generation payment',
      });
      // Held outside the try so a failure below can tell "nothing was signed"
      // from "a transfer is on chain and we lost sight of it".
      const submittedHash: string = String(tx?.hash || '').toLowerCase();

      let receipt: { status?: number; transactionHash?: string; hash?: string } | undefined;
      try {
        // wait() resolves with status 0 for a REVERTED transaction rather than
        // throwing, so ignoring the receipt would send a hash that paid nothing.
        receipt = await tx.wait(1);
      } catch (err) {
        // It rejects on a dropped connection as readily as on a real failure,
        // and on a phone that is the common case. The transfer is in the
        // mempool either way, so ask the server — it settles the question
        // against the chain and banks the receipt if it is real. Reporting
        // "payment failed" here is what turned mined transfers into lost money.
        log.warn('could not watch the transfer land:', err);
        if (submittedHash) {
          try {
            await recordAiPayment(submittedHash, account);
            refresh();
            return submittedHash;
          } catch (recordErr) {
            log.error('transfer could not be confirmed or recorded:', recordErr);
            throw new Error(
              'Your DHB transfer was sent but we could not confirm it. It is saved and will pay for your next attempt — do not send it again.',
            );
          }
        }
        throw err;
      }

      if (receipt && receipt.status !== undefined && receipt.status !== 1) {
        throw new Error('The DHB transfer did not go through. Nothing has been charged.');
      }
      const txHash: string = String(
        receipt?.transactionHash || receipt?.hash || submittedHash,
      ).toLowerCase();
      if (!txHash) throw new Error('The transfer went through but its hash is unknown — contact support.');

      // The receipt is the point of no return: from here the money is the
      // payer's to spend even if the generation never runs. Never fatal — the
      // generation function records it the old way if it gets there first.
      try {
        await recordAiPayment(txHash, account);
      } catch (err) {
        log.warn('could not record payment yet:', err);
      }

      refresh();
      return txHash;
    },
    [supported, unsupportedChain, tokenContract, account, refresh],
  );

  return { walletDhb, isLoading, unsupportedChain, payForJob, refresh };
}

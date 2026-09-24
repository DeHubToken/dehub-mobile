/**
 * Fraction checkout
 * =================
 * Every write in the fraction market that moves value, against the same
 * `fraction-checkout` edge function web's `use-fraction-checkout.ts` uses.
 *
 * The rules are the live-checkout ones, carried over unchanged:
 *
 * - **The client never prices anything.** The server quotes the DHB amount off
 *   the listing row and names the token contract; the wallet sends that.
 * - **The client never writes a trade.** The server reads the transfer back
 *   off the chain first, and matches the ERC-20 / ERC-1155 event's `from`
 *   against the signed-in account — which is why this works from the Safe
 *   `writeContractAA` sends through, where `tx.from` is the bundler.
 * - **A confirm is retried, never abandoned.** The transfer is on-chain by the
 *   time it runs; a "not found yet" is a reason to ask again, and if it never
 *   lands the hash goes in the error so the user has it to hand.
 *
 * A trade is a swap with two legs and no escrow, so each mutation settles
 * exactly one leg. The chain it settles on is the trade's own: signing happens
 * on the chain the wallet is signed in for (switching is a full re-auth here),
 * so a leg on the other chain is refused up front rather than sent to the
 * wrong contract.
 */

import { ethers } from "ethers";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "../services/supabase";
import { dehubAuthHeaders } from "../services/ai.service";
import { useERC20Contract, useStreamCollectionContract, useWeb3Provider } from "./use-web3";
import { writeContractAA } from "../libs/aa.write";
import { toastError, toastSuccess } from "../libs/toast";
import { createLogger } from "../libs/logger";
import { DHB_TOKEN_ADDRESSES } from "../config/web3.constants";
import { ChainId } from "../config/constants";
import {
  DEFAULT_FRACTION_CHAIN,
  invalidateFractionQueries,
  useFractionWallet,
  type FractionListing,
  type FractionOffer,
  type FractionTrade,
} from "./useFractionMarket";

const log = createLogger("useFractionCheckout");

const CONFIRM_ATTEMPTS = 10;
const CONFIRM_INTERVAL_MS = 3000;

export const FRACTION_CHAIN_NAMES: Record<number, string> = {
  [ChainId.BASE_MAINNET]: "Base",
  [ChainId.BSC_MAINNET]: "BNB Chain",
};

export interface FractionQuote {
  listingId: string;
  tokenId: string;
  chainId: number;
  quantity: number;
  available: number;
  pricePerFraction: number;
  dhbAmount: number;
  sellerAddress: string;
  /** The seller's live on-chain balance, or null if the read failed. */
  sellerBalance: number | null;
  tokenAddress: string;
  collectionAddress: string;
  settleWindowHours: number;
  /** DHB is ERC20Pausable; a transfer would revert while this is true. */
  paymentsFrozen: boolean;
}

export interface PostSnapshot {
  title?: string;
  imageUrl?: string;
  type?: string;
  creatorAddress?: string;
  creatorUsername?: string;
}

type TradeResult = { success: boolean; trade: FractionTrade };

async function callFraction<T>(body: Record<string, unknown>, wallet: string): Promise<T> {
  const headers = await dehubAuthHeaders(wallet || null);
  const { data, error } = await supabase.functions.invoke("fraction-checkout", { body, headers });
  // supabase-js only hands back a body on 2xx and buries the rest in the
  // error's context. The confirm loop keys its retry on the server's words, so
  // the transport message would turn a receipt that has not landed yet into a
  // permanent failure on top of a real payment.
  if (error) {
    let detail = "";
    try {
      const context = (error as { context?: Response }).context;
      if (context) detail = String((await context.json())?.error || "");
    } catch {
      // Body was not JSON — fall back to the transport message.
    }
    throw new Error(detail || error.message || "Request failed");
  }
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as T;
}

async function confirmWithRetry<T>(
  body: Record<string, unknown>,
  wallet: string,
  txHash: string,
  strandedMessage: string,
): Promise<T> {
  let lastError = "Could not confirm the transaction";
  for (let attempt = 0; attempt < CONFIRM_ATTEMPTS; attempt++) {
    try {
      return await callFraction<T>({ ...body, txHash }, wallet);
    } catch (err) {
      lastError = (err as Error).message;
      if (!/not found yet/i.test(lastError)) throw err;
      await new Promise((r) => setTimeout(r, CONFIRM_INTERVAL_MS));
    }
  }
  log.warn("confirm timed out", txHash);
  throw new Error(`${lastError}. ${strandedMessage}: ${txHash}`);
}

/** The hash off a write, waiting one block for it when the AA path returns none. */
async function hashOf(res: { hash?: string; wait?: (n?: number) => Promise<any> } | undefined) {
  let hash = res?.hash ?? "";
  if (!hash) {
    try {
      hash = (await res?.wait?.(1))?.transactionHash ?? "";
    } catch {
      // Fall through — with no hash there is nothing to confirm against.
    }
  }
  return hash;
}

/**
 * The signing side of the market: the active chain, and the two contracts a
 * leg can move, bound to it.
 */
function useFractionSigner() {
  const { t } = useTranslation();
  const { chainId } = useWeb3Provider();
  const activeChainId = Number(chainId) || ChainId.BASE_MAINNET;
  const dhb = useERC20Contract(DHB_TOKEN_ADDRESSES[activeChainId]);
  const collection = useStreamCollectionContract();

  /** Throw unless a leg on `tradeChain` can be signed right now. */
  const assertChain = (tradeChain: number | null | undefined) => {
    const chain = Number(tradeChain) || DEFAULT_FRACTION_CHAIN;
    if (chain !== activeChainId) {
      throw new Error(
        t("fractions.wrongChain", { chain: FRACTION_CHAIN_NAMES[chain] || `chain ${chain}` }),
      );
    }
  };

  const sendDhb = async (to: string, amount: number, tradeChain: number) => {
    assertChain(tradeChain);
    if (!dhb) throw new Error(t("fractions.walletNotReady"));
    const wei = ethers.utils.parseUnits(String(amount), 18);
    const hash = await hashOf(await writeContractAA(dhb, "transfer", [to, wei], { context: "fraction-payment" }));
    if (!hash) throw new Error(t("fractions.notSubmitted"));
    return hash;
  };

  const sendFractions = async (from: string, to: string, tokenId: string, quantity: number, tradeChain: number) => {
    assertChain(tradeChain);
    if (!collection) throw new Error(t("fractions.walletNotReady"));
    const hash = await hashOf(
      await writeContractAA(collection, "safeTransferFrom", [from, to, tokenId, quantity, "0x"], {
        context: "fraction-delivery",
      }),
    );
    if (!hash) throw new Error(t("fractions.notSubmitted"));
    return hash;
  };

  return { activeChainId, assertChain, sendDhb, sendFractions };
}

/**
 * Create a listing. Through the server rather than straight to Supabase so the
 * seller's on-chain balance is checked first — including against what is
 * already listed and already owed on an unsettled sale.
 */
export function useCreateListing() {
  const queryClient = useQueryClient();
  const wallet = useFractionWallet();
  return useMutation({
    mutationFn: (params: {
      tokenId: string;
      quantity: number;
      pricePerFraction: number;
      chainId?: number;
      post?: PostSnapshot;
    }) =>
      callFraction<{ success: boolean; listing: FractionListing; balance: number }>(
        {
          action: "list",
          tokenId: params.tokenId,
          quantity: params.quantity,
          pricePerFraction: params.pricePerFraction,
          chainId: params.chainId || DEFAULT_FRACTION_CHAIN,
          post: params.post || {},
        },
        wallet,
      ),
    onSuccess: (data) => invalidateFractionQueries(queryClient, data.listing?.token_id),
    onError: (e: Error) => toastError(e),
  });
}

/** Buy fractions from a listing: quote → pay DHB → server verifies. */
export function useFractionPurchase() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const wallet = useFractionWallet();
  const signer = useFractionSigner();

  const getQuote = useMutation({
    mutationFn: (params: { listingId: string; quantity: number }) =>
      callFraction<FractionQuote>(
        { action: "quote", listingId: params.listingId, quantity: params.quantity },
        wallet,
      ),
  });

  const buy = useMutation({
    mutationFn: async (quote: FractionQuote) => {
      if (quote.paymentsFrozen) throw new Error(t("fractions.paymentsFrozen"));
      const hash = await signer.sendDhb(quote.sellerAddress, quote.dhbAmount, quote.chainId);
      return confirmWithRetry<TradeResult>(
        { action: "confirm", listingId: quote.listingId, quantity: quote.quantity },
        wallet,
        hash,
        t("fractions.strandedPayment"),
      );
    },
    onSuccess: (data) => {
      invalidateFractionQueries(queryClient, data.trade?.token_id);
      toastSuccess(t("fractions.toastPaidAwaitingDelivery"));
    },
    onError: (e: Error) => toastError(e),
  });

  return { getQuote, buy, activeChainId: signer.activeChainId };
}

/**
 * Settle the leg you owe. Both directions are the same shape — move what you
 * owe on-chain, then have the server read it back — and differ only in which
 * asset moves.
 */
export function useSettleTrade() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const wallet = useFractionWallet();
  const signer = useFractionSigner();

  /** Seller side: send the fractions a buyer has already paid for. */
  const deliver = useMutation({
    mutationFn: async (trade: FractionTrade) => {
      if (!wallet) throw new Error(t("fractions.signInFirst"));
      const hash = await signer.sendFractions(wallet, trade.buyer_address, trade.token_id, trade.quantity, trade.chain_id);
      return confirmWithRetry<TradeResult>(
        { action: "deliver", tradeId: trade.id },
        wallet,
        hash,
        t("fractions.strandedDelivery"),
      );
    },
    onSuccess: (data) => {
      invalidateFractionQueries(queryClient, data.trade?.token_id);
      toastSuccess(t("fractions.toastDelivered"));
    },
    onError: (e: Error) => toastError(e),
  });

  /** Buyer side: pay for fractions a seller has already delivered. */
  const pay = useMutation({
    mutationFn: async (trade: FractionTrade) => {
      const hash = await signer.sendDhb(
        trade.seller_address,
        trade.quantity * trade.price_per_fraction,
        trade.chain_id,
      );
      return confirmWithRetry<TradeResult>(
        { action: "pay-trade", tradeId: trade.id },
        wallet,
        hash,
        t("fractions.strandedPayment"),
      );
    },
    onSuccess: (data) => {
      invalidateFractionQueries(queryClient, data.trade?.token_id);
      toastSuccess(t("fractions.toastPaidSettled"));
    },
    onError: (e: Error) => toastError(e),
  });

  return { deliver, pay };
}

/**
 * Respond to an offer. An offer is an unfunded bid, so accepting means the
 * seller moves first; the transfer is verified before the offer is marked
 * accepted, which is what makes the buyer's payment obligation real.
 */
export function useOfferResponse() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const wallet = useFractionWallet();
  const signer = useFractionSigner();

  const accept = useMutation({
    mutationFn: async (offer: FractionOffer) => {
      if (!wallet) throw new Error(t("fractions.signInFirst"));
      const hash = await signer.sendFractions(wallet, offer.buyer_address, offer.token_id, offer.quantity, offer.chain_id);
      return confirmWithRetry<TradeResult>(
        { action: "accept-offer", offerId: offer.id },
        wallet,
        hash,
        t("fractions.strandedDelivery"),
      );
    },
    onSuccess: (data) => {
      invalidateFractionQueries(queryClient, data.trade?.token_id);
      toastSuccess(t("fractions.toastOfferAccepted"));
    },
    onError: (e: Error) => toastError(e),
  });

  const reject = useMutation({
    mutationFn: (params: { offerId: string; tokenId: string }) =>
      callFraction<{ success: boolean }>({ action: "reject-offer", offerId: params.offerId }, wallet).then(
        () => params,
      ),
    onSuccess: (params) => {
      invalidateFractionQueries(queryClient, params.tokenId);
      toastSuccess(t("fractions.offerRejected"));
    },
    onError: (e: Error) => toastError(e),
  });

  return { accept, reject };
}

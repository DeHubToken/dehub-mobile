/**
 * Solana payments (#41) — PPV unlock + tips paid in SOL / SPL tokens.
 *
 * Mirrors the mint flow: the backend builds an unsigned transfer transaction,
 * the client signs it with the wallet-derived Solana keypair and broadcasts,
 * then the backend verifies the transfer on-chain and records the unlock/tip.
 */
import { Connection, Transaction } from "@solana/web3.js";
import { Buffer } from "buffer";
import { getSolanaKeypair, getSolanaAddress } from "./solana.service";
import { getSolanaRpcUrl, SOLANA_MAINNET_CHAIN_ID } from "../config/solana.constants";
import { apiClient } from "../libs/api.client";
import { translateCopy as _translateCopy } from '../i18n/copy';

export type SolanaPaymentKind = "ppv" | "tip";

interface BuildPaymentResponse {
  transaction: string;
  recipient: string;
  mintAddress: string;
  amount: number;
  decimals: number;
  chainId: number;
}

export interface SolanaPaymentResult {
  signature: string;
  recipient: string;
  mintAddress: string;
  amount: number;
}

/**
 * Pay a creator on Solana for a PPV unlock or a tip.
 * For `ppv` the amount/mint are resolved by the backend from the post; for
 * `tip` pass `amount` (and optionally `mint`, defaults to native SOL).
 */
export async function sendSolanaPayment(params: {
  tokenId: number | string;
  kind: SolanaPaymentKind;
  amount?: number;
  mint?: string;
  recipient?: string;
  chainId?: number;
}): Promise<SolanaPaymentResult> {
  const chainId = params.chainId ?? SOLANA_MAINNET_CHAIN_ID;

  const payerWallet = await getSolanaAddress();
  if (!payerWallet) {
    throw new Error(
      _translateCopy("copy.ceae840b1f84", { defaultValue: "Solana wallet unavailable — this device does not hold your wallet key. Sign in again to restore it." }),
    );
  }

  // 1. Backend builds the unsigned transfer transaction.
  const build = await apiClient.post<BuildPaymentResponse>(
    "/solana/build-payment",
    {
      tokenId: Number(params.tokenId),
      kind: params.kind,
      payerWallet,
      amount: params.amount,
      mint: params.mint,
      recipient: params.recipient,
      chainId,
    },
    { isAuthRequired: true },
  );

  if (!build?.transaction) {
    throw new Error(_translateCopy("copy.92d19a8fe155", { defaultValue: "Could not prepare the Solana payment. Please try again." }));
  }

  // 2. Sign as payer + broadcast.
  const keypair = await getSolanaKeypair();
  const connection = new Connection(getSolanaRpcUrl(chainId), "confirmed");

  let tx: Transaction;
  try {
    tx = Transaction.from(Buffer.from(build.transaction, "base64"));
  } catch {
    throw new Error(_translateCopy("copy.209d989eb7bf", { defaultValue: "Invalid payment transaction from server. Please try again." }));
  }

  try {
    tx.partialSign(keypair);
  } catch (err) {
    throw new Error(
      err instanceof Error ? err.message : _translateCopy("copy.b397b6d54c82", { defaultValue: "Failed to sign Solana transaction" }),
    );
  }

  let signature: string;
  try {
    signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });
  } catch (err) {
    const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
    if (msg.includes("insufficient") || msg.includes("0x1")) {
      throw new Error(_translateCopy("copy.f2e9e8168f00", { defaultValue: "Insufficient balance (token or SOL for fees)." }));
    }
    if (msg.includes("blockhash") || msg.includes("expired") || msg.includes("timeout")) {
      throw new Error(_translateCopy("copy.3e9abebf2d88", { defaultValue: "Solana transaction expired. Please try again." }));
    }
    throw new Error(_translateCopy("copy.d3b5f68b4641", { defaultValue: "Solana payment failed: {{value1}}", value1: err instanceof Error ? err.message : msg }));
  }

  try {
    await connection.confirmTransaction(signature, "confirmed");
  } catch (err) {
    console.warn("[Solana] payment confirmation polling failed:", err);
  }

  // 3. Backend verifies + records the unlock / tip.
  try {
    await apiClient.post(
      "/solana/confirm-payment",
      {
        tokenId: Number(params.tokenId),
        kind: params.kind,
        txSignature: signature,
        payerWallet,
        recipient: build.recipient,
        mintAddress: build.mintAddress,
        amount: build.amount,
        decimals: build.decimals,
        chainId,
      },
      { isAuthRequired: true },
    );
  } catch (err) {
    // Payment landed on-chain; server sync can be retried/backfilled.
    console.warn("[Solana] confirm-payment failed (tx already sent):", err);
  }

  return {
    signature,
    recipient: build.recipient,
    mintAddress: build.mintAddress,
    amount: build.amount,
  };
}

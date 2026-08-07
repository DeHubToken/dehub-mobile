/**
 * Solana minting (#41) — derives the user's Solana keypair from the local
 * Solana keypair provisioned alongside their EVM wallet at sign-in, signs the
 * backend's partially-signed mint transaction as fee payer, broadcasts it, and
 * confirms with the backend.
 *
 * Only Supabase-identity (Google/email) sign-ins get a Solana keypair —
 * imported (pasted private key) wallets have none and will get a clear error,
 * same as before.
 */
import { Connection, Keypair, SendTransactionError, Transaction } from "@solana/web3.js";
import { Buffer } from "buffer";
import { getAuthUser, getStoredSupabaseUserId } from "../libs/auth.utils";
import { getLocalSolanaSecretKeyHex, getOrCreateSolanaKeypairForAddress } from "../libs/identity-wallet";
import { getSolanaRpcUrl, SOLANA_MAINNET_CHAIN_ID } from "../config/solana.constants";
import { apiClient } from "../libs/api.client";

export interface SolanaMintStatus {
  chainsConfigured: number[];
  mintingEnabled: boolean;
  message: string;
}

/** GET /solana/status — whether the backend can mint on Solana right now. */
export async function getSolanaMintStatus(): Promise<SolanaMintStatus> {
  const res = await apiClient.get<SolanaMintStatus | { result: SolanaMintStatus }>(
    "/solana/status",
    { isAuthRequired: false },
  );
  const raw = (res as any)?.result ?? res;
  return raw as SolanaMintStatus;
}

let cachedKeypair: Keypair | null = null;

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return out;
}

/** Derive (and cache) the Solana keypair provisioned for the signed-in wallet. */
export async function getSolanaKeypair(): Promise<Keypair> {
  if (cachedKeypair) return cachedKeypair;
  const user = await getAuthUser<any>();
  const address: string | undefined = user?.walletAddress || user?.address;
  let hex = address ? await getLocalSolanaSecretKeyHex(address) : null;

  // Sign-in flows provision this keypair, but a session restored from a
  // persisted login never re-runs them — that left every account signed in
  // before this backfill existed stuck with no keypair. Create it lazily here
  // for any Supabase-identity (social/email) wallet.
  if (!hex && address && (await getStoredSupabaseUserId())) {
    const provisioned = await getOrCreateSolanaKeypairForAddress(address).catch(() => null);
    hex = provisioned?.secretKeyHex ?? null;
  }

  if (!hex) {
    throw new Error(
      "Solana wallet unavailable. Sign in with a social account to post on Solana.",
    );
  }
  const bytes = hexToBytes(hex);
  let kp: Keypair;
  if (bytes.length === 64) {
    kp = Keypair.fromSecretKey(bytes);
  } else if (bytes.length === 32) {
    kp = Keypair.fromSeed(bytes);
  } else {
    throw new Error(`Unexpected Solana key length: ${bytes.length}`);
  }
  cachedKeypair = kp;
  return kp;
}

/** Base58 Solana address for the current user, or null if unavailable. */
export async function getSolanaAddress(): Promise<string | null> {
  try {
    const kp = await getSolanaKeypair();
    return kp.publicKey.toBase58();
  } catch {
    return null;
  }
}

/** Clear cached keypair (call on logout / chain account change). */
export function clearSolanaKeypairCache(): void {
  cachedKeypair = null;
}

/** POST /solana/confirm-mint — persist the on-chain mint to the backend. */
export async function confirmSolanaMint(params: {
  tokenId: number;
  mintAddress: string;
  txSignature: string;
}): Promise<{ success: boolean; tokenId: number; mintAddress: string }> {
  return apiClient.post(
    "/solana/confirm-mint",
    {
      tokenId: Number(params.tokenId),
      mintAddress: params.mintAddress,
      txSignature: params.txSignature,
    },
    { isAuthRequired: true },
  );
}

export interface SolanaMintParams {
  transactionBase64: string;
  mintAddress: string;
  tokenId: number | string;
  chainId?: number;
}

export interface SolanaMintResult {
  signature: string;
  /** Set when the tx landed on-chain but POST /solana/confirm-mint failed. */
  confirmWarning?: string;
}

/**
 * Sign (fee payer) + broadcast a partially-signed Solana mint transaction,
 * then notify the backend.
 */
export async function broadcastSolanaMint(
  params: SolanaMintParams,
): Promise<SolanaMintResult> {
  const chainId = params.chainId ?? SOLANA_MAINNET_CHAIN_ID;
  const keypair = await getSolanaKeypair();
  const connection = new Connection(getSolanaRpcUrl(chainId), "confirmed");

  let tx: Transaction;
  try {
    const raw = Buffer.from(params.transactionBase64, "base64");
    tx = Transaction.from(raw);
  } catch {
    throw new Error("Invalid mint transaction from server. Please try again.");
  }

  // Fee-payer signature — keeps the backend's mint-authority signature intact.
  try {
    tx.partialSign(keypair);
  } catch (err) {
    throw new Error(
      err instanceof Error ? err.message : "Failed to sign Solana transaction",
    );
  }

  let signature: string;
  try {
    signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });
  } catch (err) {
    // web3.js's own error text just says "call getLogs() for full details" —
    // without actually calling it, every simulation failure surfaces as the
    // same useless "Transaction simulation failed" message.
    if (err instanceof SendTransactionError) {
      const logs = await err.getLogs(connection).catch(() => null);
      console.error("[Solana] sendRawTransaction simulation failed", {
        message: err.message,
        logs,
      });
    }

    const msg = err instanceof Error ? err.message : String(err);
    const lower = msg.toLowerCase();
    if (lower.includes("insufficient")) {
      throw new Error("Insufficient SOL for transaction fees. Add SOL to your wallet.");
    }
    if (lower.includes("blockhash") || lower.includes("expired") || lower.includes("timeout")) {
      throw new Error("Solana transaction expired. Please try posting again.");
    }
    throw new Error(`Solana broadcast failed: ${msg}`);
  }

  try {
    await connection.confirmTransaction(signature, "confirmed");
  } catch (err) {
    console.warn("[Solana] Confirmation polling failed, tx may still land:", err);
  }

  try {
    await confirmSolanaMint({
      tokenId: Number(params.tokenId),
      mintAddress: params.mintAddress,
      txSignature: signature,
    });
  } catch (err) {
    console.error("[Solana] confirm-mint API failed:", err);
    return {
      signature,
      confirmWarning:
        "Posted on-chain but server sync is delayed. Your post may take a few minutes to appear.",
    };
  }

  return { signature };
}

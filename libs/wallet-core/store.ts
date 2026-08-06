// Supabase persistence for the DeHub self-custody wallet — mobile counterpart
// of dehubweb's src/lib/wallet-core/store.ts. Reads/writes the SAME
// `user_wallets` table (RLS-scoped to the caller's own row), so a wallet
// created on the web unlocks on the phone and vice versa: this is what lets
// mobile recover the user's REAL wallet instead of minting a new one when no
// local copy of the private key exists on this device.
//
// The seed is encrypted CLIENT-SIDE (see crypto.ts) before it ever leaves the
// device — this module only ever moves ciphertext.
import { supabase } from "../../services/supabase";
import type { EncryptedPayload } from "./crypto";
import { getPayloadKdf } from "./crypto";

export interface StoredWallet {
  ethAddress: string;
  /** Null when the web client omitted seed columns (passkey/biometric-only wallet). */
  payload: EncryptedPayload | null;
}

// user_wallets is not in the generated Supabase types — cast through the untyped client.
function db() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return supabase as any;
}

function pickString(row: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const v = row[key];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}

/** Map a Supabase user_wallets row into StoredWallet (tolerates omitted seed columns). */
export function parseWalletRow(row: Record<string, unknown> | null | undefined): StoredWallet | null {
  if (!row) return null;
  const ethAddress = pickString(row, "eth_address", "ethAddress", "address");
  if (!ethAddress) return null;

  const ciphertext = pickString(
    row,
    "encrypted_seed",
    "encryptedSeed",
    "password_encrypted_seed",
    "password_backup_encrypted_seed"
  );
  if (!ciphertext) {
    return { ethAddress, payload: null };
  }

  const salt = pickString(row, "salt") ?? "";
  const iv = pickString(row, "iv") ?? "";
  const iterationsRaw = row.kdf_iterations ?? row.kdfIterations ?? row.iterations;
  const iterations =
    typeof iterationsRaw === "number" && Number.isFinite(iterationsRaw) ? iterationsRaw : 0;

  return {
    ethAddress,
    payload: { ciphertext, salt, iv, iterations },
  };
}

/** Fetch the caller's wallet row (RLS-scoped). Returns null if none exists. */
export async function fetchWallet(userId: string): Promise<StoredWallet | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  const sessionUid = sessionData?.session?.user?.id;
  if (!sessionUid) {
    throw new Error("Supabase session not ready — cannot load cloud wallet");
  }
  if (sessionUid !== userId) {
    // eslint-disable-next-line no-console
    console.warn("[fetchWallet] session user id mismatch", {
      expected: `${userId.slice(0, 8)}...`,
      session: `${sessionUid.slice(0, 8)}...`,
    });
  }

  const { data, error } = await db()
    .from("user_wallets")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    // eslint-disable-next-line no-console
    console.error("[fetchWallet] Supabase error:", error.message, { userId: `${userId.slice(0, 8)}...` });
    throw new Error(error.message || "Failed to load wallet");
  }
  const wallet = parseWalletRow(data as Record<string, unknown> | null);
  if (wallet && !wallet.payload) {
    // eslint-disable-next-line no-console
    console.error("[fetchWallet] row has address but no encrypted_seed — web passkey/biometric wallet", {
      userId: `${userId.slice(0, 8)}...`,
      address: `${wallet.ethAddress.slice(0, 6)}...${wallet.ethAddress.slice(-4)}`,
      columns: data ? Object.keys(data as object) : [],
    });
  } else if (wallet?.payload) {
    // eslint-disable-next-line no-console
    console.error("[fetchWallet] row ok", {
      address: `${wallet.ethAddress.slice(0, 6)}...${wallet.ethAddress.slice(-4)}`,
      kdf: getPayloadKdf(wallet.payload),
    });
  }
  return wallet;
}

export type FetchWalletResult = {
  wallet: StoredWallet | null;
  /** True when every attempt threw (network/RLS/transient) — distinct from a confirmed empty row. */
  failed: boolean;
};

/**
 * Retry fetchWallet after Google OAuth — Supabase session/RLS can lag briefly
 * and a single null read made mobile think there was no user_wallets row,
 * fall through to /web/auth/supabase, and adopt the polluted web3AuthMeta link.
 */
export async function fetchWalletReliably(
  userId: string,
  opts: { attempts?: number; delayMs?: number } = {}
): Promise<FetchWalletResult> {
  const attempts = opts.attempts ?? 5;
  const delayMs = opts.delayMs ?? 200;
  for (let i = 0; i < attempts; i++) {
    try {
      const wallet = await fetchWallet(userId);
      return { wallet, failed: false };
    } catch {
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
  return { wallet: null, failed: true };
}

/**
 * Persist a freshly created wallet's password-encrypted seed. Mobile always
 * writes a password payload (no biometric/passkey wrap path here), so unlike
 * the web version this never needs to omit the seed columns.
 */
export async function saveWallet(
  userId: string,
  ethAddress: string,
  payload: EncryptedPayload,
): Promise<void> {
  const { error } = await db().from("user_wallets").upsert({
    user_id: userId,
    eth_address: ethAddress,
    encrypted_seed: payload.ciphertext,
    salt: payload.salt,
    iv: payload.iv,
    kdf_iterations: payload.iterations,
  });
  if (error) throw new Error(error.message || "Failed to save wallet");
}

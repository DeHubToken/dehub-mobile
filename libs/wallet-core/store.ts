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

export interface StoredWallet {
  ethAddress: string;
  /** Null for a wallet with no password backup (e.g. biometric-only, created on web). */
  payload: EncryptedPayload | null;
}

// user_wallets is not in the generated Supabase types — cast through the untyped client.
function db() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return supabase as any;
}

/** Fetch the caller's wallet row (RLS-scoped). Returns null if none exists. */
export async function fetchWallet(userId: string): Promise<StoredWallet | null> {
  const { data, error } = await db()
    .from("user_wallets")
    .select("eth_address, encrypted_seed, salt, iv, kdf_iterations")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message || "Failed to load wallet");
  if (!data) return null;
  return {
    ethAddress: data.eth_address,
    payload: data.encrypted_seed
      ? {
          ciphertext: data.encrypted_seed,
          salt: data.salt,
          iv: data.iv,
          iterations: data.kdf_iterations,
        }
      : null,
  };
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

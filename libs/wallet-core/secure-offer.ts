// "Secure your wallet" is asked at the first wallet action, not at sign-up.
//
// A brand-new account gets its wallet made silently during sign-up (the
// backend only creates an account from a wallet signature), kept on this
// device under its device key. This marker remembers that the person has not
// yet chosen how to secure it (Face ID / device, or a password). The locked
// provider shim asks WalletUnlockHost to show that choice before the first
// signature, and the marker is cleared once it has been made. Backing up the
// recovery phrase is the Wallet tab's reminder afterwards, not part of this.
//
// Per Supabase identity, so a second account on the same phone neither
// inherits nor clears someone else's offer. Never throws: a failed read only
// means the offer is not made.
import * as SecureStore from "expo-secure-store";
import { createLogger } from "../logger";

const log = createLogger("wallet-core/secure-offer");

const KEY = "wallet_secure_offer_v1";

async function readMap(): Promise<Record<string, string>> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeMap(map: Record<string, string>): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(map), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function markWalletSecureOffer(supabaseUserId: string, address: string): Promise<void> {
  try {
    const map = await readMap();
    map[supabaseUserId] = address.toLowerCase();
    await writeMap(map);
  } catch (e) {
    log.warn("mark:failed", e);
  }
}

/** The wallet address still waiting for its offer, or null. */
export async function readWalletSecureOffer(supabaseUserId: string): Promise<string | null> {
  const value = (await readMap())[supabaseUserId];
  return typeof value === "string" && value ? value : null;
}

export async function clearWalletSecureOffer(supabaseUserId: string): Promise<void> {
  try {
    const map = await readMap();
    if (!(supabaseUserId in map)) return;
    delete map[supabaseUserId];
    await writeMap(map);
  } catch (e) {
    log.warn("clear:failed", e);
  }
}

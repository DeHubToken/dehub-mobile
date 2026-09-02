/**
 * Bring the signed-in user's DM encryption identity online.
 *
 * First time on a device: one wallet signature (the locked-wallet shim raises
 * the biometric sheet itself) derives the keypair, which is stored in the
 * keychain and published. Every later time it loads silently. A declined or
 * failed prompt is remembered for the session so opening the next chat does
 * not ask again; `retryDmEncryption` clears that.
 */
import { hasIdentityFor, loadIdentity, setupIdentity, syncPublishedKey } from "./keys";

export type DmEncryptionStatus = "ready" | "locked" | "error";

const declined = new Set<string>();

export async function ensureDmEncryption(address: string): Promise<DmEncryptionStatus> {
  const addr = (address || "").toLowerCase();
  if (!addr) return "error";
  if (hasIdentityFor(addr) || (await loadIdentity(addr))) {
    syncPublishedKey().catch(() => {});
    return "ready";
  }
  if (declined.has(addr)) return "locked";
  try {
    await setupIdentity(addr);
    return "ready";
  } catch (e: any) {
    declined.add(addr);
    return e?.name === "WalletLockedError" || e?.name === "BiometricRejectedError" ? "locked" : "error";
  }
}

export function retryDmEncryption(address: string): Promise<DmEncryptionStatus> {
  declined.delete((address || "").toLowerCase());
  return ensureDmEncryption(address);
}

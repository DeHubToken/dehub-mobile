/**
 * Bring the signed-in user's DM encryption identity online.
 *
 * First time on a device: one wallet signature (the locked-wallet shim raises
 * the unlock sheet itself) derives the keypair, which is stored in the keychain
 * and published. Every later time it loads silently.
 *
 * Only a REFUSAL is remembered for the session. This used to write down every
 * failure, and the one it hit most was "no signing provider": that registry is
 * filled during an interactive sign-in and cleared again in the same breath,
 * so on any returning session the first chat open failed, was recorded as
 * declined, and the phone spent the rest of the session unable to open an
 * encrypted line or send one — silently, because the only report was a log
 * line. A missing provider is a state that changes on its own; it is retried.
 */
import { hasIdentityFor, loadIdentity, setupIdentity, syncPublishedKey } from "./keys";
import { createLogger } from "../logger";

export type DmEncryptionStatus = "ready" | "locked" | "error";

const declined = new Set<string>();
const listeners = new Set<(status: DmEncryptionStatus) => void>();
const log = createLogger("dm-e2ee/setup");

function shortAddress(address: string): string {
  return address.length > 12
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : address;
}

/** Subscribe to the setup outcome. Returns unsubscribe. */
export function onDmEncryptionStatus(cb: (status: DmEncryptionStatus) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function report(status: DmEncryptionStatus): DmEncryptionStatus {
  listeners.forEach((l) => {
    try { l(status); } catch { /* a listener must not break setup */ }
  });
  return status;
}

/**
 * @param provider the session's live provider (AuthContext). Without it a
 *                 returning session has nothing to sign with, because the
 *                 module registry is empty outside a sign-in.
 */
export async function ensureDmEncryption(address: string, provider?: any): Promise<DmEncryptionStatus> {
  const addr = (address || "").toLowerCase();
  if (!addr) return report("error");
  if (hasIdentityFor(addr) || (await loadIdentity(addr))) {
    syncPublishedKey().catch(() => {});
    return report("ready");
  }
  if (declined.has(addr)) return report("locked");
  try {
    await setupIdentity(addr, provider);
    return report("ready");
  } catch (e: any) {
    const name = e?.name;
    // A refused unlock is a decision — stop asking until the user comes back
    // to it. Anything else (no provider yet, a failed publish, a dead socket)
    // is a condition, and conditions are retried on the next chat open.
    const refused = name === "WalletLockedError" || name === "BiometricRejectedError" || e?.code === 4001;
    if (refused) {
      declined.add(addr);
      log.info("ensure:declined", { address: shortAddress(addr), name, code: e?.code });
    } else {
      const error = e instanceof Error ? e : new Error(String(e?.message || e || "Unknown encryption setup error"));
      // This is deliberately an error-level row: mobile error logs are shipped
      // only from logger.error, and this catch previously converted every real
      // setup failure into a generic banner with no record to investigate.
      log.error(error, {
        event: "ensure:failed",
        address: shortAddress(addr),
        name: name || "Error",
        code: e?.code,
      });
    }
    return report(refused ? "locked" : "error");
  }
}

export function retryDmEncryption(address: string, provider?: any): Promise<DmEncryptionStatus> {
  declined.delete((address || "").toLowerCase());
  return ensureDmEncryption(address, provider);
}

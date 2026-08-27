/**
 * The provider a signed-in-but-locked session gets.
 *
 * When this device holds no private key for the signed-in account,
 * LocalProviderAdapter used to return null. Every consumer read that as a
 * broken session, and the app compensated by refusing to sign in at all until
 * the wallet could be opened — which is why a wallet whose wrap key lives on
 * some other handset locked the whole account out of the app.
 *
 * This shim is the alternative. It answers everything that does not need the
 * key — `eth_accounts`, `eth_chainId`, and every plain JSON-RPC read — from
 * the session and the public RPC, so feeds, balances, profiles and health
 * checks behave exactly as they do for an unlocked session. The moment a
 * method that genuinely needs the key is called, it raises the unlock sheet,
 * and on success hands the call to the real provider the unlock made
 * buildable. From then on it is a straight pass-through.
 *
 * The point of doing it HERE rather than at each call site: every signing
 * surface in the app — post, tip, mint, stake, bridge, export key — already
 * goes through an EIP-1193 provider. None of them needs to learn about locking.
 */
import { ethersService } from "../ethers.service";
import { defaultChainId } from "../../config/constants";
import { requestWalletUnlock, WalletLockedError } from "../../libs/wallet-lock";
import { createLogger } from "../../libs/logger";

const log = createLogger("LockedProviderShim");

export type Eip1193Shim = {
  request: (args: { method: string; params?: any[] }) => Promise<any>;
  on?: (event: string, listener: (...args: any[]) => void) => void;
  removeListener?: (event: string, listener: (...args: any[]) => void) => void;
  chainConfig?: { chainId?: string | number };
};

/**
 * Methods that cannot be answered without the private key.
 *
 * `eth_estimateGas` is deliberately NOT here: it is a read the public RPC can
 * serve, and it runs on screens that only preview a cost. Asking for a
 * fingerprint to show someone what a tip would cost is the exact behaviour
 * this change exists to remove.
 *
 * `private_key` is this app's own escape hatch (see localProviderAdapter) and
 * is the most sensitive of the lot — Settings' export flow rides on it.
 */
const SIGNING_METHODS = new Set([
  "eth_sign",
  "personal_sign",
  "eth_signTypedData",
  "eth_signTypedData_v3",
  "eth_signTypedData_v4",
  "eth_sendTransaction",
  "eth_signTransaction",
  "private_key",
]);

export function isSigningMethod(method: string): boolean {
  return SIGNING_METHODS.has(method);
}

function toHexChainId(id: number): string {
  return "0x" + id.toString(16);
}

/**
 * @param address  the address this session is signed in as — the Safe smart
 *                 account for most accounts, which is what the backend
 *                 registered and what every read should report. It is stored
 *                 in the clear, so a locked session can still name itself.
 * @param chainId  the chain the session resolved to.
 * @param rebuild  re-runs provider construction now that a key exists. Returns
 *                 null if the key still is not there, which is treated as a
 *                 refused unlock rather than an infinite retry.
 */
export function createLockedEip1193(
  address: string,
  chainId: number,
  rebuild: () => Promise<Eip1193Shim | null>,
): Eip1193Shim {
  const targetChainId = chainId || defaultChainId;
  // Set once the wallet has been opened for this session. From that point the
  // shim is transparent, so the unlock is asked for once, not per signature.
  let real: Eip1193Shim | null = null;
  // Coalesces the unlock+rebuild for calls that arrive together (a gas
  // estimate and a send fired back to back, say). wallet-lock already
  // coalesces the SHEET; this stops two winners both rebuilding the provider.
  let unlocking: Promise<Eip1193Shim | null> | null = null;

  async function unlockAndBuild(reason: string): Promise<Eip1193Shim | null> {
    if (real) return real;
    if (unlocking) return unlocking;
    const run = (async () => {
      // Try the device first. Most signed-in users DO have the key here — they
      // created or unlocked the wallet on this phone — and for them the right
      // prompt is the OS device-owner check that releasing the key already
      // raises, nothing more. Opening the unlock sheet first would put a
      // password box in front of someone who never needed one.
      //
      // A declined fingerprint propagates out of here rather than falling
      // through to the sheet: "no" to signing means no, not "try a password".
      let built = await rebuild();
      if (!built) {
        // Nothing on this device. Now the sheet is the only way forward.
        const ok = await requestWalletUnlock(reason);
        if (!ok) return null;
        built = await rebuild();
      }
      if (built) {
        real = built;
        log.info("unlocked:provider-rebuilt", {
          address: `${address.slice(0, 6)}...${address.slice(-4)}`,
        });
      } else {
        // The sheet said it succeeded but no key landed. Reporting this as a
        // refusal is safer than looping: whatever went wrong will not fix
        // itself by asking again immediately.
        log.warn("unlocked:rebuild-returned-null");
      }
      return built;
    })();
    unlocking = run;
    try {
      return await run;
    } finally {
      if (unlocking === run) unlocking = null;
    }
  }

  const shim: Eip1193Shim = {
    request: async ({ method, params }: { method: string; params?: any[] }) => {
      if (real) return real.request({ method, params });

      if (!SIGNING_METHODS.has(method)) {
        switch (method) {
          case "eth_accounts":
          case "eth_requestAccounts":
            return [address];
          case "eth_chainId":
            return toHexChainId(targetChainId);
          default: {
            const provider = ethersService.getProvider(targetChainId) as any;
            return await provider.send(method, params || []);
          }
        }
      }

      const built = await unlockAndBuild(method);
      if (!built) throw new WalletLockedError();
      return built.request({ method, params });
    },
    on: () => {
      /* no-op, same as the local signer shim */
    },
    removeListener: () => {
      /* no-op */
    },
    chainConfig: { chainId: targetChainId },
  };

  return shim;
}

// Reown AppKit (WalletConnect) setup for the "Connect Wallet" sign-in option —
// lets a user authenticate with an EXTERNAL wallet app (MetaMask, Trust
// Wallet, Coinbase Wallet, Rainbow, ...) instead of DeHub provisioning one.
//
// Created lazily. createAppKit starts WalletConnect core (key storage, a relay
// socket) and <AppKit /> prefetches the wallet listing, all of which used to
// run on every cold start for a sign-in option most people never tap. It now
// runs the first time Connect Wallet is opened (ensureAppKit), or at boot when
// a WalletConnect pairing is already persisted (restoreAppKitSession), so a
// returning Connect Wallet user still gets their wallet back as the signer.
//
// Side-effect imports for walletconnect & ethers shims are already loaded once in index.ts.
// Avoid duplicating them here to prevent multiple relayer/event listener registrations.
import { useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createAppKit,
  defaultConfig,
} from "@reown/appkit-ethers5-react-native";
import env from "./env";
import { appScheme, supportedNetworks } from "./web3.constants";
import { createLogger } from "../libs/logger";

const log = createLogger("reown.config");

export const projectId = env.REOWN_PROJECT_ID;

/**
 * Whether the "Connect Wallet" option is usable in this build.
 *
 * This module is imported from index.ts, which runs before
 * registerRootComponent — so anything it throws happens before React exists, let
 * alone the ErrorBoundary. A missing REOWN_PROJECT_ID (or a malformed
 * supportedNetworks) used to take the whole app down to a white screen with no
 * message, on a build where every other sign-in method would have worked fine.
 *
 * Connect Wallet is one of five sign-in options. Losing it is a degraded build;
 * losing boot is a dead one. Callers gate on this instead. Defined below, once
 * the chain list has been validated.
 */
if (!projectId) {
  log.error(
    "REOWN_PROJECT_ID is missing — Connect Wallet will be unavailable in this build",
  );
}

export const metadata = {
  name: "Dehub.io",
  description: "Dehub.io Mobile",
  url: "https://dehub.io",
  icons: ["https://avatars.githubusercontent.com/u/179229932"],
  redirect: {
    native: `${appScheme}://`,
    universal: "https://dehub.io",
  },
};

// The web app's 4-wallet list (src/lib/wagmi.ts's RainbowKit connectors) is
// MetaMask, Phantom, Trust, Rabby — but Phantom is deliberately excluded
// here. On web, RainbowKit connects to Phantom via its INJECTED browser
// extension (window.phantom.ethereum), bypassing WalletConnect entirely —
// see wagmi.ts's lazyPhantomWallet(). Phantom's own WalletConnect Explorer
// listing only declares "sign_v1" support (verified against
// https://explorer-api.walletconnect.com/v3/wallets) — WalletConnect v1's
// relay network was shut down in 2023, and every modern client including
// this one (via @walletconnect/ethereum-provider v2) speaks v2 only. There
// is no browser-extension equivalent on native mobile, so Phantom has no
// working connection path here — including it would just be a button that
// always fails to connect.
const WEB_PARITY_WALLET_IDS = [
  "c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96", // MetaMask
  "4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0", // Trust Wallet
  "18388be9ac2d02726dbac9777c96efaac06d744b2f6d580fccdd4127a6d01fd1", // Rabby
];

// The chains AppKit offers to connect on — must match this app's own
// supportedNetworks (config/web3.constants.ts), the same list every other
// signed-in flow (chain switcher, balances, contracts) uses. An earlier
// version of this file validated supportedNetworks and then discarded the
// result in favor of a hardcoded [Ethereum mainnet, Polygon] — chains the
// rest of the app has no contracts on — which would have offered a
// wallet-connect flow that could never actually complete a DeHub sign-in.
//
// Returns null rather than throwing, for the same reason as the projectId check
// above: this runs at module scope during boot, where a throw is a white screen.
function resolveChains() {
  if (!Array.isArray(supportedNetworks) || supportedNetworks.length === 0) {
    log.error("supportedNetworks is empty or invalid — cannot configure AppKit chains");
    return null;
  }
  for (let index = 0; index < supportedNetworks.length; index++) {
    const network = supportedNetworks[index];
    if (!network || typeof network !== "object") {
      log.error(`Invalid network at index ${index}: not an object`);
      return null;
    }
    if (!network.chainId || !network.name || !network.currency) {
      log.error(`Invalid network at index ${index}: missing required properties`);
      return null;
    }
  }
  return supportedNetworks.map((n) => ({
    chainId: n.chainId,
    name: n.name,
    currency: n.currency,
    explorerUrl: n.explorerUrl,
    rpcUrl: n.rpcUrl,
  }));
}

const chains = resolveChains();

/**
 * Configured well enough to try. createAppKit itself only runs on demand, so
 * this is what the sign-in button gates on; a failure at creation time now
 * surfaces where the user asked for Connect Wallet instead of at boot.
 */
export const isWalletConnectAvailable = !!projectId && !!chains;

// Survives Fast Refresh re-evaluating this file without losing the instance.
const APPKIT_INSTANCE_KEY = "__REOWN_APPKIT_INSTANCE__" as const;

type AppKitInstance = ReturnType<typeof createAppKit>;

const listeners = new Set<() => void>();

/**
 * The live AppKit instance, for callers that need to act on it outside a
 * component (e.g. disconnecting the WalletConnect session on DeHub sign-out —
 * see useAuthSession.ts's signOut). Undefined until ensureAppKit or
 * restoreAppKitSession has created it — reading it never creates it.
 */
export function getAppKitInstance(): AppKitInstance | undefined {
  return (globalThis as any)[APPKIT_INSTANCE_KEY];
}

/**
 * Creates AppKit if it does not exist yet and returns it. Call this where the
 * user asks for Connect Wallet. Returns undefined when this build cannot
 * configure it or creation throws — never throws itself.
 */
export function ensureAppKit(): AppKitInstance | undefined {
  const existing = getAppKitInstance();
  if (existing) return existing;
  if (!projectId || !chains) return undefined;
  try {
    const instance = createAppKit({
      projectId,
      metadata,
      chains,
      config: defaultConfig({ metadata }),
      enableAnalytics: false,
      includeWalletIds: WEB_PARITY_WALLET_IDS,
      featuredWalletIds: WEB_PARITY_WALLET_IDS,
    });
    (globalThis as any)[APPKIT_INSTANCE_KEY] = instance;
    log.info("AppKit initialized", { chainsCount: chains.length });
    listeners.forEach((listener) => listener());
    return instance;
  } catch (e) {
    // createAppKit reaches the WalletConnect relay and the wallet explorer at
    // construction time. Whatever it dislikes, it must not take the caller down.
    log.error("AppKit failed to initialize — Connect Wallet unavailable", e);
    return undefined;
  }
}

// What AppKit writes to AsyncStorage when a wallet connects and clears on
// disconnect. The ethers client only restores a WalletConnect session on
// start when '@w3m/wallet_id' is set, so either key present means there is a
// pairing worth restoring.
const PERSISTED_SESSION_KEYS = ["@w3m/wallet_id", "@w3m/connected_connector"];

let restorePromise: Promise<void> | undefined;

/**
 * Creates AppKit at boot only if a WalletConnect session is already
 * persisted, so a Connect Wallet user's pairing comes back as it always did
 * while everyone else skips the startup cost. Idempotent: callers that need
 * the restored instance (signer adoption, sign-out) await this, then read
 * getAppKitInstance().
 */
export function restoreAppKitSession(): Promise<void> {
  if (!restorePromise) {
    restorePromise = (async () => {
      if (!isWalletConnectAvailable || getAppKitInstance()) return;
      try {
        const entries = await AsyncStorage.multiGet(PERSISTED_SESSION_KEYS);
        if (entries.some(([, value]) => value != null)) ensureAppKit();
      } catch (e) {
        log.warn("could not read persisted WalletConnect session", e);
      }
    })();
  }
  return restorePromise;
}

function subscribeAppKitInstance(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The AppKit instance as React state: re-renders once it has been created. */
export function useAppKitInstance(): AppKitInstance | undefined {
  return useSyncExternalStore(subscribeAppKitInstance, getAppKitInstance, getAppKitInstance);
}

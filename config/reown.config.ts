// Reown AppKit (WalletConnect) setup for the "Connect Wallet" sign-in option —
// lets a user authenticate with an EXTERNAL wallet app (MetaMask, Trust
// Wallet, Coinbase Wallet, Rainbow, ...) instead of DeHub provisioning one.
// Imported once, for its side effect (createAppKit), from index.ts.
//
// Side-effect imports for walletconnect & ethers shims are already loaded once in index.ts.
// Avoid duplicating them here to prevent multiple relayer/event listener registrations.
import {
  createAppKit,
  defaultConfig,
} from "@reown/appkit-ethers5-react-native";
import env from "./env";
import { appScheme, supportedNetworks } from "./web3.constants";
import { createLogger } from "../libs/logger";

const log = createLogger("reown.config");

export const projectId = env.REOWN_PROJECT_ID;

if (!projectId) {
  log.error("REOWN_PROJECT_ID is missing from environment variables");
  throw new Error("REOWN_PROJECT_ID is required");
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

export const config = defaultConfig({ metadata });

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
function resolveChains() {
  if (!Array.isArray(supportedNetworks) || supportedNetworks.length === 0) {
    throw new Error("supportedNetworks is empty or invalid — cannot configure AppKit chains");
  }
  supportedNetworks.forEach((network, index) => {
    if (!network || typeof network !== "object") {
      throw new Error(`Invalid network at index ${index}: not an object`);
    }
    if (!network.chainId || !network.name || !network.currency) {
      throw new Error(`Invalid network at index ${index}: missing required properties`);
    }
  });
  return supportedNetworks.map((n) => ({
    chainId: n.chainId,
    name: n.name,
    currency: n.currency,
    explorerUrl: n.explorerUrl,
    rpcUrl: n.rpcUrl,
  }));
}

const chains = resolveChains();

// Guard against multiple inits on Fast Refresh / repeated imports.
const APPKIT_GLOBAL_KEY = "__REOWN_APPKIT_INITIALIZED__" as const;
const APPKIT_INSTANCE_KEY = "__REOWN_APPKIT_INSTANCE__" as const;

if (!(globalThis as any)[APPKIT_GLOBAL_KEY]) {
  const instance = createAppKit({
    projectId,
    metadata,
    chains,
    config,
    enableAnalytics: false,
    includeWalletIds: WEB_PARITY_WALLET_IDS,
    featuredWalletIds: WEB_PARITY_WALLET_IDS,
  });
  (globalThis as any)[APPKIT_GLOBAL_KEY] = true;
  (globalThis as any)[APPKIT_INSTANCE_KEY] = instance;
  log.info("AppKit initialized", { chainsCount: chains.length });
} else {
  log.debug("AppKit already initialized, skipping");
}

/**
 * The live AppKit instance, for callers that need to act on it outside a
 * component (e.g. disconnecting the WalletConnect session on DeHub sign-out —
 * see useAuthSession.ts's signOut). Kept off the global key rather than a
 * plain module-level variable so it survives Fast Refresh re-evaluating this
 * file's top level without losing the original instance.
 */
export function getAppKitInstance(): ReturnType<typeof createAppKit> | undefined {
  return (globalThis as any)[APPKIT_INSTANCE_KEY];
}

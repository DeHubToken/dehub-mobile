// Centralized Web3Auth configuration & helpers
// Keep ALL Web3Auth specific setup in this module and only export the minimal
// surface needed elsewhere. This avoids scattering config across the codebase.

type LoginProvider = string; // Narrow later if you add explicit union
// We avoid importing specific enums that may have changed; use literal strings.

import env from "./env";
import { ChainId } from "./constants";
import { SUPPORTED_NETWORKS, appScheme } from "./web3.constants";

// --- Environment & Constants -------------------------------------------------
// You can map these to process.env.* (already done in env.ts). Add WEB3AUTH vars there when available.
// For now we allow override via process.env to keep flexibility.
export const WEB3AUTH_CLIENT_ID: string =
  env.WEB3AUTH_CLIENT_ID ||
  (process.env.WEB3AUTH_CLIENT_ID as string) ||
  "REPLACE_WITH_WEB3AUTH_CLIENT_ID";

// Redirect / Deep link scheme must match what's configured in Web3Auth dashboard & native project.
// If you change this, update AndroidManifest, iOS URL types, and Info.plist accordingly.
export const WEB3AUTH_DEEP_LINK_SCHEME = appScheme;
export const WEB3AUTH_REDIRECT_URL = `${appScheme}://auth`; // scheme must match native config

// Preferred network from SDK enums (adjust if you need MAINNET). Using sapphire_mainnet per Web3Auth docs.
export const WEB3AUTH_NETWORK_ENV = "sapphire_mainnet";

export const WEB3AUTH_CHAIN_ID = "0x2105"; // Base Mainnet
export const WEB3AUTH_RPC_TARGET = "https://mainnet.base.org";

// --- Social Provider Metadata ------------------------------------------------
import { GOOGLE_SVG_XML, TWITTER_SVG_XML } from "./socialIcons";

export interface SocialProviderMeta {
  provider: LoginProvider;
  name: string;
  icon: string; // raw SVG xml
}

export const SOCIAL_PROVIDERS: SocialProviderMeta[] = [
  { provider: "google", name: "Google", icon: GOOGLE_SVG_XML },
  { provider: "twitter", name: "Twitter", icon: TWITTER_SVG_XML },
];

// Helper map for quick lookup
export const SOCIAL_PROVIDER_MAP: Record<string, SocialProviderMeta> =
  SOCIAL_PROVIDERS.reduce((acc, p) => ({ ...acc, [p.provider]: p }), {});

// Web3Auth set up from main site
import * as WebBrowser from "expo-web-browser";
import * as SecureStore from "expo-secure-store";
import Constants, { AppOwnership } from "expo-constants";
import * as Linking from "expo-linking";

// --- Lazy SDK Instance ------------------------------------------------------
// We defer importing heavy SDK modules until actually needed to avoid initial navigation lag
// when the SignIn screen is first opened.
let web3auth: any | null = null;
let isCreating = false;

async function getOrCreateInstance() {
  console.log({web3auth, isCreating})
  if (web3auth || isCreating) return web3auth;
  isCreating = true;
  const [{ default: Web3Auth, WEB3AUTH_NETWORK, LOGIN_PROVIDER, ChainNamespace }, { EthereumPrivateKeyProvider }] = await Promise.all([
    import("@web3auth/react-native-sdk"),
    import("@web3auth/ethereum-provider"),
  ]);

  const chainConfig = {
    chainNamespace: ChainNamespace.EIP155,
    chainId: WEB3AUTH_CHAIN_ID,
    rpcTarget: WEB3AUTH_RPC_TARGET,
    displayName: "Base Mainnet",
    blockExplorerUrl: "https://basescan.org",
    ticker: "ETH",
    tickerName: "Ether",
    decimals: 18,
    logo: "https://basescan.org/assets/base/images/svg/logos/chain-light.svg",
  };

  console.log({chainConfig})
  const privateKeyProvider = new EthereumPrivateKeyProvider({
    config: { chainConfig },
  });
  console.log({privateKeyProvider})

  const SdkInitParams = {
    clientId: WEB3AUTH_CLIENT_ID,
    network: WEB3AUTH_NETWORK.SAPPHIRE_MAINNET,
    redirectUrl: WEB3AUTH_REDIRECT_URL,
    privateKeyProvider,
    logLevel: "debug",
    loginConfig: {},
  };
  console.log({SdkInitParams})

  web3auth = new Web3Auth(WebBrowser, SecureStore, SdkInitParams);
  // Attach enums we still reference indirectly
  (web3auth as any)._LOGIN_PROVIDER = LOGIN_PROVIDER;
  isCreating = false;
  return web3auth;
}

// (Optional) dynamic redirect resolution if needed for Expo Go vs standalone
// const resolvedRedirectUrl =
//   Constants.appOwnership === AppOwnership.Expo
//     ? Linking.createURL('web3auth')
//     : Linking.createURL('web3auth', { scheme: appScheme });

// console.log("Resolved redirect URL:", WEB3AUTH_REDIRECT_URL);

// (Legacy comments retained above for reference.)

// --- Runtime State ----------------------------------------------------------
let isInitialized = false;

// --- Helpers ----------------------------------------------------------------
export const isWeb3AuthConfigured = () =>
  WEB3AUTH_CLIENT_ID &&
  WEB3AUTH_CLIENT_ID !== "REPLACE_WITH_WEB3AUTH_CLIENT_ID";

export const ensureWeb3AuthReady = async () => {
  if (!isWeb3AuthConfigured()) throw new Error("WEB3AUTH_CLIENT_ID not set");
  if (isInitialized && web3auth) return web3auth;
  try {
    const instance = await getOrCreateInstance();
    console.log({instance})
    await instance.init();
    isInitialized = true;
    return instance;
  } catch (e: any) {
    console.error("[Web3Auth] init error", e);
    throw e;
  }
};

// Alias matching official usage naming
export const initWeb3Auth = ensureWeb3AuthReady;

// Provider mapping (string -> enum)
const LOGIN_PROVIDER_MAP: Record<string, any> = {
  google: (web3auth as any)?._LOGIN_PROVIDER?.GOOGLE ?? 'google',
  twitter: (web3auth as any)?._LOGIN_PROVIDER?.TWITTER ?? 'twitter',
};

// Derive address from private key using ethers Wallet
export const deriveAddressFromPrivateKey = (
  privKey?: string | null
): string | null => {
  if (!privKey) return null;
  try {
    const { Wallet } = require("ethers");
    const normalized = privKey.startsWith("0x") ? privKey : `0x${privKey}`;
    const w = new Wallet(normalized);
    return w.address;
  } catch (e) {
    console.warn("[Web3Auth] derive address failed", e);
    return null;
  }
};

export interface Web3AuthLoginResult {
  address: string | null;
  privateKey: any;
  userInfo: any;
  provider: any;
}
export const loginWithSocial = async (
  provider: string
): Promise<Web3AuthLoginResult> => {
  const instance = await ensureWeb3AuthReady();
  // Re-evaluate mapping after instance created (enums now attached)
  const mapped = (instance as any)._LOGIN_PROVIDER?.[provider?.toUpperCase?.()] || LOGIN_PROVIDER_MAP[provider] || provider;
  try {
    const beforeState = {
      privKeyPresent: false,
    };

    await instance.login({
      loginProvider: mapped,
      redirectUrl: WEB3AUTH_REDIRECT_URL,
      curve: "secp256k1",
    });

    const userInfo = (instance as any).userInfo
      ? (instance as any).userInfo()
      : null;

    // Validate session by checking for privKey
    const web3provider = instance.provider;

    const privKey = await web3provider?.request({
      method: "private_key",
    });

    const address = deriveAddressFromPrivateKey(privKey as string);
    return { address, privateKey: privKey, userInfo, provider: web3provider };
  } catch (e: any) {
    console.error("[Web3Auth] social login error", e);
    // Surface raw message but keep generic fallback
    throw new Error(e?.message || "Web3Auth social login failed");
  }
};

export const getUserInfo = async () => {
  // For v8 provider, user info may be available via instance.userInfo or not exposed; return null placeholder.
  return null;
};

export const getPrivateKey = async (): Promise<string | null> => {
  try {
    // Requires already connected provider; not stored globally here.
    return null;
  } catch {
    return null;
  }
};

export const logoutWeb3Auth = async () => {
  if (!isInitialized || !web3auth) return;
  try {
    await web3auth.logout();
  } catch (e) {
    console.warn("[Web3Auth] logout warning", e);
  }
};

// Allow pre-warming (create + init) in background (e.g., after splash) to remove first-screen lag
export const prewarmWeb3Auth = async () => {
  if (isInitialized || !isWeb3AuthConfigured()) return;
  try {
    await ensureWeb3AuthReady();
  } catch (e) {
    // Non-fatal: just log
    console.warn('[Web3Auth] prewarm failed', e);
  }
};

// ---------------------------------------------------------------------------
// Extended Helpers for Web3 / EVM interactions via Web3Auth provider
// ---------------------------------------------------------------------------
// (All extended helper implementations have been moved to services/web3auth.service.ts)
// (Extended helpers removed to services/web3auth.service.ts)


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
import Web3Auth, {
  WEB3AUTH_NETWORK,
  LOGIN_PROVIDER,
  ChainNamespace,
} from "@web3auth/react-native-sdk";
import * as WebBrowser from "expo-web-browser";
import * as SecureStore from "expo-secure-store";
import { EthereumPrivateKeyProvider } from "@web3auth/ethereum-provider";
import Constants, { AppOwnership } from "expo-constants";
import * as Linking from "expo-linking";
import EncryptedStorage from "react-native-encrypted-storage";

// Base Mainnet chain config (replace with env-based switch if needed)
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


const privateKeyProvider = new EthereumPrivateKeyProvider({
  config: {
    chainConfig,
  },
});

// (Optional) dynamic redirect resolution if needed for Expo Go vs standalone
// const resolvedRedirectUrl =
//   Constants.appOwnership === AppOwnership.Expo
//     ? Linking.createURL('web3auth')
//     : Linking.createURL('web3auth', { scheme: appScheme });

// console.log("Resolved redirect URL:", WEB3AUTH_REDIRECT_URL);

const SdkInitParams = {
  clientId: WEB3AUTH_CLIENT_ID,
  network: WEB3AUTH_NETWORK.SAPPHIRE_MAINNET,
  redirectUrl: WEB3AUTH_REDIRECT_URL,
  privateKeyProvider,
  logLevel: "debug",
  loginConfig: {
    // google: {
    //   verifier: "dehub-mainnet",
    //   verifierSubIdentifier: "w3a-google",
    //   typeOfLogin: "google",
    //   clientId:
    //     "478161212424-hv362l391248qdh8apfe6lvbockfnmqd.apps.googleusercontent.com",
    // },
  },
};

const web3auth = new Web3Auth(WebBrowser, SecureStore, SdkInitParams);
// const web3auth = new Web3Auth(WebBrowser, EncryptedStorage, SdkInitParams);

// --- Runtime State ----------------------------------------------------------
let isInitialized = false;

// --- Helpers ----------------------------------------------------------------
export const isWeb3AuthConfigured = () =>
  WEB3AUTH_CLIENT_ID &&
  WEB3AUTH_CLIENT_ID !== "REPLACE_WITH_WEB3AUTH_CLIENT_ID";

export const ensureWeb3AuthReady = async () => {
  if (!isWeb3AuthConfigured()) throw new Error("WEB3AUTH_CLIENT_ID not set");
  if (isInitialized) return web3auth;
  try {
    await web3auth.init();
    isInitialized = true;
  } catch (e: any) {
    console.error("[Web3Auth] init error", e);
    throw e;
  }
  return web3auth;
};

// Alias matching official usage naming
export const initWeb3Auth = ensureWeb3AuthReady;

// Provider mapping (string -> enum)
const LOGIN_PROVIDER_MAP: Record<string, any> = {
  google: LOGIN_PROVIDER.GOOGLE,
  twitter: LOGIN_PROVIDER.TWITTER,
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
  const mapped = LOGIN_PROVIDER_MAP[provider] || provider; // allow raw string fallback
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

// export const loginWithSocial = async (provider: string): Promise<Web3AuthLoginResult> => {
//   const instance = await ensureWeb3AuthReady();
//   const mapped = LOGIN_PROVIDER_MAP[provider];
//   if (!mapped) throw new Error(`Unsupported provider: ${provider}`);
//   try {
// 	console.log('[Web3Auth] initiating login with provider', provider, mapped);
//   const connectedProvider: any = await instance.login({ loginProvider: mapped });
//   console.log('[Web3Auth] connected provider', connectedProvider);
//     // Try standard EIP-1193 methods to pull accounts
//     let accounts: string[] = [];
//     try {
//       accounts = await connectedProvider.request({ method: 'eth_accounts' });
//     } catch (e) {
//       try { accounts = await connectedProvider.request({ method: 'personal_listAccounts' }); } catch (_) {}
//     }
// 	console.log('[Web3Auth] fetched accounts', accounts);
//     const address = accounts?.[0] || null;
//     // Attempt to fetch private key (non-standard):
//     let priv: string | null = null;
//     try {
//       priv = await connectedProvider.request({ method: 'eth_private_key' });
//     } catch (e) {
//       // fallback custom
//       try { priv = await connectedProvider.request({ method: 'private_key' }); } catch (_) {}
//     }
//     const finalAddress = address || deriveAddressFromPrivateKey(priv);
//     return { address: finalAddress, privateKey: priv, userInfo: null, provider };
//   } catch (e: any) {
//     console.error('[Web3Auth] connect/login error', e);
//     throw new Error(e?.message || 'Web3Auth login failed');
//   }
// };

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
  if (!isInitialized) return;
  try {
    await web3auth.logout();
  } catch (e) {
    console.warn("[Web3Auth] logout warning", e);
  }
};

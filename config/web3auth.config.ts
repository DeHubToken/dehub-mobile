// Centralized Web3Auth configuration & helpers
// Keep ALL Web3Auth specific setup in this module and only export the minimal
// surface needed elsewhere. This avoids scattering config across the codebase.

type LoginProvider = string; // Narrow later if you add explicit union
// We avoid importing specific enums that may have changed; use literal strings.

import env from "./env";
import { ChainId } from "./constants";
import { SUPPORTED_NETWORKS, appScheme } from "./web3.constants";
import { getPreferredChainId } from "../libs/auth.utils";
import { createLogger } from "../libs/logger";

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

// Sign in with Apple runs through a Web3Auth *custom* JWT verifier instead of
// one of the built-in social logins, because the token is minted by Apple's
// native sheet rather than by a browser hand-off. Set this to the verifier name
// from the Web3Auth dashboard; empty means Apple stays hidden.
export const WEB3AUTH_APPLE_VERIFIER: string =
  env.WEB3AUTH_APPLE_VERIFIER ||
  (process.env.WEB3AUTH_APPLE_VERIFIER as string) ||
  "";

export const isAppleSignInConfigured = () =>
  Platform.OS === "ios" && !!WEB3AUTH_APPLE_VERIFIER;

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
// import * as WebBrowser from "expo-web-browser";
import * as WebBrowser from '@toruslabs/react-native-web-browser'
import * as SecureStore from "expo-secure-store";
import * as Linking from "expo-linking";
import * as AppleAuthentication from "expo-apple-authentication";
import { Platform } from "react-native";
// Stop dynamic imports: use static top-level imports
import Web3Auth, {
  ChainNamespace,
  LOGIN_PROVIDER,
  WEB3AUTH_NETWORK,
  // Aliased because the local init object below is also called SdkInitParams.
  type SdkInitParams as Web3AuthInitParams,
} from "@web3auth/react-native-sdk";
import { EthereumPrivateKeyProvider } from "@web3auth/ethereum-provider";
import {
  AccountAbstractionProvider,
  SafeSmartAccount,
} from "@web3auth/account-abstraction-provider";

// // Destructure needed members from SDK (keeps types flexible across versions)
// const { Web3Auth, WEB3AUTH_NETWORK, LOGIN_PROVIDER } = Web3AuthSDK as any;

// --- Lazy SDK Instance ------------------------------------------------------
// We defer importing heavy SDK modules until actually needed to avoid initial navigation lag
// when the SignIn screen is first opened.
let web3auth: any | null = null;
let isCreating = false;
let createPromise: Promise<any> | null = null;

const log = createLogger("Web3AuthConfig");

function resolveRedirectUrl(): string {
  try {
    const url = Linking.createURL("auth", {
      scheme: WEB3AUTH_DEEP_LINK_SCHEME,
    });
    log.debug("resolveRedirectUrl", { url });
    return url;
  } catch {
    const fallback = `${WEB3AUTH_DEEP_LINK_SCHEME}://auth`;
    log.warn("resolveRedirectUrl:fallback", { fallback });
    return fallback;
  }
}

async function getOrCreateInstance() {
  // console.log({ web3auth, isCreating, createPromise, WEB3AUTH_CLIENT_ID });
  if (web3auth) return web3auth;
  if (isCreating && createPromise) return await createPromise;
  isCreating = true;
  // console.log("Creating Web3Auth instance...");
  // console.log("Created sdk (static imports)");
  // Determine initial chain from preferredChainId if present; else default to Base
  const preferred =
    (await getPreferredChainId()) || (ChainId as any).BASE_MAINNET || 8453;
  // log.info("sdk:prefferedchain", { preferred, fromstore: await getPreferredChainId() });
  const baseCfg =
    (SUPPORTED_NETWORKS as any)?.[preferred] ||
    (SUPPORTED_NETWORKS as any)?.[8453];
  const initialHex = (baseCfg?.chainId as string) || WEB3AUTH_CHAIN_ID;
  const initialRpc = Array.isArray(baseCfg?.rpcUrls)
    ? baseCfg.rpcUrls[0]
    : baseCfg?.rpcUrls || WEB3AUTH_RPC_TARGET;
  const chainConfig = {
    chainNamespace: ChainNamespace.EIP155,
    chainId: initialHex,
    rpcTarget: initialRpc,
    displayName: baseCfg?.chainName || "Base Mainnet",
    blockExplorerUrl: Array.isArray(baseCfg?.blockExplorerUrls)
      ? baseCfg.blockExplorerUrls[0]
      : baseCfg?.blockExplorerUrls || "https://basescan.org",
    ticker: baseCfg?.nativeCurrency?.symbol || "ETH",
    tickerName: baseCfg?.nativeCurrency?.name || "Ether",
    decimals: baseCfg?.nativeCurrency?.decimals ?? 18,
    logo: (baseCfg as any)?.iconUrls?.[0] || "",
  } as any;

  // console.log({ chainConfig });
  const privateKeyProvider = new EthereumPrivateKeyProvider({
    config: { chainConfig },
  });
  // console.log({ privateKeyProvider });

  const accountAbstractionProvider = new AccountAbstractionProvider({
    config: {
      chainConfig,
      bundlerConfig: {
        // Get the pimlico API Key from dashboard.pimlico.io
        url: `https://api.pimlico.io/v2/${parseInt(
          String(initialHex),
          16
        )}/rpc?apikey=${env.PIMLICO_API_KEY}`,
      },
      smartAccountInit: new SafeSmartAccount(),
      paymasterConfig: {
        // Get the pimlico API Key from dashboard.pimlico.io
        url: `https://api.pimlico.io/v2/${parseInt(
          String(initialHex),
          16
        )}/rpc?apikey=${env.PIMLICO_API_KEY}`,
      },
    },
  });

  const redirectUrl = resolveRedirectUrl();
  log.debug("resolvedRedirectUrl", { redirectUrl });

  // The `jwt` entry is Sign in with Apple (see loginWithSocial). Web3Auth
  // wants the verifier at construction time, not at login time, so it has to
  // be declared here even though nothing else uses it.
  //
  // Annotated rather than inlined below: with no contextual type the ternary
  // infers `{ jwt: {...} } | { jwt?: undefined }`, and that second branch has
  // no way to satisfy LoginConfig's index signature (`undefined` is not a
  // login config entry). The annotation also keeps typeOfLogin as the literal
  // "jwt" instead of widening it to string.
  const loginConfig: Web3AuthInitParams["loginConfig"] = WEB3AUTH_APPLE_VERIFIER
    ? {
        jwt: {
          verifier: WEB3AUTH_APPLE_VERIFIER,
          typeOfLogin: "jwt",
          clientId: WEB3AUTH_CLIENT_ID,
        },
      }
    : {};

  const SdkInitParams = {
    clientId: WEB3AUTH_CLIENT_ID,
    network: WEB3AUTH_NETWORK.SAPPHIRE_MAINNET,
    redirectUrl,
    privateKeyProvider,
    accountAbstractionProvider,
    // This will allow you to use EthereumPrivateKeyProvider for
    // external wallets, while use the AccountAbstractionProvider
    // for Web3Auth embedded wallets.
    useAAWithExternalWallet: false,
    logLevel: "debug",
    loginConfig,
    // Extended session time (30 days) to reduce re-auth frequency
    // but this helps with local session management
    sessionTime: 86400 * 30, // 30 days in seconds
  };
  log.debug("sdk:init:params", { hasClientId: !!WEB3AUTH_CLIENT_ID });

  //   console.log("[DEBUG] SdkInitParams", SdkInitParams);
  // console.log("[DEBUG] Web3Auth class", Web3Auth);
  // console.log("[DEBUG] EthereumPrivateKeyProvider", EthereumPrivateKeyProvider);
  try {
    const instance = new Web3Auth(WebBrowser, SecureStore, SdkInitParams);
    log.info("sdk:instance:created");
    // createPromise = Promise.resolve(instance);
    // web3auth = await createPromise;
    //   return web3auth;
    // await instance.addChain(bscChain);
    web3auth = instance;
    (web3auth as any)._LOGIN_PROVIDER = LOGIN_PROVIDER;
    return instance;
  } finally {
    isCreating = false;
    createPromise = null;
  }
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
    log.info("sdk:init:start");
    const instance = await getOrCreateInstance();
    await instance.init();
    isInitialized = true;
    log.info("sdk:init:ready");
    return instance;
  } catch (e: any) {
    log.error("sdk:init:error", e);
    // If init fails (e.g. stale Google Play Services after long background),
    // discard the cached instance so the next call creates a fresh one.
    web3auth = null;
    isInitialized = false;
    isCreating = false;
    createPromise = null;
    throw e;
  }
};

// Alias matching official usage naming
export const initWeb3Auth = ensureWeb3AuthReady;

// Provider mapping (string -> enum)
const LOGIN_PROVIDER_MAP: Record<string, any> = {
  google: "google",
  twitter: "twitter",
  passwordless: "email_passwordless",
  sms_passwordless: "sms_passwordless",
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
    log.warn("deriveAddressFromPrivateKey:error", e);
    return null;
  }
};

export interface Web3AuthLoginResult {
  address: string | null;
  privateKey: any;
  userInfo: any;
  provider: any;
}
/**
 * Run Apple's native sign-in sheet and turn the result into Web3Auth login
 * params.
 *
 * Apple is the odd one out among the socials: the identity token is minted
 * on-device before Web3Auth is involved, so it goes in through the custom JWT
 * verifier rather than a browser hand-off. Everything downstream is identical —
 * the key still comes from Web3Auth, so the AccountAbstractionProvider still
 * produces the same kind of Safe smart account it does for a Google login.
 *
 * The display name is the reason this returns userInfo of its own: Apple sends
 * it exactly once, on the very first authorization, and never inside the token.
 * If it isn't captured here it is gone for good.
 */
const buildAppleLogin = async (): Promise<{ params: any; userInfo: Record<string, any> }> => {
  if (!WEB3AUTH_APPLE_VERIFIER) {
    throw new Error("Apple sign-in is not configured");
  }
  if (!(await AppleAuthentication.isAvailableAsync())) {
    throw new Error("Sign in with Apple isn't available on this device");
  }

  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
  } catch (e: any) {
    // Dismissing the sheet is a normal thing to do, not a failure worth
    // reporting as "Login failed. Please retry."
    if (e?.code === "ERR_REQUEST_CANCELED") {
      throw new Error("Sign in with Apple was cancelled");
    }
    throw e;
  }

  if (!credential.identityToken) {
    throw new Error("Apple didn't return an identity token");
  }

  const name = [credential.fullName?.givenName, credential.fullName?.familyName]
    .filter(Boolean)
    .join(" ")
    .trim();

  log.info("buildAppleLogin:credential", {
    hasName: !!name,
    hasEmail: !!credential.email,
  });

  return {
    params: {
      loginProvider: (LOGIN_PROVIDER as any)?.JWT || "jwt",
      redirectUrl: resolveRedirectUrl(),
      curve: "secp256k1",
      // Same as the social path below: keep the hosted MFA enrollment page
      // out of the login flow.
      mfaLevel: "none",
      extraLoginOptions: {
        id_token: credential.identityToken,
        verifierIdField: "sub",
        domain: "https://appleid.apple.com",
      },
    },
    userInfo: {
      typeOfLogin: "apple",
      ...(name ? { name } : {}),
      ...(credential.email ? { email: credential.email } : {}),
    },
  };
};

export const loginWithSocial = async (
  provider: string,
  extraLoginOptions?: any
): Promise<Web3AuthLoginResult> => {
  log.info("loginWithSocial:start", { provider });
  const instance = await ensureWeb3AuthReady();
  // Apple has to collect its token before the Web3Auth call, and must be
  // checked before the mapping below — LOGIN_PROVIDER.APPLE exists and would
  // otherwise send it down the browser flow instead of the native sheet.
  const apple = provider === "apple" ? await buildAppleLogin() : null;
  // Re-evaluate mapping after instance created (enums now attached)
  const mapped =
    (LOGIN_PROVIDER as any)?.[provider?.toUpperCase?.()] ||
    LOGIN_PROVIDER_MAP[provider] ||
    provider;
  log.debug("loginWithSocial:mapped", { provider, mapped: apple?.params.loginProvider ?? mapped });
  try {
    await instance.login(
      apple?.params ?? {
        loginProvider: mapped,
        redirectUrl: resolveRedirectUrl(),
        curve: "secp256k1",
        // Without this the hosted auth flow interposes its own "set up
        // biometrics/passkey" enrollment page after the OAuth step, which has
        // stranded sign-ins on devices where the passkey ceremony never
        // completes inside the auth browser tab. Device-level key protection
        // is unaffected; users can still enroll later from Web3Auth's side.
        mfaLevel: "none",
        extraLoginOptions,
      }
    );
    log.info("loginWithSocial:web3auth:logged-in");
    const sdkUserInfo = (instance as any).userInfo
      ? (instance as any).userInfo()
      : null;
    // Apple's name/email are merged on top: for a JWT login Web3Auth only sees
    // what the token carries, which never includes the name.
    const userInfo = apple ? { ...(sdkUserInfo || {}), ...apple.userInfo } : sdkUserInfo;

    // With Account Abstraction smart accounts, there is no private key exposed.
    // Derive the connected address via standard RPC.
    const web3provider = instance.provider;
    let address: string | null = null;
    try {
      const accs = await web3provider?.request?.({ method: "eth_accounts" });
      if (Array.isArray(accs) && accs.length > 0) address = accs[0];
      if (!address) {
        const req = await web3provider?.request?.({
          method: "eth_requestAccounts",
        });
        if (Array.isArray(req) && req.length > 0) address = req[0];
      }
    } catch (e) {
      log.warn("loginWithSocial:accounts:error", e as any);
    }
    log.info("loginWithSocial:session", {
      addr: address ? `${address.slice(0, 6)}...${address.slice(-4)}` : null,
      hasPrivKey: false,
      userInfoPresent: !!userInfo,
    });

    return { address, privateKey: null, userInfo, provider: web3provider };
  } catch (e: any) {
    log.error("loginWithSocial:error", e);
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

/**
 * Ed25519 private key from the active Web3Auth session — used to derive the
 * user's Solana keypair for Solana minting (#41). Returns null for non-Web3Auth
 * sessions (e.g. imported EVM wallets) or when no session is active.
 */
export const getEd25519PrivateKey = async (): Promise<string | null> => {
  try {
    const instance = web3auth || (await ensureWeb3AuthReady());
    const key: string | undefined = instance?.getFinalEd25519PrivKey?.();
    return key && key.length > 0 ? key : null;
  } catch (e) {
    log.warn("getEd25519PrivateKey:error", e as any);
    return null;
  }
};

export const logoutWeb3Auth = async () => {
  if (!isInitialized || !web3auth) return;
  try {
    await web3auth.logout();
    log.info("logout:ok");
  } catch (e) {
    log.warn("logout:warning", e);
  }
};

/**
 * Destroy the cached Web3Auth instance so the next ensureWeb3AuthReady()
 * creates a fresh one configured for whatever preferredChainId is persisted.
 * Call this when switching chains in-place (no app restart).
 *
 * IMPORTANT: We intentionally do NOT call logout() here.
 * logout() invalidates the session on Web3Auth's server and removes the
 * sessionId from SecureStore. That means the new instance's init() would
 * find no session → no private key → signing fails with
 * "Invalid signature produced". By keeping the session intact the new
 * instance restores it automatically during init() on the target chain.
 */
export const resetWeb3AuthInstance = () => {
  web3auth = null;
  isInitialized = false;
  isCreating = false;
  createPromise = null;
  log.info("sdk:instance:reset");
};

// Allow pre-warming (create + init) in background (e.g., after splash) to remove first-screen lag
export const prewarmWeb3Auth = async () => {
  if (isInitialized && web3auth) return;
  if (!isWeb3AuthConfigured()) return;
  try {
    await ensureWeb3AuthReady();
    log.debug("prewarm:ok");
  } catch (e) {
    // Non-fatal: instance was already discarded by ensureWeb3AuthReady,
    // next call will create a fresh one.
    log.warn("prewarm:failed (will retry on next use)", e);
  }
};

// Extended helpers moved to services/web3auth.service.ts.
// Chain-switch helpers removed: preferred chain persisted → app restarts on it.

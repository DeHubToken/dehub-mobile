// LEGACY Web3Auth — one-time wallet migration only
// ================================================
// Native RN port of dehubweb's src/lib/legacy-web3auth.ts: lets a user who has
// a pre-migration (Web3Auth-era) DeHub account log in through the OLD
// provider ONCE, reconstructs the private key on-device via Sapphire DKG (the
// key never touches our servers), and hands it to switchActiveWalletForIdentity
// for import. Same key -> same account (followers/uploads/DHB balance intact).
//
// Unlike web (which juggles popup-vs-full-page-redirect fallbacks),
// @web3auth/react-native-sdk's connectTo() opens an in-app browser session
// and resolves in-process once redirected back to our custom scheme -- same
// pattern this app already uses for Google sign-in via
// WebBrowser.openAuthSessionAsync in services/auth/supabaseAuth.service.ts.
// No "resume on next launch" handling is needed.
import * as WebBrowser from "@toruslabs/react-native-web-browser";
import * as SecureStore from "expo-secure-store";
import * as Linking from "expo-linking";
import Web3Auth, { AUTH_CONNECTION, WEB3AUTH_NETWORK } from "@web3auth/react-native-sdk";
import { supabase } from "../services/supabase";
import { createLogger } from "./logger";

const log = createLogger("LegacyWeb3Auth");

export type LegacyProvider = "google" | "twitter" | "discord" | "apple" | "email_passwordless";

const AUTH_CONNECTION_MAP: Record<LegacyProvider, string> = {
  google: AUTH_CONNECTION.GOOGLE,
  twitter: AUTH_CONNECTION.TWITTER,
  discord: AUTH_CONNECTION.DISCORD,
  apple: AUTH_CONNECTION.APPLE,
  email_passwordless: AUTH_CONNECTION.EMAIL_PASSWORDLESS,
};

// Reuses the exact redirect path the pre-migration mobile app used for its
// Web3Auth login (see the deleted config/web3auth.config.ts,
// WEB3AUTH_REDIRECT_URL = `${appScheme}://auth`) -- that URL is already
// whitelisted on the Web3Auth dashboard for this clientId/network, so this
// avoids needing a new dashboard whitelist entry for a brand-new path.
const LEGACY_MIGRATION_REDIRECT_PATH = "auth";
const WEB3AUTH_APP_SCHEME = "dehub";

// Base mainnet only -- key reconstruction doesn't touch the chain, this just
// satisfies the SDK's required chain config, matching wallet-core/smart-account.ts.
const CHAIN_CONFIG = {
  chainNamespace: "eip155" as const,
  chainId: "0x2105",
  rpcTarget: "https://mainnet.base.org",
  displayName: "Base Mainnet",
  blockExplorerUrl: "https://basescan.org",
  ticker: "ETH",
  tickerName: "Ethereum",
};

let cachedClientId: string | null = null;

async function getClientId(): Promise<string> {
  if (cachedClientId) return cachedClientId;
  const { data, error } = await supabase.functions.invoke("get-web3auth-config");
  if (error || !data?.clientId) {
    throw new Error(error?.message || "Web3Auth client ID not configured");
  }
  cachedClientId = data.clientId as string;
  return cachedClientId;
}

function resolveRedirectUrl(): string {
  try {
    return Linking.createURL(LEGACY_MIGRATION_REDIRECT_PATH, { scheme: WEB3AUTH_APP_SCHEME });
  } catch (e) {
    log.warn("resolveRedirectUrl:fallback", e);
    return `${WEB3AUTH_APP_SCHEME}://${LEGACY_MIGRATION_REDIRECT_PATH}`;
  }
}

async function initLegacyWeb3Auth(): Promise<Web3Auth> {
  const clientId = await getClientId();
  const redirectUrl = resolveRedirectUrl();
  const instance = new Web3Auth(WebBrowser as any, SecureStore as any, {
    clientId,
    network: WEB3AUTH_NETWORK.SAPPHIRE_MAINNET,
    redirectUrl,
    chains: [CHAIN_CONFIG],
    defaultChainId: CHAIN_CONFIG.chainId,
    // Short-lived: this is a one-shot recovery tool, never a standing session.
    sessionTime: 300,
    // We only need the raw EOA key, never a smart account wrapper. Explicit
    // `false` (not omitted) matters: the SDK's initAccountAbstractionConfig()
    // only fills this in from a dashboard-config constant when it's left
    // `undefined`, and DeHub's dashboard has smart accounts configured for
    // the main app -- leaving this unset crashed with
    // "Cannot read property 'SMART_ACCOUNT_WALLET_SCOPE' of undefined".
    useAAWithExternalWallet: false,
    // Explicit `null` (not omitted) is the SDK's own opt-out signal --
    // initAccountAbstractionConfig() checks `=== null` and resolves it to
    // `undefined` even though the dashboard has smartAccounts configured.
    // Without this, getWallet() unconditionally tries to wrap the recovered
    // key in a smart account via noModal.accountAbstractionProvider(), which
    // dynamically imports a separate JS chunk -- Metro's async-require chunk
    // loading isn't set up for that in this app, crashing with
    // "Cannot read property 'replace' of undefined" inside
    // buildUrlForBundle. We only need the raw EOA key, so skip AA entirely.
    accountAbstractionConfig: null,
    // No analytics for a one-shot local recovery tool.
    disableAnalytics: true,
  } as any);

  await Promise.race([
    instance.init(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Web3Auth init timed out after 30s")), 30000)
    ),
  ]);
  return instance;
}

/** Best-effort cleanup so no standing Web3Auth session lingers on the device. */
async function cleanupLegacySession(instance: Web3Auth | null): Promise<void> {
  if (!instance) return;
  try {
    await instance.logout();
  } catch {
    // not connected / already logged out -- fine, this is best-effort.
  }
}

/**
 * Run the one-time legacy login and return the raw private key (hex).
 * Never logs the key itself -- only masked addresses/status, matching the
 * rest of this codebase's convention.
 */
export async function startLegacyMigration(
  provider: LegacyProvider,
  loginHint?: string
): Promise<string> {
  let instance: Web3Auth | null = null;
  try {
    log.info("startLegacyMigration:init:start", { provider });
    instance = await initLegacyWeb3Auth();
    log.info("startLegacyMigration:init:ok", { provider });

    const connection = await instance.connectTo({
      authConnection: AUTH_CONNECTION_MAP[provider],
      ...(loginHint ? { extraLoginOptions: { login_hint: loginHint } } : {}),
    } as any);
    log.info("startLegacyMigration:connectTo:ok", { provider, hasConnection: !!connection });

    if (!connection) {
      throw new Error("Could not retrieve your old wallet key. Please try again.");
    }

    // getFinalPrivKey() is intentionally not part of the public TS surface
    // (it's marked `private` in the SDK's .d.ts) but is a plain, callable
    // method on the compiled class -- same technique the pre-migration
    // mobile code used for getFinalEd25519PrivKey(). It reads the in-memory
    // key populated by the connectTo() call above; no extra network hop.
    const rawKey: string | undefined = (instance as any).getFinalPrivKey?.();
    if (!rawKey) {
      throw new Error("Could not retrieve your old wallet key. Please try again.");
    }
    log.info("startLegacyMigration:ok", { provider });
    return rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`;
  } catch (e: any) {
    log.error("startLegacyMigration:error", { provider, message: e?.message, stack: e?.stack });
    // eslint-disable-next-line no-console
    console.error("[legacy-web3auth] startLegacyMigration failed", e);
    throw e instanceof Error ? e : new Error("Could not retrieve your old wallet key. Please try again.");
  } finally {
    await cleanupLegacySession(instance);
  }
}

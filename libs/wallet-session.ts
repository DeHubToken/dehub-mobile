/**
 * Signed wallet sessions for row-level security (same as web).
 *
 * Wallet-scoped RLS reads get_request_wallet_address(), which used to trust the
 * x-wallet-address header on its own. The database now also accepts
 * x-wallet-session, a short-lived signature minted by the `wallet-session`
 * edge function for the wallet the DeHub token proves.
 *
 * `walletSessionFetch` is handed to createClient as its fetch, so every REST
 * and storage request that names a wallet (withWalletHeader and friends) gets
 * that wallet's session attached. supabase-js 2.52 captures fetch when the
 * client is created, which is why this is passed in rather than patched onto
 * the global. Until enforcement is switched on server-side, a request without
 * a session still works exactly as before.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Application from "expo-application";
import { Platform } from "react-native";
import env from "../config/env";
import { getAuthToken } from "./auth.utils";
import { tokenRefreshManager } from "./token-refresh";

const STORAGE_KEY = "dehub_wallet_sessions";
const REFRESH_MARGIN_MS = 60 * 60 * 1000;
const RETRY_AFTER_MS = 60 * 1000;
const FIRST_WAIT_MS = 4000;

interface Session { token: string; expiresAt: number }

const sessions = new Map<string, Session>();
const inflight = new Map<string, Promise<Session | null>>();
const failedAt = new Map<string, number>();
let loaded: Promise<void> | null = null;

function load(): Promise<void> {
  if (!loaded) {
    loaded = AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!raw) return;
        for (const [wallet, s] of Object.entries(JSON.parse(raw) as Record<string, Session>)) {
          if (s?.token && s.expiresAt > Date.now() && !sessions.has(wallet)) sessions.set(wallet, s);
        }
      })
      .catch(() => undefined);
  }
  return loaded;
}

function save() {
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(sessions))).catch(() => undefined);
}

function fresh(wallet: string): Session | null {
  const s = sessions.get(wallet);
  return s && s.expiresAt - REFRESH_MARGIN_MS > Date.now() ? s : null;
}

async function mint(wallet: string, baseFetch: typeof fetch): Promise<Session | null> {
  await tokenRefreshManager.ensureFreshToken();
  const token = await getAuthToken();
  if (!token) return null;
  const res = await baseFetch(`${env.SUPABASE_URL}/functions/v1/wallet-session`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_PUBLISHABLE_KEY}`,
      "x-dehub-token": token,
      "x-wallet-address": wallet,
    },
    body: JSON.stringify({ client: Platform.OS, appVersion: Application.nativeApplicationVersion ?? undefined }),
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  if (!data?.token || String(data.wallet).toLowerCase() !== wallet) return null;
  const session = { token: String(data.token), expiresAt: new Date(data.expiresAt).getTime() };
  sessions.set(wallet, session);
  save();
  return session;
}

function ensure(wallet: string, baseFetch: typeof fetch): Promise<Session | null> {
  const have = fresh(wallet);
  if (have) return Promise.resolve(have);
  const failed = failedAt.get(wallet);
  if (failed && Date.now() - failed < RETRY_AFTER_MS) return Promise.resolve(sessions.get(wallet) ?? null);
  let pending = inflight.get(wallet);
  if (!pending) {
    pending = mint(wallet, baseFetch)
      .catch(() => null)
      .then((s) => {
        if (!s) failedAt.set(wallet, Date.now());
        inflight.delete(wallet);
        return s ?? sessions.get(wallet) ?? null;
      });
    inflight.set(wallet, pending);
  }
  return pending;
}

function timeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((r) => { timer = setTimeout(() => r(null), ms); });
  return Promise.race([p, late]).finally(() => clearTimeout(timer));
}

function readUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return (input as Request).url;
}

/** A fetch for supabase-js that signs wallet-scoped REST and storage requests. */
export function createWalletSessionFetch(baseFetch: typeof fetch = fetch): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = readUrl(input);
    const scoped = url.startsWith(env.SUPABASE_URL) && (url.includes("/rest/v1/") || url.includes("/storage/v1/"));
    if (!scoped) return baseFetch(input, init);
    const headers = new Headers(init?.headers);
    const wallet = headers.get("x-wallet-address")?.toLowerCase();
    if (!wallet || headers.has("x-wallet-session")) return baseFetch(input, init);
    await load();
    const valid = sessions.get(wallet);
    const usable = valid && valid.expiresAt - 30_000 > Date.now() ? valid : null;
    if (usable && !fresh(wallet)) void ensure(wallet, baseFetch);
    const session = usable ?? (await timeout(ensure(wallet, baseFetch), FIRST_WAIT_MS));
    if (!session) return baseFetch(input, init);
    headers.set("x-wallet-session", session.token);
    return baseFetch(input, { ...init, headers });
  };
}

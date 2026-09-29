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
import { reportError } from "./errorReporter";
import { tokenRefreshManager } from "./token-refresh";

const STORAGE_KEY = "dehub_wallet_sessions";
const REFRESH_MARGIN_MS = 60 * 60 * 1000;
const RETRY_AFTER_MS = 60 * 1000;
const FIRST_WAIT_MS = 4000;

interface Session { token: string; expiresAt: number }

/**
 * Why a wallet-scoped request went out without a session. Enforcement can only
 * be switched on once almost nothing lands here, so the reasons have to be told
 * apart: no_token is a sign-in problem, mint_error a server refusal or wallet
 * mismatch, timeout a mint that was merely slow.
 */
export type UnsignedReason = "no_token" | "mint_error" | "timeout";
interface MintFailure { reason: UnsignedReason; detail: string }

class MintError extends Error {
  constructor(readonly reason: UnsignedReason, detail: string) { super(detail); }
}

const sessions = new Map<string, Session>();
const inflight = new Map<string, Promise<Session | null>>();
const failedAt = new Map<string, number>();
const lastFailure = new Map<string, MintFailure>();
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
  if (!token) throw new MintError("no_token", "no DeHub token stored");
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
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // A 401 is the DeHub token itself being dead, not a server fault.
    const detail = `${res.status} ${data?.error ?? ""}`.trim();
    throw new MintError(res.status === 401 ? "no_token" : "mint_error", detail);
  }
  if (!data?.token) throw new MintError("mint_error", "response carried no session");
  if (String(data.wallet).toLowerCase() !== wallet) {
    throw new MintError("mint_error", "session minted for a different wallet");
  }
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
      .catch((e: unknown) => {
        lastFailure.set(wallet, e instanceof MintError
          ? { reason: e.reason, detail: e.message }
          : { reason: "mint_error", detail: e instanceof Error ? e.message : String(e) });
        return null;
      })
      .then((s) => {
        if (!s) failedAt.set(wallet, Date.now());
        inflight.delete(wallet);
        return s ?? sessions.get(wallet) ?? null;
      });
    inflight.set(wallet, pending);
  }
  return pending;
}

/**
 * Ask for the wallet's session now, skipping the back-off after a failed
 * mint. For a person pressing a button, not for background requests. Resolves
 * to null once the wallet is signed, otherwise to why it could not be.
 */
export async function retryWalletSession(wallet: string): Promise<UnsignedReason | null> {
  const w = wallet.toLowerCase();
  await load();
  failedAt.delete(w);
  const session = await ensure(w, fetch);
  if (session && session.expiresAt - 30_000 > Date.now()) return null;
  return lastFailure.get(w)?.reason ?? "mint_error";
}

const TIMED_OUT = Symbol("timed out");

function timeout<T>(p: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<typeof TIMED_OUT>((r) => { timer = setTimeout(() => r(TIMED_OUT), ms); });
  return Promise.race([p, late]).finally(() => clearTimeout(timer));
}

let reportedUnsigned = false;

/**
 * One row per app launch, the first time a wallet-scoped request goes out
 * unsigned. Enough to count the wallets affected and see why, without a
 * signed-out phone writing a row for every query it makes.
 */
function reportUnsigned(wallet: string, url: string, why: MintFailure) {
  if (reportedUnsigned) return;
  reportedUnsigned = true;
  // Not new URL(): React Native's URL has thrown on .pathname in the past.
  const path = url.slice(env.SUPABASE_URL.length).split("?")[0];
  reportError("WalletSession", [
    `Unsigned wallet request (${why.reason})`,
    { reason: why.reason, detail: why.detail.slice(0, 300), path, client: Platform.OS, wallet },
  ]);
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
    if (!session || session === TIMED_OUT) {
      reportUnsigned(wallet, url, session === TIMED_OUT
        ? { reason: "timeout", detail: `no session within ${FIRST_WAIT_MS}ms` }
        : lastFailure.get(wallet) ?? { reason: "mint_error", detail: "unknown" });
      return baseFetch(input, init);
    }
    headers.set("x-wallet-session", session.token);
    return baseFetch(input, { ...init, headers });
  };
}

/**
 * "Reserve now" on a free username: the name is held for this install for one
 * minute while the visitor signs up. The install is known only by a random
 * token kept here; the server stores nothing else. Mirrors dehubweb's
 * src/lib/username-hold.ts.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiClient } from "../libs";

const TOKEN_KEY = "dehub.usernameHold.token";
const HOLD_KEY = "dehub.usernameHold";

export interface UsernameHold {
  username: string;
  expiresAt: number;
}

export type HoldResponse =
  | { held: true; username: string; expiresAt: string; holdMs: number }
  | { held: false; username: string; reason: "invalid" | "taken" | "reserved" | "held"; expiresAt?: string };

let token: string | null = null;
let hold: UsernameHold | null = null;

// Warm the cache so sync readers (sign up save, username check) see a hold
// made before an app restart.
void (async () => {
  try {
    const [[, t], [, h]] = await AsyncStorage.multiGet([TOKEN_KEY, HOLD_KEY]);
    if (t && !token) token = t;
    if (h && !hold) hold = JSON.parse(h);
  } catch {
    /* storage unavailable: holds only last this session */
  }
})();

function makeToken(): string {
  try {
    const bytes = new Uint8Array(18);
    (globalThis as any).crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`.slice(0, 40).padEnd(20, "0");
  }
}

export function holdToken(): string {
  if (token && /^[A-Za-z0-9_-]{16,64}$/.test(token)) return token;
  token = makeToken();
  void AsyncStorage.setItem(TOKEN_KEY, token).catch(() => {});
  return token;
}

/** The name this install is holding right now, if the hold has not run out. */
export function currentHold(): UsernameHold | null {
  return hold && hold.expiresAt > Date.now() ? hold : null;
}

function saveHold(next: UsernameHold | null) {
  hold = next;
  if (next) void AsyncStorage.setItem(HOLD_KEY, JSON.stringify(next)).catch(() => {});
  else void AsyncStorage.removeItem(HOLD_KEY).catch(() => {});
}

export async function reserveUsername(username: string): Promise<HoldResponse> {
  const res = await apiClient.post<HoldResponse>(
    "/username/hold",
    { username, holdToken: holdToken() },
    { isAuthRequired: false },
  );
  if (res?.held) saveHold({ username: res.username, expiresAt: Date.parse(res.expiresAt) });
  return res;
}

/** Let go of the held name. Fire and forget: it runs out on its own anyway. */
export function releaseUsername(): void {
  const had = !!currentHold();
  saveHold(null);
  if (!had) return;
  void apiClient.post("/username/release", { holdToken: holdToken() }, { isAuthRequired: false }).catch(() => {});
}

/** Sent with the sign up save so the server lets this install take its held name. */
export function holdFieldFor(username: string | undefined | null): string | null {
  const live = currentHold();
  if (!live || !username || live.username !== String(username).trim().toLowerCase()) return null;
  return holdToken();
}

export function forgetHold(): void {
  saveHold(null);
}

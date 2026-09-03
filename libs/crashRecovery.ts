import { storage } from "./storage";

/**
 * What the app does after a fault instead of dying.
 *
 * Two things went wrong on 2026-09-03 that this exists to stop. A poisoned
 * entry in the persisted query cache made the first feed throw on every
 * launch, and the only recovery on offer was "Try Again", which re-rendered
 * the same poisoned data and threw again. And a fatal uncaught error still
 * went to React Native's default handler, which in a release build ends the
 * process — the user sees the app vanish, and nothing on screen says why.
 *
 * Recovery here is deliberately blunt: throw the persisted cache away (it is
 * a convenience, the network has the truth) and reload the JS runtime with
 * expo-updates, which is a restart without the process dying. Both are
 * budgeted so a fault that survives a restart cannot loop the app forever.
 */

/** Must match the persister key in config/queryClient.ts. */
export const QUERY_CACHE_KEY = "dehub-query-cache";

const RESTART_LOG_KEY = "crash-recovery-restarts-v1";
const LAST_CRASH_KEY = "crash-recovery-last-v1";

/** More than this many restarts inside the window and the fault is not one a restart fixes. */
export const MAX_RESTARTS_IN_WINDOW = 3;
export const RESTART_WINDOW_MS = 5 * 60_000;

export interface CrashMarker {
  reason: string;
  message: string;
  at: number;
}

/**
 * Drop the on-disk query cache. The next launch starts from the network.
 * Safe to call at any time — including from the fatal handler, where the
 * runtime is about to be reloaded and nothing else can be trusted.
 */
export function dropPersistedQueryCache(): void {
  try {
    storage.delete(QUERY_CACHE_KEY);
  } catch {
    /* MMKV unavailable — nothing to drop */
  }
}

function readRestarts(now: number): number[] {
  try {
    const raw = storage.getString(RESTART_LOG_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(list)) return [];
    return list.filter((t): t is number => typeof t === "number" && now - t < RESTART_WINDOW_MS);
  } catch {
    return [];
  }
}

/** How many automatic restarts have happened inside the current window. */
export function restartsInWindow(now: number = Date.now()): number {
  return readRestarts(now).length;
}

/**
 * Claim one automatic restart. False when the budget for the window is spent,
 * in which case the caller should let the fault surface rather than loop.
 */
export function claimRestart(now: number = Date.now()): boolean {
  const recent = readRestarts(now);
  if (recent.length >= MAX_RESTARTS_IN_WINDOW) return false;
  recent.push(now);
  try {
    storage.set(RESTART_LOG_KEY, JSON.stringify(recent));
  } catch {
    /* if the counter cannot be written, still allow this one */
  }
  return true;
}

/** Leave a note for the next launch saying why this one ended. */
export function writeCrashMarker(marker: CrashMarker): void {
  try {
    storage.set(LAST_CRASH_KEY, JSON.stringify(marker));
  } catch {
    /* nothing to do */
  }
}

/** Read and clear the note the previous launch left, if any. */
export function takeCrashMarker(): CrashMarker | null {
  try {
    const raw = storage.getString(LAST_CRASH_KEY);
    if (!raw) return null;
    storage.delete(LAST_CRASH_KEY);
    const parsed = JSON.parse(raw) as Partial<CrashMarker>;
    if (typeof parsed?.reason !== "string") return null;
    return {
      reason: parsed.reason,
      message: typeof parsed.message === "string" ? parsed.message : "",
      at: typeof parsed.at === "number" ? parsed.at : 0,
    };
  } catch {
    return null;
  }
}

/**
 * Reload the JS runtime. Resolves false when it could not — in development,
 * where the red box is the better tool; when the restart budget is spent; or
 * when expo-updates is not available (Expo Go, a test).
 *
 * `userInitiated` skips the budget: a person pressing "Restart app" is
 * entitled to as many as they like.
 */
export async function restartApp(
  reason: string,
  message = "",
  options: { userInitiated?: boolean } = {},
): Promise<boolean> {
  const dev = typeof __DEV__ !== "undefined" && __DEV__;
  if (!options.userInitiated) {
    if (dev) return false;
    if (!claimRestart()) return false;
  }
  dropPersistedQueryCache();
  writeCrashMarker({ reason, message: message.slice(0, 500), at: Date.now() });
  try {
    // Required lazily: the module binds to native code at import, which a
    // test runner does not have, and nothing else in the app needs it loaded
    // before a fault actually happens.
    const Updates = require("expo-updates") as { reloadAsync: () => Promise<void> };
    await Updates.reloadAsync();
    return true;
  } catch {
    return false;
  }
}

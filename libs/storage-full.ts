import AsyncStorage from "@react-native-async-storage/async-storage";
import { storage } from "./storage";

/**
 * Android keeps AsyncStorage in one SQLite file capped at 6 MB. When it is full
 * every write throws "database or disk is full (code 13 SQLITE_FULL)", and the
 * first write that matters is the login session. These helpers make sure a full
 * store never blocks sign-in: free our own disposable caches, retry, and as a
 * last resort keep the value in MMKV (a plain file with no size cap).
 */
export function isStorageFullError(error: unknown): boolean {
  const message =
    typeof error === "string"
      ? error
      : typeof (error as { message?: unknown })?.message === "string"
        ? (error as { message: string }).message
        : "";
  return /SQLITE_FULL|disk is full|database or disk|ENOSPC|no space left|quota/i.test(message);
}

// Keys that only hold re-downloadable or re-buildable data. Never the session,
// wallets, drafts or settings.
const DISPOSABLE_PREFIXES = [
  "locale-pack:",
  "msg-cache-v1:",
  "dm-cache-v2:",
  "error_reporter_",
];

let freeing: Promise<number> | null = null;

/** Remove disposable caches from AsyncStorage. Returns how many keys went. */
export function freeAsyncStorageSpace(): Promise<number> {
  if (freeing) return freeing;
  freeing = (async () => {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const drop = keys.filter((k) => DISPOSABLE_PREFIXES.some((p) => k.startsWith(p)));
      if (drop.length) await AsyncStorage.multiRemove(drop);
      return drop.length;
    } catch {
      return 0;
    }
  })().finally(() => {
    freeing = null;
  });
  return freeing;
}

const FALLBACK_PREFIX = "asfallback:";

/**
 * AsyncStorage-shaped store for values that must always save (the Supabase
 * session). Writes that AsyncStorage refuses land in MMKV instead.
 */
export const resilientAsyncStorage = {
  async getItem(key: string): Promise<string | null> {
    // The MMKV copy only exists while AsyncStorage refused the newest write,
    // so it is always the fresher one.
    const fallback = storage.getString(FALLBACK_PREFIX + key);
    if (fallback !== undefined) return fallback;
    try {
      return await AsyncStorage.getItem(key);
    } catch {
      return null;
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    try {
      await AsyncStorage.setItem(key, value);
      storage.delete(FALLBACK_PREFIX + key);
      return;
    } catch (error) {
      if (isStorageFullError(error)) {
        await freeAsyncStorageSpace();
        try {
          await AsyncStorage.setItem(key, value);
          storage.delete(FALLBACK_PREFIX + key);
          return;
        } catch {
          // still full: keep it in MMKV below
        }
      }
    }
    storage.set(FALLBACK_PREFIX + key, value);
  },
  async removeItem(key: string): Promise<void> {
    storage.delete(FALLBACK_PREFIX + key);
    try {
      await AsyncStorage.removeItem(key);
    } catch {
      // nothing left to remove
    }
  },
};

/** Drop MMKV fallback copies whose original key matches, e.g. on sign-out. */
export function clearFallbackKeys(
  match: (key: string, value: string) => boolean,
): void {
  try {
    for (const full of storage.getAllKeys()) {
      if (!full.startsWith(FALLBACK_PREFIX)) continue;
      const key = full.slice(FALLBACK_PREFIX.length);
      if (match(key, storage.getString(full) ?? "")) storage.delete(full);
    }
  } catch {
    // nothing to clear
  }
}

/**
 * Everything the app can safely throw away to make room: the disposable
 * AsyncStorage caches, the saved feed and the image disk cache. Never the
 * session, wallets, drafts or settings.
 */
export async function clearAppCaches(): Promise<void> {
  await freeAsyncStorageSpace();
  try {
    storage.delete("dehub-query-cache");
  } catch {
    // feed cache already gone
  }
  try {
    const { Image } = await import("expo-image");
    await Image.clearDiskCache();
  } catch {
    // image cache unavailable
  }
}

import { MMKV } from "react-native-mmkv";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Fast synchronous storage for hot paths (media settings, query cache).
// AsyncStorage stays for everything else; move keys over only when the
// sync/speed win matters.
export const storage = new MMKV({ id: "dehub" });

const MIGRATION_FLAG = "storage-migrated-v1";

// Keys that used to live in AsyncStorage and now live in MMKV.
const MIGRATED_KEYS = ["video-muted", "audio-hue", "dehub:defaultCategory"];

// One-time copy of known keys from AsyncStorage so existing users keep
// their settings. Idempotent and cheap after the first run.
export async function migrateFromAsyncStorage(): Promise<void> {
  if (storage.getBoolean(MIGRATION_FLAG)) return;
  try {
    const pairs = await AsyncStorage.multiGet(MIGRATED_KEYS);
    for (const [key, value] of pairs) {
      if (value !== null && storage.getString(key) === undefined) {
        storage.set(key, value);
      }
    }
  } catch {
    // If AsyncStorage is unreadable, fall through — defaults apply and the
    // flag prevents retrying forever.
  }
  storage.set(MIGRATION_FLAG, true);
}

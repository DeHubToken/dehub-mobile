/**
 * Feed interests — the topics a new account picks while signing up.
 *
 * Picked on the "Your interests" step of the welcome flow
 * (screens/auth/SetProfileScreen.tsx) and put first in every category list,
 * which all come through getCategoriesCached.
 *
 * Saved as `feedInterests` in `user_display_preferences.preferences`, the same
 * blob web reads (dehubweb lib/feed-interests.ts), so the choice follows the
 * account to the site and back. AsyncStorage keeps a device copy.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

export const FEED_INTERESTS_PREF = "feedInterests";
const STORAGE_KEY = "dehub.feedInterests";
const MAX_INTERESTS = 12;

export type InterestTopic = { id: string; cover?: number };

/** Same list and order as web. Every id is a live category with posts. */
export const INTEREST_TOPICS: readonly InterestTopic[] = [
  { id: "music", cover: require("../assets/login-stack/concert.jpg") },
  { id: "art", cover: require("../assets/login-stack/366621225937192975.jpg") },
  { id: "gaming", cover: require("../assets/welcome/gaming.jpg") },
  { id: "crypto", cover: require("../assets/welcome/crypto.jpg") },
  { id: "sports", cover: require("../assets/login-stack/skate.jpg") },
  { id: "travel", cover: require("../assets/login-stack/restyle.jpg") },
  { id: "comedy", cover: require("../assets/login-stack/friends.jpg") },
  { id: "film", cover: require("../assets/welcome/film.jpg") },
  { id: "anime", cover: require("../assets/login-stack/693413673891637586.jpg") },
  { id: "cars", cover: require("../assets/welcome/cars.jpg") },
  { id: "podcast", cover: require("../assets/login-stack/bass.jpg") },
  { id: "animals" },
  { id: "tech" },
  { id: "food" },
  { id: "news" },
  { id: "science" },
];

export function topicCover(id: string): number | undefined {
  return INTEREST_TOPICS.find((t) => t.id === id)?.cover;
}

function clean(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const v of value) {
    if (typeof v !== "string") continue;
    const name = v.trim().toLowerCase();
    if (name && !out.includes(name)) out.push(name);
    if (out.length >= MAX_INTERESTS) break;
  }
  return out;
}

let current: string[] = [];
let loaded: Promise<void> | null = null;

/** Reads the device copy once. Category lists wait on it before ordering. */
export function loadFeedInterests(): Promise<void> {
  if (!loaded) {
    loaded = AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => { if (raw) current = clean(JSON.parse(raw)); })
      .catch(() => {});
  }
  return loaded;
}

export function getFeedInterests(): string[] {
  return current;
}

export async function setFeedInterests(next: string[]): Promise<string[]> {
  current = clean(next);
  loaded = Promise.resolve();
  try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(current)); } catch { /* memory copy stands */ }
  return current;
}

/** Picked interests first, in the order picked, then the rest as they came. */
export function orderByInterests(categories: string[], interests: string[] = current): string[] {
  if (!interests.length || !categories.length) return categories;
  const rank = new Map(interests.map((name, i) => [name, i]));
  const picked = categories.filter((c) => rank.has(c.toLowerCase()));
  if (!picked.length) return categories;
  picked.sort((a, b) => (rank.get(a.toLowerCase()) ?? 0) - (rank.get(b.toLowerCase()) ?? 0));
  return [...picked, ...categories.filter((c) => !rank.has(c.toLowerCase()))];
}

/**
 * Merges keys into the account's preferences blob. Read first, so web's own
 * keys (theme, language, layout) survive the write.
 */
export async function saveAccountPrefs(wallet: string, patch: Record<string, unknown>): Promise<void> {
  // Loaded on use: the category service imports this file, and the Supabase
  // client has no business being pulled in with it.
  const [{ supabase }, { withWalletHeader }] = await Promise.all([
    import("../services/supabase"),
    import("./supabase-wallet-client"),
  ]);
  const address = wallet.toLowerCase();
  const { data, error } = await withWalletHeader(
    supabase.from("user_display_preferences").select("preferences").eq("wallet_address", address).maybeSingle(),
    address,
  );
  if (error) throw error;
  const existing = (data as { preferences?: unknown } | null)?.preferences;
  const preferences = { ...(existing && typeof existing === "object" ? existing : {}), ...patch };
  const { error: writeError } = await withWalletHeader(
    supabase
      .from("user_display_preferences")
      .upsert({ wallet_address: address, preferences } as any, { onConflict: "wallet_address" }),
    address,
  );
  if (writeError) throw writeError;
}

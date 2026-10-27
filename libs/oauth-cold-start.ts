/**
 * A sign-in page that comes back to a fresh launch of the app.
 *
 * Google, Apple and Telegram sign-in open a browser page and wait for it to
 * return to dehub://auth-callback with the identity in the fragment. On a
 * phone short on memory, Android can close the app while that page is open
 * (an account picker, a 2-step prompt in another app). The page still comes
 * back, but to a new launch where nothing is waiting for it, and the link was
 * dropped: the person finished Google and landed on Home signed out.
 *
 * The launch link is held here, linking.config opens the sign-in screen for
 * it, and the sign-in screen finishes it once.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const RESUMED_KEY = "dehub_oauth_resumed";
/** Only straight after the launch the page came back on. */
const MAX_AGE_MS = 10 * 60 * 1000;

let held: { url: string; at: number } | null = null;

/** Stable fingerprint of the identity a callback carries; null when it carries none. */
function identityKey(url: string): string | null {
  const hash = url.indexOf("#");
  if (hash < 0) return null;
  const path = url.slice(0, hash).split("?")[0];
  if (!/(^|[/:])auth-callback\/?$/.test(path)) return null;
  const params = new URLSearchParams(url.slice(hash + 1));
  const key = params.get("access_token") && params.get("refresh_token")
    ? params.get("refresh_token")
    : params.get("tgAuthResult");
  if (!key) return null;
  // A fingerprint, so a used token is not written to storage a second time.
  let h = 5381;
  for (let i = 0; i < key.length; i++) h = ((h << 5) + h + key.charCodeAt(i)) | 0;
  return `${key.length}:${(h >>> 0).toString(36)}`;
}

/**
 * Holds the link the app was launched with when it is a sign-in page coming
 * back. False for any other link, and for one already finished: a reload
 * (an update applying) hands the launch link over again.
 */
export async function holdLaunchCallback(url: string): Promise<boolean> {
  const key = identityKey(url);
  if (!key) return false;
  const done = await AsyncStorage.getItem(RESUMED_KEY).catch(() => null);
  if (done === key) return false;
  held = { url, at: Date.now() };
  return true;
}

export function hasHeldCallback(): boolean {
  return !!held && Date.now() - held.at < MAX_AGE_MS;
}

/** The held link, once. Marked finished so no later launch resumes it again. */
export function takeHeldCallback(): string | null {
  const taken = held;
  held = null;
  if (!taken || Date.now() - taken.at >= MAX_AGE_MS) return null;
  const key = identityKey(taken.url);
  if (key) AsyncStorage.setItem(RESUMED_KEY, key).catch(() => undefined);
  return taken.url;
}

/** The link with its fragment hidden, for logs. */
export function withoutFragment(url: string): string {
  const hash = url.indexOf("#");
  return hash < 0 ? url : `${url.slice(0, hash)}#…`;
}

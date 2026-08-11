import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";

/**
 * Anonymous views — views from visitors with no DeHub session.
 * ===========================================================
 * The DeHub API requires a valid JWT on /record-view and /view/batch (no header
 * → 400 "Invalid signature", bad token → 401), so a signed-out user browsing the
 * feed would record nothing. Those views go to the `anon-views` Supabase edge
 * function instead — the same function the web app uses, so a post's anonymous
 * count is shared across web and mobile.
 *
 * A signed-in user only ever hits the DeHub API and a signed-out one only ever
 * hits this, so nobody is counted twice. Server-side dedup is one view per
 * viewer per post per UTC day, where the viewer is a salted hash of the device
 * id below plus the request IP.
 *
 * Recording only. The edge function forwards what it records to the DeHub API,
 * which folds it into the post's `totalViews`, so that is where the count is
 * read back from — see resolveViewCount in libs/numbers.util. This module used
 * to expose a fetchAnonViewCounts() the cards added on at display time, which
 * made the count arrive in two pieces and double-count whenever the base it was
 * added to already included the anonymous half.
 */

const DEVICE_ID_KEY = "dhb_anon_view_id";

export interface AnonViewRecordResponse {
  success: boolean;
  recorded: number;
  submitted: number;
}

let cachedDeviceId: string | null = null;

function generateId(): string {
  // No crypto.randomUUID on all RN runtimes; this only needs to be unique
  // enough to separate devices sharing an IP, and it is hashed with a secret
  // salt server-side before storage.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}-${Math.random()
    .toString(36)
    .slice(2, 12)}`;
}

/**
 * A stable per-install id used only for view dedup. Persisted in AsyncStorage;
 * falls back to a per-process id if storage is unavailable so tracking still
 * works.
 */
export async function getAnonViewerId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;

  try {
    const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (existing) {
      cachedDeviceId = existing;
      return cachedDeviceId;
    }

    const created = generateId();
    await AsyncStorage.setItem(DEVICE_ID_KEY, created);
    cachedDeviceId = created;
    return cachedDeviceId;
  } catch (e) {
    console.warn("[AnonView] Failed to persist device id", e);
    cachedDeviceId = generateId();
    return cachedDeviceId;
  }
}

/**
 * Record anonymous views for one or more posts. Returns null on failure — view
 * tracking is best-effort and never surfaces an error to the user.
 */
export async function recordAnonViews(
  tokenIds: (string | number)[],
): Promise<AnonViewRecordResponse | null> {
  if (tokenIds.length === 0) return null;

  try {
    const deviceId = await getAnonViewerId();
    const { data, error } = await supabase.functions.invoke("anon-views", {
      body: { tokenIds: tokenIds.map(String), deviceId },
    });

    if (error) {
      console.error("[AnonView] record failed", error);
      return null;
    }

    return data as AnonViewRecordResponse;
  } catch (e) {
    console.error("[AnonView] record error", e);
    return null;
  }
}

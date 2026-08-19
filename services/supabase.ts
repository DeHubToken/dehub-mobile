import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import env from "../config/env";
// The token accessor directly, not services/ai.service's dehubAuthHeaders:
// that module imports nothing from here today, but a service importing a
// sibling service to reach a two-line helper is how import cycles start.
import { getAuthToken } from "../libs/auth.utils";

export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

/**
 * Fetch an Agora RTC token from the Supabase edge function.
 * Reuses the same `agora-token` edge function as the web app.
 *
 * A subscriber token stays anonymous — that is what lets a listener (and, on
 * web, a signed-out visitor on an invite link) hear a room with nothing but the
 * publishable key. A publisher token is gated on the caller holding a
 * host/speaker seat in that stage, so identify ourselves whenever we ask to
 * speak. The wallet header is only a cross-check; the function takes the
 * address off the verified token.
 */
export async function fetchAgoraToken(
  channelName: string,
  role: "publisher" | "subscriber" = "publisher",
  uid: number = 0,
  walletAddress?: string | null,
): Promise<{ token: string; appId: string; uid: number }> {
  const headers: Record<string, string> = {};
  if (role === "publisher") {
    const authToken = await getAuthToken();
    if (authToken) {
      headers["x-dehub-token"] = authToken;
      if (walletAddress) headers["x-wallet-address"] = walletAddress.toLowerCase();
    }
  }
  const { data, error } = await supabase.functions.invoke("agora-token", {
    body: { channelName, role, uid },
    ...(Object.keys(headers).length ? { headers } : {}),
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  if (!data?.appId || !data?.token) throw new Error("Agora credentials not configured");
  return { token: data.token, appId: data.appId, uid: data.uid ?? uid };
}

import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import env from "../config/env";

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
 */
export async function fetchAgoraToken(
  channelName: string,
  role: "publisher" | "subscriber" = "publisher",
  uid: number = 0,
): Promise<{ token: string; appId: string; uid: number }> {
  const { data, error } = await supabase.functions.invoke("agora-token", {
    body: { channelName, role, uid },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  if (!data?.appId || !data?.token) throw new Error("Agora credentials not configured");
  return { token: data.token, appId: data.appId, uid: data.uid ?? uid };
}

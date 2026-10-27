/**
 * Pulls the account's feed interests (lib/feed-interests) on sign-in, the way
 * useShortsServerSync does for Shorts.
 */
import { useEffect } from "react";
import { supabase } from "../services/supabase";
import { withWalletHeader } from "../libs/supabase-wallet-client";
import { useUser } from "../context/AuthContext";
import { FEED_INTERESTS_PREF, setFeedInterests } from "../libs/feed-interests";

/** Pulls the account's interests once per signed-in wallet. Server wins. */
export function useFeedInterestsServerSync(): void {
  const user = useUser() as any;
  const wallet = ((user?.walletAddress || user?.address || "") as string).toLowerCase();
  useEffect(() => {
    if (!wallet) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await withWalletHeader(
          supabase.from("user_display_preferences").select("preferences").eq("wallet_address", wallet).maybeSingle(),
          wallet,
        );
        if (cancelled || error) return;
        const value = ((data as { preferences?: Record<string, unknown> } | null)?.preferences ?? {})[FEED_INTERESTS_PREF];
        if (Array.isArray(value)) await setFeedInterests(value);
      } catch {
        /* the device copy stands */
      }
    })();
    return () => { cancelled = true; };
  }, [wallet]);
}

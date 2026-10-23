/**
 * Shorts on/off, kept in step with the account.
 *
 * Web saves this to `user_display_preferences.shorts_enabled` (see dehubweb
 * contexts/ShortsEnabledContext.tsx) so it follows the account. The app keeps
 * its device copy in useAppPrefs (`shorts`) for an instant first paint, and
 * this hook pulls the account value on sign-in and writes it back on toggle,
 * so turning Shorts off on either side turns it off on both.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "../services/supabase";
import { useUser } from "../context/AuthContext";
import { withWalletHeader } from "../libs/supabase-wallet-client";
import { setAppPref, useAppPrefs } from "./useAppPrefs";
import { toastError } from "../libs/toast";

function useWallet(): string | null {
  const user = useUser() as any;
  return ((user?.walletAddress || user?.address || "") as string).toLowerCase() || null;
}

/** Pulls the account's saved value once per signed-in wallet. Server wins. */
export function useShortsServerSync(): void {
  const wallet = useWallet();
  useEffect(() => {
    if (!wallet) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await withWalletHeader(
          supabase
            .from("user_display_preferences")
            .select("shorts_enabled")
            .eq("wallet_address", wallet)
            .maybeSingle(),
          wallet,
        );
        if (cancelled || error) return;
        const value = (data as { shorts_enabled?: unknown } | null)?.shorts_enabled;
        if (typeof value === "boolean") setAppPref("shorts", value);
      } catch {
        /* the device copy stands */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wallet]);
}

/** The toggle: flips at once, saves to the account, rolls back if the save fails. */
export function useShortsEnabled() {
  const { shorts } = useAppPrefs();
  const wallet = useWallet();
  const [saving, setSaving] = useState(false);

  const setShortsEnabled = useCallback(
    async (value: boolean) => {
      const previous = shorts;
      setAppPref("shorts", value);
      if (!wallet) return;
      setSaving(true);
      try {
        const { error } = await withWalletHeader(
          supabase
            .from("user_display_preferences")
            .upsert({ wallet_address: wallet, shorts_enabled: value } as any, { onConflict: "wallet_address" }),
          wallet,
        );
        if (error) throw error;
      } catch {
        setAppPref("shorts", previous);
        toastError("Failed to save Shorts preference");
      } finally {
        setSaving(false);
      }
    },
    [shorts, wallet],
  );

  return { shortsEnabled: shorts, setShortsEnabled, saving };
}

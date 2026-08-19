/**
 * Stage reminders (mobile)
 * ========================
 * One row per (stage, wallet): "tell me when this starts". A mirror of
 * dehubweb's `useStageReminder`, against the same table.
 *
 * Until this existed a phone user could not set a reminder at all — the bell
 * was web-only — so every mobile-only account was structurally unreachable by
 * the stage notifications the server has been writing since #264. The rows also
 * feed web's pre-audience, so a reminder set here shows that wallet in the
 * room's crowd the moment the host goes live.
 *
 * Both writes carry the wallet header: DELETE has always been gated on
 * `get_request_wallet_address()`, and INSERT becomes gated by
 * 20260819180000_stage_write_policies.sql. Without it the un-remind silently
 * does nothing — the row stays and the bell springs back on the next refetch.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../services/supabase";
import { useAuth } from "../context/AuthContext";
import { withWalletHeader } from "../libs/supabase-wallet-client";
import { toastError, toastSuccess } from "../libs/toast";
import { createLogger } from "../libs/logger";

const log = createLogger("useStageReminder");

export const stageReminderKeys = {
  all: ["stage-reminders"] as const,
  /** Keyed by wallet so switching accounts cannot serve the previous one's row. */
  forStage: (spaceId: string, wallet?: string | null) =>
    [...stageReminderKeys.all, spaceId, wallet?.toLowerCase() ?? null] as const,
};

export function useStageReminder(spaceId: string | undefined) {
  const { user } = useAuth();
  const walletAddress = user?.walletAddress || user?.address || "";
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: stageReminderKeys.forStage(spaceId ?? "", walletAddress),
    enabled: !!spaceId && !!walletAddress,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stage_reminders")
        .select("id")
        .eq("space_id", spaceId!)
        .eq("wallet_address", walletAddress.toLowerCase())
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const toggle = useMutation({
    mutationFn: async (): Promise<boolean | undefined> => {
      if (!spaceId || !walletAddress) return undefined;
      if (query.data) {
        const { error } = await withWalletHeader(
          supabase
            .from("stage_reminders")
            .delete()
            .eq("space_id", spaceId)
            .eq("wallet_address", walletAddress.toLowerCase()),
          walletAddress,
        );
        if (error) throw error;
        return false;
      }
      const { error } = await withWalletHeader(
        supabase
          .from("stage_reminders")
          .insert({ space_id: spaceId, wallet_address: walletAddress.toLowerCase() }),
        walletAddress,
      );
      if (error) throw error;
      return true;
    },
    onSuccess: (nowSet) => {
      void queryClient.invalidateQueries({ queryKey: stageReminderKeys.all });
      if (nowSet === true) toastSuccess("Reminder set — you'll be told when it starts");
      if (nowSet === false) toastSuccess("Reminder removed");
    },
    onError: (err) => {
      log.error("Failed to toggle stage reminder:", err);
      toastError("Could not update the reminder");
    },
  });

  return {
    /** Whether the signed-in wallet holds a reminder for this stage. */
    hasReminder: !!query.data,
    isLoading: query.isLoading,
    canRemind: !!walletAddress,
    toggleReminder: () => toggle.mutate(),
    isToggling: toggle.isPending,
  };
}

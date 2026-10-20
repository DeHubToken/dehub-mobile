import { useTranslation as _useCopy } from 'react-i18next';
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
import { getAccountSummaries } from "../services/user.service";

const log = createLogger("useStageReminder");

export const stageReminderKeys = {
  all: ["stage-reminders"] as const,
  /** Keyed by wallet so switching accounts cannot serve the previous one's row. */
  forStage: (spaceId: string, wallet?: string | null) =>
    [...stageReminderKeys.all, spaceId, wallet?.toLowerCase() ?? null] as const,
};

export function useStageReminder(spaceId: string | undefined) {
  const { t: _copy } = _useCopy();
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
      if (nowSet === true) toastSuccess(_copy("copy.f0199bd77184", { defaultValue: "Reminder set — you'll be told when it starts" }));
      if (nowSet === false) toastSuccess(_copy("copy.b2afd441461d", { defaultValue: "Reminder removed" }));
    },
    onError: (err) => {
      log.error("Failed to toggle stage reminder:", err);
      toastError(_copy("copy.e7a148aa735e", { defaultValue: "Could not update the reminder" }));
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

/** Reminder rows pulled per stage; the total comes from the same query's count. */
const FACE_CANDIDATES = 16;
/** Avatars drawn on a card; anyone beyond this lands in the trailing +N. */
const FACES_SHOWN = 10;

export interface StageReminderFace {
  address: string;
  username?: string;
  avatarUrl?: string;
}

/**
 * Who is waiting on a stage: a few faces plus the true total. Mirrors web's
 * `useStageReminderFaces`, but resolves every face with one
 * `/account_info/batch` call instead of a request per address. Order is the
 * order people pressed the bell. A failed lookup keeps the count and drops
 * the faces.
 */
export function useStageReminderFaces(spaceId: string | undefined) {
  const query = useQuery({
    queryKey: [...stageReminderKeys.all, "faces", spaceId ?? ""] as const,
    enabled: !!spaceId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, count, error } = await supabase
        .from("stage_reminders")
        .select("wallet_address", { count: "exact" })
        .eq("space_id", spaceId!)
        .order("created_at", { ascending: true })
        .limit(FACE_CANDIDATES);
      if (error) throw error;
      const addresses: string[] = (data ?? [])
        .map((row: { wallet_address: string | null }) => row.wallet_address)
        .filter((address): address is string => !!address);
      let faces: StageReminderFace[] = [];
      try {
        const summaries = await getAccountSummaries(addresses);
        const byAddress = new Map(summaries.map((s) => [s.address.toLowerCase(), s]));
        faces = addresses
          .map((address) => byAddress.get(address.toLowerCase()))
          .filter((s): s is NonNullable<typeof s> => !!s && !s.isBanned)
          .map((s) => ({
            address: s.address,
            username: s.username?.replace(/^@+/, "") || undefined,
            avatarUrl: s.avatarImageUrl || undefined,
          }));
      } catch (err) {
        log.warn("Could not resolve stage reminder faces:", err);
      }
      return { faces: faces.slice(0, FACES_SHOWN), total: count ?? 0 };
    },
  });

  return { faces: query.data?.faces ?? [], total: query.data?.total ?? 0 };
}

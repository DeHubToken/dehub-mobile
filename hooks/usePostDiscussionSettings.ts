/**
 * Per-post discussion settings (Common Ground mode).
 *
 * Native port of dehubweb's `use-post-discussion-settings.ts`. One Supabase
 * row per (post, creator), written with the wallet header. The read side is
 * keyed on the post and then filtered against the post's minter by
 * `resolveDiscussionSettings` — see libs/discussion-settings for why the row
 * cannot be trusted on its own.
 */
import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../services/supabase";
import { withWalletHeader } from "../libs/supabase-wallet-client";
import { useUser } from "../context/AuthContext";
import {
  resolveDiscussionSettings,
  DEFAULT_DISCUSSION_SETTINGS,
  type DiscussionSettingsRow,
} from "../libs/discussion-settings";

const queryKeyFor = (tokenId: number | null) => ["post-discussion-settings", String(tokenId ?? "")] as const;

function numericTokenId(tokenId: string | number | null | undefined): number | null {
  if (tokenId === null || tokenId === undefined || tokenId === "") return null;
  const n = typeof tokenId === "number" ? tokenId : parseInt(String(tokenId), 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * The post's discussion settings, validated against its minter. Until the
 * minter is known the defaults are returned, so nothing flashes on and off.
 */
export function usePostDiscussionSettings(
  tokenId: string | number | null | undefined,
  minter: string | null | undefined,
  enabled: boolean = true,
) {
  const id = numericTokenId(tokenId);
  const query = useQuery({
    queryKey: queryKeyFor(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("post_discussion_settings")
        .select("token_id, creator_address, common_ground")
        .eq("token_id", id!);
      if (error) throw error;
      return (data || []) as DiscussionSettingsRow[];
    },
    enabled: id !== null && enabled,
    staleTime: 60_000,
    retry: 1,
  });

  const settings = query.data ? resolveDiscussionSettings(query.data, minter) : DEFAULT_DISCUSSION_SETTINGS;
  return { ...settings, isLoading: query.isLoading, rows: query.data ?? [] };
}

/** Creator-side write. The row is keyed on the wallet doing the writing. */
export function useSetCommonGround(tokenId: string | number | null | undefined) {
  const user = useUser();
  const walletAddress = user?.address || user?.walletAddress || null;
  const queryClient = useQueryClient();
  const id = numericTokenId(tokenId);

  return useMutation({
    mutationFn: async (on: boolean) => {
      if (id === null) throw new Error("No post to save settings for");
      if (!walletAddress) throw new Error("Connect a wallet to change this");
      const addr = walletAddress.toLowerCase();
      const { error } = await withWalletHeader(
        supabase
          .from("post_discussion_settings")
          .upsert(
            { token_id: id, creator_address: addr, common_ground: on },
            { onConflict: "token_id,creator_address" },
          ),
        walletAddress,
      );
      if (error) throw error;
      return on;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeyFor(id) });
    },
  });
}

/**
 * Threads this reader has already been through the Common Ground steps for.
 * Per app session (web keeps the same thing in sessionStorage): the same post
 * does not re-ask on every reply, a fresh launch does.
 */
const completedThreads = new Set<string>();

export function useCommonGroundCompletion(tokenId: string | number | null | undefined) {
  const key = String(tokenId ?? "");
  const isDone = useCallback(() => completedThreads.has(key), [key]);
  const markDone = useCallback(() => {
    completedThreads.add(key);
  }, [key]);
  return { isDone, markDone };
}

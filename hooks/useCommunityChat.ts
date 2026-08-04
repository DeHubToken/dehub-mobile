/**
 * Community chat data layer
 * =========================
 * Native port of web's use-community-chat.ts, against the same
 * `community_chat_messages` table, so a message sent on either client shows up
 * identically on the other. Structurally this is useTvChat plus the moderation
 * the community system needs: pinning, delete-anyone's-message, and the
 * restriction states (mute, slow mode, revoked send rights).
 *
 * Two things differ from useTvChat, both forced by the newer RLS:
 *
 * - The fetch carries the wallet header. A private community's history is no
 *   longer world-readable, so without it the list comes back empty for members
 *   too, silently.
 * - Private communities poll instead of relying on realtime. Replication
 *   evaluates the same SELECT policy but has no way to send a request header,
 *   so a private community receives no live events at all.
 */
import { useCallback, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../services/supabase";
import { useUser } from "../context/AuthContext";
import { withWalletHeader } from "../libs/supabase-wallet-client";
import {
  deleteCommunityMessage,
  pinCommunityMessage,
} from "../services/communities.service";
import { communityErrorMessage } from "../libs/community-permissions";
import { toastError, toastSuccess } from "../libs/toast";
import { createLogger } from "../libs/logger";
import type { CommunityChatMessage } from "../types/community";

const log = createLogger("useCommunityChat");

const QUERY_KEY = "community-chat-messages";
const PAGE_LIMIT = 200;

export function useCommunityChat(
  communityId: string | undefined,
  options?: { enabled?: boolean; isPrivate?: boolean },
) {
  const user = useUser() as any;
  const queryClient = useQueryClient();
  const walletAddress = (user?.walletAddress || user?.address || "") || null;
  const active = !!communityId && (options?.enabled ?? true);
  const isPrivate = !!options?.isPrivate;

  // The wallet is part of the key because the SELECT policy filters by it —
  // one account's visible history must not be served to the next.
  const key = useMemo(
    () => [QUERY_KEY, communityId, walletAddress] as const,
    [communityId, walletAddress],
  );

  const { data: rawMessages = [], isLoading } = useQuery({
    queryKey: key,
    queryFn: async () => {
      if (!communityId) return [] as CommunityChatMessage[];
      // Newest N, then flipped back to reading order — a community that has been
      // chatting for months should open on the current conversation.
      const { data, error } = await withWalletHeader(
        supabase
          .from("community_chat_messages")
          .select("*")
          .eq("community_id", communityId)
          .order("created_at", { ascending: false })
          .limit(PAGE_LIMIT),
        walletAddress,
      );
      if (error) throw error;
      return ((data || []) as unknown as CommunityChatMessage[]).slice().reverse();
    },
    enabled: active,
    staleTime: 30_000,
    refetchInterval: active && isPrivate ? 5_000 : false,
  });

  const messages: CommunityChatMessage[] = useMemo(() => {
    const byId = new Map(rawMessages.map((m) => [m.id, m]));
    return rawMessages.map((msg) => {
      if (!msg.reply_to_id) return msg;
      const parent = byId.get(msg.reply_to_id);
      if (!parent) return msg;
      return {
        ...msg,
        reply_to: {
          id: parent.id,
          content: parent.content || (parent.message_type === "gif" ? "GIF" : "Media"),
          sender_name: parent.display_name || parent.username || "User",
        },
      };
    });
  }, [rawMessages]);

  /** Newest pin wins, matching the single-pin banner the panel renders. */
  const pinnedMessage = useMemo(
    () =>
      messages
        .filter((m) => m.pinned_at)
        .sort((a, b) => (b.pinned_at ?? "").localeCompare(a.pinned_at ?? ""))[0] ?? null,
    [messages],
  );

  useEffect(() => {
    if (!active || isPrivate) return;
    const chan = supabase
      .channel(`community-chat-${communityId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "community_chat_messages",
          filter: `community_id=eq.${communityId}`,
        },
        (payload: any) => {
          if (payload.eventType === "INSERT") {
            queryClient.setQueryData<CommunityChatMessage[]>(key, (old = []) => {
              if (old.some((m) => m.id === payload.new.id)) return old;
              return [...old, payload.new as CommunityChatMessage];
            });
          } else if (payload.eventType === "UPDATE") {
            queryClient.setQueryData<CommunityChatMessage[]>(key, (old = []) =>
              old.map((m) =>
                m.id === payload.new.id ? { ...m, ...(payload.new as CommunityChatMessage) } : m,
              ),
            );
          } else if (payload.eventType === "DELETE") {
            queryClient.setQueryData<CommunityChatMessage[]>(key, (old = []) =>
              old.filter((m) => m.id !== payload.old.id),
            );
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(chan);
    };
  }, [active, isPrivate, communityId, queryClient, key]);

  const sendMessage = useCallback(
    async (content: string, replyToId?: string) => {
      if (!communityId || !walletAddress) return;
      const msg = {
        community_id: communityId,
        wallet_address: walletAddress.toLowerCase(),
        username: user?.username || null,
        display_name: user?.displayName || null,
        avatar_url: user?.avatarImageUrl || user?.avatarUrl || null,
        badge_balance: user?.badgeBalance ?? null,
        content,
        message_type: "text",
        image_url: null,
        reply_to_id: replyToId || null,
        reactions: {},
      };

      const { error } = await withWalletHeader(
        supabase.from("community_chat_messages").insert(msg as any),
        walletAddress,
      );
      if (error) {
        log.error("send failed", error);
        // Slow mode, mute and revoked send rights all arrive here as raised
        // conditions — say which one rather than a generic failure.
        toastError(communityErrorMessage(error, "Failed to send message"));
        throw error;
      }
    },
    [communityId, walletAddress, user],
  );

  const editMessage = useCallback(
    async (messageId: string, newContent: string) => {
      if (!walletAddress || !communityId) return;
      const trimmed = newContent.trim();
      if (!trimmed) return;

      const prev = queryClient.getQueryData<CommunityChatMessage[]>(key);
      queryClient.setQueryData<CommunityChatMessage[]>(key, (old = []) =>
        old.map((m) => (m.id === messageId ? { ...m, content: trimmed } : m)),
      );

      const { error } = await withWalletHeader(
        supabase
          .from("community_chat_messages")
          .update({ content: trimmed } as any)
          .eq("id", messageId)
          .eq("wallet_address", walletAddress.toLowerCase()),
        walletAddress,
      );
      if (error) {
        log.error("edit failed", error);
        toastError(communityErrorMessage(error, "Failed to edit message"));
        if (prev) queryClient.setQueryData(key, prev);
        // Rethrow like sendMessage does, so the composer can keep the revised
        // text for a retry instead of clearing it on a refusal.
        throw error;
      }
    },
    [walletAddress, communityId, queryClient, key],
  );

  const reactionWrite = useCallback(
    async (messageId: string, reactions: Record<string, string[]>, fallback: string) => {
      if (!walletAddress) return;
      const prev = queryClient.getQueryData<CommunityChatMessage[]>(key);
      queryClient.setQueryData<CommunityChatMessage[]>(key, (old = []) =>
        old.map((m) => (m.id === messageId ? { ...m, reactions } : m)),
      );

      const { error } = await withWalletHeader(
        supabase
          .from("community_chat_messages")
          .update({ reactions } as any)
          .eq("id", messageId),
        walletAddress,
      );
      if (error) {
        toastError(communityErrorMessage(error, fallback));
        if (prev) queryClient.setQueryData(key, prev);
      }
    },
    [walletAddress, queryClient, key],
  );

  const addReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!walletAddress) return;
      const msg = rawMessages.find((m) => m.id === messageId);
      if (!msg) return;
      const reactions = { ...(msg.reactions || {}) };
      const addresses = reactions[emoji] || [];
      if (addresses.some((a) => a.toLowerCase() === walletAddress.toLowerCase())) return;
      reactions[emoji] = [...addresses, walletAddress.toLowerCase()];
      await reactionWrite(messageId, reactions, "Failed to react");
    },
    [rawMessages, walletAddress, reactionWrite],
  );

  const removeReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!walletAddress) return;
      const msg = rawMessages.find((m) => m.id === messageId);
      if (!msg) return;
      const reactions = { ...(msg.reactions || {}) };
      const addresses = reactions[emoji] || [];
      reactions[emoji] = addresses.filter((a) => a.toLowerCase() !== walletAddress.toLowerCase());
      if (reactions[emoji].length === 0) delete reactions[emoji];
      await reactionWrite(messageId, reactions, "Failed to remove reaction");
    },
    [rawMessages, walletAddress, reactionWrite],
  );

  /** Own message, or a moderator deleting anyone's. Raises on refusal. */
  const deleteMessage = useCallback(
    async (messageId: string) => {
      if (!walletAddress || !communityId) return;
      const prev = queryClient.getQueryData<CommunityChatMessage[]>(key);
      queryClient.setQueryData<CommunityChatMessage[]>(key, (old = []) =>
        old.filter((m) => m.id !== messageId),
      );
      try {
        await deleteCommunityMessage(walletAddress, messageId);
      } catch (error) {
        log.error("delete failed", error);
        toastError(communityErrorMessage(error, "Failed to delete message"));
        if (prev) queryClient.setQueryData(key, prev);
      }
    },
    [walletAddress, communityId, queryClient, key],
  );

  const setPinned = useCallback(
    async (messageId: string, pinned: boolean) => {
      if (!walletAddress || !communityId) return;
      try {
        await pinCommunityMessage(walletAddress, messageId, pinned);
        queryClient.setQueryData<CommunityChatMessage[]>(key, (old = []) =>
          old.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  pinned_at: pinned ? new Date().toISOString() : null,
                  pinned_by: pinned ? walletAddress.toLowerCase() : null,
                }
              : m,
          ),
        );
        toastSuccess(pinned ? "Message pinned" : "Message unpinned");
      } catch (error) {
        toastError(
          communityErrorMessage(error, pinned ? "Failed to pin message" : "Failed to unpin message"),
        );
      }
    },
    [walletAddress, communityId, queryClient, key],
  );

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: [QUERY_KEY, communityId] });
  }, [queryClient, communityId]);

  return {
    messages,
    pinnedMessage,
    isLoading,
    sendMessage,
    editMessage,
    deleteMessage,
    setPinned,
    addReaction,
    removeReaction,
    refresh,
  };
}

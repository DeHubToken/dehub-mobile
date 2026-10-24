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
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation as _useCopy } from 'react-i18next';
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../services/supabase";
import { useUser } from "../context/AuthContext";
import { withWalletHeader } from "../libs/supabase-wallet-client";
import {
  deleteCommunityMessage,
  pinCommunityMessage,
} from "../services/communities.service";
import { communityErrorMessage } from "../libs/community-permissions";
import { notifyCommunityMentions } from "../libs/community-mention-notify";
import { toastError, toastSuccess } from "../libs/toast";
import { createLogger } from "../libs/logger";
import type { CommunityChatMessage } from "../types/community";

const log = createLogger("useCommunityChat");

const QUERY_KEY = "community-chat-messages";
const PAGE_LIMIT = 200;
/** Private chats poll; each tick fetches only what arrived since the last one. */
const PRIVATE_POLL_MS = 15_000;
/**
 * Edits, deletes, pins and reactions do not change the newest created_at, so an
 * incremental tick cannot see them. A full reload this often picks them up.
 */
const PRIVATE_FULL_RELOAD_MS = 60_000;

export function useCommunityChat(
  communityId: string | undefined,
  options?: { enabled?: boolean; isPrivate?: boolean },
) {
  const { t: _copy } = _useCopy();
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

  const lastFullLoadRef = useRef<{ key: string; at: number } | null>(null);

  const { data: rawMessages = [], isLoading } = useQuery({
    queryKey: key,
    queryFn: async () => {
      if (!communityId) return [] as CommunityChatMessage[];
      const keyId = `${communityId}|${walletAddress ?? ""}`;
      const held = queryClient.getQueryData<CommunityChatMessage[]>(key) ?? [];
      const newest = held.length ? held[held.length - 1]?.created_at : undefined;
      const last = lastFullLoadRef.current;
      const fullDue = !last || last.key !== keyId || Date.now() - last.at >= PRIVATE_FULL_RELOAD_MS;
      if (isPrivate && newest && !fullDue) {
        const { data, error } = await withWalletHeader(
          supabase
            .from("community_chat_messages")
            .select("*")
            .eq("community_id", communityId)
            .gt("created_at", newest)
            .order("created_at", { ascending: true })
            .limit(PAGE_LIMIT),
          walletAddress,
        );
        if (error) throw error;
        const fresh = (data || []) as unknown as CommunityChatMessage[];
        if (!fresh.length) return held;
        const seen = new Set(held.map((m) => m.id));
        const merged = [...held, ...fresh.filter((m) => !seen.has(m.id))];
        return merged.length > PAGE_LIMIT ? merged.slice(merged.length - PAGE_LIMIT) : merged;
      }
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
      lastFullLoadRef.current = { key: keyId, at: Date.now() };
      return ((data || []) as unknown as CommunityChatMessage[]).slice().reverse();
    },
    enabled: active,
    staleTime: 30_000,
    refetchInterval: active && isPrivate ? PRIVATE_POLL_MS : false,
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
          content: parent.content || (parent.message_type === "gif" ? "GIF" : _copy("copy.d357175cfe89", { defaultValue: "Media" })),
          sender_name: parent.display_name || parent.username || _copy("copy.b512d97e7cbf", { defaultValue: "User" }),
        },
      };
    });
  }, [rawMessages, _copy]);

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
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void queryClient.invalidateQueries({ queryKey: key });
      });

    return () => {
      void supabase.removeChannel(chan);
    };
  }, [active, isPrivate, communityId, queryClient, key]);

  const sendMessage = useCallback(
    async (content: string, replyToId?: string, media?: { type: "gif" | "voice"; url: string }) => {
      if (!communityId || !walletAddress) throw new Error(_copy("copy.bc30560b2f21", { defaultValue: "Sign in to send a message" }));
      const msg = {
        community_id: communityId,
        wallet_address: walletAddress.toLowerCase(),
        username: user?.username || null,
        display_name: user?.displayName || null,
        avatar_url: user?.avatarImageUrl || user?.avatarUrl || null,
        badge_balance: user?.badgeBalance ?? null,
        content,
        // Same shapes web writes: a GIF or voice note carries its URL in
        // image_url, and the body is empty (GIF) or the URL again (voice).
        message_type: media?.type ?? "text",
        image_url: media?.url ?? null,
        reply_to_id: replyToId || null,
        reactions: {},
      };

      const { data: inserted, error } = await withWalletHeader(
        supabase.from("community_chat_messages").insert(msg as any).select("id").single(),
        walletAddress,
      );
      if (error) {
        log.error("send failed", error);
        // Slow mode, mute and revoked send rights all arrive here as raised
        // conditions — say which one rather than a generic failure.
        toastError(communityErrorMessage(error, _copy("copy.66b8e077d85f", { defaultValue: "Failed to send message" })));
        throw error;
      }
      // No realtime echo in a private community: fetch the new tail now rather
      // than leaving the sender waiting on the next poll.
      if (isPrivate) void queryClient.invalidateQueries({ queryKey: key });
      // Fire and forget: a failed notify must never read as a failed send.
      const messageId = (inserted as { id?: string } | null)?.id;
      if (messageId) {
        void notifyCommunityMentions({ communityId, messageId, content, walletAddress });
      }
    },
    [communityId, walletAddress, user, isPrivate, queryClient, key, _copy],
  );

  const editMessage = useCallback(
    async (messageId: string, newContent: string) => {
      if (!walletAddress || !communityId) throw new Error(_copy("copy.fb948766d6ed", { defaultValue: "Sign in to edit a message" }));
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
        toastError(communityErrorMessage(error, _copy("copy.da8e926af644", { defaultValue: "Failed to edit message" })));
        if (prev) queryClient.setQueryData(key, prev);
        // Rethrow like sendMessage does, so the composer can keep the revised
        // text for a retry instead of clearing it on a refusal.
        throw error;
      }
    },
    [walletAddress, communityId, queryClient, key, _copy],
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
      await reactionWrite(messageId, reactions, _copy("copy.13931898084d", { defaultValue: "Failed to react" }));
    },
    [rawMessages, walletAddress, reactionWrite, _copy],
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
      await reactionWrite(messageId, reactions, _copy("copy.bf206a215a1f", { defaultValue: "Failed to remove reaction" }));
    },
    [rawMessages, walletAddress, reactionWrite, _copy],
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
        toastError(communityErrorMessage(error, _copy("copy.5ce4aeba4357", { defaultValue: "Failed to delete message" })));
        if (prev) queryClient.setQueryData(key, prev);
      }
    },
    [walletAddress, communityId, queryClient, key, _copy],
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
        toastSuccess(pinned ? _copy("copy.480e61cdab71", { defaultValue: "Message pinned" }) : _copy("copy.dc1e29e33dc7", { defaultValue: "Message unpinned" }));
      } catch (error) {
        toastError(
          communityErrorMessage(error, pinned ? _copy("copy.675c5fe95089", { defaultValue: "Failed to pin message" }) : _copy("copy.3b69de078742", { defaultValue: "Failed to unpin message" })),
        );
      }
    },
    [walletAddress, communityId, queryClient, key, _copy],
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

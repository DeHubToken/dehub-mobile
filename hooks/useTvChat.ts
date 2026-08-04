/**
 * TV Chat data layer
 * ==================
 * Native port of the web app's use-tv-chat.ts. Reads and writes the same
 * Supabase table (`tv_chat_messages`) with the same filter, ordering and
 * reaction maths, so a message posted on either client shows up identically on
 * the other.
 *
 * Why not the socket.io livechat this app already ships: that backend is a
 * single global room — `livechat:joinRoom` takes no argument and
 * `/livechat/room` has no id — so it cannot key a room to a channel. Per-channel
 * rooms ride Supabase realtime instead, the same transport `useStages` uses.
 *
 * RLS headers go through libs/supabase-wallet-client's `withWalletHeader`
 * rather than calling .setHeader() inline.
 */
import { useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../services/supabase";
import { useUser } from "../context/AuthContext";
import { withWalletHeader } from "../libs/supabase-wallet-client";
import { toastError } from "../libs/toast";
import { createLogger } from "../libs/logger";

const log = createLogger("useTvChat");

export interface TvChatMessage {
  id: string;
  channel_id: string;
  wallet_address: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  badge_balance: number | null;
  content: string;
  message_type: string;
  image_url: string | null;
  reply_to_id: string | null;
  reactions: Record<string, string[]>;
  created_at: string;
  reply_to?: {
    id: string;
    content: string;
    sender_name: string;
  };
}

const QUERY_KEY = "tv-chat-messages";
const PAGE_LIMIT = 200;

export function useTvChat(channelId: string | undefined, enabled = true) {
  const user = useUser();
  const queryClient = useQueryClient();
  const walletAddress = (user?.walletAddress || user?.address || "") || null;
  const active = !!channelId && enabled;

  const { data: rawMessages = [], isLoading } = useQuery({
    queryKey: [QUERY_KEY, channelId],
    queryFn: async () => {
      if (!channelId) return [] as TvChatMessage[];
      // Newest N, then flipped back to reading order — a channel that has been
      // chatting for months should open on the current conversation.
      const { data, error } = await supabase
        .from("tv_chat_messages")
        .select("*")
        .eq("channel_id", channelId)
        .order("created_at", { ascending: false })
        .limit(PAGE_LIMIT);
      if (error) throw error;
      return ((data || []) as unknown as TvChatMessage[]).slice().reverse();
    },
    enabled: active,
    staleTime: 30_000,
  });

  // Resolve reply_to
  const messages: TvChatMessage[] = rawMessages.map((msg) => {
    if (!msg.reply_to_id) return msg;
    const parent = rawMessages.find((m) => m.id === msg.reply_to_id);
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

  // Realtime. Gated on `enabled` so the subscription only exists while the
  // player modal is actually open.
  useEffect(() => {
    if (!active) return;
    const chan = supabase
      .channel(`tv-chat-${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tv_chat_messages",
          filter: `channel_id=eq.${channelId}`,
        },
        (payload: any) => {
          if (payload.eventType === "INSERT") {
            queryClient.setQueryData<TvChatMessage[]>([QUERY_KEY, channelId], (old = []) => {
              if (old.some((m) => m.id === payload.new.id)) return old;
              return [...old, payload.new as TvChatMessage];
            });
          } else if (payload.eventType === "UPDATE") {
            queryClient.setQueryData<TvChatMessage[]>([QUERY_KEY, channelId], (old = []) =>
              old.map((m) => (m.id === payload.new.id ? { ...m, ...(payload.new as TvChatMessage) } : m))
            );
          } else if (payload.eventType === "DELETE") {
            queryClient.setQueryData<TvChatMessage[]>([QUERY_KEY, channelId], (old = []) =>
              old.filter((m) => m.id !== payload.old.id)
            );
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(chan);
    };
  }, [active, channelId, queryClient]);

  const sendMessage = useCallback(
    async (content: string, replyToId?: string) => {
      if (!channelId || !walletAddress) return;
      const msg = {
        channel_id: channelId,
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
        supabase.from("tv_chat_messages").insert(msg as any),
        walletAddress
      );
      if (error) {
        log.error("send failed", error);
        toastError(error, "Failed to send message");
        throw error;
      }
    },
    [channelId, walletAddress, user]
  );

  const addReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!walletAddress || !channelId) return;
      const msg = rawMessages.find((m) => m.id === messageId);
      if (!msg) return;
      const reactions = { ...(msg.reactions || {}) };
      const addresses = reactions[emoji] || [];
      if (addresses.some((a) => a.toLowerCase() === walletAddress.toLowerCase())) return;
      reactions[emoji] = [...addresses, walletAddress.toLowerCase()];

      queryClient.setQueryData<TvChatMessage[]>([QUERY_KEY, channelId], (old = []) =>
        old.map((m) => (m.id === messageId ? { ...m, reactions } : m))
      );

      await withWalletHeader(
        supabase.from("tv_chat_messages").update({ reactions } as any).eq("id", messageId),
        walletAddress
      );
    },
    [rawMessages, walletAddress, channelId, queryClient]
  );

  const removeReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!walletAddress || !channelId) return;
      const msg = rawMessages.find((m) => m.id === messageId);
      if (!msg) return;
      const reactions = { ...(msg.reactions || {}) };
      const addresses = reactions[emoji] || [];
      reactions[emoji] = addresses.filter((a) => a.toLowerCase() !== walletAddress.toLowerCase());
      if (reactions[emoji].length === 0) delete reactions[emoji];

      queryClient.setQueryData<TvChatMessage[]>([QUERY_KEY, channelId], (old = []) =>
        old.map((m) => (m.id === messageId ? { ...m, reactions } : m))
      );

      await withWalletHeader(
        supabase.from("tv_chat_messages").update({ reactions } as any).eq("id", messageId),
        walletAddress
      );
    },
    [rawMessages, walletAddress, channelId, queryClient]
  );

  const deleteMessage = useCallback(
    async (messageId: string) => {
      if (!walletAddress || !channelId) return;

      queryClient.setQueryData<TvChatMessage[]>([QUERY_KEY, channelId], (old = []) =>
        old.filter((m) => m.id !== messageId)
      );

      const { error } = await withWalletHeader(
        supabase
          .from("tv_chat_messages")
          .delete()
          .eq("id", messageId)
          .eq("wallet_address", walletAddress.toLowerCase()),
        walletAddress
      );
      if (error) {
        log.error("delete failed", error);
        toastError(error, "Failed to delete message");
        void queryClient.invalidateQueries({ queryKey: [QUERY_KEY, channelId] });
      }
    },
    [walletAddress, channelId, queryClient]
  );

  return { messages, isLoading, sendMessage, deleteMessage, addReaction, removeReaction };
}

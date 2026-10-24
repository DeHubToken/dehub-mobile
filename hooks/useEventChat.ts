/**
 * Event chat, a port of dehubweb's use-event-chat: the last 200 messages of
 * `event_chat_messages`, kept live over a realtime channel, with send, edit
 * and emoji reactions. Writes carry the wallet header RLS checks.
 */
import { useCallback, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "../services/supabase";
import { withWalletHeader } from "../libs/supabase-wallet-client";
import { toastError } from "../libs/toast";

export interface EventChatMessage {
  id: string;
  event_id: string;
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
  reply_to?: { id: string; content: string; sender_name: string };
}

const QUERY_KEY = "event-chat-messages";

export interface ChatProfile {
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  badgeBalance?: number;
}

export function useEventChat(eventId: string | undefined, walletAddress: string | null | undefined) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const key = useMemo(() => [QUERY_KEY, eventId], [eventId]);

  const { data: raw = [], isLoading } = useQuery({
    queryKey: key,
    enabled: !!eventId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("event_chat_messages" as any)
        .select("*")
        .eq("event_id", eventId!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      // The newest 200, shown oldest first.
      return ((data || []) as unknown as EventChatMessage[]).reverse();
    },
  });

  const messages = useMemo<EventChatMessage[]>(
    () =>
      raw.map((msg) => {
        if (!msg.reply_to_id) return msg;
        const parent = raw.find((m) => m.id === msg.reply_to_id);
        if (!parent) return msg;
        return {
          ...msg,
          reply_to: {
            id: parent.id,
            content: parent.content || (parent.message_type === "gif" ? "GIF" : "Media"),
            sender_name: parent.display_name || parent.username || "User",
          },
        };
      }),
    [raw],
  );

  useEffect(() => {
    if (!eventId) return;
    const channel = supabase
      .channel(`event-chat-${eventId}`)
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "event_chat_messages", filter: `event_id=eq.${eventId}` },
        (payload: any) => {
          queryClient.setQueryData<EventChatMessage[]>(key, (old = []) => {
            if (payload.eventType === "INSERT") {
              const row = payload.new as EventChatMessage;
              return old.some((m) => m.id === row.id) ? old : [...old, row];
            }
            if (payload.eventType === "UPDATE") {
              const row = payload.new as EventChatMessage;
              return old.map((m) => (m.id === row.id ? { ...m, ...row } : m));
            }
            if (payload.eventType === "DELETE") return old.filter((m) => m.id !== payload.old?.id);
            return old;
          });
        },
      )
      .subscribe((status: string) => {
        if (status === "SUBSCRIBED") queryClient.invalidateQueries({ queryKey: key });
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId, key, queryClient]);

  const sendMessage = useCallback(
    async (content: string, replyToId?: string, profile?: ChatProfile) => {
      if (!eventId || !walletAddress) throw new Error("Sign in to send a message");
      const { error } = await withWalletHeader(
        supabase.from("event_chat_messages" as any).insert({
          event_id: eventId,
          wallet_address: walletAddress.toLowerCase(),
          username: profile?.username || null,
          display_name: profile?.displayName || null,
          avatar_url: profile?.avatarUrl || null,
          badge_balance: profile?.badgeBalance || null,
          content,
          message_type: "text",
          image_url: null,
          reply_to_id: replyToId || null,
          reactions: {},
        } as any),
        walletAddress,
      );
      if (error) {
        toastError(t("copy.66b8e077d85f", { defaultValue: "Failed to send message" }));
        throw error;
      }
    },
    [eventId, walletAddress, t],
  );

  const setReactions = useCallback(
    async (messageId: string, mutate: (r: Record<string, string[]>, me: string) => Record<string, string[]> | null) => {
      if (!walletAddress || !eventId) return;
      const msg = raw.find((m) => m.id === messageId);
      if (!msg) return;
      const next = mutate({ ...(msg.reactions || {}) }, walletAddress.toLowerCase());
      if (!next) return;
      queryClient.setQueryData<EventChatMessage[]>(key, (old = []) =>
        old.map((m) => (m.id === messageId ? { ...m, reactions: next } : m)),
      );
      await withWalletHeader(
        supabase.from("event_chat_messages" as any).update({ reactions: next } as any).eq("id", messageId),
        walletAddress,
      );
    },
    [raw, walletAddress, eventId, key, queryClient],
  );

  const addReaction = useCallback(
    (messageId: string, emoji: string) =>
      setReactions(messageId, (r, me) => {
        const list = r[emoji] || [];
        if (list.some((a) => a.toLowerCase() === me)) return null;
        r[emoji] = [...list, me];
        return r;
      }),
    [setReactions],
  );

  const removeReaction = useCallback(
    (messageId: string, emoji: string) =>
      setReactions(messageId, (r, me) => {
        r[emoji] = (r[emoji] || []).filter((a) => a.toLowerCase() !== me);
        if (r[emoji].length === 0) delete r[emoji];
        return r;
      }),
    [setReactions],
  );

  const editMessage = useCallback(
    async (messageId: string, newContent: string) => {
      const trimmed = newContent.trim();
      if (!walletAddress || !eventId || !trimmed) return false;
      queryClient.setQueryData<EventChatMessage[]>(key, (old = []) =>
        old.map((m) => (m.id === messageId ? { ...m, content: trimmed } : m)),
      );
      const { error } = await withWalletHeader(
        supabase
          .from("event_chat_messages" as any)
          .update({ content: trimmed } as any)
          .eq("id", messageId)
          .eq("wallet_address", walletAddress.toLowerCase()),
        walletAddress,
      );
      if (error) {
        toastError(t("copy.da8e926af644", { defaultValue: "Failed to edit message" }));
        queryClient.invalidateQueries({ queryKey: key });
        return false;
      }
      return true;
    },
    [walletAddress, eventId, key, queryClient, t],
  );

  return { messages, isLoading, sendMessage, editMessage, addReaction, removeReaction };
}

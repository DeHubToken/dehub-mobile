/**
 * Live chat inside an event, matching dehubweb's events/EventChat: messages
 * with replies and emoji reactions, edit your own, and a composer pinned under
 * the list. Hold a message for its actions.
 */
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import Icon from "../ui/Icon";
import Avatar from "../common/Avatar";
import { InlineEmoji } from "../common/EmojiText";
import { getAvatarUrl } from "../../libs/misc";
import { useAuthActions, useAuthState, useUser } from "../../context/AuthContext";
import { useUserProfileSheet } from "../../context/UserProfileSheetContext";
import { useEventChat, type EventChatMessage } from "../../hooks/useEventChat";
import { formatRelativeFromNow } from "../../libs/date.util";

const QUICK_REACTIONS = ["🔥", "❤️", "😂", "👀", "💯", "🙌"];
const MAX_LEN = 500;

export default function EventChat({ eventId }: { eventId: string }) {
  const { t } = useTranslation();
  const user = useUser() as any;
  const { isSignedIn } = useAuthState();
  const { requireAuth } = useAuthActions();
  const { showUserProfile } = useUserProfileSheet();
  const wallet: string | null = user?.walletAddress || user?.address || null;
  const me = wallet?.toLowerCase();
  const { messages, isLoading, sendMessage, editMessage, addReaction, removeReaction } = useEventChat(eventId, wallet);

  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<EventChatMessage | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    setText("");
    setReplyTo(null);
    setEditingId(null);
  }, [eventId]);

  const send = async () => {
    const body = text.trim();
    if (!body || sending) return;
    if (!isSignedIn || !wallet) {
      requireAuth(() => {});
      return;
    }
    setSending(true);
    try {
      if (editingId) {
        if (await editMessage(editingId, body)) {
          setEditingId(null);
          setText("");
        }
      } else {
        await sendMessage(body, replyTo?.id, {
          username: user?.username,
          displayName: user?.displayName,
          avatarUrl: user?.avatarImageUrl,
          badgeBalance: user?.badgeBalance,
        });
        setText("");
        setReplyTo(null);
      }
    } catch {
      // The hook already said what went wrong; the text stays for a retry.
    } finally {
      setSending(false);
    }
  };

  const toggleReaction = (m: EventChatMessage, emoji: string) => {
    if (!isSignedIn || !me) {
      requireAuth(() => {});
      return;
    }
    const mine = (m.reactions?.[emoji] || []).some((a) => a.toLowerCase() === me);
    void (mine ? removeReaction(m.id, emoji) : addReaction(m.id, emoji));
  };

  const visible = messages.slice(-80);

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Icon name="MessageSquare" size={14} color="rgba(255,255,255,0.6)" />
        <Text style={styles.headText}>{t("copy.460b3a7da007", { defaultValue: "Chat" })}</Text>
        {messages.length > 0 && <Text style={styles.faint}>· {messages.length}</Text>}
      </View>

      <View style={styles.list}>
        {isLoading ? (
          <ActivityIndicator size="small" color="rgba(255,255,255,0.6)" style={{ paddingVertical: 16 }} />
        ) : visible.length === 0 ? (
          <Text style={[styles.faint, { textAlign: "center", paddingVertical: 16 }]}>
            {`${t("copy.f42e0f66017d", { defaultValue: "No messages yet" })}. ${t("copy.c26c60eb4a6c", { defaultValue: "Be the first to chat." })}`}
          </Text>
        ) : (
          visible.map((m) => {
            const name = m.display_name || m.username || `${m.wallet_address.slice(0, 6)}…`;
            const mine = !!me && m.wallet_address.toLowerCase() === me;
            const reactions = Object.entries(m.reactions || {}).filter(([, a]) => a.length > 0);
            const open = selected === m.id;
            return (
              <View key={m.id}>
                <Pressable
                  onLongPress={() => setSelected(open ? null : m.id)}
                  onPress={() => open && setSelected(null)}
                  style={[styles.row, open && styles.rowOpen]}
                >
                  <Avatar
                    uri={m.avatar_url ? getAvatarUrl(m.avatar_url, 28) : undefined}
                    name={name}
                    size={28}
                    onPress={() => showUserProfile(m.username || m.wallet_address, { source: "event-chat" })}
                  />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={styles.nameRow}>
                      <Text style={styles.name} numberOfLines={1}>{name}</Text>
                      <Text style={styles.faint}>{formatRelativeFromNow(m.created_at)}</Text>
                    </View>
                    {!!m.reply_to && (
                      <View style={styles.quote}>
                        <Icon name="CornerDownLeft" size={11} color="rgba(255,255,255,0.4)" />
                        <Text style={styles.quoteText} numberOfLines={1}>
                          <Text style={{ fontWeight: "600" }}>{m.reply_to.sender_name}: </Text>
                          {m.reply_to.content}
                        </Text>
                      </View>
                    )}
                    <Text style={styles.body}>{m.content}</Text>
                    {reactions.length > 0 && (
                      <View style={styles.reactions}>
                        {reactions.map(([emoji, addrs]) => {
                          const reacted = !!me && addrs.some((a) => a.toLowerCase() === me);
                          return (
                            <Pressable
                              key={emoji}
                              onPress={() => toggleReaction(m, emoji)}
                              style={[styles.chip, reacted && styles.chipMine]}
                            >
                              <InlineEmoji value={emoji} size={13} />
                              <Text style={[styles.chipText, reacted && { color: "#fff" }]}>{addrs.length}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    )}
                  </View>
                </Pressable>

                {open && (
                  <View style={styles.actions}>
                    {QUICK_REACTIONS.map((emoji) => (
                      <Pressable
                        key={emoji}
                        hitSlop={4}
                        onPress={() => {
                          toggleReaction(m, emoji);
                          setSelected(null);
                        }}
                      >
                        <Text style={{ fontSize: 18 }}>{emoji}</Text>
                      </Pressable>
                    ))}
                    <View style={{ flex: 1 }} />
                    <Pressable
                      hitSlop={6}
                      onPress={() => {
                        setEditingId(null);
                        setReplyTo(m);
                        setSelected(null);
                        inputRef.current?.focus();
                      }}
                    >
                      <Icon name="Reply" size={16} color="#fff" />
                    </Pressable>
                    {mine && (
                      <Pressable
                        hitSlop={6}
                        onPress={() => {
                          setReplyTo(null);
                          setEditingId(m.id);
                          setText(m.content);
                          setSelected(null);
                          inputRef.current?.focus();
                        }}
                      >
                        <Icon name="Pencil" size={15} color="#fff" />
                      </Pressable>
                    )}
                  </View>
                )}
              </View>
            );
          })
        )}
      </View>

      {(replyTo || editingId) && (
        <View style={styles.banner}>
          <Icon name={editingId ? "Pencil" : "Reply"} size={12} color="rgba(255,255,255,0.6)" />
          <Text style={[styles.faint, { flex: 1 }]} numberOfLines={1}>
            {editingId
              ? t("events.edit")
              : `${t("events.reply")} · ${replyTo?.display_name || replyTo?.username || "User"}`}
          </Text>
          <Pressable
            hitSlop={8}
            onPress={() => {
              if (editingId) setText("");
              setReplyTo(null);
              setEditingId(null);
            }}
          >
            <Icon name="X" size={14} color="rgba(255,255,255,0.6)" />
          </Pressable>
        </View>
      )}

      <View style={styles.composer}>
        <TextInput
          ref={inputRef}
          value={text}
          onChangeText={setText}
          placeholder={
            isSignedIn
              ? t("events.typeMessage")
              : t("events.logInToChat")
          }
          placeholderTextColor="rgba(255,255,255,0.4)"
          style={styles.input}
          multiline
          maxLength={MAX_LEN}
          onFocus={() => !isSignedIn && requireAuth(() => {})}
        />
        <Pressable
          onPress={send}
          disabled={!text.trim() || sending}
          style={[styles.send, (!text.trim() || sending) && { opacity: 0.4 }]}
          accessibilityRole="button"
          accessibilityLabel={t("copy.f6f4688ff23d", { defaultValue: "Send" })}
        >
          {sending ? <ActivityIndicator size="small" color="#000" /> : <Icon name={editingId ? "Check" : "Send"} size={16} color="#000" />}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", borderRadius: 14, overflow: "hidden" },
  head: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  headText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  list: { paddingVertical: 4 },
  row: { flexDirection: "row", gap: 10, paddingHorizontal: 12, paddingVertical: 8 },
  rowOpen: { backgroundColor: "rgba(255,255,255,0.05)" },
  nameRow: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  name: { color: "#fff", fontSize: 13, fontWeight: "600", flexShrink: 1 },
  faint: { color: "rgba(255,255,255,0.45)", fontSize: 11 },
  body: { color: "rgba(255,255,255,0.88)", fontSize: 14, lineHeight: 19, marginTop: 2 },
  quote: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  quoteText: { color: "rgba(255,255,255,0.5)", fontSize: 12, flex: 1 },
  reactions: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 4 },
  chip: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", backgroundColor: "rgba(255,255,255,0.04)" },
  chipMine: { borderColor: "rgba(255,255,255,0.3)", backgroundColor: "rgba(255,255,255,0.1)" },
  chipText: { color: "rgba(255,255,255,0.6)", fontSize: 11 },
  actions: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: "rgba(255,255,255,0.05)" },
  banner: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)" },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 8, padding: 8, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.06)" },
  input: { flex: 1, color: "#fff", fontSize: 14, maxHeight: 100, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.06)" },
  send: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
});

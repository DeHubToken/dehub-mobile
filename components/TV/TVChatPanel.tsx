/**
 * TVChatPanel
 * ===========
 * Live chat under a playing TV channel. One room per channel.
 *
 * The message row is the LiveChatMessage row: same display-name fallback chain,
 * same staking badge from resolveBadgeBalance/getBadgeUrl, same `h:mm AM/PM`
 * timestamp, same quoted-reply block, same reaction pills — so a message reads
 * the same here as it does in the main live chat.
 *
 * Sizing is the caller's job: this fills whatever box it is given (flex: 1).
 */
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  ActivityIndicator,
  Image,
  StyleSheet,
} from "react-native";
import Icon from "../ui/Icon";
import Avatar from "../common/Avatar";
import { getAvatarUrl, getBadgeUrl, resolveBadgeBalance } from "../../libs/misc";
import { useUser, useAuthActions } from "../../context/AuthContext";
import { useTvChat, type TvChatMessage } from "../../hooks/useTvChat";
import { useUserProfileSheet } from "../../context/UserProfileSheetContext";

const REACTION_EMOJIS = ["🔥", "❤️", "😂", "👀", "💯", "🙌"];
const MAX_LEN = 500;

const formatTime = (iso: string): string => {
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${m} ${ampm}`;
};

const ChatRow: React.FC<{
  message: TvChatMessage;
  myAddress: string;
  onReply: (m: TvChatMessage) => void;
  onDelete: (id: string) => void;
  onToggleReaction: (id: string, emoji: string) => void;
  onOpenProfile: (identifier: string) => void;
}> = ({ message, myAddress, onReply, onDelete, onToggleReaction, onOpenProfile }) => {
  const [showPicker, setShowPicker] = useState(false);

  const isMe = message.wallet_address?.toLowerCase() === myAddress;
  const displayName =
    message.display_name || message.username || message.wallet_address?.slice(0, 8) || "Anon";
  const avatarUrl = getAvatarUrl(message.avatar_url || "");
  const badgeImg = getBadgeUrl(resolveBadgeBalance({ badgeBalance: message.badge_balance }));

  const reactionEntries = useMemo(
    () => Object.entries(message.reactions || {}).filter(([, addrs]) => addrs.length > 0),
    [message.reactions]
  );

  const profileId = message.username || message.wallet_address;

  return (
    <Pressable
      onLongPress={() => setShowPicker((v) => !v)}
      className="flex-row px-3 py-1.5"
    >
      <Pressable onPress={() => profileId && onOpenProfile(profileId)}>
        <Avatar uri={avatarUrl} size={32} name={displayName} />
      </Pressable>

      <View className="flex-1 ml-2.5">
        <View className="flex-row items-center gap-1.5 mb-0.5 flex-wrap">
          <Text
            className={`font-bold text-[13px] ${isMe ? "text-theme-accent" : "text-white"}`}
            numberOfLines={1}
            onPress={() => profileId && onOpenProfile(profileId)}
          >
            {displayName}
          </Text>
          {!!badgeImg && (
            <Image source={badgeImg} style={{ width: 13, height: 13 }} resizeMode="contain" />
          )}
          <Text className="text-white/60 text-xs ml-auto">
            {formatTime(message.created_at)}
          </Text>
        </View>

        {!!message.reply_to && (
          <View className="bg-white/5 rounded-lg px-2.5 py-1.5 mb-1 border-l-2 border-white/30">
            <Text className="text-white/70 text-xs font-medium" numberOfLines={1}>
              {message.reply_to.sender_name}
            </Text>
            <Text className="text-white/50 text-xs" numberOfLines={1}>
              {message.reply_to.content}
            </Text>
          </View>
        )}

        {!!message.content && (
          <Text className="text-white/70 text-[13px] leading-5">{message.content}</Text>
        )}

        {reactionEntries.length > 0 && (
          <View className="flex-row flex-wrap gap-1 mt-1">
            {reactionEntries.map(([emoji, addrs]) => {
              const mine = addrs.some((a) => a.toLowerCase() === myAddress);
              return (
                <Pressable
                  key={emoji}
                  onPress={() => onToggleReaction(message.id, emoji)}
                  style={[styles.reactionPill, mine && styles.reactionPillMine]}
                  hitSlop={8}
                >
                  <Text style={{ fontSize: 11 }}>{emoji}</Text>
                  <Text style={[styles.reactionCount, mine && { color: "#FFFFFF" }]}>
                    {addrs.length}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {showPicker && (
          <View style={styles.pickerRow}>
            {REACTION_EMOJIS.map((emoji) => (
              <Pressable
                key={emoji}
                onPress={() => {
                  onToggleReaction(message.id, emoji);
                  setShowPicker(false);
                }}
                style={styles.pickerBtn}
                hitSlop={4}
              >
                <Text style={{ fontSize: 15 }}>{emoji}</Text>
              </Pressable>
            ))}
            <Pressable
              onPress={() => {
                onReply(message);
                setShowPicker(false);
              }}
              style={styles.pickerBtn}
              hitSlop={4}
              accessibilityRole="button"
              accessibilityLabel="Reply"
            >
              <Icon name="Reply" size={14} color="#A1A1AA" />
            </Pressable>
            {isMe && (
              <Pressable
                onPress={() => {
                  onDelete(message.id);
                  setShowPicker(false);
                }}
                style={styles.pickerBtn}
                hitSlop={4}
                accessibilityRole="button"
                accessibilityLabel="Delete"
              >
                <Icon name="Trash2" size={14} color="#F4F4F5" />
              </Pressable>
            )}
          </View>
        )}
      </View>
    </Pressable>
  );
};

interface TVChatPanelProps {
  channelId: string;
  /** Subscribe only while the player is open. */
  enabled?: boolean;
  /** Extra bottom padding for the safe-area inset when the keyboard is closed. */
  bottomInset?: number;
}

const TVChatPanel: React.FC<TVChatPanelProps> = ({ channelId, enabled = true, bottomInset = 0 }) => {
  const user = useUser();
  const { requireAuth } = useAuthActions();
  const { showUserProfile } = useUserProfileSheet();
  const listRef = useRef<FlatList<TvChatMessage>>(null);
  const atBottomRef = useRef(true);

  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<TvChatMessage | null>(null);
  const [sending, setSending] = useState(false);

  const myAddress = (user?.walletAddress || user?.address || "").toLowerCase();
  const isSignedIn = !!myAddress;

  const { messages, isLoading, sendMessage, deleteMessage, addReaction, removeReaction } =
    useTvChat(channelId, enabled);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, []);

  const handleSend = useCallback(() => {
    const body = text.trim();
    if (!body || sending) return;
    requireAuth(async () => {
      setSending(true);
      try {
        await sendMessage(body, replyTo?.id);
        setText("");
        setReplyTo(null);
        atBottomRef.current = true;
        scrollToBottom();
      } catch {
        // toast already raised in the hook
      } finally {
        setSending(false);
      }
    });
  }, [text, sending, requireAuth, sendMessage, replyTo, scrollToBottom]);

  const handleToggleReaction = useCallback(
    (id: string, emoji: string) => {
      requireAuth(() => {
        const msg = messages.find((m) => m.id === id);
        const mine = msg?.reactions?.[emoji]?.some((a) => a.toLowerCase() === myAddress);
        if (mine) void removeReaction(id, emoji);
        else void addReaction(id, emoji);
      });
    },
    [requireAuth, messages, myAddress, addReaction, removeReaction]
  );

  const handleOpenProfile = useCallback(
    (identifier: string) => showUserProfile(identifier, { source: "tv-chat" }),
    [showUserProfile]
  );

  const renderItem = useCallback(
    ({ item }: { item: TvChatMessage }) => (
      <ChatRow
        message={item}
        myAddress={myAddress}
        onReply={setReplyTo}
        onDelete={(id) => void deleteMessage(id)}
        onToggleReaction={handleToggleReaction}
        onOpenProfile={handleOpenProfile}
      />
    ),
    [myAddress, deleteMessage, handleToggleReaction, handleOpenProfile]
  );

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Icon name="MessageSquare" size={13} color="#A1A1AA" />
        <Text style={styles.headerText}>Live chat</Text>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#FFFFFF" />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={renderItem}
          contentContainerStyle={
            messages.length === 0 ? { flex: 1 } : { paddingVertical: 6 }
          }
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          initialNumToRender={20}
          maxToRenderPerBatch={20}
          onScroll={(e) => {
            const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
            atBottomRef.current =
              contentSize.height - contentOffset.y - layoutMeasurement.height < 80;
          }}
          scrollEventThrottle={100}
          onContentSizeChange={() => {
            if (atBottomRef.current) listRef.current?.scrollToEnd({ animated: false });
          }}
          ListEmptyComponent={
            <View style={styles.center}>
              <Icon name="MessageSquare" size={26} color="#3F3F46" />
              <Text style={styles.dim}>No messages yet — say something.</Text>
            </View>
          }
        />
      )}

      {!!replyTo && (
        <View style={styles.replyBar}>
          <Icon name="Reply" size={13} color="#FFFFFF" />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.replyName} numberOfLines={1}>
              {replyTo.display_name || replyTo.username || "User"}
            </Text>
            <Text style={styles.replyBody} numberOfLines={1}>
              {replyTo.content || "Media"}
            </Text>
          </View>
          <Pressable
            onPress={() => setReplyTo(null)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Dismiss reply"
          >
            <Icon name="X" size={14} color="#A1A1AA" />
          </Pressable>
        </View>
      )}

      <View style={[styles.composer, { paddingBottom: 8 + bottomInset }]}>
        {isSignedIn ? (
          <>
            <TextInput
              value={text}
              onChangeText={(v) => v.length <= MAX_LEN && setText(v)}
              placeholder="Type here..."
              placeholderTextColor="#8B8D90"
              style={styles.input}
              multiline
              maxLength={MAX_LEN}
            />
            <Pressable
              onPress={handleSend}
              disabled={!text.trim() || sending}
              style={[styles.sendBtn, (!text.trim() || sending) && { opacity: 0.4 }]}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Send"
            >
              {sending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Icon name="Send" size={15} color="#FFFFFF" />
              )}
            </Pressable>
          </>
        ) : (
          <Pressable onPress={() => requireAuth(() => {})} style={styles.signInBtn}>
            <Icon name="LogIn" size={14} color="#A1A1AA" />
            <Text style={styles.signInText}>Sign in to chat</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000000" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  headerText: { color: "#FFFFFF", fontSize: 14, fontWeight: "700" },

  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  dim: { color: "#A1A1AA", fontSize: 12, textAlign: "center" },

  reactionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#3F3F46",
    backgroundColor: "rgba(39,39,42,0.5)",
  },
  reactionPillMine: {
    borderColor: "rgba(255,255,255,0.3)",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  reactionCount: { color: "#A1A1AA", fontSize: 12 },

  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginTop: 6,
    padding: 3,
    borderRadius: 10,
    backgroundColor: "#27272A",
    alignSelf: "flex-start",
  },
  pickerBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },

  replyBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 12,
    marginBottom: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 10,
    borderLeftWidth: 2,
    borderLeftColor: "rgba(255,255,255,0.3)",
    backgroundColor: "rgba(39,39,42,0.7)",
  },
  replyName: { color: "#FFFFFF", fontSize: 12, fontWeight: "600" },
  replyBody: { color: "#A1A1AA", fontSize: 12 },

  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  input: {
    flex: 1,
    maxHeight: 96,
    color: "#FFFFFF",
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  sendBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  signInBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  signInText: { color: "#A1A1AA", fontSize: 14, fontWeight: "600" },
});

export default TVChatPanel;

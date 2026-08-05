/**
 * CommunityChatPanel
 * ==================
 * Mobile counterpart to web's CommunityChat, and the community sibling of
 * TVChatPanel: the message row is the same row — same display-name fallback
 * chain, same staking badge, same `h:mm AM/PM` stamp, same quoted-reply block
 * and reaction pills — so a message reads identically in either place.
 *
 * On top of that row sits the community layer:
 *   - a pinned banner that jumps to and flashes the pinned message
 *   - a long-press action sheet (reply / copy / edit / pin / delete), each
 *     entry gated on the right the server would check
 *   - the restriction states (not a member, muted, posting revoked) rendered
 *     in place of the composer
 *   - the slow-mode hint and post-send countdown
 *
 * The database is the authority on every one of these — the gating here only
 * avoids offering a control that would be refused.
 *
 * There is deliberately no attachment affordance: useCommunityChat.sendMessage
 * hard-codes message_type "text" and image_url null, and uploadCommunityMedia
 * only accepts "avatar" | "banner", so a picker here would have nowhere to
 * send an image. Nothing is therefore gated on send_media — when a media path
 * lands, its button belongs behind abilities.can("send_media"). Incoming
 * image messages from web still render.
 *
 * Sizing is the caller's job: this fills whatever box it is given (flex: 1).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  ActivityIndicator,
  Modal,
  Alert,
  Platform,
  KeyboardAvoidingView,
  Image as RNImage,
  StyleSheet,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Icon from "../ui/Icon";
import type { IconName } from "../ui/Icon";
import Avatar from "../common/Avatar";
import { getAvatarUrl, getBadgeUrl, resolveBadgeBalance } from "../../libs/misc";
import { copyToClipboard } from "../../libs/clipboard.utils";
import { toastSuccess } from "../../libs/toast";
import { useUser } from "../../context/AuthContext";
import { useUserProfileSheet } from "../../context/UserProfileSheetContext";
import { useCommunityChat } from "../../hooks/useCommunityChat";
import { getCommunityAbilities, isForever } from "../../libs/community-permissions";
import type { Community, CommunityChatMessage, CommunityMember } from "../../types/community";

const REACTION_EMOJIS = ["🔥", "❤️", "😂", "👀", "💯", "🙌"];
const MAX_LEN = 500;
/** Rendered window, oldest end trimmed. Grown by the "show earlier" header. */
const PAGE = 30;
const FLASH_MS = 1500;
/** Long enough for the action sheet to finish dismissing before an Alert. */
const ALERT_DELAY_MS = 250;

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const formatClock = (date: Date): string => {
  const h = date.getHours();
  const m = date.getMinutes().toString().padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${m} ${ampm}`;
};

/** `4 Aug, 9:05 PM` — built by hand so it does not depend on Intl being present. */
const formatWhen = (date: Date): string =>
  `${date.getDate()} ${MONTHS[date.getMonth()]}, ${formatClock(date)}`;

const humaniseInterval = (seconds: number): string => {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  return `${Math.round(seconds / 3600)} h`;
};

const mmss = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, "0")}`;

// ─── Message row ─────────────────────────────────────────────────────────────

const ChatRow: React.FC<{
  message: CommunityChatMessage;
  myAddress: string;
  flashing: boolean;
  canReact: boolean;
  onLongPress: (message: CommunityChatMessage) => void;
  onToggleReaction: (id: string, emoji: string) => void;
  onOpenProfile: (identifier: string) => void;
}> = ({ message, myAddress, flashing, canReact, onLongPress, onToggleReaction, onOpenProfile }) => {
  const { t } = useTranslation();

  const isMe = !!myAddress && message.wallet_address?.toLowerCase() === myAddress;
  const displayName =
    message.display_name ||
    message.username ||
    message.wallet_address?.slice(0, 8) ||
    t("communities.chatPanel.anon", { defaultValue: "Anon" });
  const avatarUrl = getAvatarUrl(message.avatar_url || "");
  const badgeImg = getBadgeUrl(resolveBadgeBalance({ badgeBalance: message.badge_balance }));

  const reactionEntries = useMemo(
    () => Object.entries(message.reactions || {}).filter(([, addrs]) => addrs.length > 0),
    [message.reactions],
  );

  const profileId = message.username || message.wallet_address;

  return (
    <Pressable
      onLongPress={() => onLongPress(message)}
      delayLongPress={300}
      className="flex-row px-3 py-1.5"
      style={flashing ? styles.flash : undefined}
    >
      <Pressable onPress={() => profileId && onOpenProfile(profileId)}>
        <Avatar uri={avatarUrl} size={32} name={displayName} />
      </Pressable>

      <View className="flex-1 ml-2.5">
        <View className="flex-row items-center gap-1.5 mb-0.5 flex-wrap">
          <Text
            className={`font-bold text-[13px] ${isMe ? "text-blue-400" : "text-white"}`}
            numberOfLines={1}
            onPress={() => profileId && onOpenProfile(profileId)}
          >
            {displayName}
          </Text>
          {!!badgeImg && (
            <RNImage source={badgeImg} style={{ width: 13, height: 13 }} resizeMode="contain" />
          )}
          {!!message.pinned_at && <Icon name="Pin" size={10} color="#A1A1AA" />}
          <Text className="text-white/30 text-[10px] ml-auto">
            {formatClock(new Date(message.created_at))}
          </Text>
        </View>

        {!!message.reply_to && (
          <View className="bg-white/5 rounded-lg px-2.5 py-1.5 mb-1 border-l-2 border-blue-500/50">
            <Text className="text-blue-400/70 text-[11px] font-medium" numberOfLines={1}>
              {message.reply_to.sender_name}
            </Text>
            <Text className="text-white/50 text-xs" numberOfLines={1}>
              {message.reply_to.content}
            </Text>
          </View>
        )}

        {!!message.image_url && (
          <Image
            source={{ uri: message.image_url }}
            style={styles.messageImage}
            contentFit="cover"
          />
        )}

        {!!message.content && (
          <Text className="text-white/70 text-[13px] leading-5">{message.content}</Text>
        )}

        {!!message.edited_at && (
          <Text className="text-white/25 text-[10px] mt-0.5">
            {t("communities.chatPanel.edited", { defaultValue: "edited" })}
          </Text>
        )}

        {reactionEntries.length > 0 && (
          <View className="flex-row flex-wrap gap-1 mt-1">
            {reactionEntries.map(([emoji, addrs]) => {
              const mine = !!myAddress && addrs.some((a) => a.toLowerCase() === myAddress);
              return (
                <Pressable
                  key={emoji}
                  disabled={!canReact}
                  onPress={() => onToggleReaction(message.id, emoji)}
                  style={[styles.reactionPill, mine && styles.reactionPillMine]}
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
      </View>
    </Pressable>
  );
};

// ─── Panel ───────────────────────────────────────────────────────────────────

interface CommunityChatPanelProps {
  community: Community;
  membership: CommunityMember | null | undefined;
  isMember: boolean;
}

export function CommunityChatPanel({ community, membership, isMember }: CommunityChatPanelProps) {
  const { t } = useTranslation();
  const user = useUser() as any;
  const { showUserProfile } = useUserProfileSheet();
  const insets = useSafeAreaInsets();

  const listRef = useRef<FlatList<CommunityChatMessage>>(null);
  const atBottomRef = useRef(true);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alertTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const myAddress = ((user?.walletAddress || user?.address || "") as string).toLowerCase();

  const abilities = useMemo(
    () => getCommunityAbilities(community, membership),
    [community, membership],
  );

  const {
    messages,
    pinnedMessage,
    isLoading,
    sendMessage,
    editMessage,
    deleteMessage,
    setPinned,
    addReaction,
    removeReaction,
  } = useCommunityChat(community.id, { isPrivate: community.is_private });

  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<CommunityChatMessage | null>(null);
  const [editing, setEditing] = useState<CommunityChatMessage | null>(null);
  const [sending, setSending] = useState(false);
  const [sheetFor, setSheetFor] = useState<CommunityChatMessage | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [pendingJump, setPendingJump] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE);
  const [cooldown, setCooldown] = useState(0);

  const canPin = abilities.can("pin_messages");
  const canDeleteAny = abilities.can("delete_messages");
  const canSend = isMember && !abilities.isMuted && abilities.can("send_messages");

  const slowSeconds = community.slow_mode_seconds || 0;
  /** Owners and admins are exempt server-side, so only members see the hint. */
  const slowModeApplies = slowSeconds > 0 && abilities.role === "member";

  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
      if (alertTimer.current) clearTimeout(alertTimer.current);
    },
    [],
  );

  // One tick per second; each decrement re-runs the effect.
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => (c <= 1 ? 0 : c - 1)), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const visibleMessages = useMemo(
    () =>
      messages.length > visibleCount ? messages.slice(messages.length - visibleCount) : messages,
    [messages, visibleCount],
  );

  // Runs after the window has grown, so the index is always in range.
  useEffect(() => {
    if (!pendingJump) return;
    const index = visibleMessages.findIndex((m) => m.id === pendingJump);
    if (index >= 0) {
      try {
        listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.4 });
      } catch {
        // onScrollToIndexFailed picks it up
      }
    }
    setPendingJump(null);
  }, [pendingJump, visibleMessages]);

  const jumpToMessage = useCallback(
    (id: string) => {
      setFlashId(id);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlashId(null), FLASH_MS);

      const absolute = messages.findIndex((m) => m.id === id);
      if (absolute < 0) return;
      const needed = messages.length - absolute;
      if (needed > visibleCount) setVisibleCount(needed);
      // Growing the window changes the content size, and the stick-to-bottom
      // handler would otherwise scroll straight past the message we jumped to.
      atBottomRef.current = false;
      setPendingJump(id);
    },
    [messages, visibleCount],
  );

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, []);

  const handleSend = useCallback(async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      if (editing) {
        await editMessage(editing.id, body);
        setEditing(null);
        setText("");
      } else {
        await sendMessage(body, replyTo?.id);
        setText("");
        setReplyTo(null);
        atBottomRef.current = true;
        scrollToBottom();
        // Feedback only — the server enforces slow mode on its own.
        if (slowModeApplies) setCooldown(slowSeconds);
      }
    } catch {
      // the hook already toasted
    } finally {
      setSending(false);
    }
  }, [
    text,
    sending,
    editing,
    editMessage,
    sendMessage,
    replyTo,
    scrollToBottom,
    slowModeApplies,
    slowSeconds,
  ]);

  const handleToggleReaction = useCallback(
    (id: string, emoji: string) => {
      const msg = messages.find((m) => m.id === id);
      const mine = msg?.reactions?.[emoji]?.some((a) => a.toLowerCase() === myAddress);
      if (mine) void removeReaction(id, emoji);
      else void addReaction(id, emoji);
    },
    [messages, myAddress, addReaction, removeReaction],
  );

  const handleOpenProfile = useCallback(
    (identifier: string) => showUserProfile(identifier, { source: "community-chat" }),
    [showUserProfile],
  );

  const confirmDelete = useCallback(
    (message: CommunityChatMessage) => {
      setSheetFor(null);
      if (alertTimer.current) clearTimeout(alertTimer.current);
      alertTimer.current = setTimeout(() => {
        Alert.alert(
          t("communities.chatPanel.deleteTitle", { defaultValue: "Delete message" }),
          t("communities.chatPanel.deleteConfirm", {
            defaultValue: "Delete this message? This cannot be undone.",
          }),
          [
            { text: t("common.cancel", { defaultValue: "Cancel" }), style: "cancel" },
            {
              text: t("common.delete", { defaultValue: "Delete" }),
              style: "destructive",
              onPress: () => {
                void deleteMessage(message.id);
              },
            },
          ],
        );
      }, ALERT_DELAY_MS);
    },
    [t, deleteMessage],
  );

  const renderItem = useCallback(
    ({ item }: { item: CommunityChatMessage }) => (
      <ChatRow
        message={item}
        myAddress={myAddress}
        flashing={flashId === item.id}
        canReact={canSend}
        onLongPress={setSheetFor}
        onToggleReaction={handleToggleReaction}
        onOpenProfile={handleOpenProfile}
      />
    ),
    [myAddress, flashId, canSend, handleToggleReaction, handleOpenProfile],
  );

  // ── composer state, in the order the server checks them ──
  const mutedCopy = isForever(abilities.mutedUntil)
    ? t("communities.chatPanel.muted", { defaultValue: "You are muted" })
    : t("communities.chatPanel.mutedUntil", {
        defaultValue: "You are muted until {{date}}",
        date: abilities.mutedUntil ? formatWhen(abilities.mutedUntil) : "",
      });

  const composerNotice = !isMember
    ? t("communities.joinToChat", { defaultValue: "Join this community to chat" })
    : abilities.isMuted
      ? mutedCopy
      : !abilities.can("send_messages")
        ? t("communities.chatPanel.postingDisabled", {
            defaultValue: "Posting is disabled for members here",
          })
        : null;

  const noticeIcon: IconName = !isMember ? "Users" : abilities.isMuted ? "MicOff" : "Lock";

  const sendDisabled = !text.trim() || sending || cooldown > 0;

  const sheetIsMine = !!sheetFor && !!myAddress && sheetFor.wallet_address?.toLowerCase() === myAddress;
  const sheetCanEdit = sheetIsMine && sheetFor?.message_type === "text" && !!sheetFor?.content;
  const sheetCanDelete = sheetIsMine || canDeleteAny;

  const pinnedSender = pinnedMessage
    ? pinnedMessage.display_name ||
      pinnedMessage.username ||
      pinnedMessage.wallet_address?.slice(0, 8) ||
      t("communities.chatPanel.anon", { defaultValue: "Anon" })
    : "";
  const pinnedPreview = pinnedMessage
    ? pinnedMessage.content?.trim() ||
      t("communities.chatPanel.mediaMessage", { defaultValue: "Media" })
    : "";

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {!!pinnedMessage && (
        <Pressable style={styles.pinnedBar} onPress={() => jumpToMessage(pinnedMessage.id)}>
          <Icon name="Pin" size={13} color="#FFFFFF" />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.pinnedLabel} numberOfLines={1}>
              {t("communities.chatPanel.pinnedMessage", { defaultValue: "Pinned message" })}
            </Text>
            <Text style={styles.pinnedBody} numberOfLines={1}>
              <Text style={styles.pinnedName}>{pinnedSender}</Text>
              {`  ${pinnedPreview}`}
            </Text>
          </View>
          {canPin && (
            <Pressable onPress={() => void setPinned(pinnedMessage.id, false)} hitSlop={8}>
              <Icon name="X" size={14} color="#71717a" />
            </Pressable>
          )}
        </Pressable>
      )}

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="small" color="#FFFFFF" />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={visibleMessages}
          keyExtractor={(m) => m.id}
          renderItem={renderItem}
          contentContainerStyle={
            visibleMessages.length === 0 ? { flex: 1 } : { paddingVertical: 6 }
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
          onScrollToIndexFailed={(info) => {
            listRef.current?.scrollToOffset({
              offset: Math.max(0, info.averageItemLength * info.index),
              animated: true,
            });
          }}
          ListHeaderComponent={
            messages.length > visibleMessages.length ? (
              <Pressable
                style={styles.showMore}
                onPress={() => {
                  // Reading history, not following the tail.
                  atBottomRef.current = false;
                  setVisibleCount((c) => c + PAGE);
                }}
              >
                <Text style={styles.showMoreText}>
                  {t("communities.chatPanel.showEarlier", { defaultValue: "Show earlier messages" })}
                </Text>
              </Pressable>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.dim}>
                {t("communities.noMessagesYet", { defaultValue: "No messages yet" })}
              </Text>
            </View>
          }
        />
      )}

      {!!replyTo && !editing && (
        <View style={styles.contextBar}>
          <Icon name="Reply" size={13} color="#FFFFFF" />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.contextName} numberOfLines={1}>
              {replyTo.display_name ||
                replyTo.username ||
                t("communities.chatPanel.anon", { defaultValue: "Anon" })}
            </Text>
            <Text style={styles.contextBody} numberOfLines={1}>
              {replyTo.content ||
                t("communities.chatPanel.mediaMessage", { defaultValue: "Media" })}
            </Text>
          </View>
          <Pressable onPress={() => setReplyTo(null)} hitSlop={8}>
            <Icon name="X" size={14} color="#71717a" />
          </Pressable>
        </View>
      )}

      {!!editing && (
        <View style={styles.contextBar}>
          <Icon name="Pencil" size={13} color="#FFFFFF" />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.contextName} numberOfLines={1}>
              {t("communities.chatPanel.editingMessage", { defaultValue: "Editing message" })}
            </Text>
            <Text style={styles.contextBody} numberOfLines={1}>
              {editing.content}
            </Text>
          </View>
          <Pressable
            onPress={() => {
              setEditing(null);
              setText("");
            }}
            hitSlop={8}
          >
            <Icon name="X" size={14} color="#71717a" />
          </Pressable>
        </View>
      )}

      {slowModeApplies && !composerNotice && (
        <Text style={styles.slowModeLine}>
          {t("communities.chatPanel.slowMode", {
            defaultValue: "Slow mode: one message every {{interval}}",
            interval: humaniseInterval(slowSeconds),
          })}
        </Text>
      )}

      {/* The panel is the last thing on the screen with no tab bar beneath it, so
          the composer has to clear the home indicator itself. */}
      <View style={[styles.composer, { paddingBottom: 8 + insets.bottom }]}>
        {composerNotice ? (
          <View style={styles.noticeRow}>
            <Icon name={noticeIcon} size={14} color="#71717a" />
            <Text style={styles.noticeText}>{composerNotice}</Text>
          </View>
        ) : (
          <>
            <TextInput
              value={text}
              onChangeText={(v) => v.length <= MAX_LEN && setText(v)}
              placeholder={t("communities.typeMessage", { defaultValue: "Type a message..." })}
              placeholderTextColor="#52525B"
              style={styles.input}
              multiline
              maxLength={MAX_LEN}
            />
            <Pressable
              onPress={() => void handleSend()}
              disabled={sendDisabled}
              style={[styles.sendBtn, sendDisabled && { opacity: 0.4 }]}
              hitSlop={6}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : cooldown > 0 ? (
                <Text style={styles.cooldownText}>{mmss(cooldown)}</Text>
              ) : (
                <Icon name="Send" size={15} color="#FFFFFF" />
              )}
            </Pressable>
          </>
        )}
      </View>

      <Modal
        visible={!!sheetFor}
        transparent
        animationType="slide"
        onRequestClose={() => setSheetFor(null)}
      >
        <Pressable style={styles.overlay} onPress={() => setSheetFor(null)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            {!!sheetFor && (
              <>
                <Text style={styles.sheetPreview} numberOfLines={2}>
                  {sheetFor.content ||
                    t("communities.chatPanel.mediaMessage", { defaultValue: "Media" })}
                </Text>

                {canSend && (
                  <View style={styles.emojiRow}>
                    {REACTION_EMOJIS.map((emoji) => (
                      <Pressable
                        key={emoji}
                        style={styles.emojiBtn}
                        onPress={() => {
                          handleToggleReaction(sheetFor.id, emoji);
                          setSheetFor(null);
                        }}
                      >
                        <Text style={{ fontSize: 18 }}>{emoji}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}

                {isMember && (
                  <Pressable
                    style={styles.sheetRow}
                    onPress={() => {
                      setEditing(null);
                      setReplyTo(sheetFor);
                      setSheetFor(null);
                    }}
                  >
                    <Icon name="Reply" size={16} color="#FFFFFF" />
                    <Text style={styles.sheetRowText}>
                      {t("communities.reply", { defaultValue: "Reply" })}
                    </Text>
                  </Pressable>
                )}

                {!!sheetFor.content && (
                  <Pressable
                    style={styles.sheetRow}
                    onPress={() => {
                      copyToClipboard(sheetFor.content);
                      setSheetFor(null);
                      toastSuccess(
                        t("communities.chatPanel.copied", { defaultValue: "Message copied" }),
                      );
                    }}
                  >
                    <Icon name="Copy" size={16} color="#FFFFFF" />
                    <Text style={styles.sheetRowText}>
                      {t("communities.chatPanel.copyText", { defaultValue: "Copy text" })}
                    </Text>
                  </Pressable>
                )}

                {sheetCanEdit && (
                  <Pressable
                    style={styles.sheetRow}
                    onPress={() => {
                      setReplyTo(null);
                      setEditing(sheetFor);
                      setText(sheetFor.content);
                      setSheetFor(null);
                    }}
                  >
                    <Icon name="Pencil" size={16} color="#FFFFFF" />
                    <Text style={styles.sheetRowText}>
                      {t("common.edit", { defaultValue: "Edit" })}
                    </Text>
                  </Pressable>
                )}

                {canPin && (
                  <Pressable
                    style={styles.sheetRow}
                    onPress={() => {
                      const next = !sheetFor.pinned_at;
                      void setPinned(sheetFor.id, next);
                      setSheetFor(null);
                    }}
                  >
                    <Icon name="Pin" size={16} color="#FFFFFF" />
                    <Text style={styles.sheetRowText}>
                      {sheetFor.pinned_at
                        ? t("communities.unpin", { defaultValue: "Unpin" })
                        : t("communities.pin", { defaultValue: "Pin" })}
                    </Text>
                  </Pressable>
                )}

                {sheetCanDelete && (
                  <Pressable style={styles.sheetRow} onPress={() => confirmDelete(sheetFor)}>
                    <Icon name="Trash2" size={16} color="#f87171" />
                    <Text style={[styles.sheetRowText, { color: "#f87171" }]}>
                      {t("common.delete", { defaultValue: "Delete" })}
                    </Text>
                  </Pressable>
                )}

                <Pressable style={styles.sheetCancel} onPress={() => setSheetFor(null)}>
                  <Text style={styles.sheetCancelText}>
                    {t("common.cancel", { defaultValue: "Cancel" })}
                  </Text>
                </Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, padding: 24 },
  dim: { color: "#71717a", fontSize: 12, textAlign: "center" },

  flash: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.25)",
  },

  messageImage: {
    width: 180,
    height: 180,
    borderRadius: 10,
    marginBottom: 4,
    backgroundColor: "rgba(255,255,255,0.04)",
  },

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
  reactionCount: { color: "#A1A1AA", fontSize: 10 },

  pinnedBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  pinnedLabel: { color: "#FFFFFF", fontSize: 10.5, fontWeight: "700" },
  pinnedBody: { color: "#a1a1aa", fontSize: 11.5 },
  pinnedName: { color: "#e4e4e7", fontWeight: "600" },

  showMore: { alignSelf: "center", paddingVertical: 8, paddingHorizontal: 14 },
  showMoreText: { color: "#71717a", fontSize: 12, fontWeight: "600" },

  contextBar: {
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
  contextName: { color: "#FFFFFF", fontSize: 10.5, fontWeight: "600" },
  contextBody: { color: "#A1A1AA", fontSize: 10.5 },

  slowModeLine: {
    color: "#71717a",
    fontSize: 11,
    paddingHorizontal: 14,
    paddingBottom: 4,
  },

  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
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
    minWidth: 36,
    height: 36,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  cooldownText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },

  noticeRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
  },
  noticeText: { color: "#71717a", fontSize: 12.5, flexShrink: 1, textAlign: "center" },

  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "#111316",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    paddingBottom: 28,
  },
  sheetPreview: {
    color: "#71717a",
    fontSize: 12,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  emojiRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    paddingHorizontal: 4,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  emojiBtn: {
    width: 40,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  sheetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  sheetRowText: { color: "#FFFFFF", fontSize: 14, fontWeight: "500" },
  sheetCancel: {
    marginTop: 14,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
  },
  sheetCancelText: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
});

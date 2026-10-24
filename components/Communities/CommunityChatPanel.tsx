import { useKeyboardSwap } from "../../hooks/useKeyboardSwap";
import { useSurfaceDraft, draftIdentity } from '../../hooks/useSurfaceDraft';
import { useDraftState } from '../../hooks/useDraftState';
import BadgeArtwork from "../common/BadgeArtwork";
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
 * GIFs and voice notes, as on web, sit behind abilities.can("send_media"):
 * a GIF posts its GIPHY URL, a voice note is uploaded through the same
 * dm-upload-media function web uses and posts the stored URL. Plain photos
 * are not offered because web does not send them here either.
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
  StyleSheet,
} from "react-native";
import SmartImage from "../common/SmartImage";
import { Image } from "expo-image";
import { storageImageSource } from "../../libs/cdnImage";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "../ui/Icon";
import type { IconName } from "../ui/Icon";
import Avatar from "../common/Avatar";
import { getAvatarUrl, getBadgeHoverOpticalStyle as getBadgeOpticalStyle, getBadgeUrl, resolveBadgeBalance } from "../../libs/misc";
import { copyToClipboard } from "../../libs/clipboard.utils";
import { toastSuccess } from "../../libs/toast";
import { useUser } from "../../context/AuthContext";
import { useUserProfileSheet } from "../../context/UserProfileSheetContext";
import { useCommunityChat } from "../../hooks/useCommunityChat";
import { useComposerKeyboard } from "../../hooks/useComposerKeyboard";
import { getCommunityAbilities, isForever } from "../../libs/community-permissions";
import type { Community, CommunityChatMessage, CommunityMember } from "../../types/community";
import { DehubLinkCards, MAX_CARDS_PER_MESSAGE } from "../common/DehubLinkCard";
import LinkPreviewCard from "../common/LinkPreviewCard";
import { findDehubLinks, stripDehubLinkMatches } from "../../libs/dehub-links";
import { chatBodyText } from "../../libs/chat-gif";
import { AssetRefCards, MAX_ASSET_CARDS_PER_MESSAGE } from "../common/AssetRefCard";
import { findAssetRefs, stripAssetRefs } from "../../libs/asset-refs";
import MentionSuggestions from "../common/MentionSuggestions";
import EmojiSheet from "../Upload/EmojiSheet";
import { InlineEmoji, expandEmojiTokens } from "../common/EmojiText";
import { useMentions } from "../../hooks/useMentions";
import GifPicker from "../DM/GifPicker";
import VoiceNotePlayer from "../Comments/VoiceNotePlayer";
import { useVoiceRecorder, VoiceNoteRecordingOverlay } from "../Comments/VoiceNoteRecorder";
import type { VoiceNoteResult } from "../Comments/VoiceNoteRecorder";
import { uploadLiveChatImage } from "../../services/livechat.service";
import { toastError } from "../../libs/toast";

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
  const badgeImg = getBadgeUrl(resolveBadgeBalance({ badgeBalance: message.badge_balance }), { username: message.username });

  const reactionEntries = useMemo(
    () => Object.entries(message.reactions || {}).filter(([, addrs]) => addrs.length > 0),
    [message.reactions],
  );

  const profileId = message.username || message.wallet_address;

  // Web sends a GIF with its URL as the message body and the same URL in
  // image_url. The picture is already on screen, so printing the body as well
  // just puts a stray link under it — drop it, and the link card with it.
  const bodyText = useMemo(() => chatBodyText(message), [message]);

  // A shop item, an event or another community dropped into a channel arrived
  // as a bare URL; card it the same way the feed and DMs now do.
  const dehubLinks = useMemo(
    () => findDehubLinks(bodyText).slice(0, MAX_CARDS_PER_MESSAGE),
    [bodyText],
  );
  const linkFreeContent = useMemo(
    () => (dehubLinks.length ? stripDehubLinkMatches(bodyText, dehubLinks) : bodyText),
    [bodyText, dehubLinks],
  );
  // Same for a contract address or a ticker dropped into a channel.
  const assetRefs = useMemo(
    () => findAssetRefs(linkFreeContent).slice(0, MAX_ASSET_CARDS_PER_MESSAGE),
    [linkFreeContent],
  );
  const displayContent = useMemo(
    () => stripAssetRefs(linkFreeContent, assetRefs),
    [linkFreeContent, assetRefs],
  );

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
        <View className="flex-row items-baseline gap-1.5 mb-0.5 flex-wrap">
          <Text
            className="font-bold text-[13px] text-white"
            numberOfLines={1}
            onPress={() => profileId && onOpenProfile(profileId)}
          >
            {displayName}
          </Text>
          {!!badgeImg && (
            <BadgeArtwork source={badgeImg} style={[getBadgeOpticalStyle(badgeImg, 13), { marginLeft: 0 }]} contentFit="contain" />
          )}
          {!!message.pinned_at && <Icon name="Pin" size={10} color="#A1A1AA" />}
          <Text className="text-zinc-400 text-xs ml-auto">
            {formatClock(new Date(message.created_at))}
          </Text>
        </View>

        {!!message.reply_to && (
          <View className="bg-white/5 rounded-lg px-2.5 py-1.5 mb-1">
            <Text className="text-zinc-300 text-[11px] font-medium" numberOfLines={1}>
              {message.reply_to.sender_name}
            </Text>
            <Text className="text-white/50 text-xs" numberOfLines={1}>
              {message.reply_to.content}
            </Text>
          </View>
        )}

        {message.message_type === "voice" && !!message.image_url ? (
          <View style={{ marginBottom: 4, maxWidth: 260 }}>
            <VoiceNotePlayer audioUrl={message.image_url} compact />
          </View>
        ) : !!message.image_url && (
          <Image
            source={storageImageSource(message.image_url, 180)}
            style={styles.messageImage}
            contentFit="cover"
          />
        )}

        {!!displayContent && (
          <Text className="text-white/70 text-sm leading-5">{expandEmojiTokens(displayContent, { fontSize: 14 })}</Text>
        )}

        <DehubLinkCards links={dehubLinks} />
        <LinkPreviewCard text={bodyText} />
        <AssetRefCards refs={assetRefs} />

        {!!message.edited_at && (
          <Text className="text-zinc-400 text-xs mt-0.5">
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
                  <InlineEmoji value={emoji} size={11} />
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

  /**
   * Edge-to-edge Android does not shrink the window for the keyboard, so the
   * panel lifts its composer by hand, measured against the keyboard's top
   * (hooks/useComposerKeyboard). Working it out from the keyboard height and
   * the insets left the box under the keys on some phones.
   */
  const composerKeyboard = useComposerKeyboard(0, { gap: 0 });
  const keyboardLift = composerKeyboard.lift;
  // The message actions sheet is a Modal, which is edge-to-edge and outside the
  // root SafeAreaView, so it has to clear the nav bar on its own.
  const insets = useSafeAreaInsets();

  const listRef = useRef<FlatList<CommunityChatMessage>>(null);
  const atBottomRef = useRef(true);
  // "Jump to latest", as web's CommunityChat draws it: shown once the reader
  // has scrolled up, with a count of the messages that arrived since.
  const [showJump, setShowJump] = useState(false);
  const [unseen, setUnseen] = useState(0);
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

  const [editing, setEditing] = useState<CommunityChatMessage | null>(null);
  const [text, setText] = useDraftState(editing ? `community:${community.id}:edit:${editing.id}` : `community:${community.id}:composer`, editing?.content ?? "");
  // @mention typeahead. Handles were already parsed out of sent text for
  // notifications, but nothing suggested anyone while typing, so a mention
  // only landed if you already knew the handle exactly.
  const mentions = useMentions(text, setText);
  const [replyTo, setReplyTo] = useDraftState<CommunityChatMessage | null>(`community:${community.id}:reply`, null);
  const [sending, setSending] = useState(false);
  const [sheetFor, setSheetFor] = useState<CommunityChatMessage | null>(null);
  // Message whose full emoji picker is open. The action sheet closes first:
  // iOS will not stack a second modal on one that is still presenting.
  const [moreFor, setMoreFor] = useState<CommunityChatMessage | null>(null);
  const moreTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (moreTimer.current) clearTimeout(moreTimer.current);
  }, []);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [pendingJump, setPendingJump] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE);
  const [cooldown, setCooldown] = useState(0);

  const canPin = abilities.can("pin_messages");
  const canSendMedia = abilities.can("send_media");
  const [gifOpen, setGifOpen] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const keyboardSwap = useKeyboardSwap(inputRef);
  const gifPress = useMemo(() => keyboardSwap.pressProps(() => keyboardSwap.swapTo(() => setGifOpen(true))), [keyboardSwap]);
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

  // Counted from the old tail, not the length: the list is capped at 200, so
  // once it is full every new message pushes an old one out and the length
  // stops moving. Old tail gone (a full refetch) counts nothing, like web.
  const lastIdRef = useRef<string | null>(null);
  const lastMessageId = messages[messages.length - 1]?.id ?? null;
  useEffect(() => {
    const prev = lastIdRef.current;
    lastIdRef.current = lastMessageId;
    if (!prev || prev === lastMessageId || atBottomRef.current) return;
    const at = messages.findIndex((m) => m.id === prev);
    const added = at === -1 ? 0 : messages.length - 1 - at;
    if (added > 0) setUnseen((n) => n + added);
    // Only a new tail is a new message; `messages` is read, not watched.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastMessageId]);

  const jumpToLatest = useCallback(() => {
    atBottomRef.current = true;
    setUnseen(0);
    setShowJump(false);
    scrollToBottom();
  }, [scrollToBottom]);

  const handleSend = useCallback(async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      if (editing) {
        await editMessage(editing.id, body);
        if (setText.complete(text, "")) {
          setEditing(current => current?.id === editing.id ? null : current);
          mentions.reset();
        }
      } else {
        await sendMessage(body, replyTo?.id);
        if (setText.complete(text, "")) {
          mentions.reset();
          setReplyTo.complete(replyTo, null);
        }
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
  }, [text,
    sending,
    editing,
    mentions,
    editMessage,
    sendMessage,
    replyTo,
    scrollToBottom,
    slowModeApplies,
    slowSeconds, setText, setReplyTo]);

  // A GIF or voice note goes out at once, like web, then the same after-send
  // steps as text: reply cleared, scrolled to the bottom, slow mode shown.
  const sendMedia = useCallback(async (type: "gif" | "voice", url: string) => {
    setSending(true);
    try {
      await sendMessage(type === "voice" ? url : "", replyTo?.id, { type, url });
      setReplyTo.complete(replyTo, null);
      atBottomRef.current = true;
      scrollToBottom();
      if (slowModeApplies) setCooldown(slowSeconds);
    } catch {
      // the hook already toasted
    } finally {
      setSending(false);
    }
  }, [sendMessage, replyTo, setReplyTo, scrollToBottom, slowModeApplies, slowSeconds]);

  const handleVoiceDone = useCallback(async (result: VoiceNoteResult) => {
    if (!myAddress) return;
    setSending(true);
    try {
      // dm-upload-media takes audio/mp4 for the m4a the recorder writes.
      const mime = /m4a|aac|mp4/i.test(result.mimeType || "") || !result.mimeType ? "audio/mp4" : result.mimeType;
      const name = result.uri.split("/").pop() || `voice-${Date.now()}.m4a`;
      const { url } = await uploadLiveChatImage(result.uri, mime, name, myAddress);
      await sendMedia("voice", url);
    } catch (e: any) {
      toastError(e?.message || t("liveChat.voiceUploadFailed"));
      setSending(false);
    }
  }, [myAddress, sendMedia, t]);

  const recorder = useVoiceRecorder({ onRecordingComplete: handleVoiceDone, onCancel: () => {} });

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
    ? chatBodyText(pinnedMessage).trim() ||
      t("communities.chatPanel.mediaMessage", { defaultValue: "Media" })
    : "";

  return (
    <View style={[styles.root, { paddingBottom: keyboardLift }]}>
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
            <Pressable
              onPress={() => void setPinned(pinnedMessage.id, false)}
              hitSlop={15}
              accessibilityRole="button"
              accessibilityLabel={t("communities.unpin", { defaultValue: "Unpin" })}
            >
              <Icon name="X" size={14} color="#808089" />
            </Pressable>
          )}
        </Pressable>
      )}

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="small" color="#F4F4F5" />
        </View>
      ) : (
        <View style={{ flex: 1 }}>
        <FlatList
          ref={listRef}
          // "Show earlier messages" prepends a page; without this the list jumped
          // to the top of the new page instead of holding the reader in place.
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
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
            const fromBottom = contentSize.height - contentOffset.y - layoutMeasurement.height;
            atBottomRef.current = fromBottom < 80;
            const farUp = fromBottom > 240;
            setShowJump((was) => (was === farUp ? was : farUp));
            if (fromBottom < 80) setUnseen((n) => (n === 0 ? n : 0));
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
        {showJump || unseen > 0 ? (
          <Pressable
            onPress={jumpToLatest}
            hitSlop={8}
            style={styles.jumpLatest}
            accessibilityRole="button"
            accessibilityLabel={t("communities.chatPanel.jumpToLatest", { defaultValue: "Jump to latest" })}
          >
            <Icon name="ArrowDown" size={14} color="#F4F4F5" />
            {unseen > 0 ? (
              <Text style={styles.jumpLatestText}>{unseen > 99 ? "99+" : unseen}</Text>
            ) : null}
          </Pressable>
        ) : null}
        </View>
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
              {chatBodyText(replyTo) ||
                t("communities.chatPanel.mediaMessage", { defaultValue: "Media" })}
            </Text>
          </View>
          <Pressable
            onPress={() => setReplyTo.complete(replyTo, null)}
            hitSlop={15}
            accessibilityRole="button"
            accessibilityLabel={t("common.cancel", { defaultValue: "Cancel" })}
          >
            <Icon name="X" size={14} color="#808089" />
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
              setText.clear();
            }}
            hitSlop={15}
            accessibilityRole="button"
            accessibilityLabel={t("common.cancel", { defaultValue: "Cancel" })}
          >
            <Icon name="X" size={14} color="#808089" />
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

      {/* No insets.bottom pad here, at rest or otherwise: the root SafeAreaView
          above the navigator already ends this panel above the home indicator,
          and paying it again floated the composer a full band too high. */}
      <MentionSuggestions
        visible={mentions.showSuggestions}
        suggestions={mentions.suggestions}
        onSelect={mentions.selectMention}
        loading={mentions.loading}
      />

      <View
        ref={composerKeyboard.ref}
        collapsable={false}
        onLayout={composerKeyboard.onLayout}
        style={[styles.composer, { paddingBottom: 8 }]}
      >
        {composerNotice ? (
          <View style={styles.noticeRow}>
            <Icon name={noticeIcon} size={14} color="#808089" />
            <Text style={styles.noticeText}>{composerNotice}</Text>
          </View>
        ) : recorder.isRecording || recorder.isStopping ? (
          <View style={{ flex: 1 }}>
            <VoiceNoteRecordingOverlay recorder={recorder} />
          </View>
        ) : (
          <>
            {canSendMedia && !editing && (
              <View style={styles.mediaBtns}>
                <Pressable
                  {...gifPress}
                  disabled={sending || cooldown > 0}
                  style={styles.mediaBtn}
                  hitSlop={4}
                  accessibilityRole="button"
                  accessibilityLabel={t("comments.addGif")}
                >
                  <Text style={styles.gifText}>{t("liveChat.attachGif")}</Text>
                </Pressable>
                {!text.trim() && (
                  <Pressable
                    onPress={() => recorder.startRecording()}
                    disabled={sending || cooldown > 0}
                    style={styles.mediaBtn}
                    hitSlop={4}
                    accessibilityRole="button"
                    accessibilityLabel={t("comments.recordVoice")}
                  >
                    <Icon name="Mic" size={17} color="#A1A1AA" />
                  </Pressable>
                )}
              </View>
            )}
            <TextInput
              ref={inputRef}
              value={text}
              onChangeText={(v) => {
                if (v.length <= MAX_LEN) mentions.handleChangeText(v);
              }}
              onSelectionChange={mentions.handleSelectionChange}
              placeholder={t("communities.typeMessage", { defaultValue: "Type a message..." })}
              placeholderTextColor="#8B8D90"
              style={styles.input}
              multiline
              maxLength={MAX_LEN}
            />
            <Pressable
              onPress={() => void handleSend()}
              disabled={sendDisabled}
              style={[styles.sendBtn, sendDisabled && { opacity: 0.4 }]}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={t("dm.sendMessage")}
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

      {gifOpen && (
        <GifPicker
          visible={gifOpen}
          onClose={() => {
            setGifOpen(false);
            keyboardSwap.restore();
          }}
          onPick={(url) => {
            setGifOpen(false);
            keyboardSwap.restore();
            void sendMedia("gif", url);
          }}
        />
      )}

      <Modal
        visible={!!sheetFor}
        transparent
        animationType="slide"
        onRequestClose={() => setSheetFor(null)}
      >
        <Pressable style={styles.overlay} onPress={() => setSheetFor(null)}>
          <Pressable
            style={[styles.sheet, { paddingBottom: Math.max(28, insets.bottom + 16) }]}
            onPress={(e) => e.stopPropagation()}
          >
            {!!sheetFor && (
              <>
                <Text style={styles.sheetPreview} numberOfLines={2}>
                  {chatBodyText(sheetFor) ||
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
                    <Pressable
                      style={styles.emojiBtn}
                      accessibilityLabel={t("emojiPicker.moreReactions")}
                      onPress={() => {
                        const msg = sheetFor;
                        setSheetFor(null);
                        if (moreTimer.current) clearTimeout(moreTimer.current);
                        moreTimer.current = setTimeout(() => setMoreFor(msg), 350);
                      }}
                    >
                      <Icon name="Plus" size={18} color="#A1A1AA" />
                    </Pressable>
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
                      setReplyTo.complete(replyTo, null);
                      setEditing(sheetFor);
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
                    <Icon name="Trash2" size={16} color="#F4F4F5" />
                    <Text style={[styles.sheetRowText, { color: "#F4F4F5" }]}>
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

      <EmojiSheet
        visible={!!moreFor}
        onClose={() => setMoreFor(null)}
        selected={
          moreFor && myAddress
            ? Object.entries(moreFor.reactions ?? {})
                .filter(([, addresses]) => addresses?.some((a) => a.toLowerCase() === myAddress))
                .map(([emoji]) => emoji)
            : undefined
        }
        onSelect={(emoji) => {
          if (moreFor) handleToggleReaction(moreFor.id, emoji);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, padding: 24 },
  dim: { color: "#A1A1AA", fontSize: 12, textAlign: "center" },

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
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.06)",
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
  pinnedLabel: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  pinnedBody: { color: "#a1a1aa", fontSize: 12 },
  pinnedName: { color: "#e4e4e7", fontWeight: "600" },

  showMore: { alignSelf: "center", paddingVertical: 8, paddingHorizontal: 14 },
  jumpLatest: {
    position: "absolute",
    right: 12,
    bottom: 10,
    minWidth: 36,
    height: 36,
    paddingHorizontal: 10,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: "rgba(39,39,42,0.92)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.18)",
  },
  jumpLatestText: { color: "#F4F4F5", fontSize: 12, fontWeight: "700" },
  showMoreText: { color: "#A1A1AA", fontSize: 12, fontWeight: "600" },

  contextBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 12,
    marginBottom: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  contextName: { color: "#FFFFFF", fontSize: 12, fontWeight: "600" },
  contextBody: { color: "#A1A1AA", fontSize: 12 },

  slowModeLine: {
    color: "#808089",
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
  mediaBtns: { flexDirection: "row", gap: 6 },
  mediaBtn: {
    minWidth: 36,
    height: 36,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  gifText: { color: "#A1A1AA", fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
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
  noticeText: { color: "#A1A1AA", fontSize: 12, flexShrink: 1, textAlign: "center" },

  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "rgba(12,12,14,0.96)",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.1)",
    padding: 16,
    paddingBottom: 28,
  },
  sheetPreview: {
    color: "#A1A1AA",
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

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  ListRenderItemInfo,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from "react-native";
import Icon from "../components/ui/Icon";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import ScreenHeader from "../components/ScreenHeader";
import ConfirmModal from "../components/common/ConfirmModal";
import LiveChatMessage from "../components/LiveChat/LiveChatMessage";
import LiveChatInput from "../components/LiveChat/LiveChatInput";
import LiveChatContextMenu from "../components/LiveChat/LiveChatContextMenu";
import type { MessageLayout } from "../components/LiveChat/LiveChatContextMenu";
import PinnedMessagesBar from "../components/LiveChat/PinnedMessagesBar";
import { useKeyboard } from "../hooks/useKeyboard";
import GifPicker from "../components/DM/GifPicker";
import { useLiveChat } from "../hooks/useLiveChat";
import { useUser } from "../context/AuthContext";
import { useUserProfileSheet } from "../context/UserProfileSheetContext";
import {
  pinMessage as pinMessageApi,
  unpinMessage as unpinMessageApi,
} from "../services/livechat.service";
import type { LiveChatMessageData, LiveChatUser, SendMessagePayload } from "../services/livechat.service";
import { ScreenNames } from "../navigation/ScreenNames";

/** Returns a readable date label for message grouping */
const getDateLabel = (iso: string): string => {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  if (isToday) return "Today";
  if (isYesterday) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

/** Insert date separators between messages from different days */
type ListItem =
  | { type: "message"; data: LiveChatMessageData }
  | { type: "date"; label: string; key: string };

const buildListItems = (
  messages: LiveChatMessageData[],
  pinnedMessages?: LiveChatMessageData[],
): ListItem[] => {
  // Merge any pinned messages not already in the main messages array so they
  // can be scrolled to even if they're older than the loaded message window.
  const messageIds = new Set(messages.map((m) => m._id));
  const extraPinned = (pinnedMessages || []).filter((m) => !messageIds.has(m._id));
  const allMessages =
    extraPinned.length > 0
      ? [...messages, ...extraPinned].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        )
      : messages;

  const items: ListItem[] = [];
  let lastDate = "";
  for (const msg of allMessages) {
    const dateLabel = getDateLabel(msg.createdAt);
    if (dateLabel !== lastDate) {
      const d = new Date(msg.createdAt);
      items.push({ type: "date", label: dateLabel, key: `date-${d.toDateString()}` });
      lastDate = dateLabel;
    }
    items.push({ type: "message", data: msg });
  }
  return items;
};

const LiveChatScreen: React.FC = () => {
  const user = useUser();
  const { showUserProfile } = useUserProfileSheet();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { height: kbHeight, isVisible: kbVisible } = useKeyboard();

  const inputLift = kbVisible ? kbHeight : 0;
  const listBottomPadding = 88 + inputLift + (insets.bottom || 0);

  const {
    connected,
    joining,
    messages,
    room,
    isBanned,
    isModerator,
    canSend,
    typingUsers,
    onlineCount,
    loadingMore,
    hasMore,
    sendMessage,
    editMessage,
    deleteMessage,
    addReaction,
    removeReaction,
    setTyping,
    loadMoreMessages,
    reconnect,
  } = useLiveChat();

  const [replyingTo, setReplyingTo] = useState<LiveChatMessageData | null>(null);
  const [showReactionPicker, setShowReactionPicker] = useState<string | null>(null);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [contextMenuVisible, setContextMenuVisible] = useState(false);
  const [contextMenuMessage, setContextMenuMessage] = useState<LiveChatMessageData | null>(null);
  const [contextMenuLayout, setContextMenuLayout] = useState<MessageLayout | null>(null);
  const [editingMessage, setEditingMessage] = useState<LiveChatMessageData | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    visible: boolean;
    title: string;
    description?: string;
    confirmText: string;
    confirmKind: "primary" | "danger" | "neutral";
    onConfirm: () => void;
  }>({ visible: false, title: "", confirmText: "Confirm", confirmKind: "primary", onConfirm: () => {} });
  const flatListRef = useRef<FlatList>(null);
  const isAtBottomRef = useRef(true);
  const prevMessageCountRef = useRef(0);
  const messagesRef = useRef<LiveChatMessageData[]>([]);
  messagesRef.current = messages;
  const contentHeightRef = useRef(0);
  const layoutHeightRef = useRef(0);
  const scrollOffsetRef = useRef(0);
  const hasInitialScrolledRef = useRef(false);
  const initialRevealTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [initialScrollDone, setInitialScrollDone] = useState(false);

  const myAddress = useMemo(
    () => (user?.walletAddress || user?.address || "").toLowerCase(),
    [user]
  );

  const listItems = useMemo(
    () => buildListItems(messages, room?.pinnedMessages),
    [messages, room?.pinnedMessages],
  );

  const scrollToBottom = useCallback((animated = true) => {
    const maxOffset = contentHeightRef.current - layoutHeightRef.current;
    if (maxOffset > 0) {
      flatListRef.current?.scrollToOffset({ offset: maxOffset, animated });
    }
  }, []);

  // Auto-scroll to bottom when new messages arrive (only if user is at bottom)
  useEffect(() => {
    const prevCount = prevMessageCountRef.current;
    const newCount = messages.length;
    prevMessageCountRef.current = newCount;
    if (prevCount === 0) return;
    if (newCount > prevCount && isAtBottomRef.current) {
      setTimeout(() => scrollToBottom(true), 150);
    }
  }, [messages.length, scrollToBottom]);

  const handleContentSizeChange = useCallback((_w: number, h: number) => {
    const prevH = contentHeightRef.current;
    contentHeightRef.current = h;

    // ── Phase 1: initial setup (list hidden via opacity 0) ──
    if (!hasInitialScrolledRef.current) {
      if (messagesRef.current.length === 0 || layoutHeightRef.current === 0 || h <= layoutHeightRef.current) return;

      flatListRef.current?.scrollToOffset({ offset: h - layoutHeightRef.current, animated: false });

      clearTimeout(initialRevealTimer.current);
      initialRevealTimer.current = setTimeout(() => {
        hasInitialScrolledRef.current = true;
        const finalOffset = contentHeightRef.current - layoutHeightRef.current;
        flatListRef.current?.scrollToOffset({ offset: finalOffset, animated: false });
        scrollOffsetRef.current = finalOffset;
        setInitialScrollDone(true);
      }, 250);
      return;
    }

    // ── Phase 2: normal operation ──
    const delta = h - prevH;
    if (!isAtBottomRef.current && delta !== 0 && prevH > layoutHeightRef.current) {
      // Content changed while user is scrolled up — adjust offset to maintain visual position
      const adjusted = Math.max(0, scrollOffsetRef.current + delta);
      flatListRef.current?.scrollToOffset({ offset: adjusted, animated: false });
      scrollOffsetRef.current = adjusted;
    } else if (isAtBottomRef.current) {
      setTimeout(() => scrollToBottom(false), 30);
    }
  }, [scrollToBottom]);

  const handleLayout = useCallback((e: { nativeEvent: { layout: { height: number } } }) => {
    layoutHeightRef.current = e.nativeEvent.layout.height;
  }, []);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
      scrollOffsetRef.current = contentOffset.y;
      const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
      isAtBottomRef.current = distanceFromBottom < 120;

      // Load more when scrolled near top (not during initial setup)
      if (hasInitialScrolledRef.current && contentOffset.y < 100 && hasMore && !loadingMore) {
        loadMoreMessages();
      }
    },
    [hasMore, loadingMore, loadMoreMessages]
  );

  const handleSend = useCallback(
    (content: string, replyTo?: string, audioUrl?: string, audioDuration?: number) => {
      if (editingMessage) {
        editMessage(editingMessage._id, content);
        setEditingMessage(null);
        return;
      }
      const payload: SendMessagePayload = { content };
      if (replyTo) payload.replyTo = replyTo;
      if (audioUrl) {
        payload.messageType = "audio";
        payload.audioUrl = audioUrl;
        payload.audioDuration = audioDuration;
      }
      sendMessage(payload);
      isAtBottomRef.current = true;
      setTimeout(() => scrollToBottom(true), 300);
    },
    [sendMessage, scrollToBottom, editingMessage, editMessage]
  );

  const handleGifPicked = useCallback(
    (url: string) => {
      setShowGifPicker(false);
      const payload: SendMessagePayload = {
        messageType: "gif",
        gif: {
          provider: "tenor",
          gifId: url,
          url,
          previewUrl: url,
          width: 240,
          height: 180,
        },
      };
      if (replyingTo?._id) payload.replyTo = replyingTo._id;
      sendMessage(payload);
      setReplyingTo(null);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    },
    [sendMessage, replyingTo]
  );

  const handleReply = useCallback((msg: LiveChatMessageData) => {
    setReplyingTo(msg);
  }, []);

  const handleCancelReply = useCallback(() => {
    setReplyingTo(null);
  }, []);

  const handleSelectReaction = useCallback(
    (messageId: string, emoji: string) => {
      const msg = messagesRef.current.find((m) => m._id === messageId);
      const alreadyReacted = msg?.reactions?.[emoji]?.includes(myAddress);
      if (alreadyReacted) {
        removeReaction(messageId, emoji);
      } else {
        addReaction(messageId, emoji);
      }
      setShowReactionPicker(null);
    },
    [myAddress, addReaction, removeReaction]
  );

  const showConfirm = useCallback(
    (opts: {
      title: string;
      description?: string;
      confirmText: string;
      confirmKind?: "primary" | "danger" | "neutral";
      onConfirm: () => void;
    }) => {
      setConfirmModal({
        visible: true,
        title: opts.title,
        description: opts.description,
        confirmText: opts.confirmText,
        confirmKind: opts.confirmKind || "primary",
        onConfirm: opts.onConfirm,
      });
    },
    []
  );

  const dismissConfirm = useCallback(() => {
    setConfirmModal((prev) => ({ ...prev, visible: false }));
  }, []);

  const handleDelete = useCallback(
    (msg: LiveChatMessageData) => {
      showConfirm({
        title: "Delete Message",
        description: "Are you sure you want to delete this message?",
        confirmText: "Delete",
        confirmKind: "danger",
        onConfirm: () => {
          deleteMessage(msg._id);
          dismissConfirm();
        },
      });
    },
    [deleteMessage, showConfirm, dismissConfirm]
  );

  const handleAvatarPress = useCallback(
    (chatUser: LiveChatUser) => {
      if (chatUser.address) {
        showUserProfile(chatUser.address);
      }
    },
    [showUserProfile]
  );

  const handleLongPress = useCallback(
    (msg: LiveChatMessageData, layout: MessageLayout) => {
      if (msg.isDeleted) return;
      setContextMenuMessage(msg);
      setContextMenuLayout(layout);
      setContextMenuVisible(true);
    },
    []
  );

  const handleContextMenuClose = useCallback(() => {
    setContextMenuVisible(false);
    setContextMenuMessage(null);
    setContextMenuLayout(null);
  }, []);

  const handleContextReply = useCallback((msg: LiveChatMessageData) => {
    setReplyingTo(msg);
  }, []);

  const handleContextReact = useCallback(
    (messageId: string, emoji: string) => {
      const msg = messagesRef.current.find((m) => m._id === messageId);
      const alreadyReacted = msg?.reactions?.[emoji]?.includes(myAddress);
      if (alreadyReacted) {
        removeReaction(messageId, emoji);
      } else {
        addReaction(messageId, emoji);
      }
    },
    [myAddress, addReaction, removeReaction]
  );

  const handleContextEdit = useCallback((msg: LiveChatMessageData) => {
    setEditingMessage(msg);
  }, []);

  const handleContextDelete = useCallback(
    (msg: LiveChatMessageData) => {
      showConfirm({
        title: "Delete Message",
        description: "Are you sure you want to delete this message?",
        confirmText: "Delete",
        confirmKind: "danger",
        onConfirm: () => {
          deleteMessage(msg._id);
          dismissConfirm();
        },
      });
    },
    [deleteMessage, showConfirm, dismissConfirm]
  );

  const handleContextPin = useCallback(
    async (msg: LiveChatMessageData) => {
      try {
        if (msg.isPinned) {
          await unpinMessageApi(msg._id);
        } else {
          await pinMessageApi(msg._id);
        }
      } catch (e) {
        showConfirm({
          title: "Error",
          description: msg.isPinned ? "Failed to unpin message" : "Failed to pin message",
          confirmText: "OK",
          onConfirm: dismissConfirm,
        });
      }
    },
    [showConfirm, dismissConfirm]
  );

  const handleUnpinFromBar = useCallback(
    async (msg: LiveChatMessageData) => {
      try {
        await unpinMessageApi(msg._id);
      } catch {
        showConfirm({
          title: "Error",
          description: "Failed to unpin message",
          confirmText: "OK",
          onConfirm: dismissConfirm,
        });
      }
    },
    [showConfirm, dismissConfirm]
  );

  const highlightAndScroll = useCallback(
    (messageId: string) => {
      const idx = listItems.findIndex(
        (item) => item.type === "message" && item.data._id === messageId,
      );
      if (idx < 0) return;

      setHighlightedId(null);
      // Jump to an estimated offset first so scrollToIndex has the item rendered
      const estimatedOffset = Math.max(0, idx * 80 - layoutHeightRef.current * 0.3);
      flatListRef.current?.scrollToOffset({ offset: estimatedOffset, animated: false });
      setTimeout(() => {
        flatListRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.3 });
      }, 100);
      setTimeout(() => {
        setHighlightedId(messageId);
        setTimeout(() => setHighlightedId(null), 4000);
      }, 350);
    },
    [listItems],
  );

  const handlePinnedPress = useCallback(
    (msg: LiveChatMessageData) => {
      highlightAndScroll(msg._id);
    },
    [highlightAndScroll],
  );

  const handleReplyPress = useCallback(
    (messageId: string) => {
      highlightAndScroll(messageId);
    },
    [highlightAndScroll],
  );

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<ListItem>) => {
      if (item.type === "date") {
        return (
          <View className="items-center py-3">
            <View className="bg-white/5 rounded-full px-3 py-1">
              <Text className="text-white/30 text-[11px] font-medium">{item.label}</Text>
            </View>
          </View>
        );
      }

      const msg = item.data;
      return (
        <LiveChatMessage
          message={msg}
          myAddress={myAddress}
          isModerator={isModerator}
          onSelectReaction={handleSelectReaction}
          onAvatarPress={handleAvatarPress}
          onLongPress={handleLongPress}
          onReplyPress={handleReplyPress}
          highlighted={highlightedId === msg._id}
        />
      );
    },
    [
      myAddress,
      isModerator,
      handleSelectReaction,
      handleAvatarPress,
      handleLongPress,
      handleReplyPress,
      highlightedId,
    ]
  );

  const keyExtractor = useCallback(
    (item: ListItem) => (item.type === "date" ? item.key : item.data._id),
    []
  );

  // Typing indicator text
  const typingText = useMemo(() => {
    if (typingUsers.length === 0) return null;
    if (typingUsers.length === 1) {
      return `${typingUsers[0].displayName || typingUsers[0].username || "Someone"} is typing...`;
    }
    if (typingUsers.length <= 3) {
      const names = typingUsers.map((u) => u.displayName || u.username || "Someone");
      return `${names.join(", ")} are typing...`;
    }
    return `${typingUsers.length} people are typing...`;
  }, [typingUsers]);

  const participants = useMemo(() => {
    const seen = new Set<string>();
    const result: LiveChatUser[] = [];
    for (const msg of messages) {
      const addr = msg.senderAddress?.toLowerCase();
      if (!addr || seen.has(addr) || !msg.sender) continue;
      seen.add(addr);
      result.push(msg.sender);
    }
    return result;
  }, [messages]);

  const handleInfoPress = useCallback(() => {
    navigation.navigate(ScreenNames.LiveChatInfo as any, {
      room,
      isModerator,
      onlineCount,
      participants,
    });
  }, [navigation, room, isModerator, onlineCount, participants]);

  // Header right content — online count + info icon
  const RightHeader = useMemo(
    () => (
      <View className="flex-row items-center gap-3">
        <View className="flex-row items-center gap-1.5">
          <View className="w-2 h-2 rounded-full bg-green-500" />
          <Text className="text-white/50 text-xs">{onlineCount}</Text>
        </View>
        <TouchableOpacity onPress={handleInfoPress} activeOpacity={0.6} hitSlop={8}>
          <Icon name="Info" size={22} color="rgba(255,255,255,0.5)" />
        </TouchableOpacity>
      </View>
    ),
    [onlineCount, handleInfoPress]
  );

  // Header subtitle
  const subtitle = useMemo(() => {
    if (!connected && !joining) return "Disconnected";
    if (joining) return "Connecting...";
    return "All things DeHub...";
  }, [connected, joining]);

  const ListHeader = useMemo(
    () =>
      loadingMore ? (
        <View className="py-3 items-center">
          <ActivityIndicator size="small" color="rgba(255,255,255,0.3)" />
        </View>
      ) : null,
    [loadingMore]
  );

  const ListEmpty = useMemo(
    () => (
      <View className="flex-1 items-center justify-center py-20">
        {joining ? (
          <>
            <ActivityIndicator size="large" color="rgba(255,255,255,0.3)" />
            <Text className="text-white/30 text-sm mt-4">Joining chat...</Text>
          </>
        ) : !connected ? (
          <>
            <Icon name="WifiOff" size={48} color="rgba(255,255,255,0.15)" />
            <Text className="text-white/30 text-sm mt-3">Not connected</Text>
            <TouchableOpacity
              onPress={reconnect}
              className="mt-3 px-4 py-2 bg-blue-500/20 rounded-full"
            >
              <Text className="text-blue-400 text-sm font-medium">Reconnect</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Icon name="MessageCircle" size={48} color="rgba(255,255,255,0.1)" />
            <Text className="text-white/30 text-sm mt-3">No messages yet</Text>
            <Text className="text-white/20 text-xs mt-1">Be the first to say something!</Text>
          </>
        )}
      </View>
    ),
    [joining, connected, reconnect]
  );

  return (
    <View className="flex-1 bg-black">
      <ScreenHeader
        title="Public Chat"
        subtitle={subtitle}
        rightContent={RightHeader}
      />

      {room?.pinnedMessages && room.pinnedMessages.length > 0 && (
        <PinnedMessagesBar
          pinnedMessages={room.pinnedMessages}
          onPinnedPress={handlePinnedPress}
          isModerator={isModerator}
          onUnpin={handleUnpinFromBar}
        />
      )}

      {isBanned && (
        <View className="bg-red-500/10 border-b border-red-500/20 px-4 py-2.5">
          <View className="flex-row items-center gap-2">
            <Icon name="Ban" size={16} color="#EF4444" />
            <Text className="text-red-400 text-sm">You are banned from this chat</Text>
          </View>
        </View>
      )}

      <View className="flex-1">
        <FlatList
          ref={flatListRef}
          data={listItems}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          style={{ opacity: initialScrollDone || listItems.length === 0 ? 1 : 0 }}
          contentContainerStyle={
            listItems.length === 0
              ? { flex: 1 }
              : { paddingVertical: 8, paddingBottom: listBottomPadding }
          }
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={ListEmpty}
          onScroll={handleScroll}
          onContentSizeChange={handleContentSizeChange}
          onLayout={handleLayout}
          scrollEventThrottle={100}
          inverted={false}
          initialNumToRender={30}
          maxToRenderPerBatch={20}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          onScrollToIndexFailed={(info) => {
            // Item not yet rendered — scroll to approximate offset then retry
            flatListRef.current?.scrollToOffset({
              offset: info.averageItemLength * info.index,
              animated: true,
            });
            setTimeout(() => {
              flatListRef.current?.scrollToIndex({
                index: info.index,
                animated: true,
                viewPosition: 0.3,
              });
            }, 300);
          }}
        />

        {!isAtBottomRef.current && messages.length > 10 && (
          <TouchableOpacity
            onPress={() => scrollToBottom()}
            className="absolute right-4"
            style={{ bottom: inputLift + 100 }}
            activeOpacity={0.7}
          >
            <View className="bg-white/10 rounded-full w-10 h-10 items-center justify-center">
              <Icon name="ChevronDown" size={22} color="rgba(255,255,255,0.6)" />
            </View>
          </TouchableOpacity>
        )}

        <View
          className="absolute left-0 right-0 bottom-0 bg-theme-neutrals-900"
          style={{ marginBottom: inputLift, paddingBottom: insets.bottom || 0 }}
        >
          {typingText && (
            <View className="px-4 py-1.5 border-b border-white/5">
              <Text className="text-white/30 text-xs italic">{typingText}</Text>
            </View>
          )}

          <LiveChatInput
            onSend={handleSend}
            replyingTo={replyingTo}
            onCancelReply={handleCancelReply}
            editingMessage={editingMessage}
            onCancelEdit={() => setEditingMessage(null)}
            isBanned={isBanned}
            canSend={canSend && connected}
            onTyping={setTyping}
            slowMode={room?.slowMode}
            slowModeSeconds={room?.slowModeSeconds}
            onGifPress={() => setShowGifPicker(true)}
          />
        </View>
      </View>

      <GifPicker
        visible={showGifPicker}
        onClose={() => setShowGifPicker(false)}
        onPick={handleGifPicked}
      />

      <LiveChatContextMenu
        visible={contextMenuVisible}
        message={contextMenuMessage}
        layout={contextMenuLayout}
        isMe={
          contextMenuMessage?.senderAddress?.toLowerCase() === myAddress
        }
        isModerator={isModerator}
        onClose={handleContextMenuClose}
        onReply={handleContextReply}
        onReact={handleContextReact}
        onEdit={handleContextEdit}
        onDelete={handleContextDelete}
        onPin={handleContextPin}
      />

      <ConfirmModal
        visible={confirmModal.visible}
        title={confirmModal.title}
        description={confirmModal.description}
        confirmText={confirmModal.confirmText}
        confirmKind={confirmModal.confirmKind}
        onConfirm={confirmModal.onConfirm}
        onCancel={dismissConfirm}
      />
    </View>
  );
};

export default LiveChatScreen;

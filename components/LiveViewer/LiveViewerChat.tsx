import { DhbCoin } from "../common/DhbCoin";
import React, { memo, useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
} from "react-native";
import { Send, Gift } from "lucide-react-native";
import { StreamActivityType } from "../../services/enums/livestream.enum";
import { useKeyboard } from "../../hooks/useKeyboard";
import { useUserProfileSheet } from "../../context/UserProfileSheetContext";
import Avatar from "../common/Avatar";

/** Shared shape for the `userReferenceProjection` returned by both socket events and REST activities. */
export interface UserReference {
  address?: string;
  username?: string;
  displayName?: string;
  avatarImageUrl?: string;
  followers?: number;
  followings?: number;
  sentTips?: number;
  receivedTips?: number;
  createdAt?: string;
  isPrivate?: boolean;
  hideFollowers?: boolean;
  badgeBalance?: number;
}

export interface ChatActivity {
  id?: string;
  status: StreamActivityType | "SYSTEM";
  address?: string;
  createdAt?: number;
  /** Full user reference from socket `user` / REST `account` field. */
  user?: UserReference;
  meta?: Record<string, any> & {
    username?: string;
    content?: string;
    amount?: number;
    avatarImageUrl?: string;
    message?: string;
  };
  optimistic?: boolean;
}

interface LiveViewerChatProps {
  activities: ChatActivity[];
  canSend: boolean;
  isLive: boolean;
  isEnded: boolean;
  isScheduled: boolean;
  onSendMessage: (content: string) => void;
  onGiftPress: () => void;
  chatEnabled: boolean;
}

/** Deterministic color palette for usernames (monochrome neutrals ramp) */
const USERNAME_PALETTE = [
  "#F9FBFF",
  "#D4D4D8",
  "#DDE0E3",
  "#F4F4F5",
  "#D4D4D8",
  "#D4D4D8",
  "#D4D4D8",
  "#C2C4C7",
  "#D4D4D8",
  "#D4D4D8",
  "#D4D4D8",
  "#F4F4F5",
  "#D4D4D8",
  "#D4D4D8",
];

const colorForUser = (key?: string): string => {
  if (!key) return "#e5e7eb";
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return USERNAME_PALETTE[hash % USERNAME_PALETTE.length];
};

const shortAddr = (addr?: string) =>
  addr ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : "";

/** Resolve the best display name from an activity's user ref or meta fallback. */
const resolveDisplayName = (a: ChatActivity): string =>
  a.user?.displayName || a.user?.username || a.meta?.username || shortAddr(a.user?.address || a.address) || "user";

/** Resolve the best avatar URL from an activity. */
const resolveAvatarUrl = (a: ChatActivity): string | undefined =>
  a.user?.avatarImageUrl || a.meta?.avatarImageUrl;

/** Resolve the best identifier to open a profile sheet (prefer username, fallback address). */
const resolveProfileId = (a: ChatActivity): string | undefined =>
  a.user?.username || a.user?.address || a.meta?.username || a.address;

interface ChatBubbleProps {
  a: ChatActivity;
  onUserPress: (identifier: string) => void;
}

const ChatBubble: React.FC<ChatBubbleProps> = memo(({ a, onUserPress }) => {
  const displayName = resolveDisplayName(a);
  const avatarUrl = resolveAvatarUrl(a);
  const profileId = resolveProfileId(a);

  const handlePress = useCallback(() => {
    if (profileId) onUserPress(profileId);
  }, [profileId, onUserPress]);

  switch (a.status) {
    case StreamActivityType.MESSAGE:
      return (
        <View className="mb-1.5 bg-black/60 rounded-xl px-2.5 py-1.5 self-start max-w-[85%] flex-row items-start">
          <TouchableOpacity onPress={handlePress} activeOpacity={0.7} className="mr-1.5 mt-0.5">
            <Avatar uri={avatarUrl} size={20} name={displayName} />
          </TouchableOpacity>
          <Text style={{ color: '#FFFFFF' }} className="text-[12px] leading-[17px] flex-1 flex-shrink">
            <Text
              className="font-bold"
              style={{ color: colorForUser(displayName) }}
              onPress={handlePress}
            >
              {displayName}{" "}
            </Text>
            <Text style={a.optimistic ? { opacity: 0.6, color: '#FFFFFF' } : { color: '#FFFFFF' }}>
              {a.meta?.content}
            </Text>
          </Text>
        </View>
      );

    case StreamActivityType.JOINED:
      return (
        <View className="mb-1 self-start flex-row items-center">
          <TouchableOpacity onPress={handlePress} activeOpacity={0.7} className="mr-1">
            <Avatar uri={avatarUrl} size={14} name={displayName} />
          </TouchableOpacity>
          <Text className="text-white/40 text-[11px]">
            👋{" "}
            <Text onPress={handlePress} className="font-medium">
              {displayName}
            </Text>{" "}
            joined
          </Text>
        </View>
      );

    case StreamActivityType.LEFT:
      return (
        <View className="mb-1 self-start flex-row items-center">
          <TouchableOpacity onPress={handlePress} activeOpacity={0.7} className="mr-1">
            <Avatar uri={avatarUrl} size={14} name={displayName} />
          </TouchableOpacity>
          <Text className="text-white/40 text-[11px]">
            <Text onPress={handlePress} className="font-medium">
              {displayName}
            </Text>{" "}
            left
          </Text>
        </View>
      );

    case StreamActivityType.TIP: {
      const amt = a.meta?.amount || 0;
      return (
        <View className="mb-1.5 bg-theme-yellow-500/20 border border-theme-yellow-400/30 rounded-xl px-2.5 py-2 self-start max-w-[85%] flex-row items-start">
          <TouchableOpacity onPress={handlePress} activeOpacity={0.7} className="mr-1.5 mt-0.5">
            <Avatar uri={avatarUrl} size={20} name={displayName} />
          </TouchableOpacity>
          <View className="flex-1 flex-shrink">
            <Text className="text-theme-yellow-300 text-[12px] font-semibold">
              🎁{" "}
              <Text onPress={handlePress}>
                {displayName}
              </Text>{" "}
              sent {amt.toLocaleString()} <DhbCoin />
            </Text>
            {a.meta?.message ? (
              <Text style={{ color: 'rgba(255,255,255,0.7)' }} className="text-[11px] mt-0.5">
                {a.meta.message}
              </Text>
            ) : null}
          </View>
        </View>
      );
    }

    case StreamActivityType.START:
      return (
        <View className="mb-1 self-start">
          <Text className="text-red-400 text-[11px] font-semibold">
            🔴 Stream has started
          </Text>
        </View>
      );

    case StreamActivityType.END:
      return (
        <View className="mb-1 self-start">
          <Text className="text-white/50 text-[11px]">
            ⏹ Stream has ended
          </Text>
        </View>
      );

    default:
      return null;
  }
});

const LiveViewerChat: React.FC<LiveViewerChatProps> = ({
  activities,
  canSend,
  isLive,
  isEnded,
  isScheduled,
  onSendMessage,
  onGiftPress,
  chatEnabled,
}) => {
  const [message, setMessage] = useState("");
  const listRef = useRef<FlatList<ChatActivity> | null>(null);
  const { height: keyboardHeight, isVisible: kbVisible } = useKeyboard();
  const { showUserProfile } = useUserProfileSheet();

  const handleUserPress = useCallback(
    (identifier: string) => {
      showUserProfile(identifier, { initialHeightPct: 0.4, source: "live-chat" } as any);
    },
    [showUserProfile]
  );

  // Only show messages & tips (filter out most join/leave noise for cleaner UI)
  const filteredActivities = useMemo(() => {
    return activities.filter(
      (a) =>
        a.status === StreamActivityType.MESSAGE ||
        a.status === StreamActivityType.TIP ||
        a.status === StreamActivityType.START ||
        a.status === StreamActivityType.END
    );
  }, [activities]);

  const reversed = useMemo(
    () => filteredActivities.slice().reverse(),
    [filteredActivities]
  );

  const handleSend = useCallback(() => {
    const content = message.trim();
    if (!content || !canSend || !chatEnabled) return;
    onSendMessage(content);
    setMessage("");
  }, [message, canSend, chatEnabled, onSendMessage]);

  const renderItem = useCallback(
    ({ item }: { item: ChatActivity }) => <ChatBubble a={item} onUserPress={handleUserPress} />,
    [handleUserPress]
  );

  const keyExtractor = useCallback((a: ChatActivity, idx: number) => {
    const t = a.createdAt || 0;
    const who = (a.address || a.meta?.username || "").toLowerCase();
    const contentKey =
      (a.meta?.content ? String(a.meta?.content).slice(0, 16) : "") ||
      String(a.meta?.amount || "");
    return `${t}:${a.status}:${who}:${contentKey}:${idx}`;
  }, []);

  const inputDisabled = !canSend || !chatEnabled || isScheduled;

  const placeholderText = isEnded
    ? "Stream ended"
    : isScheduled
      ? "Chat will open when live"
      : !isLive
        ? "Waiting for stream..."
        : !chatEnabled
          ? "Chat is disabled"
          : !canSend
            ? "Sign in to chat"
            : "Say something...";

  const inputBottomOffset = useMemo(() => {
    if (!kbVisible) return 0;
    return keyboardHeight;
  }, [kbVisible, keyboardHeight]);

  return (
    <View pointerEvents="box-none">
      {/* Chat messages - floating, transparent */}
      <View
        style={{ height: 260 }}
        pointerEvents="box-none"
      >
        <FlatList
          ref={listRef}
          data={reversed}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          className="px-3"
          contentContainerStyle={{ paddingTop: 8, paddingBottom: 4 }}
          initialNumToRender={15}
          maxToRenderPerBatch={20}
          windowSize={5}
          removeClippedSubviews
          inverted
          showsVerticalScrollIndicator={false}
        />
      </View>

      {/* Input bar */}
      <View
        className="flex-row items-center px-3 pb-2 pt-1"
        style={{ marginBottom: inputBottomOffset }}
      >
        <View className="flex-1 flex-row items-center bg-black/60 rounded-full px-4 border border-white/20 mr-2" style={{ height: 40 }}>
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder={placeholderText}
            placeholderTextColor="#999999"
            className="flex-1 text-[14px]"
            style={{ color: '#FFFFFF', paddingVertical: 0 }}
            editable={!inputDisabled}
            maxLength={500}
            multiline={false}
            returnKeyType="send"
            onSubmitEditing={handleSend}
          />
          {message.trim() && !inputDisabled ? (
            <TouchableOpacity
              onPress={handleSend}
              activeOpacity={0.7}
              className="ml-1 p-2"
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Send message"
            >
              <Send color="#F4F4F5" size={18} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Gift button */}
        {isLive && (
          <TouchableOpacity
            onPress={onGiftPress}
            activeOpacity={0.7}
            className="w-10 h-10 rounded-full bg-theme-neutrals-800/90 border border-theme-neutrals-600/40 items-center justify-center"
          >
            <Gift color="#D4D4D8" size={18} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

export default memo(LiveViewerChat);

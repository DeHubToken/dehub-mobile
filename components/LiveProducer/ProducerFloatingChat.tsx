import { DhbCoin } from "../common/DhbCoin";
import React, { memo, useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
} from "react-native";
import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowUpCircle, MessageCircleOff } from "lucide-react-native";
import { StreamActivityType } from "../../services/enums/livestream.enum";
import { useUserProfileSheet } from "../../context/UserProfileSheetContext";
import Avatar from "../common/Avatar";
import { useKeyboard } from "../../hooks/useKeyboard";
import type { UserReference } from "../LiveViewer/LiveViewerChat";

export interface ProducerChatActivity {
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

interface ProducerFloatingChatProps {
  activities: ProducerChatActivity[];
  isLive: boolean;
  chatEnabled: boolean;
  canSend: boolean;
  onSendMessage: (content: string) => void;
  onToggleChatEnabled?: () => void;
  settingsUpdating?: boolean;
}

/** Shortened wallet address display */
const shortAddr = (addr?: string): string =>
  addr ? `${addr.slice(0, 4)}...${addr.slice(-4)}` : "";

/** Resolve display name from user ref or meta fallback. */
const resolveDisplayName = (a: ProducerChatActivity): string =>
  a.user?.displayName || a.user?.username || a.meta?.username || shortAddr(a.user?.address || a.address) || "user";

/** Resolve avatar URL from user ref or meta fallback. */
const resolveAvatarUrl = (a: ProducerChatActivity): string | undefined =>
  a.user?.avatarImageUrl || a.meta?.avatarImageUrl;

/** Resolve identifier for profile sheet (prefer username, fallback address). */
const resolveProfileId = (a: ProducerChatActivity): string | undefined =>
  a.user?.username || a.user?.address || a.meta?.username || a.address;

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
    hash = ((hash * 31 + key.charCodeAt(i)) >>> 0);
  }
  return USERNAME_PALETTE[hash % USERNAME_PALETTE.length];
};

/**
 * Messages sit straight on the broadcast now — no bubble behind them — so
 * every line carries its own shadow. Without it a white name over a bright
 * frame is unreadable, and the fix cannot be a slab: the slab is the thing
 * being removed.
 */
const onVideo = {
  textShadowColor: "rgba(0,0,0,0.85)",
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 3,
} as const;

/** Visible message types (filter join/leave noise) */
const VISIBLE_TYPES = new Set<string>([
  StreamActivityType.MESSAGE,
  StreamActivityType.TIP,
  StreamActivityType.START,
  StreamActivityType.END,
]);

const ProducerFloatingChat: React.FC<ProducerFloatingChatProps> = ({
  activities,
  isLive,
  chatEnabled,
  canSend,
  onSendMessage,
  onToggleChatEnabled,
  settingsUpdating,
}) => {
  const [message, setMessage] = useState("");
  const listRef = useRef<FlatList<ProducerChatActivity> | null>(null);
  const { showUserProfile } = useUserProfileSheet();
  const { height: kbHeight, isVisible: kbVisible } = useKeyboard();
  const inputLift = kbVisible ? kbHeight : 0;

  const handleUserPress = useCallback(
    (identifier: string) => {
      showUserProfile(identifier, { initialHeightPct: 0.4, source: "producer-chat" } as any);
    },
    [showUserProfile]
  );

  const filteredActivities = useMemo(() => {
    return activities.filter((a) => VISIBLE_TYPES.has(a.status as string));
  }, [activities]);

  const dataReversed = useMemo(
    () => filteredActivities.slice().reverse(),
    [filteredActivities]
  );

  const handleSend = useCallback(() => {
    const content = message.trim();
    if (!content || !canSend) return;
    onSendMessage(content);
    setMessage("");
  }, [message, canSend, onSendMessage]);

  const renderItem = useCallback(
    ({ item }: { item: ProducerChatActivity }) => (
      <ChatBubble item={item} onUserPress={handleUserPress} />
    ),
    [handleUserPress]
  );

  const keyExtractor = useCallback(
    (a: ProducerChatActivity, idx: number) => {
      const t = a.createdAt || 0;
      const who = (a.address || a.meta?.username || "").toLowerCase();
      const contentKey =
        a.meta?.content
          ? String(a.meta.content).slice(0, 16)
          : String(a.meta?.amount || "");
      return `${t}:${a.status}:${who}:${contentKey}:${idx}`;
    },
    []
  );

  return (
    <View className="px-3" pointerEvents="box-none">
      {isLive && onToggleChatEnabled ? (
        <View className="flex-row items-center mb-2" pointerEvents="box-none">
          <TouchableOpacity
            onPress={onToggleChatEnabled}
            activeOpacity={0.8}
            disabled={settingsUpdating}
            className={`flex-row items-center px-2.5 py-1 rounded-full ${
              chatEnabled ? "bg-theme-neutrals-800/60" : "bg-red-600/40"
            }`}
          >
            <MessageCircleOff
              color={chatEnabled ? "#32D583" : "#F97066"}
              size={12}
            />
            <Text className="text-white/70 text-[10px] ml-1 font-medium">
              {chatEnabled ? "Chat on" : "Chat off"}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* The list dissolves at its top edge rather than stopping dead. The
          list is inverted, so "top" is the far end of the data — the mask is
          still just a gradient over the viewport, opaque at the bottom. */}
      <MaskedView
        style={{ maxHeight: 200 }}
        pointerEvents="none"
        maskElement={
          <LinearGradient
            style={{ flex: 1 }}
            colors={["transparent", "#000", "#000"]}
            locations={[0, 0.35, 1]}
          />
        }
      >
        <FlatList
          ref={listRef}
          data={dataReversed}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          inverted
          showsVerticalScrollIndicator={false}
          initialNumToRender={12}
          maxToRenderPerBatch={16}
          windowSize={5}
          removeClippedSubviews
          keyboardShouldPersistTaps="handled"
        />
      </MaskedView>

      <View
        className="flex-row items-center mt-2 rounded-full px-3 py-1.5 border border-white/15 bg-black/40"
        style={{ marginBottom: inputLift }}
      >
        <TextInput
          value={message}
          onChangeText={setMessage}
          placeholder={
            isLive && canSend ? "Say something..." : "Chat unavailable"
          }
          placeholderTextColor="#8B8D90"
          className="flex-1 text-white text-[12px] leading-5"
          editable={canSend && isLive}
          maxLength={240}
          multiline={false}
          returnKeyType="send"
          onSubmitEditing={handleSend}
        />
        <TouchableOpacity
          onPress={handleSend}
          disabled={!message.trim() || !canSend}
          activeOpacity={0.8}
          className="ml-2"
          style={!message.trim() || !canSend ? { opacity: 0.3 } : undefined}
        >
          <ArrowUpCircle color="#fff" size={22} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

/** Individual chat bubble */
const ChatBubble: React.FC<{ item: ProducerChatActivity; onUserPress: (id: string) => void }> = memo(
  ({ item, onUserPress }) => {
    const displayName = resolveDisplayName(item);
    const avatarUrl = resolveAvatarUrl(item);
    const profileId = resolveProfileId(item);

    const handlePress = useCallback(() => {
      if (profileId) onUserPress(profileId);
    }, [profileId, onUserPress]);

    switch (item.status) {
      case StreamActivityType.MESSAGE: {
        return (
          <View className="flex-row items-start mb-1.5 px-0.5 py-1 self-start max-w-[92%]">
            <TouchableOpacity onPress={handlePress} activeOpacity={0.7} className="mr-1.5 mt-0.5">
              <Avatar uri={avatarUrl} size={18} name={displayName} />
            </TouchableOpacity>
            <Text
              className="text-[11px] font-bold mr-1.5"
              style={{ color: colorForUser(displayName), ...onVideo }}
              numberOfLines={1}
              onPress={handlePress}
            >
              {displayName}
            </Text>
            <Text
              className={`text-white text-[11px] flex-1 flex-shrink ${
                item.optimistic ? "opacity-60" : ""
              }`}
              style={onVideo}
              numberOfLines={3}
            >
              {item.meta?.content}
            </Text>
            {item.optimistic ? (
              <Text className="text-white/30 text-[9px] ml-1">...</Text>
            ) : null}
          </View>
        );
      }
      case StreamActivityType.TIP: {
        return (
          <View className="flex-row items-center mb-1.5 bg-theme-yellow-500/20 rounded-xl px-2.5 py-1.5 self-start max-w-[85%] border border-theme-yellow-400/30">
            <TouchableOpacity onPress={handlePress} activeOpacity={0.7} className="mr-1.5">
              <Avatar uri={avatarUrl} size={18} name={displayName} />
            </TouchableOpacity>
            <Text className="text-[11px] mr-1">💰</Text>
            <Text className="text-theme-yellow-300 text-[11px] font-semibold" onPress={handlePress}>
              {displayName}
            </Text>
            <Text className="text-white/70 text-[11px] ml-1">
              tipped {item.meta?.amount} <DhbCoin />
            </Text>
          </View>
        );
      }
      case StreamActivityType.START:
        return (
          <View className="mb-1.5 self-start">
            <Text className="text-white/50 text-[10px]" style={onVideo}>
              🔴 Stream started
            </Text>
          </View>
        );
      case StreamActivityType.END:
        return (
          <View className="mb-1.5 self-start">
            <Text className="text-white/50 text-[10px]" style={onVideo}>
              ⏹️ Stream ended
            </Text>
          </View>
        );
      default:
        return null;
    }
  }
);

export default memo(ProducerFloatingChat);

import { DhbCoin } from "../common/DhbCoin";
import React, { memo, useCallback, useMemo, useRef } from "react";
import { View, Text, FlatList, TouchableOpacity } from "react-native";
import { Image } from "expo-image";
import { StreamActivityType } from "../../services/enums/livestream.enum";
import { useUserProfileSheet } from "../../context/UserProfileSheetContext";
import Avatar from "../common/Avatar";
import { TEXT_SHADOW } from "../common/ViewerChrome";

/**
 * Messages ride the picture, not a pill.
 *
 * Each line used to sit in its own dark rounded box, which over a
 * broadcast reads as a stack of little cards rather than as a room
 * talking. The shade at the foot of the frame and this shadow carry the
 * legibility the boxes were carrying — the same arrangement the web
 * viewer's overlay chat uses.
 */
const MESSAGE_TEXT = { color: "#FFFFFF", ...TEXT_SHADOW } as const;

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
    gifUrl?: string;
    amount?: number;
    avatarImageUrl?: string;
    message?: string;
  };
  optimistic?: boolean;
}

interface LiveViewerChatProps {
  activities: ChatActivity[];
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
        <View className="mb-2 self-start max-w-[92%] flex-row items-start">
          <TouchableOpacity onPress={handlePress} activeOpacity={0.7} className="mr-1.5 mt-0.5">
            <Avatar uri={avatarUrl} size={20} name={displayName} />
          </TouchableOpacity>
          <View className="flex-1 flex-shrink">
          <Text style={MESSAGE_TEXT} className="text-[13px] leading-[18px]">
            <Text
              className="font-bold"
              style={{ color: colorForUser(displayName) }}
              onPress={handlePress}
            >
              {displayName}{" "}
            </Text>
            {!a.meta?.gifUrl ? <Text style={{ color: '#FFFFFF' }}>{a.meta?.content}</Text> : null}
          </Text>
          {a.meta?.gifUrl ? <Image source={{ uri: a.meta.gifUrl }} style={{ width: 160, height: 120, borderRadius: 8, marginTop: 4 }} contentFit="cover" /> : null}
          </View>
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
        <View className="mb-1.5 bg-white/10 rounded-2xl px-2.5 py-2 self-start max-w-[85%] flex-row items-start">
          <TouchableOpacity onPress={handlePress} activeOpacity={0.7} className="mr-1.5 mt-0.5">
            <Avatar uri={avatarUrl} size={20} name={displayName} />
          </TouchableOpacity>
          <View className="flex-1 flex-shrink">
            <Text className="text-white text-[12px] font-semibold">
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
          <Text className="text-white/70 text-[11px] font-semibold">
            Live started
          </Text>
        </View>
      );

    case StreamActivityType.END:
      return (
        <View className="mb-1 self-start">
          <Text className="text-white/50 text-[11px]">
            Stream has ended
          </Text>
        </View>
      );

    default:
      return null;
  }
});

const LiveViewerChat: React.FC<LiveViewerChatProps> = ({ activities }) => {
  const listRef = useRef<FlatList<ChatActivity> | null>(null);
  const { showUserProfile } = useUserProfileSheet();

  const handleUserPress = useCallback(
    (identifier: string) => {
      showUserProfile(identifier, { initialHeightPct: 0.4, source: "live-chat" } as any);
    },
    [showUserProfile]
  );

  // Keep viewer arrivals alongside messages and stream milestones.
  const filteredActivities = useMemo(() => {
    return activities.filter(
      (a) =>
        a.status === StreamActivityType.MESSAGE ||
        a.status === StreamActivityType.JOINED ||
        a.status === StreamActivityType.TIP ||
        a.status === StreamActivityType.START ||
        a.status === StreamActivityType.END
    );
  }, [activities]);

  const reversed = useMemo(
    () => filteredActivities.slice().reverse(),
    [filteredActivities]
  );

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

  return (
    /* The room, floating over the picture. 220 rather than 260: the bar
       under it is one row now instead of two, and the extra height was
       only ever covering more of the stream with nothing in it. */
    <View style={{ height: 220 }} pointerEvents="box-none">
      <FlatList
        ref={listRef}
        data={reversed}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        className="px-4"
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 4 }}
        initialNumToRender={15}
        maxToRenderPerBatch={20}
        windowSize={5}
        removeClippedSubviews={false}
        inverted
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
};

export default memo(LiveViewerChat);

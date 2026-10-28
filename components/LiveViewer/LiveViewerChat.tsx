import { translateCopy as _translateCopy } from "../../i18n/copy";
import { DhbCoin } from "../common/DhbCoin";
import React, { memo, useCallback, useEffect, useMemo, useRef } from "react";
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from "react-native-reanimated";
import { View, Text, FlatList, Pressable, TouchableOpacity } from "react-native";
import { Image } from "expo-image";
import { StreamActivityType } from "../../services/enums/livestream.enum";
import { useUserProfileSheet } from "../../context/UserProfileSheetContext";
import Avatar from "../common/Avatar";
import { getAvatarUrl, getBadgeUrlFor, getBadgeHoverOpticalStyle as getBadgeOpticalStyle } from "../../libs/misc";
import BadgeArtwork from "../common/BadgeArtwork";
import { TEXT_SHADOW } from "../common/ViewerChrome";
import { useTranslation } from "../../hooks/useTranslation";
import { useTranslation as useI18n } from "react-i18next";
import TranslateButton from "../ui/TranslateButton";

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
  badgeLock?: { tier: string; requirement: number } | null;
  hideBadgeAndBalance?: boolean;
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
  /**
   * Set only for the stream's creator and the moderators they appointed: a
   * long press on someone else's line opens the moderation actions.
   */
  onModerate?: (activity: ChatActivity) => void;
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
  a.user?.displayName || a.user?.username || a.meta?.username || shortAddr(a.user?.address || a.address) || _translateCopy("copy.04f8996da763", { defaultValue: "user" });

/**
 * Resolve the best avatar from an activity, as something fetchable.
 *
 * The API never hands a URL out here. `userReferenceProjection` carries the
 * stored path — `avatars/0x....jpg` — and the livechat sender lookup carries
 * that path prefixed onto the API host, which 404s because only the CDN holds
 * the objects. Either one reaches <Image> with nothing it can fetch, so every
 * face in the chat fell back to its initial the moment you joined a stream.
 * getAvatarUrl re-bases both onto the CDN, the way every other avatar in the
 * app is resolved.
 */
const resolveAvatarUrl = (a: ChatActivity): string =>
  getAvatarUrl(a.user?.avatarImageUrl || a.meta?.avatarImageUrl);

/** Resolve the best identifier to open a profile sheet (prefer username, fallback address). */
const resolveProfileId = (a: ChatActivity): string | undefined =>
  a.user?.username || a.user?.address || a.meta?.username || a.address;

interface ChatBubbleProps {
  a: ChatActivity;
  onUserPress: (identifier: string) => void;
  onModerate?: (activity: ChatActivity) => void;
}

const ChatBubble: React.FC<ChatBubbleProps> = memo(({ a, onUserPress, onModerate }) => {
  const { t } = useI18n();
  const displayName = resolveDisplayName(a);
  const avatarUrl = resolveAvatarUrl(a);
  const profileId = resolveProfileId(a);
  // Same badge a comment row draws: balance and grandfathered lock together,
  // nothing when the holder hides it.
  const badgeImg = useMemo(
    () => (a.user && !a.user.hideBadgeAndBalance ? getBadgeUrlFor(a.user) : undefined),
    [a.user],
  );
  const texts = useMemo(() => ({ content: a.status === StreamActivityType.MESSAGE && !a.meta?.gifUrl ? a.meta?.content || '' : '' }), [a.status, a.meta?.gifUrl, a.meta?.content]);
  const translation = useTranslation(texts, undefined, 'chat', true);

  const handlePress = useCallback(() => {
    if (profileId) onUserPress(profileId);
  }, [profileId, onUserPress]);

  switch (a.status) {
    case StreamActivityType.MESSAGE:
      return (
        <Pressable
          onLongPress={onModerate ? () => onModerate(a) : undefined}
          delayLongPress={350}
          disabled={!onModerate}
          className="mb-2 self-start max-w-[92%] flex-row items-start"
        >
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
              {displayName}
              {badgeImg ? (
                <View style={{ height: 14, marginLeft: 2, justifyContent: "center" }}>
                  <BadgeArtwork source={badgeImg} style={[getBadgeOpticalStyle(badgeImg, 13, 0, 14), { marginLeft: 0 }]} contentFit="contain" />
                </View>
              ) : null}{" "}
            </Text>
            {!a.meta?.gifUrl ? <Text style={{ color: '#FFFFFF' }}>{translation.isTranslated ? translation.translatedTexts.content : a.meta?.content}</Text> : null}
          </Text>
          {a.meta?.gifUrl ? <Image source={{ uri: a.meta.gifUrl }} style={{ width: 160, height: 120, borderRadius: 8, marginTop: 4 }} contentFit="cover" /> : null}
          {translation.shouldShow && (
            <TranslateButton
              isTranslated={translation.isTranslated}
              isLoading={translation.isLoading}
              detectedLanguage={translation.sourceLang}
              onTranslate={translation.handleTranslate}
              onShowOriginal={translation.handleShowOriginal}
            />
          )}
          </View>
        </Pressable>
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
            {t("liveViewer.joined")}
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
            {t("liveViewer.leftStream")}
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
              {t("liveViewer.sentAmount", { amount: amt.toLocaleString() })} <DhbCoin />
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
            {t("liveViewer.liveStarted")}
          </Text>
        </View>
      );

    case StreamActivityType.END:
      return (
        <View className="mb-1 self-start">
          <Text className="text-white/50 text-[11px]">
            {t("liveViewer.streamHasEnded")}
          </Text>
        </View>
      );

    default:
      return null;
  }
});

/**
 * A line that arrives while the chat is open glides up into place; a tip also
 * glows for a beat, the same landing a tip message gets under a post.
 */
const LandIn = memo(function LandIn({ glow, children }: { glow: boolean; children: React.ReactNode }) {
  const rise = useSharedValue(0);
  const shine = useSharedValue(glow ? 1 : 0);
  useEffect(() => {
    rise.value = withSpring(1, { damping: 18, stiffness: 200 });
    if (glow) shine.value = withDelay(200, withTiming(0, { duration: 1600 }));
  }, [glow, rise, shine]);
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, rise.value * 1.5),
    transform: [{ translateY: (1 - rise.value) * 12 }],
    shadowColor: "#FFFFFF",
    shadowOpacity: shine.value * 0.7,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  }));
  return <Animated.View style={style}>{children}</Animated.View>;
});

const LiveViewerChat: React.FC<LiveViewerChatProps> = ({ activities, onModerate }) => {
  const listRef = useRef<FlatList<ChatActivity> | null>(null);
  const { showUserProfile } = useUserProfileSheet();

  const handleUserPress = useCallback(
    (identifier: string) => {
      showUserProfile(identifier, { initialHeightPct: 0.4, source: "live-chat" } as any);
    },
    [showUserProfile]
  );

  // Keep viewer arrivals alongside messages and stream milestones. A viewer's
  // arrival shows once: reconnects re-send JoinStream (after a LEFT), and both
  // the viewer and the producer screen feed this list.
  const filteredActivities = useMemo(() => {
    const arrivals = new Set<string>();
    return activities.filter((a) => {
      if (a.status === StreamActivityType.JOINED) {
        const who = (a.address || a.user?.address || a.user?.username || a.meta?.username || "").toLowerCase();
        if (!who) return true;
        if (arrivals.has(who)) return false;
        arrivals.add(who);
        return true;
      }
      return (
        a.status === StreamActivityType.MESSAGE ||
        a.status === StreamActivityType.TIP ||
        a.status === StreamActivityType.START ||
        a.status === StreamActivityType.END
      );
    });
  }, [activities]);

  const reversed = useMemo(
    () => filteredActivities.slice().reverse(),
    [filteredActivities]
  );

  // Keyed by position from the oldest line, so rows already on screen keep
  // their key (and stay put) when a new one arrives at the bottom.
  const total = reversed.length;
  const keyExtractor = useCallback((a: ChatActivity, idx: number) => {
    const t = a.createdAt || 0;
    const who = (a.address || a.meta?.username || "").toLowerCase();
    const contentKey =
      (a.meta?.content ? String(a.meta?.content).slice(0, 16) : "") ||
      String(a.meta?.amount || "");
    return `${t}:${a.status}:${who}:${contentKey}:${total - 1 - idx}`;
  }, [total]);

  // Lines already there when the chat opened don't animate; later ones land.
  const seen = useRef<Set<string> | null>(null);
  if (seen.current == null) seen.current = new Set(reversed.map((a, i) => keyExtractor(a, i)));

  const renderItem = useCallback(
    ({ item, index }: { item: ChatActivity; index: number }) => {
      const bubble = <ChatBubble a={item} onUserPress={handleUserPress} onModerate={onModerate} />;
      const key = keyExtractor(item, index);
      if (seen.current!.has(key)) return bubble;
      return <LandIn glow={item.status === StreamActivityType.TIP}>{bubble}</LandIn>;
    },
    [handleUserPress, onModerate, keyExtractor]
  );

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

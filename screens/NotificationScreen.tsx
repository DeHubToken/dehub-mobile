import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  View,
  Text,
  FlatList,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Platform,
  UIManager,
} from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "../components/ui/Icon";
import ScreenHeader from "../components/ScreenHeader";
import { 
  getNotifications, 
  markNotificationAsRead, 
  markAllNotificationsAsRead,
  acceptFollowRequest,
  rejectFollowRequest,
  type NotificationItem,
  type NotificationCategory,
} from "../services/user.service";
import { useUser, useAuthState, useAuthActions } from "../context/AuthContext";
import { useGateToHome } from "../hooks/useGateToHome";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { ScreenNames } from "../navigation/ScreenNames";
import { formatNotificationDate } from "../libs/date.util";
import { useUserProfileSheet } from "../context/UserProfileSheetContext";
import { buildCdnPath, getAvatarUrl, getShortsThumbnailUrl } from "../libs";
import { cdnImage } from "../libs/cdnImage";
import { addDismissedIds, getDismissedIds } from "../libs/notifications.dismissed";
import { openInApp } from "../libs/links.utils";
import Avatar from "../components/common/Avatar";
import SmartImage from "../components/common/SmartImage";
import { reactionMeta } from "../libs/reactions";
import {
  NotificationType,
  getNotificationIconConfig,
  NON_CLICKABLE_TYPES,
} from "../services/enums/notification.enums";

type NotificationTypeFilter = 'all' | 'likes' | 'follows' | 'comments' | 'reposts' | 'subscriptions' | 'tips' | 'payments' | 'livestreams';

const TYPE_TABS: { key: NotificationTypeFilter; icon: string; label: string }[] = [
  { key: 'all', icon: 'Bell', label: 'All' },
  { key: 'likes', icon: 'ThumbsUp', label: 'Likes' },
  { key: 'follows', icon: 'UserPlus', label: 'Follows' },
  { key: 'comments', icon: 'MessageSquareText', label: 'Comments' },
  { key: 'reposts', icon: 'Repeat2', label: 'Reposts' },
  { key: 'subscriptions', icon: 'Users', label: 'Subs' },
  { key: 'tips', icon: 'Gem', label: 'Tips' },
  { key: 'payments', icon: 'CreditCard', label: 'Payments' },
  { key: 'livestreams', icon: 'Zap', label: 'Live' },
];

const FILTER_TYPE_MAP: Record<NotificationTypeFilter, NotificationType[]> = {
  all: [],
  likes: [NotificationType.LIKE, NotificationType.COMMENT_LIKE],
  follows: [NotificationType.FOLLOWING, NotificationType.FOLLOW_REQUEST, NotificationType.FOLLOW_REQUEST_ACCEPTED],
  comments: [NotificationType.COMMENT, NotificationType.COMMENT_REPLY, NotificationType.MENTION],
  reposts: [NotificationType.REPOST, NotificationType.QUOTE],
  subscriptions: [NotificationType.SUBSCRIPTION, NotificationType.PPV_PURCHASE],
  tips: [NotificationType.TIP, NotificationType.BOUNTY_AVAILABLE, NotificationType.BOUNTY_CLAIMED],
  payments: [NotificationType.FIAT_PAYMENT_COMPLETED],
  livestreams: [NotificationType.LIVESTREAM_START],
};

/**
 * Types the API does not store, so it cannot filter on them. Sending one makes
 * the API drop the whole filter and answer with an unfiltered page, so they are
 * stripped before the request and matched client-side only.
 *
 * fiat_payment_completed exists in this app's enum but has no counterpart
 * server-side and nothing emits it, so the Payments tab stays empty until
 * something does.
 */
const CLIENT_ONLY_TYPES = new Set<string>([NotificationType.FIAT_PAYMENT_COMPLETED]);

/** The subset of a tab's types the API can filter on, or undefined for no server filter. */
function apiTypesForFilter(filter: NotificationTypeFilter): string[] | undefined {
  const types = FILTER_TYPE_MAP[filter].filter((t) => !CLIENT_ONLY_TYPES.has(t));
  return types.length ? types : undefined;
}

const SPRING_CONFIG = { stiffness: 400, damping: 30 };
const TAB_HEIGHT = 44;

interface TypeTabsProps {
  selected: NotificationTypeFilter;
  onSelect: (filter: NotificationTypeFilter) => void;
  disabled?: boolean;
  counts: Record<NotificationTypeFilter, number>;
}

const TypeTabs: React.FC<TypeTabsProps> = React.memo(({ selected, onSelect, disabled, counts }) => {
  const tabWidths = useRef<Record<string, number>>({});
  const tabPositions = useRef<Record<string, number>>({});
  const indicatorX = useSharedValue(0);
  const indicatorW = useSharedValue(0);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
    width: indicatorW.value,
  }));

  const handleLayout = useCallback((key: string, x: number, width: number) => {
    tabWidths.current[key] = width;
    tabPositions.current[key] = x;
    if (key === selected) {
      indicatorX.value = withSpring(x, SPRING_CONFIG);
      indicatorW.value = withSpring(width, SPRING_CONFIG);
    }
  }, [selected, indicatorX, indicatorW]);

  useEffect(() => {
    const x = tabPositions.current[selected];
    const w = tabWidths.current[selected];
    if (x !== undefined && w !== undefined) {
      indicatorX.value = withSpring(x, SPRING_CONFIG);
      indicatorW.value = withSpring(w, SPRING_CONFIG);
    }
  }, [selected, indicatorX, indicatorW]);

  return (
    <View className="border-b border-zinc-800/50" style={{ paddingVertical: 8 }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 12 }}
      >
        <View style={{ flexDirection: 'row', gap: 8, position: 'relative' }}>
          <Animated.View
            style={[
              indicatorStyle,
              {
                position: 'absolute',
                top: 0,
                height: TAB_HEIGHT,
                borderRadius: 12,
                backgroundColor: 'rgba(255,255,255,0.2)',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.4)',
              },
            ]}
          />

          {TYPE_TABS.map((tab) => {
            const isActive = selected === tab.key;
            const count = counts[tab.key];
            return (
              <TouchableOpacity
                key={tab.key}
                onPress={() => onSelect(tab.key)}
                disabled={disabled}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={tab.label}
                accessibilityState={{ selected: isActive }}
                onLayout={(e) => {
                  const { x, width } = e.nativeEvent.layout;
                  handleLayout(tab.key, x, width);
                }}
                style={[
                  {
                    height: TAB_HEIGHT,
                    paddingHorizontal: 14,
                    borderRadius: 12,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                  },
                  !isActive && { backgroundColor: '#27272a' },
                  disabled && !isActive ? { opacity: 0.5 } : undefined,
                ]}
              >
                <Icon
                  name={tab.icon as any}
                  size={14}
                  color={isActive ? '#fff' : '#a1a1aa'}
                />
                {count > 0 && (
                  <View
                    style={{
                      backgroundColor: 'rgba(255,255,255,0.20)',
                      borderRadius: 9,
                      minWidth: 18,
                      height: 18,
                      paddingHorizontal: 4,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
                      {count > 99 ? '99+' : count}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
});

// Monochrome constraint over the shared icon config: the per-type saturated
// tints bypass the monochrome system. Semantic color survives only where it
// means something — red for warnings/removals, green for money received.
const MONEY_RECEIVED_TYPES = new Set<string>([
  NotificationType.TIP,
  NotificationType.BOUNTY_CLAIMED,
  NotificationType.PPV_PURCHASE,
  NotificationType.FIAT_PAYMENT_COMPLETED,
]);
const WARNING_TYPES = new Set<string>([
  NotificationType.VIDEO_REMOVAL,
  NotificationType.ACCOUNT_WARNING,
]);
const MONO_ICON_COLORS = new Set(['#F4F4F5', '#D4D4D8']);

const getMonoIconConfig = (type: NotificationType | string): { name: string; color: string } => {
  const cfg = getNotificationIconConfig(type);
  if (WARNING_TYPES.has(type as string)) return { ...cfg, color: '#EF4444' };
  if (MONEY_RECEIVED_TYPES.has(type as string)) return { ...cfg, color: '#22C55E' };
  return MONO_ICON_COLORS.has(cfg.color) ? cfg : { ...cfg, color: '#D4D4D8' };
};

/**
 * Check if notification is clickable based on type and available data
 */
const isNotificationClickable = (notification: NotificationItem): boolean => {
  const type = notification.type as NotificationType;
  
  // Non-clickable types (dislike doesn't generate notifications but just in case)
  if (NON_CLICKABLE_TYPES.has(type)) return false;
  
  // Follow request — handled via inline accept/reject buttons, not clickable to navigate
  if (type === NotificationType.FOLLOW_REQUEST) return false;

  // Follow request accepted — navigate to the requester's profile
  if (type === NotificationType.FOLLOW_REQUEST_ACCEPTED) {
    return !!(notification.actorAddress || notification.actorUsername);
  }

  // Following/Subscription - need actor info to show profile
  if (type === NotificationType.FOLLOWING || type === NotificationType.SUBSCRIPTION) {
    return !!(notification.actorAddress || notification.actorUsername);
  }
  
  // Content types - need tokenId
  if (type === NotificationType.LIKE ||
      type === NotificationType.COMMENT ||
      type === NotificationType.COMMENT_REPLY ||
      type === NotificationType.COMMENT_LIKE ||
      type === NotificationType.REPOST ||
      type === NotificationType.TIP ||
      type === NotificationType.PPV_PURCHASE ||
      type === NotificationType.BOUNTY_AVAILABLE ||
      type === NotificationType.BOUNTY_CLAIMED ||
      type === NotificationType.VIDEO_MILESTONE ||
      type === NotificationType.MENTION) {
    return !!notification.tokenId;
  }

  // Quote - clickable if has quoteTokenId or tokenId
  if (type === NotificationType.QUOTE) {
    return !!(notification.metadata?.quoteTokenId || notification.tokenId);
  }
  
  // Livestream - need tokenId
  if (type === NotificationType.LIVESTREAM_START) {
    return !!notification.tokenId;
  }
  
  // System notifications - not clickable unless they have external link
  if (type === NotificationType.SYSTEM || 
      type === NotificationType.VIDEO_REMOVAL || 
      type === NotificationType.ACCOUNT_WARNING) {
    return !!(notification.metadata?.articleUrl);
  }
  
  // Default: clickable if has tokenId or actor info
  return !!(notification.tokenId || notification.actorAddress || notification.actorUsername);
};

/** Rendered size of the row's post preview, in CSS points. */
const THUMB_PT = 56;

/**
 * The API sends `tokenThumbnail` as a CDN-relative path ("images/2008.jpg"),
 * which React Native's image loader cannot resolve — so the row painted an
 * empty tile with the play badge floating in it, which is the "sideways
 * triangle instead of a preview" this fixes. Web has always prefixed the CDN
 * origin here; this is that same rule, plus the resize every other image in
 * the app asks for.
 */
function resolveNotificationThumbnail(item: NotificationItem): string | undefined {
  const raw = item.tokenThumbnail?.trim();
  if (raw) {
    const absolute = /^https?:\/\//i.test(raw) ? raw : buildCdnPath(raw) ?? raw;
    return cdnImage(absolute, { width: THUMB_PT });
  }
  // Shorts carry no stored thumbnail path — their poster frame is derived from
  // the tokenId, the same way the feed builds it. Long-form video posts can't
  // be derived (the extension lives in the stored path), so they stay blank.
  if (item.postType === 'short' && item.tokenId != null) {
    return getShortsThumbnailUrl(item.tokenId, THUMB_PT);
  }
  return undefined;
}

// Motion for the per-row actions, copied from web's mark-as-read button: a
// 400ms envelope flip on the same easing curve, then the button leaves.
const FLIP_DURATION = 400;
const FLIP_EXIT_DURATION = 200;
const CLEAR_DURATION = 260;
const ACTION_EASING = Easing.bezier(0.4, 0, 0.2, 1);

const actionButtonStyle = {
  width: 30,
  height: 30,
  borderRadius: 10,
  backgroundColor: 'rgba(255,255,255,0.06)',
  alignItems: 'center',
  justifyContent: 'center',
} as const;

const ACTION_HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

interface NotificationRowProps {
  item: NotificationItem;
  onPress: (item: NotificationItem) => void;
  onMarkRead: (item: NotificationItem) => void;
  onClear: (item: NotificationItem) => void;
  onOpenProfile: (actorAddress?: string, actorUsername?: string) => void;
  onAcceptFollowRequest: (item: NotificationItem) => void;
  onRejectFollowRequest: (item: NotificationItem) => void;
}

const NotificationRow: React.FC<NotificationRowProps> = React.memo(({
  item,
  onPress,
  onMarkRead,
  onClear,
  onOpenProfile,
  onAcceptFollowRequest,
  onRejectFollowRequest,
}) => {
  const { t } = useTranslation();
  const icon = getMonoIconConfig(item.type);
  // Every positive reaction arrives as a `like`; show which one it was.
  // Absent on legacy rows and on aggregated rows whose actors disagreed —
  // the thumbs-up icon is right for both. The message text needs no special
  // casing: it comes from the server's pre-rendered `content`, which
  // already uses the reaction's verb ("Ada loved your post").
  const reactionGlyph =
    item.type === 'like' && item.reaction && item.reaction !== 'like'
      ? reactionMeta(item.reaction).emoji
      : null;
  const avatarUrl = getAvatarUrl(item.actorAvatar);
  const hasAvatar = !!item.actorAvatar &&
    item.type !== NotificationType.VIDEO_MILESTONE &&
    item.type !== NotificationType.VIDEO_REMOVAL &&
    item.type !== NotificationType.SYSTEM &&
    item.type !== NotificationType.ACCOUNT_WARNING;

  const clickable = isNotificationClickable(item);
  const thumbnail = useMemo(() => resolveNotificationThumbnail(item), [item]);
  const [thumbFailed, setThumbFailed] = useState(false);
  const [marking, setMarking] = useState(false);

  // Clear: the row slides out and collapses, then the parent drops it. maxHeight
  // rather than height so the resting style needs no measurement — 9999 does not
  // constrain a row, and the measured value is only used once the collapse runs.
  const clearing = useSharedValue(0);
  const collapse = useSharedValue(0);
  const measuredHeight = useSharedValue(0);
  // The collapse shrinks the view it is measured from, so the last natural
  // height has to be frozen before the animation starts or each layout pass
  // feeds a smaller height back in and the row snaps shut.
  const clearingRef = useRef(false);

  const finishClear = useCallback(() => onClear(item), [onClear, item]);
  const finishMarkRead = useCallback(() => onMarkRead(item), [onMarkRead, item]);

  const rowStyle = useAnimatedStyle(() => {
    const collapsing = clearing.value === 1;
    return {
      opacity: collapsing ? 1 - collapse.value : 1,
      transform: [{ translateX: collapsing ? collapse.value * 56 : 0 }],
      // 9999 at rest constrains nothing; the measured value only takes over
      // once the collapse runs.
      maxHeight: collapsing ? measuredHeight.value * (1 - collapse.value) : 9999,
    };
  });

  const clearIconStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${collapse.value * 90}deg` },
      { scale: 1 - collapse.value * 0.25 },
    ],
  }));

  const handleClear = useCallback(() => {
    if (clearingRef.current) return;
    clearingRef.current = true;
    clearing.value = 1;
    collapse.value = withTiming(
      1,
      { duration: CLEAR_DURATION, easing: ACTION_EASING },
      (finished) => {
        if (finished) runOnJS(finishClear)();
      },
    );
  }, [clearing, collapse, finishClear]);

  // Mark as read: the envelope flips open-to-closed, then the button itself
  // leaves — the row's own read styling lands as it finishes.
  const flip = useSharedValue(0);
  const markOpacity = useSharedValue(1);
  const markScale = useSharedValue(1);

  const markIconStyle = useAnimatedStyle(() => ({
    transform: [{ perspective: 400 }, { rotateX: `${flip.value * 180}deg` }],
  }));

  const markButtonStyle = useAnimatedStyle(() => ({
    opacity: markOpacity.value,
    transform: [{ scale: markScale.value }],
  }));

  const handleMarkRead = useCallback(() => {
    if (marking) return;
    setMarking(true);
    flip.value = withTiming(1, { duration: FLIP_DURATION, easing: ACTION_EASING });
    markScale.value = withDelay(
      FLIP_DURATION,
      withTiming(0.8, { duration: FLIP_EXIT_DURATION, easing: ACTION_EASING }),
    );
    markOpacity.value = withDelay(
      FLIP_DURATION,
      withTiming(0, { duration: FLIP_EXIT_DURATION, easing: ACTION_EASING }, (finished) => {
        if (finished) runOnJS(finishMarkRead)();
      }),
    );
  }, [marking, flip, markOpacity, markScale, finishMarkRead]);

  return (
    <Animated.View
      style={[{ overflow: 'hidden' }, rowStyle]}
      onLayout={(e) => {
        if (!clearingRef.current) measuredHeight.value = e.nativeEvent.layout.height;
      }}
    >
      <TouchableOpacity
        onPress={() => onPress(item)}
        disabled={!clickable}
        activeOpacity={0.5}
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          padding: 16,
          borderBottomWidth: 1,
          borderBottomColor: '#1D1F21',
          backgroundColor: !item.read ? 'rgba(255,255,255,0.08)' : 'transparent',
        }}
      >
        {/* Avatar or Icon — tap to open profile */}
        <TouchableOpacity
          activeOpacity={0.7}
          disabled={!item.actorUsername && !item.actorAddress}
          onPress={() => onOpenProfile(item.actorAddress, item.actorUsername)}
          style={{ position: 'relative' }}
        >
          {hasAvatar ? (
            <Avatar uri={avatarUrl || undefined} size={44} name={item.actorUsername} />
          ) : (
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: `${icon.color}20`,
              }}
            >
              {reactionGlyph ? (
                <Text style={{ fontSize: 20, lineHeight: 26 }}>{reactionGlyph}</Text>
              ) : (
                <Icon name={icon.name as any} size={22} color={icon.color} />
              )}
            </View>
          )}
          {/* Type badge overlay for avatar */}
          {hasAvatar && (
            <View
              style={{
                position: 'absolute',
                bottom: -4,
                right: -4,
                width: 20,
                height: 20,
                borderRadius: 10,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 2,
                borderColor: '#010305',
                backgroundColor: 'rgba(255,255,255,0.2)',
              }}
            >
              {reactionGlyph ? (
                <Text style={{ fontSize: 12, lineHeight: 15 }}>{reactionGlyph}</Text>
              ) : (
                <Icon name={icon.name as any} size={10} color="white" />
              )}
            </View>
          )}
        </TouchableOpacity>

        {/* Content */}
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text
            style={{
              fontSize: 14,
              lineHeight: 20,
              color: !item.read ? '#F9FBFF' : '#A6A9AC',
              fontWeight: !item.read ? '500' : '400',
            }}
            numberOfLines={3}
          >
            {item.content}
          </Text>

          {/* Aggregation indicator */}
          {item.aggregatedCount && item.aggregatedCount > 1 && item.latestActorNames && (
            <Text style={{ color: '#A1A1AA', fontSize: 12, marginTop: 4 }}>
              {item.latestActorNames.slice(0, 3).join(', ')}
              {item.aggregatedCount > 3 && ` and ${item.aggregatedCount - 3} others`}
            </Text>
          )}

          {/* Timestamp */}
          <Text style={{ color: '#A1A1AA', fontSize: 12, marginTop: 4 }}>
            {formatNotificationDate(item.updatedAt || item.createdAt)}
          </Text>

          {/* Tip/Bounty amount badge */}
          {(item.type === NotificationType.TIP ||
            item.type === NotificationType.BOUNTY_CLAIMED ||
            item.type === NotificationType.PPV_PURCHASE) && item.amount && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
              <View style={{ backgroundColor: 'rgba(34, 197, 94, 0.2)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 }}>
                <Text style={{ color: '#22C55E', fontSize: 12, fontWeight: '600' }}>
                  +{item.amount} {item.currency || 'DHB'}
                </Text>
              </View>
            </View>
          )}

          {/* Bounty available badge */}
          {item.type === NotificationType.BOUNTY_AVAILABLE && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
              <View style={{ backgroundColor: 'rgba(255,255,255, 0.2)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 }}>
                <Text style={{ color: '#D4D4D8', fontSize: 12, fontWeight: '600' }}>
                  💰 Claim your bounty
                </Text>
              </View>
            </View>
          )}

          {/* Follow request accept/reject buttons */}
          {(item.type as string) === NotificationType.FOLLOW_REQUEST && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 8 }}>
              <TouchableOpacity
                onPress={() => onAcceptFollowRequest(item)}
                activeOpacity={0.85}
                style={{
                  backgroundColor: '#fff',
                  paddingHorizontal: 16,
                  paddingVertical: 7,
                  borderRadius: 8,
                }}
              >
                <Text style={{ color: '#09090B', fontSize: 13, fontWeight: '600' }}>
                  Accept
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => onRejectFollowRequest(item)}
                activeOpacity={0.85}
                style={{
                  backgroundColor: '#27272a',
                  paddingHorizontal: 16,
                  paddingVertical: 7,
                  borderRadius: 8,
                }}
              >
                <Text style={{ color: '#A6A9AC', fontSize: 13, fontWeight: '600' }}>
                  Decline
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Thumbnail for content notifications. A source that 404s hides the
            whole tile — a play badge over nothing is what this looked like. */}
        {!!thumbnail && !thumbFailed && (
          <View style={{ marginLeft: 12 }}>
            <SmartImage
              source={{ uri: thumbnail }}
              style={{ width: THUMB_PT, height: THUMB_PT, borderRadius: 8, backgroundColor: '#18181B' }}
              contentFit="cover"
              recyclingKey={item._id}
              transition={120}
              onError={() => setThumbFailed(true)}
            />
            {(item.postType === 'video' || item.postType === 'short') && (
              <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 12, padding: 4 }}>
                  <Icon name="Play" size={12} color="white" fill="white" />
                </View>
              </View>
            )}
          </View>
        )}

        {/* Row actions: mark this one read, clear this one away. */}
        <View style={{ marginLeft: 10, alignItems: 'center', gap: 8 }}>
          {!item.read && (
            <Animated.View style={markButtonStyle}>
              <TouchableOpacity
                onPress={handleMarkRead}
                activeOpacity={0.7}
                hitSlop={ACTION_HIT_SLOP}
                accessibilityRole="button"
                accessibilityLabel={t('notifications.markAsRead')}
                style={actionButtonStyle}
              >
                <Animated.View style={markIconStyle}>
                  <Icon name={marking ? 'Mail' : 'MailOpen'} size={15} color="#A1A1AA" />
                </Animated.View>
              </TouchableOpacity>
            </Animated.View>
          )}

          <TouchableOpacity
            onPress={handleClear}
            activeOpacity={0.7}
            hitSlop={ACTION_HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel={t('notifications.clearNotification')}
            style={actionButtonStyle}
          >
            <Animated.View style={clearIconStyle}>
              <Icon name="X" size={15} color="#A1A1AA" />
            </Animated.View>
          </TouchableOpacity>

          {clickable && <Icon name="ChevronRight" size={14} color="#52525B" />}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
});

const NotificationScreen = () => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { patchUser } = useAuthActions();
  const user = useUser();
  const { isSignedIn, needsUsername } = useAuthState();
  const allow = isSignedIn && !needsUsername;
  useGateToHome(allow);
  const navigation = useNavigation<any>();
  const { showUserProfile } = useUserProfileSheet();
  
  const walletAddress = user?.walletAddress || user?.address || null;

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  /**
   * Rows this device has cleared. The API has no delete endpoint, so a cleared
   * row is remembered here and filtered out — otherwise the next refetch would
   * hand every one of them straight back.
   */
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedFilter, setSelectedFilter] = useState<NotificationTypeFilter>('all');
  // Unfiltered snapshot kept alongside the (now server-filtered) list purely so
  // the tab badges and the app badge keep seeing every type.
  const [countsSource, setCountsSource] = useState<NotificationItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isChangingCategory, setIsChangingCategory] = useState(false);

  // Cleared rows are per account: two wallets on one phone must not inherit
  // each other's list.
  useEffect(() => {
    if (!walletAddress) {
      setDismissedIds(new Set());
      return;
    }
    let alive = true;
    getDismissedIds(walletAddress).then((ids) => {
      if (alive) setDismissedIds(new Set(ids));
    });
    return () => {
      alive = false;
    };
  }, [walletAddress]);

  // Enable LayoutAnimation on Android
  useEffect(() => {
    const isFabric = (global as any)?.nativeFabricUIManager != null;
    if (
      Platform.OS === "android" &&
      UIManager.setLayoutAnimationEnabledExperimental &&
      !isFabric
    ) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  const navigateToFeed = useCallback((tokenId: number, commentId?: string, postType?: string) => {
    if (postType === 'video' || postType === 'short') {
      navigation.navigate(ScreenNames.ShortsViewer, {
        initialIndex: 0,
        initialItems: [{ tokenId, postType: 'short' } as any],
      });
      return;
    }
    navigation.navigate(ScreenNames.FeedDetail, { tokenId, commentId });
  }, [navigation]);

  const openUserProfile = useCallback((actorAddress?: string, actorUsername?: string) => {
    const identifier = actorUsername || actorAddress;
    if (!identifier) return;
    showUserProfile(identifier);
  }, [showUserProfile]);

  const navigateToLivestream = useCallback((tokenId?: number, streamId?: string) => {
    const id = streamId || (tokenId ? String(tokenId) : null);
    if (!id) return;
    navigation.navigate(ScreenNames.LiveViewer, { streamId: id });
  }, [navigation]);

  const navigateToDM = useCallback((conversationId: string) => {
    navigation.navigate(ScreenNames.Chat, { conversationId });
  }, [navigation]);

  /**
   * Fire-and-forget mark as read
   */
  const markAsReadAsync = useCallback((notificationId: string) => {
    markNotificationAsRead(notificationId).catch((e) => {
      console.warn('[NotificationScreen] markAsRead failed', e);
    });
  }, []);

  /**
   * Handle notification press - navigate immediately, mark read in background
   */
  const handleNotificationPress = useCallback((notification: NotificationItem) => {
    const { _id, type, postType, tokenId, actorAddress, actorUsername, commentId, metadata } = notification;
    
    // Check if clickable
    if (!isNotificationClickable(notification)) return;
    
    // Mark as read (fire and forget) - only if unread
    if (!notification.read) {
      setNotifications((prev) =>
        prev.map((n) => (n._id === _id ? { ...n, read: true } : n))
      );
      // The app badge is derived from this snapshot by the effect below, so
      // marking the row read here is the whole update — no manual decrement to
      // race with it.
      setCountsSource((prev) =>
        prev.map((n) => (n._id === _id ? { ...n, read: true } : n))
      );
      markAsReadAsync(_id);
    }

    // Navigate based on notification type
    switch (type as string) {
      case NotificationType.FOLLOWING:
      case NotificationType.SUBSCRIPTION:
      case NotificationType.FOLLOW_REQUEST_ACCEPTED:
        openUserProfile(actorAddress, actorUsername);
        break;

      case 'like':
        if (tokenId) navigateToFeed(tokenId, undefined, postType);
        break;

      case 'comment':
      case 'comment_reply':
      case 'comment_like':
        if (tokenId) navigateToFeed(tokenId, commentId, postType);
        break;

      case 'repost':
        if (tokenId) navigateToFeed(tokenId, undefined, postType);
        break;

      case 'quote':
        if (metadata?.quoteTokenId) {
          navigateToFeed(metadata.quoteTokenId, undefined, postType);
        } else if (tokenId) {
          navigateToFeed(tokenId, undefined, postType);
        }
        break;

      case 'tip':
      case 'ppv_purchase':
      case 'bounty_available':
      case 'bounty_claimed':
        if (tokenId) navigateToFeed(tokenId, undefined, postType);
        break;

      case 'video_milestone':
        if (tokenId) navigateToFeed(tokenId, undefined, postType);
        break;

      case 'livestream_start':
        if (tokenId) navigateToLivestream(tokenId, undefined);
        break;

      case 'new_message':
        if (metadata?.deepLink) {
          const match = metadata.deepLink.match(/\/dm\/(.+)/);
          if (match?.[1]) navigateToDM(match[1]);
        }
        break;

      case NotificationType.FIAT_PAYMENT_COMPLETED:
        navigation.navigate(ScreenNames.Dpay as never);
        break;

      case 'video_removal':
      case 'account_warning':
      case 'system':
        if (metadata?.articleUrl) openInApp(metadata.articleUrl);
        break;

      case 'mention':
        if (tokenId) navigateToFeed(tokenId, commentId, postType);
        break;

      default:
        if (tokenId) navigateToFeed(tokenId, undefined, postType);
        break;
    }
  }, [
    navigateToFeed,
    openUserProfile,
    navigateToLivestream,
    navigateToDM,
    markAsReadAsync,
  ]);

  const pageRef = useRef(1);
  const selectedFilterRef = useRef<NotificationTypeFilter>('all');
  
  useEffect(() => {
    pageRef.current = page;
  }, [page]);
  
  useEffect(() => {
    selectedFilterRef.current = selectedFilter;
  }, [selectedFilter]);

  // The list arrives already narrowed by the API. This pass still runs: it
  // covers the client-only types, and it keeps the tab correct against an API
  // that predates the `types` param.
  const filteredNotifications = useMemo(() => {
    const visible = dismissedIds.size
      ? notifications.filter((n) => !dismissedIds.has(n._id))
      : notifications;
    if (selectedFilter === 'all') return visible;
    const allowedTypes = FILTER_TYPE_MAP[selectedFilter];
    return visible.filter((n) => allowedTypes.includes(n.type as NotificationType));
  }, [notifications, selectedFilter, dismissedIds]);

  // Both badge sources — the tabs and the app icon — count what is still on
  // screen, so a cleared row stops being counted the moment it goes.
  const visibleCountsSource = useMemo(
    () => (dismissedIds.size ? countsSource.filter((n) => !dismissedIds.has(n._id)) : countsSource),
    [countsSource, dismissedIds],
  );

  const tabCounts = useMemo(() => {
    const counts: Record<NotificationTypeFilter, number> = {
      all: 0, likes: 0, follows: 0, comments: 0,
      reposts: 0, subscriptions: 0, tips: 0, payments: 0, livestreams: 0,
    };
    const unread = visibleCountsSource.filter((n) => !n.read);
    counts.all = unread.length;
    for (const n of unread) {
      for (const [key, types] of Object.entries(FILTER_TYPE_MAP)) {
        if (key !== 'all' && types.includes(n.type as NotificationType)) {
          counts[key as NotificationTypeFilter]++;
        }
      }
    }
    return counts;
  }, [visibleCountsSource]);

  // App badge follows the unfiltered snapshot, so selecting a tab no longer
  // rewrites it with just that tab's unread count.
  useEffect(() => {
    patchUser?.({ notificationCount: visibleCountsSource.filter((n) => !n.read).length });
    // patchUser is intentionally not a dependency: it is recreated on every
    // user patch, and depending on it would make this effect re-run its own
    // update forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countsSource]);

  const fetchNotifications = useCallback(
    async (isRefresh = false) => {
      try {
        const targetPage = isRefresh ? 1 : pageRef.current;
        const types = apiTypesForFilter(selectedFilterRef.current);

        // Ask for this tab's types rather than paging through everything and
        // narrowing in memory — that left a tab empty whenever its rows sat
        // past the loaded window.
        const res: any = await getNotifications({
          unreadOnly: false,
          types,
          page: targetPage,
          limit: 30,
        });

        const payload = res?.data?.result || res?.result || [];

        if (isRefresh) {
          setNotifications(payload);
          setPage(1);
        } else {
          setNotifications((prev) => [...prev, ...payload]);
        }

        setHasMore(payload.length >= 30);

        if (isRefresh) {
          // The tab badges and the app badge both need every type, so a
          // filtered refresh pulls one unfiltered page alongside it. On the All
          // tab the response we already have is that page.
          if (types) {
            const allRes: any = await getNotifications({ unreadOnly: false, page: 1, limit: 30 });
            setCountsSource(allRes?.data?.result || allRes?.result || []);
          } else {
            setCountsSource(payload);
          }
        }
      } catch (e) {
        console.warn("[NotificationScreen] fetch error", e);
      } finally {
        setRefreshing(false);
        setLoading(false);
        setLoadingMore(false);
      }
    },
    []
  );

  // Store fetchNotifications in a ref to avoid dependency issues
  const fetchNotificationsRef = useRef(fetchNotifications);
  fetchNotificationsRef.current = fetchNotifications;

  const hasFetchedRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      // Only show skeleton on first load, not when returning from another screen
      if (!hasFetchedRef.current) {
        hasFetchedRef.current = true;
        setLoading(true);
      }
      // Always refresh data in background
      fetchNotificationsRef.current(true);
    }, [])
  );

  const isFirstFilterRender = useRef(true);
  useEffect(() => {
    if (isFirstFilterRender.current) {
      isFirstFilterRender.current = false;
      return;
    }
    // The filter is applied server-side now, so a tab change needs a refetch
    // rather than the cosmetic loading blip this used to do. selectedFilterRef
    // is updated by the effect above, which runs first — it is declared earlier
    // in the file, and React fires effects in declaration order.
    setIsChangingCategory(true);
    setPage(1);
    setNotifications([]);
    fetchNotificationsRef.current(true);
    requestAnimationFrame(() => setIsChangingCategory(false));
  }, [selectedFilter]);

  useEffect(() => {
    if (page > 1) {
      setLoadingMore(true);
      fetchNotificationsRef.current(false);
    }
  }, [page]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setPage(1);
    fetchNotificationsRef.current(true);
  }, []);

  const onLoadMore = useCallback(() => {
    if (loadingMore || !hasMore || isChangingCategory) return;
    setPage((p) => p + 1);
  }, [loadingMore, hasMore, isChangingCategory]);

  const handleFilterChange = useCallback((filter: NotificationTypeFilter) => {
    if (filter === selectedFilter || isChangingCategory) return;
    setSelectedFilter(filter);
  }, [selectedFilter, isChangingCategory]);

  const handleMarkAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    // Keep the badge source in step, or the tab counts stay lit until the next
    // refresh even though the rows all show as read. The app badge follows from
    // this via the effect above.
    setCountsSource((prev) => prev.map((n) => ({ ...n, read: true })));

    markAllNotificationsAsRead().catch((e) => {
      console.warn('[NotificationScreen] markAllRead error', e);
    });
  }, []);

  const handleAcceptFollowRequest = useCallback(async (notification: NotificationItem) => {
    const followId = notification.metadata?.followId;
    if (!followId) {
      console.warn('[NotificationScreen] Missing followId in notification metadata');
      return;
    }
    // Optimistic: remove from list
    setNotifications((prev) => prev.filter((n) => n._id !== notification._id));
    try {
      await acceptFollowRequest(followId);
      // Increment follower count
      const currentCount = user?.followers || 0;
      patchUser?.({ followers: currentCount + 1 });
    } catch (e) {
      console.warn('[NotificationScreen] acceptFollowRequest error', e);
      // Revert
      setNotifications((prev) => {
        const exists = prev.some((n) => n._id === notification._id);
        if (exists) return prev;
        return [notification, ...prev];
      });
    }
  }, [patchUser, user?.followers]);

  const handleRejectFollowRequest = useCallback(async (notification: NotificationItem) => {
    const followId = notification.metadata?.followId;
    if (!followId) {
      console.warn('[NotificationScreen] Missing followId in notification metadata');
      return;
    }
    // Optimistic: remove from list
    setNotifications((prev) => prev.filter((n) => n._id !== notification._id));
    try {
      await rejectFollowRequest(followId);
    } catch (e) {
      console.warn('[NotificationScreen] rejectFollowRequest error', e);
      // Revert
      setNotifications((prev) => {
        const exists = prev.some((n) => n._id === notification._id);
        if (exists) return prev;
        return [notification, ...prev];
      });
    }
  }, []);

  /** Per-row mark as read — the row's own button, not the header's mark-all. */
  const handleMarkRead = useCallback((notification: NotificationItem) => {
    if (notification.read) return;
    setNotifications((prev) =>
      prev.map((n) => (n._id === notification._id ? { ...n, read: true } : n))
    );
    setCountsSource((prev) =>
      prev.map((n) => (n._id === notification._id ? { ...n, read: true } : n))
    );
    markAsReadAsync(notification._id);
  }, [markAsReadAsync]);

  /**
   * Clear one row. `/notification` exposes PATCH (read) and mark-all-read and
   * nothing else, so there is no server-side delete to call: the row is marked
   * read — which keeps the badge honest on every device — and its id is
   * remembered locally so a refetch cannot resurrect it here.
   */
  const handleClearNotification = useCallback((notification: NotificationItem) => {
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.add(notification._id);
      return next;
    });
    setNotifications((prev) => prev.filter((n) => n._id !== notification._id));
    setCountsSource((prev) => prev.filter((n) => n._id !== notification._id));
    if (!notification.read) markAsReadAsync(notification._id);
    addDismissedIds(walletAddress, [notification._id]).catch((e) => {
      console.warn('[NotificationScreen] persist cleared notification failed', e);
    });
  }, [markAsReadAsync, walletAddress]);

  const renderItem = useCallback(
    ({ item }: { item: NotificationItem }) => (
      <NotificationRow
        item={item}
        onPress={handleNotificationPress}
        onMarkRead={handleMarkRead}
        onClear={handleClearNotification}
        onOpenProfile={openUserProfile}
        onAcceptFollowRequest={handleAcceptFollowRequest}
        onRejectFollowRequest={handleRejectFollowRequest}
      />
    ),
    [
      handleNotificationPress,
      handleMarkRead,
      handleClearNotification,
      handleAcceptFollowRequest,
      handleRejectFollowRequest,
      openUserProfile,
    ]
  );

  const keyExtractor = useCallback((item: NotificationItem) => item._id, []);

  // Skeleton for loading state
  const skeletonData = useMemo(
    () => Array.from({ length: 8 }, (_, i) => ({ key: `sk-${i}` })),
    []
  );
  
  const renderSkeleton = useCallback(
    () => (
      <View className="flex-row items-start p-4 border-b border-theme-neutrals-800">
        {/* Avatar with badge overlay */}
        <View className="relative">
          <View className="w-11 h-11 rounded-full bg-theme-neutrals-800" />
          {/* Type badge */}
          <View
            className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-theme-neutrals-700"
            style={{ borderWidth: 2, borderColor: '#010305' }}
          />
        </View>
        
        {/* Content */}
        <View className="flex-1 ml-3">
          {/* Main text lines */}
          <View className="w-full h-4 bg-theme-neutrals-800 rounded" />
          <View className="w-4/5 h-4 bg-theme-neutrals-800 rounded mt-1.5" />
          <View className="w-2/3 h-4 bg-theme-neutrals-800 rounded mt-1.5" />
          {/* Timestamp */}
          <View className="w-16 h-3 bg-theme-neutrals-800 rounded mt-2" />
        </View>
      </View>
    ),
    []
  );

  // Footer for load more
  const ListFooter = useMemo(() => {
    if (!loadingMore) return null;
    return (
      <View className="py-6 items-center">
        <ActivityIndicator size="small" color="#F4F4F5" />
      </View>
    );
  }, [loadingMore]);

  // Header with mark all read button
  const hasUnread = filteredNotifications.some((n) => !n.read);
  const showLoading = loading || isChangingCategory;

  return (
    <View className="flex-1 bg-theme-neutrals-900">
      <ScreenHeader 
        title={t("notifications.title")}
        rightContent={
          <TouchableOpacity
            onPress={handleMarkAllRead}
            disabled={!hasUnread}
            className="px-3 py-1"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text className={`text-sm font-medium ${hasUnread ? 'text-theme-neutrals-100' : 'text-theme-neutrals-500'}`}>
              Mark all read
            </Text>
          </TouchableOpacity>
        }
      />
      
      {/* Category Filter Tabs */}
      <TypeTabs 
        selected={selectedFilter} 
        onSelect={handleFilterChange} 
        disabled={isChangingCategory}
        counts={tabCounts}
      />
      
      {showLoading ? (
        <FlatList
          data={skeletonData}
          keyExtractor={(item) => item.key}
          renderItem={renderSkeleton}
        />
      ) : (
        <FlatList
          data={filteredNotifications}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#F4F4F5"
            />
          }
          onEndReached={onLoadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={ListFooter}
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center py-20">
              <View className="w-16 h-16 rounded-full bg-theme-neutrals-800 items-center justify-center mb-4">
                <Icon name="BellOff" size={32} color="#A1A1AA" />
              </View>
              <Text className="text-theme-neutrals-400 text-base font-medium mb-1">
                No notifications
              </Text>
              <Text className="text-theme-neutrals-500 text-sm text-center px-8">
                {selectedFilter === 'all' 
                  ? "You're all caught up! Check back later for updates."
                  : `No ${TYPE_TABS.find(t => t.key === selectedFilter)?.label?.toLowerCase() || selectedFilter} notifications yet.`}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
};

export default NotificationScreen;

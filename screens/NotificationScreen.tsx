import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  RefreshControl,
  Platform,
  UIManager,
} from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
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
import { getAvatarUrl } from "../libs";
import { openInApp } from "../libs/links.utils";
import Avatar from "../components/common/Avatar";
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

const SPRING_CONFIG = { stiffness: 400, damping: 30 };
const TAB_HEIGHT = 36;

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
    <View className="border-b border-zinc-800/50" style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
      <View style={{ flexDirection: 'row', gap: 8, position: 'relative' }}>
        <Animated.View
          style={[
            indicatorStyle,
            { position: 'absolute', top: 0, height: TAB_HEIGHT, borderRadius: 12, overflow: 'hidden' },
          ]}
        >
          <LinearGradient
            colors={['rgba(255,255,255,0.20)', 'rgba(255,255,255,0.10)', 'rgba(255,255,255,0.05)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              flex: 1,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.30)',
            }}
          />
          <View
            style={{
              position: 'absolute',
              top: 1,
              left: '10%',
              right: '10%',
              height: 1,
              backgroundColor: 'rgba(255,255,255,0.4)',
              borderRadius: 1,
            }}
          />
        </Animated.View>

        {TYPE_TABS.map((tab) => {
          const isActive = selected === tab.key;
          const count = counts[tab.key];
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => onSelect(tab.key)}
              disabled={disabled}
              activeOpacity={0.7}
              onLayout={(e) => {
                const { x, width } = e.nativeEvent.layout;
                handleLayout(tab.key, x, width);
              }}
              style={[
                {
                  height: TAB_HEIGHT,
                  paddingHorizontal: 10,
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
                    backgroundColor: isActive ? 'rgba(255,255,255,0.20)' : '#ef4444',
                    borderRadius: 8,
                    minWidth: 16,
                    height: 16,
                    paddingHorizontal: 4,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>
                    {count > 99 ? '99+' : count}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
});

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

const NotificationScreen = () => {
  const { t } = useTranslation();
  const { patchUser } = useAuthActions();
  const user = useUser();
  const { isSignedIn, needsUsername } = useAuthState();
  const allow = isSignedIn && !needsUsername;
  useGateToHome(allow);
  const navigation = useNavigation<any>();
  const { showUserProfile } = useUserProfileSheet();
  
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedFilter, setSelectedFilter] = useState<NotificationTypeFilter>('all');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isChangingCategory, setIsChangingCategory] = useState(false);

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
      const currentCount = user?.notificationCount || 0;
      if (currentCount > 0) {
        patchUser?.({ notificationCount: currentCount - 1 });
      }
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
    patchUser, 
    user?.notificationCount
  ]);

  const pageRef = useRef(1);
  const selectedFilterRef = useRef<NotificationTypeFilter>('all');
  
  useEffect(() => {
    pageRef.current = page;
  }, [page]);
  
  useEffect(() => {
    selectedFilterRef.current = selectedFilter;
  }, [selectedFilter]);

  const filteredNotifications = useMemo(() => {
    if (selectedFilter === 'all') return notifications;
    const allowedTypes = FILTER_TYPE_MAP[selectedFilter];
    return notifications.filter((n) => allowedTypes.includes(n.type as NotificationType));
  }, [notifications, selectedFilter]);

  const tabCounts = useMemo(() => {
    const counts: Record<NotificationTypeFilter, number> = {
      all: 0, likes: 0, follows: 0, comments: 0,
      reposts: 0, subscriptions: 0, tips: 0, livestreams: 0,
    };
    const unread = notifications.filter((n) => !n.read);
    counts.all = unread.length;
    for (const n of unread) {
      for (const [key, types] of Object.entries(FILTER_TYPE_MAP)) {
        if (key !== 'all' && types.includes(n.type as NotificationType)) {
          counts[key as NotificationTypeFilter]++;
        }
      }
    }
    return counts;
  }, [notifications]);

  const fetchNotifications = useCallback(
    async (isRefresh = false) => {
      try {
        const targetPage = isRefresh ? 1 : pageRef.current;
        
        const res: any = await getNotifications({
          unreadOnly: false,
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
          const unreadCount = payload.filter((n: NotificationItem) => !n.read).length;
          patchUser?.({ notificationCount: unreadCount });
        }
      } catch (e) {
        console.warn("[NotificationScreen] fetch error", e);
      } finally {
        setRefreshing(false);
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [patchUser]
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
    // Client-side filtering - no need to refetch, just show loading briefly
    setIsChangingCategory(true);
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
    patchUser?.({ notificationCount: 0 });
    
    markAllNotificationsAsRead().catch((e) => {
      console.warn('[NotificationScreen] markAllRead error', e);
    });
  }, [patchUser]);

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

  const renderItem = useCallback(
    ({ item }: { item: NotificationItem }) => {
      const icon = getNotificationIconConfig(item.type);
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
      
      return (
        <TouchableOpacity
          onPress={() => handleNotificationPress(item)}
          disabled={!clickable}
          activeOpacity={0.5}
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            padding: 16,
            borderBottomWidth: 1,
            borderBottomColor: '#27272a',
            backgroundColor: !item.read ? '#1a1a1d' : 'transparent',
          }}
        >
          {/* Avatar or Icon — tap to open profile */}
          <TouchableOpacity
            activeOpacity={0.7}
            disabled={!item.actorUsername && !item.actorAddress}
            onPress={() => openUserProfile(item.actorAddress, item.actorUsername)}
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
                  borderColor: '#0a0a0a',
                  backgroundColor: icon.color,
                }}
              >
                {reactionGlyph ? (
                  <Text style={{ fontSize: 10, lineHeight: 13 }}>{reactionGlyph}</Text>
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
                color: !item.read ? '#f5f5f5' : '#a3a3a3',
                fontWeight: !item.read ? '500' : '400',
              }}
              numberOfLines={3}
            >
              {item.content}
            </Text>
            
            {/* Aggregation indicator */}
            {item.aggregatedCount && item.aggregatedCount > 1 && item.latestActorNames && (
              <Text style={{ color: '#6b7280', fontSize: 12, marginTop: 4 }}>
                {item.latestActorNames.slice(0, 3).join(', ')}
                {item.aggregatedCount > 3 && ` and ${item.aggregatedCount - 3} others`}
              </Text>
            )}
            
            {/* Timestamp */}
            <Text style={{ color: '#6b7280', fontSize: 12, marginTop: 4 }}>
              {formatNotificationDate(item.updatedAt || item.createdAt)}
            </Text>

            {/* Tip/Bounty amount badge */}
            {(item.type === NotificationType.TIP || 
              item.type === NotificationType.BOUNTY_CLAIMED ||
              item.type === NotificationType.PPV_PURCHASE) && item.amount && (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                <View style={{ backgroundColor: 'rgba(34, 197, 94, 0.2)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 }}>
                  <Text style={{ color: '#4ade80', fontSize: 12, fontWeight: '600' }}>
                    +{item.amount} {item.currency || 'DHB'}
                  </Text>
                </View>
              </View>
            )}

            {/* Bounty available badge */}
            {item.type === NotificationType.BOUNTY_AVAILABLE && (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
                <View style={{ backgroundColor: 'rgba(245, 158, 11, 0.2)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 }}>
                  <Text style={{ color: '#fbbf24', fontSize: 12, fontWeight: '600' }}>
                    💰 Claim your bounty
                  </Text>
                </View>
              </View>
            )}

            {/* Follow request accept/reject buttons */}
            {(item.type as string) === NotificationType.FOLLOW_REQUEST && (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 8 }}>
                <TouchableOpacity
                  onPress={() => handleAcceptFollowRequest(item)}
                  activeOpacity={0.85}
                  style={{
                    backgroundColor: '#256DFA',
                    paddingHorizontal: 16,
                    paddingVertical: 7,
                    borderRadius: 8,
                  }}
                >
                  <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>
                    Accept
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleRejectFollowRequest(item)}
                  activeOpacity={0.85}
                  style={{
                    backgroundColor: '#27272a',
                    paddingHorizontal: 16,
                    paddingVertical: 7,
                    borderRadius: 8,
                  }}
                >
                  <Text style={{ color: '#a3a3a3', fontSize: 13, fontWeight: '600' }}>
                    Decline
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Thumbnail for content notifications */}
          {item.tokenThumbnail && (
            <View style={{ marginLeft: 12 }}>
              <Image
                source={{ uri: item.tokenThumbnail }}
                style={{ width: 56, height: 56, borderRadius: 8 }}
                resizeMode="cover"
              />
              {item.postType === 'video' && (
                <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
                  <View style={{ backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 12, padding: 4 }}>
                    <Icon name="Play" size={12} color="white" />
                  </View>
                </View>
              )}
            </View>
          )}

          {/* Clickable indicator */}
          {clickable && (
            <View style={{ position: 'absolute', top: 16, right: 16 }}>
              <Icon name="ChevronRight" size={16} color="#6b7280" />
            </View>
          )}
        </TouchableOpacity>
      );
    },
    [handleNotificationPress, handleAcceptFollowRequest, handleRejectFollowRequest, openUserProfile]
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
            style={{ borderWidth: 2, borderColor: '#0a0a0a' }}
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
      <View className="py-4 items-center">
        <Text className="text-theme-neutrals-500 text-xs">Loading more...</Text>
      </View>
    );
  }, [loadingMore]);

  // Header with mark all read button
  const hasUnread = notifications.some((n) => !n.read);
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
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#fff"
            />
          }
          onEndReached={onLoadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={ListFooter}
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center py-20">
              <View className="w-16 h-16 rounded-full bg-theme-neutrals-800 items-center justify-center mb-4">
                <Icon name="BellOff" size={32} color="#6b7280" />
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

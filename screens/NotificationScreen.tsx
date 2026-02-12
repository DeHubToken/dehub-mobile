import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
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
import { Ionicons } from "@expo/vector-icons";
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
import {
  NotificationType,
  getNotificationIconConfig,
  NON_CLICKABLE_TYPES,
} from "../services/enums/notification.enums";

// =============================================================================
// Category Filter Tabs
// =============================================================================

const CATEGORY_TABS: { key: NotificationCategory | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'engagement', label: 'Engagement' },
  { key: 'social', label: 'Social' },
  { key: 'monetization', label: 'Money' },
  { key: 'content', label: 'Content' },
  { key: 'system', label: 'System' },
];

interface CategoryTabsProps {
  selected: NotificationCategory | 'all';
  onSelect: (category: NotificationCategory | 'all') => void;
  disabled?: boolean;
}

const CategoryTabs: React.FC<CategoryTabsProps> = ({ selected, onSelect, disabled }) => (
  <View className="flex-row px-4 py-2 border-b border-theme-neutrals-800">
    <FlatList
      horizontal
      data={CATEGORY_TABS}
      showsHorizontalScrollIndicator={false}
      keyExtractor={(item) => item.key}
      renderItem={({ item }) => (
        <TouchableOpacity
          onPress={() => onSelect(item.key)}
          disabled={disabled}
          activeOpacity={0.7}
          className={`px-4 py-2 mr-2 rounded-full ${
            selected === item.key ? 'bg-theme-primary-500' : 'bg-theme-neutrals-800'
          }`}
          style={disabled && selected !== item.key ? { opacity: 0.5 } : undefined}
        >
          <Text
            className={`text-xs font-medium ${
              selected === item.key ? 'text-white' : 'text-theme-neutrals-400'
            }`}
          >
            {item.label}
          </Text>
        </TouchableOpacity>
      )}
    />
  </View>
);

// =============================================================================
// Helper Functions
// =============================================================================

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
      type === NotificationType.TIP ||
      type === NotificationType.PPV_PURCHASE ||
      type === NotificationType.BOUNTY_AVAILABLE ||
      type === NotificationType.BOUNTY_CLAIMED ||
      type === NotificationType.VIDEO_MILESTONE ||
      type === NotificationType.MENTION) {
    return !!notification.tokenId;
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

// =============================================================================
// Main Screen
// =============================================================================

const NotificationScreen = () => {
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
  const [selectedCategory, setSelectedCategory] = useState<NotificationCategory | 'all'>('all');
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

  // ==========================================================================
  // Navigation Handlers
  // ==========================================================================

  const navigateToVideo = useCallback((tokenId: number, commentId?: string) => {
    // Navigate immediately - let VideoPlayer handle loading
    navigation.navigate(ScreenNames.VideoPlayer, { tokenId, commentId });
  }, [navigation]);

  const navigateToFeed = useCallback((tokenId: number, commentId?: string) => {
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
        if (tokenId) {
          if (postType === 'feed-images' || postType === 'feed-simple') {
            navigateToFeed(tokenId);
          } else {
            navigateToVideo(tokenId);
          }
        }
        break;

      case 'comment':
      case 'comment_reply':
      case 'comment_like':
        if (tokenId) {
          if (postType === 'feed-images' || postType === 'feed-simple') {
            navigateToFeed(tokenId, commentId);
          } else {
            navigateToVideo(tokenId, commentId);
          }
        }
        break;

      case 'tip':
      case 'ppv_purchase':
      case 'bounty_available':
      case 'bounty_claimed':
        if (tokenId) {
          if (postType === 'feed-images' || postType === 'feed-simple') {
            navigateToFeed(tokenId);
          } else {
            navigateToVideo(tokenId);
          }
        }
        break;

      case 'video_milestone':
        if (tokenId) navigateToVideo(tokenId);
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

      case 'video_removal':
      case 'account_warning':
      case 'system':
        if (metadata?.articleUrl) openInApp(metadata.articleUrl);
        break;

      case 'mention':
        if (tokenId) {
          if (postType === 'feed-images' || postType === 'feed-simple') {
            navigateToFeed(tokenId, commentId);
          } else {
            navigateToVideo(tokenId, commentId);
          }
        }
        break;

      default:
        // Fallback: try to navigate to content if tokenId exists
        if (tokenId) {
          if (postType === 'feed-images' || postType === 'feed-simple') {
            navigateToFeed(tokenId);
          } else {
            navigateToVideo(tokenId);
          }
        }
        break;
    }
  }, [
    navigateToVideo, 
    navigateToFeed, 
    openUserProfile, 
    navigateToLivestream, 
    navigateToDM,
    markAsReadAsync,
    patchUser, 
    user?.notificationCount
  ]);

  // ==========================================================================
  // Data Fetching
  // ==========================================================================

  const pageRef = useRef(1);
  const selectedCategoryRef = useRef<NotificationCategory | 'all'>('all');
  
  useEffect(() => {
    pageRef.current = page;
  }, [page]);
  
  useEffect(() => {
    selectedCategoryRef.current = selectedCategory;
  }, [selectedCategory]);

  const fetchNotifications = useCallback(
    async (isRefresh = false) => {
      try {
        const targetPage = isRefresh ? 1 : pageRef.current;
        const category = selectedCategoryRef.current;
        
        const res: any = await getNotifications({
          unreadOnly: false,
          category: category === 'all' ? undefined : category,
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

  const isFirstCategoryRender = useRef(true);
  useEffect(() => {
    if (isFirstCategoryRender.current) {
      isFirstCategoryRender.current = false;
      return;
    }
    // Clear data and show loading when changing category
    setNotifications([]);
    setPage(1);
    setIsChangingCategory(true);
    fetchNotificationsRef.current(true).finally(() => {
      setIsChangingCategory(false);
    });
  }, [selectedCategory]);

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

  const handleCategoryChange = useCallback((category: NotificationCategory | 'all') => {
    if (category === selectedCategory || isChangingCategory) return;
    setSelectedCategory(category);
  }, [selectedCategory, isChangingCategory]);

  const handleMarkAllRead = useCallback(async () => {
    // Optimistic update immediately
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    patchUser?.({ notificationCount: 0 });
    
    // Fire and forget
    markAllNotificationsAsRead(
      selectedCategoryRef.current === 'all' ? undefined : selectedCategoryRef.current
    ).catch((e) => {
      console.warn('[NotificationScreen] markAllRead error', e);
    });
  }, [patchUser]);

  // ==========================================================================
  // Follow Request Handlers
  // ==========================================================================

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

  // ==========================================================================
  // Render Items
  // ==========================================================================

  const renderItem = useCallback(
    ({ item }: { item: NotificationItem }) => {
      const icon = getNotificationIconConfig(item.type);
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
              <Avatar uri={avatarUrl || undefined} size={44} />
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
                <Ionicons name={icon.name as any} size={22} color={icon.color} />
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
                <Ionicons name={icon.name as any} size={10} color="white" />
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
                    <Ionicons name="play" size={12} color="white" />
                  </View>
                </View>
              )}
            </View>
          )}

          {/* Clickable indicator */}
          {clickable && (
            <View style={{ position: 'absolute', top: 16, right: 16 }}>
              <Ionicons name="chevron-forward" size={16} color="#6b7280" />
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
        title="Notifications"
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
      <CategoryTabs 
        selected={selectedCategory} 
        onSelect={handleCategoryChange} 
        disabled={isChangingCategory}
      />
      
      {showLoading ? (
        <FlatList
          data={skeletonData}
          keyExtractor={(item) => item.key}
          renderItem={renderSkeleton}
        />
      ) : (
        <FlatList
          data={notifications}
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
                <Ionicons name="notifications-off-outline" size={32} color="#6b7280" />
              </View>
              <Text className="text-theme-neutrals-400 text-base font-medium mb-1">
                No notifications
              </Text>
              <Text className="text-theme-neutrals-500 text-sm text-center px-8">
                {selectedCategory === 'all' 
                  ? "You're all caught up! Check back later for updates."
                  : `No ${selectedCategory} notifications yet.`}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
};

export default NotificationScreen;

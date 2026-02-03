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
  type NotificationItem,
  type NotificationCategory,
} from "../services/user.service";
import { getNFT } from "../services/nft.service";
import { useUser, useAuthState, useAuthActions } from "../context/AuthContext";
import { useGateToHome } from "../hooks/useGateToHome";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { ScreenNames } from "../navigation/ScreenNames";
import { formatNotificationDate } from "../libs/date.util";
import { useUserProfileSheet } from "../context/UserProfileSheetContext";
import { getAvatarUrl } from "../libs";
import Avatar from "../components/common/Avatar";

// =============================================================================
// Notification Icon Mapping
// =============================================================================

const getNotificationIcon = (type: string): { name: keyof typeof Ionicons.glyphMap; color: string } => {
  switch (type) {
    case 'like':
      return { name: 'heart', color: '#ef4444' };
    case 'comment':
    case 'comment_reply':
      return { name: 'chatbubble', color: '#3b82f6' };
    case 'following':
      return { name: 'person-add', color: '#8b5cf6' };
    case 'tip':
      return { name: 'cash', color: '#22c55e' };
    case 'subscription':
      return { name: 'checkmark-circle', color: '#f59e0b' };
    case 'ppv_purchase':
      return { name: 'lock-open', color: '#06b6d4' };
    case 'video_milestone':
      return { name: 'trophy', color: '#fbbf24' };
    case 'livestream_start':
      return { name: 'radio', color: '#ef4444' };
    case 'video_removal':
      return { name: 'alert-circle', color: '#f97316' };
    default:
      return { name: 'notifications', color: '#9ca3af' };
  }
};

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
}

const CategoryTabs: React.FC<CategoryTabsProps> = ({ selected, onSelect }) => (
  <View className="flex-row px-4 py-2 border-b border-theme-neutrals-800">
    <FlatList
      horizontal
      data={CATEGORY_TABS}
      showsHorizontalScrollIndicator={false}
      keyExtractor={(item) => item.key}
      renderItem={({ item }) => (
        <TouchableOpacity
          onPress={() => onSelect(item.key)}
          className={`px-4 py-2 mr-2 rounded-full ${
            selected === item.key ? 'bg-theme-primary-500' : 'bg-theme-neutrals-800'
          }`}
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

  const navigateToVideo = useCallback(async (tokenId: number) => {
    try {
      // Fetch NFT data to pass to VideoPlayer
      const address = user?.walletAddress || user?.address;
      const res: any = await getNFT(tokenId, address);
      const nft = res?.result || res;
      
      navigation.navigate(ScreenNames.VideoPlayer, {
        tokenId,
        nft,
        accessInfo: nft?.accessInfo,
      });
    } catch (e) {
      console.warn('[NotificationScreen] Failed to fetch video', e);
      // Navigate anyway with just tokenId
      navigation.navigate(ScreenNames.VideoPlayer, { tokenId });
    }
  }, [navigation, user?.walletAddress, user?.address]);

  const navigateToFeed = useCallback((tokenId: number) => {
    navigation.navigate(ScreenNames.FeedDetail, { tokenId });
  }, [navigation]);

  const navigateToProfile = useCallback((actorAddress?: string, actorUsername?: string) => {
    const identifier = actorUsername || actorAddress;
    if (!identifier) return;
    showUserProfile(identifier);
  }, [showUserProfile]);

  const navigateToLivestream = useCallback((tokenId?: number) => {
    if (!tokenId) return;
    navigation.navigate(ScreenNames.LiveViewer, { streamId: String(tokenId) });
  }, [navigation]);

  const handleNotificationPress = useCallback(async (notification: NotificationItem) => {
    const { _id, type, postType, tokenId, actorAddress, actorUsername } = notification;
    
    // Mark as read optimistically
    if (!notification.read) {
      setNotifications((prev) =>
        prev.map((n) => (n._id === _id ? { ...n, read: true } : n))
      );
      // Update unread count
      const currentCount = user?.notificationCount || 0;
      if (currentCount > 0) {
        patchUser?.({ notificationCount: currentCount - 1 });
      }
      markNotificationAsRead(_id).catch(() => {
        // Revert on failure
        setNotifications((prev) =>
          prev.map((n) => (n._id === _id ? { ...n, read: false } : n))
        );
        // Revert count
        patchUser?.({ notificationCount: currentCount });
      });
    }

    // Navigate based on notification type
    switch (type) {
      case 'following':
        // Open user profile bottom sheet
        navigateToProfile(actorAddress, actorUsername);
        break;

      case 'like':
      case 'comment':
      case 'comment_reply':
      case 'tip':
        // Navigate based on post type
        if (tokenId) {
          if (postType === 'video') {
            navigateToVideo(tokenId);
          } else if (postType === 'feed-images' || postType === 'feed-simple') {
            navigateToFeed(tokenId);
          } else {
            // Default to video if postType unknown
            navigateToVideo(tokenId);
          }
        }
        break;

      case 'subscription':
      case 'ppv_purchase':
        // Open the actor's profile or navigate to content
        if (tokenId && postType === 'video') {
          navigateToVideo(tokenId);
        } else {
          navigateToProfile(actorAddress, actorUsername);
        }
        break;

      case 'video_milestone':
        // Navigate to the video
        if (tokenId) {
          navigateToVideo(tokenId);
        }
        break;

      case 'livestream_start':
        // Navigate to livestream
        navigateToLivestream(tokenId);
        break;

      case 'video_removal':
        // System notification - could navigate to settings or just show info
        // For now, do nothing special
        break;

      default:
        // Try to navigate to content if tokenId exists
        if (tokenId) {
          if (postType === 'video') {
            navigateToVideo(tokenId);
          } else {
            navigateToFeed(tokenId);
          }
        }
        break;
    }
  }, [navigateToVideo, navigateToFeed, navigateToProfile, navigateToLivestream, patchUser, user?.notificationCount]);

  // ==========================================================================
  // Data Fetching
  // ==========================================================================

  // Use refs to avoid dependency issues in callbacks
  const pageRef = useRef(1);
  const selectedCategoryRef = useRef<NotificationCategory | 'all'>('all');
  
  // Keep refs in sync with state
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
        
        // Update notification count (unread count) on refresh
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
    [patchUser] // Minimal dependencies - using refs for the rest
  );

  // Track if initial fetch has happened
  const hasFetchedRef = useRef(false);

  // Initial load and focus effect
  useFocusEffect(
    useCallback(() => {
      hasFetchedRef.current = true;
      setLoading(true);
      fetchNotifications(true);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []) // Empty deps - runs once on focus
  );

  // Handle category change (skip initial render)
  const isFirstCategoryRender = useRef(true);
  useEffect(() => {
    if (isFirstCategoryRender.current) {
      isFirstCategoryRender.current = false;
      return;
    }
    setNotifications([]);
    setPage(1);
    setLoading(true);
    fetchNotifications(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory]);

  // Handle pagination (skip page 1 as it's handled by refresh/category change)
  useEffect(() => {
    if (page > 1) {
      setLoadingMore(true);
      fetchNotifications(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setPage(1);
    fetchNotifications(true);
  }, [fetchNotifications]);

  const onLoadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    setPage((p) => p + 1);
  }, [loadingMore, hasMore]);

  const handleCategoryChange = useCallback((category: NotificationCategory | 'all') => {
    if (category === selectedCategory) return;
    setSelectedCategory(category);
  }, [selectedCategory]);

  const handleMarkAllRead = useCallback(async () => {
    try {
      // Optimistic update
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      patchUser?.({ notificationCount: 0 });
      
      await markAllNotificationsAsRead(
        selectedCategoryRef.current === 'all' ? undefined : selectedCategoryRef.current
      );
    } catch (e) {
      console.warn('[NotificationScreen] markAllRead error', e);
      // Refetch on error
      fetchNotifications(true);
    }
  }, [patchUser, fetchNotifications]);

  // ==========================================================================
  // Render Items
  // ==========================================================================

  const NotificationRow = useCallback(
    ({ item }: { item: NotificationItem }) => {
      const icon = getNotificationIcon(item.type);
      const avatarUrl = getAvatarUrl(item.actorAvatar);
      const hasAvatar = !!item.actorAvatar && item.type !== 'video_milestone' && item.type !== 'video_removal';
      
      return (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => handleNotificationPress(item)}
          className={`flex-row items-start p-4 border-b border-theme-neutrals-800 ${
            !item.read ? 'bg-theme-neutrals-850' : ''
          }`}
        >
          {/* Avatar or Icon */}
          <View className="relative">
            {hasAvatar ? (
              <Avatar uri={avatarUrl || undefined} size={44} />
            ) : (
              <View 
                className="w-11 h-11 rounded-full items-center justify-center"
                style={{ backgroundColor: `${icon.color}20` }}
              >
                <Ionicons name={icon.name} size={22} color={icon.color} />
              </View>
            )}
            {/* Type badge overlay for avatar */}
            {hasAvatar && (
              <View 
                className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full items-center justify-center border-2 border-theme-neutrals-900"
                style={{ backgroundColor: icon.color }}
              >
                <Ionicons name={icon.name} size={10} color="white" />
              </View>
            )}
          </View>

          {/* Content */}
          <View className="flex-1 ml-3">
            <Text 
              className={`text-sm leading-5 ${
                !item.read ? 'text-theme-neutrals-100 font-medium' : 'text-theme-neutrals-300'
              }`}
              numberOfLines={3}
            >
              {item.content}
            </Text>
            
            {/* Aggregation indicator */}
            {item.aggregatedCount && item.aggregatedCount > 1 && item.latestActorNames && (
              <Text className="text-theme-neutrals-500 text-xs mt-1">
                {item.latestActorNames.slice(0, 3).join(', ')}
                {item.aggregatedCount > 3 && ` and ${item.aggregatedCount - 3} others`}
              </Text>
            )}
            
            {/* Timestamp */}
            <Text className="text-theme-neutrals-500 text-xs mt-1">
              {formatNotificationDate(item.updatedAt || item.createdAt)}
            </Text>

            {/* Tip amount badge */}
            {item.type === 'tip' && item.amount && (
              <View className="flex-row items-center mt-2">
                <View className="bg-green-500/20 px-2 py-1 rounded-full">
                  <Text className="text-green-400 text-xs font-semibold">
                    +{item.amount} {item.currency || 'DHB'}
                  </Text>
                </View>
              </View>
            )}
          </View>

          {/* Thumbnail for content notifications */}
          {item.tokenThumbnail && (
            <View className="ml-3">
              <Image
                source={{ uri: item.tokenThumbnail }}
                className="w-14 h-14 rounded-lg"
                resizeMode="cover"
              />
              {item.postType === 'video' && (
                <View className="absolute inset-0 items-center justify-center">
                  <View className="bg-black/50 rounded-full p-1">
                    <Ionicons name="play" size={12} color="white" />
                  </View>
                </View>
              )}
            </View>
          )}

          {/* Unread indicator */}
          {!item.read && (
            <View className="absolute top-4 right-4 w-2 h-2 rounded-full bg-theme-primary-500" />
          )}
        </TouchableOpacity>
      );
    },
    [handleNotificationPress]
  );

  const renderItem = useCallback(
    ({ item }: { item: NotificationItem }) => <NotificationRow item={item} />,
    [NotificationRow]
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
        <View className="w-11 h-11 rounded-full bg-theme-neutrals-700" />
        <View className="flex-1 ml-3">
          <View className="h-4 w-4/5 bg-theme-neutrals-700 rounded mb-2" />
          <View className="h-3 w-2/3 bg-theme-neutrals-800 rounded mb-2" />
          <View className="h-3 w-1/4 bg-theme-neutrals-800 rounded" />
        </View>
        <View className="w-14 h-14 rounded-lg bg-theme-neutrals-800 ml-3" />
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

  return (
    <View className="flex-1 bg-theme-neutrals-900">
      <ScreenHeader 
        title="Notifications"
        rightContent={
          hasUnread ? (
            <TouchableOpacity
              onPress={handleMarkAllRead}
              className="px-3 py-1"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text className="text-theme-primary-500 text-sm font-medium">
                Mark all read
              </Text>
            </TouchableOpacity>
          ) : undefined
        }
      />
      
      {/* Category Filter Tabs */}
      <CategoryTabs selected={selectedCategory} onSelect={handleCategoryChange} />
      
      {loading ? (
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

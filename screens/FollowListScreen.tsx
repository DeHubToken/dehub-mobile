import React, { useState, useCallback, useMemo, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Keyboard,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "../context/AuthContext";
import { useUserProfileSheet } from "../context/UserProfileSheetContext";
import { 
  getFollowList, 
  FollowListItem, 
  GetFollowListParams, 
  FollowListResponse,
  getFollowRequests,
  acceptFollowRequest,
  rejectFollowRequest,
  FollowRequestItem,
  removeFollower,
} from "../services/user.service";
import { getAvatarUrl } from "../libs/misc";
import { truncate } from "../libs/strings.util";
import { formatCompactNumber } from "../libs/numbers.util";
import Avatar from "../components/common/Avatar";
import ScreenHeader from "../components/ScreenHeader";
import { ScreenNames } from "../navigation/ScreenNames";
import AccentButtonGradient from "../components/ui/AccentButtonGradient";
import GlassModal from "../components/ui/GlassModal";

type RouteParams = {
  FollowList: {
    address: string;
    username?: string;
    initialTab?: "followers" | "following" | "requests";
    hideFollowers?: boolean;
    isOwnProfile?: boolean;
  };
};

type TabKey = "followers" | "following" | "requests";
type SortOption = "recent" | "oldest" | "alphabetical";

const TAB_OPTIONS: { key: TabKey; label: string }[] = [
  { key: "followers", label: "Followers" },
  { key: "following", label: "Following" },
];

const SORT_OPTIONS: { key: SortOption; label: string; icon: string }[] = [
  { key: "recent", label: "Most Recent", icon: "time-outline" },
  { key: "oldest", label: "Oldest First", icon: "hourglass-outline" },
  { key: "alphabetical", label: "A-Z", icon: "text-outline" },
];

const PAGE_LIMIT = 20;

interface FollowUserRowProps {
  item: FollowListItem;
  onPress: (address: string) => void;
  onRemove?: (address: string) => void;
}

const FollowUserRow: React.FC<FollowUserRowProps> = React.memo(({ item, onPress, onRemove }) => {
  const user = item.user;
  const displayName = user.displayName || user.username || truncate(user.address, 12, "..");
  const avatarUrl = getAvatarUrl(user.avatarImageUrl);
  const hasUsername = !!user.username;

  const handlePress = useCallback(() => {
    onPress(user.address);
  }, [onPress, user.address]);

  const handleRemove = useCallback(() => {
    onRemove?.(user.address);
  }, [onRemove, user.address]);

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.6}
      className="flex-row items-center px-4 py-3"
    >
      {/* Avatar with gradient ring */}
      <View className="relative">
        <LinearGradient
          colors={["#833ab4", "#fd1d1d", "#fcb045"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ borderRadius: 30, padding: 2 }}
        >
          <View className="bg-black rounded-full p-[2px]">
            <Avatar uri={avatarUrl} size={52} />
          </View>
        </LinearGradient>
      </View>

      {/* User Info */}
      <View className="flex-1 ml-3">
        <Text className="text-white font-semibold text-[15px]" numberOfLines={1}>
          {displayName}
        </Text>
        {hasUsername && (
          <Text className="text-gray-500 text-sm" numberOfLines={1}>
            @{user.username}
          </Text>
        )}
        {user.followers !== undefined && (
          <Text className="text-gray-600 text-xs mt-0.5">
            {formatCompactNumber(user.followers)} followers
          </Text>
        )}
      </View>

      {/* Remove button or chevron */}
      {onRemove ? (
        <TouchableOpacity
          onPress={handleRemove}
          activeOpacity={0.7}
          className="bg-theme-neutrals-800 px-3.5 py-1.5 rounded-lg ml-2"
        >
          <Text className="text-gray-300 text-xs font-semibold">Remove</Text>
        </TouchableOpacity>
      ) : (
        <Ionicons name="chevron-forward" size={20} color="#555" />
      )}
    </TouchableOpacity>
  );
});

interface FollowRequestRowProps {
  item: FollowRequestItem;
  onAccept: (item: FollowRequestItem) => void;
  onReject: (item: FollowRequestItem) => void;
  onPress: (address: string) => void;
}

const FollowRequestRow: React.FC<FollowRequestRowProps> = React.memo(
  ({ item, onAccept, onReject, onPress }) => {
    const displayName = item.user.displayName || item.user.username || truncate(item.user.address, 12, "..");
    const avatarUrl = getAvatarUrl(item.user.avatarImageUrl);

    const handlePress = useCallback(() => {
      onPress(item.user.address);
    }, [onPress, item.user.address]);

    const handleAccept = useCallback(() => {
      onAccept(item);
    }, [onAccept, item]);

    const handleReject = useCallback(() => {
      onReject(item);
    }, [onReject, item]);

    return (
      <View className="flex-row items-center px-4 py-3">
        {/* Avatar */}
        <TouchableOpacity activeOpacity={0.6} onPress={handlePress}>
          <View className="relative">
            <LinearGradient
              colors={["#833ab4", "#fd1d1d", "#fcb045"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ borderRadius: 30, padding: 2 }}
            >
              <View className="bg-black rounded-full p-[2px]">
                <Avatar uri={avatarUrl} size={52} />
              </View>
            </LinearGradient>
          </View>
        </TouchableOpacity>

        {/* User Info */}
        <TouchableOpacity className="flex-1 ml-3" activeOpacity={0.6} onPress={handlePress}>
          <Text className="text-white font-semibold text-[15px]" numberOfLines={1}>
            {displayName}
          </Text>
          {item.user.username && (
            <Text className="text-gray-500 text-sm" numberOfLines={1}>
              @{item.user.username}
            </Text>
          )}
        </TouchableOpacity>

        {/* Accept/Reject buttons */}
        <View className="flex-row items-center gap-2 ml-2">
          <AccentButtonGradient style={{ borderRadius: 8 }}>
            <TouchableOpacity
              onPress={handleAccept}
              className="px-4 py-2"
              style={{ backgroundColor: 'transparent' }}
              activeOpacity={0.85}
            >
              <Text className="text-white text-xs font-semibold">Accept</Text>
            </TouchableOpacity>
          </AccentButtonGradient>
          <TouchableOpacity
            onPress={handleReject}
            className="bg-theme-neutrals-800 px-4 py-2 rounded-lg"
            activeOpacity={0.85}
          >
            <Text className="text-gray-400 text-xs font-semibold">Decline</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }
);

const HiddenFollowersMessage: React.FC<{ username?: string }> = ({ username }) => (
  <View className="flex-1 items-center justify-center px-8">
    <View className="bg-theme-neutrals-800/50 rounded-full p-6 mb-6">
      <Ionicons name="lock-closed" size={48} color="#666" />
    </View>
    <Text className="text-white text-xl font-bold text-center mb-2">
      This Account is Private
    </Text>
    <Text className="text-gray-400 text-center text-base leading-6">
      {username ? `@${username}` : "This user"} has chosen to keep their followers and following list private.
    </Text>
  </View>
);

const FollowListScreen: React.FC = () => {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RouteParams, "FollowList">>();
  const insets = useSafeAreaInsets();
  const { user: authUser } = useAuth();
  const { showUserProfile } = useUserProfileSheet();

  const { 
    address, 
    username, 
    initialTab = "followers",
    hideFollowers = false,
    isOwnProfile = false,
  } = route.params;

  // Determine if we can show the list
  const isOwner = isOwnProfile || authUser?.address?.toLowerCase() === address.toLowerCase();
  const canViewList = !hideFollowers || isOwner;

  const isPrivateForTab = authUser?.isPrivate === true;
  const [activeTab, setActiveTab] = useState<TabKey>(
    initialTab === "requests" && !(isOwner && isPrivateForTab) ? "followers" : initialTab as TabKey
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOption, setSortOption] = useState<SortOption>("recent");
  const [showSortPicker, setShowSortPicker] = useState(false);

  const [data, setData] = useState<FollowListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);

  // Follow requests state
  const [requestsData, setRequestsData] = useState<FollowRequestItem[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestsRefreshing, setRequestsRefreshing] = useState(false);
  const [requestsPage, setRequestsPage] = useState(1);
  const [requestsHasMore, setRequestsHasMore] = useState(true);
  const [requestsLoadingMore, setRequestsLoadingMore] = useState(false);
  const [requestsCount, setRequestsCount] = useState(authUser?.pendingFollowRequests || 0);

  // Remove follower modal state
  const [removeTarget, setRemoveTarget] = useState<{ address: string; displayName: string } | null>(null);

  // Build tabs dynamically — only show "Requests" for own private profile
  const isPrivateAccount = authUser?.isPrivate === true;
  const tabs = useMemo(() => {
    const base = [...TAB_OPTIONS];
    if (isOwner && isPrivateAccount) {
      base.push({ key: "requests", label: "Requests" });
    }
    return base;
  }, [isOwner, isPrivateAccount]);

  // Debounce search
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const getSortParams = useCallback((sort: SortOption): { sortBy?: 'createdAt' | 'username' | 'displayName'; sortOrder?: "asc" | "desc" } => {
    switch (sort) {
      case "recent":
        return { sortBy: "createdAt", sortOrder: "desc" };
      case "oldest":
        return { sortBy: "createdAt", sortOrder: "asc" };
      case "alphabetical":
        return { sortBy: "username", sortOrder: "asc" };
      default:
        return {};
    }
  }, []);

  const fetchData = useCallback(
    async (pageNum: number, isRefresh = false) => {
      if (!canViewList || activeTab === "requests") {
        setLoading(false);
        return;
      }

      if (pageNum === 1) {
        if (isRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }
      } else {
        setLoadingMore(true);
      }

      try {
        const sortParams = getSortParams(sortOption);
        const params: GetFollowListParams = {
          address,
          type: activeTab,
          page: pageNum,
          limit: PAGE_LIMIT,
          search: debouncedSearch || undefined,
          sortBy: sortParams.sortBy,
          sortOrder: sortParams.sortOrder,
        };

        const response: FollowListResponse = await getFollowList(params);
        
        if (response.result?.items) {
          if (pageNum === 1) {
            setData(response.result.items);
          } else {
            setData((prev) => [...prev, ...response.result.items]);
          }
          setHasMore(response.result.pagination.hasMore);
          setTotalCount(response.result.pagination.totalCount);
          setPage(pageNum);
        }
      } catch (error) {
        console.error("[FollowListScreen] fetchData error:", error);
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [address, activeTab, debouncedSearch, sortOption, getSortParams, canViewList]
  );

  // Initial load and refetch on tab/search/sort change
  useEffect(() => {
    if (activeTab === "requests") {
      // Don't fetch follow list for requests tab
      return;
    }
    if (canViewList) {
      setPage(1);
      setHasMore(true);
      fetchData(1);
    } else {
      setLoading(false);
    }
  }, [activeTab, debouncedSearch, sortOption, fetchData, canViewList]);

  // Follow requests data fetching
  const fetchRequests = useCallback(
    async (pageNum: number, isRefresh = false) => {
      if (pageNum === 1) {
        if (isRefresh) {
          setRequestsRefreshing(true);
        } else {
          setRequestsLoading(true);
        }
      } else {
        setRequestsLoadingMore(true);
      }

      try {
        const response = await getFollowRequests(pageNum, PAGE_LIMIT);
        const items = response.items || [];
        const pagination = response.pagination;

        if (pageNum === 1) {
          setRequestsData(items);
        } else {
          setRequestsData((prev) => [...prev, ...items]);
        }
        setRequestsHasMore(pagination?.hasMore ?? false);
        setRequestsCount(pagination?.totalCount ?? items.length);
        setRequestsPage(pageNum);
      } catch (error) {
        console.error("[FollowListScreen] fetchRequests error:", error);
      } finally {
        setRequestsLoading(false);
        setRequestsRefreshing(false);
        setRequestsLoadingMore(false);
      }
    },
    []
  );

  // Load requests when requests tab is active
  useEffect(() => {
    if (activeTab === "requests" && isOwner) {
      setRequestsPage(1);
      setRequestsHasMore(true);
      fetchRequests(1);
    }
  }, [activeTab, isOwner, fetchRequests]);

  const handleAcceptRequest = useCallback(async (item: FollowRequestItem) => {
    // Optimistic remove
    setRequestsData((prev) => prev.filter((r) => r.requestId !== item.requestId));
    setRequestsCount((prev) => Math.max(0, prev - 1));
    try {
      await acceptFollowRequest(item.requestId);
    } catch (e) {
      console.error("[FollowListScreen] acceptRequest error:", e);
      // Revert
      setRequestsData((prev) => [item, ...prev]);
      setRequestsCount((prev) => prev + 1);
    }
  }, []);

  const handleRejectRequest = useCallback(async (item: FollowRequestItem) => {
    // Optimistic remove
    setRequestsData((prev) => prev.filter((r) => r.requestId !== item.requestId));
    setRequestsCount((prev) => Math.max(0, prev - 1));
    try {
      await rejectFollowRequest(item.requestId);
    } catch (e) {
      console.error("[FollowListScreen] rejectRequest error:", e);
      // Revert
      setRequestsData((prev) => [item, ...prev]);
      setRequestsCount((prev) => prev + 1);
    }
  }, []);

  const handleRemoveFollower = useCallback((followerAddress: string) => {
    const targetItem = data.find(
      (d) => d.user.address.toLowerCase() === followerAddress.toLowerCase()
    );
    const displayName = targetItem?.user.displayName || targetItem?.user.username || "this user";
    setRemoveTarget({ address: followerAddress, displayName });
  }, [data]);

  const handleConfirmRemoveFollower = useCallback(async () => {
    if (!removeTarget) return;
    const { address: followerAddress } = removeTarget;
    const targetItem = data.find(
      (d) => d.user.address.toLowerCase() === followerAddress.toLowerCase()
    );

    setRemoveTarget(null);

    // Optimistic removal
    setData((prev) => prev.filter(
      (d) => d.user.address.toLowerCase() !== followerAddress.toLowerCase()
    ));
    setTotalCount((prev) => Math.max(0, prev - 1));
    try {
      await removeFollower(followerAddress);
    } catch (e) {
      console.error("[FollowListScreen] removeFollower error:", e);
      if (targetItem) {
        setData((prev) => [targetItem, ...prev]);
        setTotalCount((prev) => prev + 1);
      }
    }
  }, [removeTarget, data]);

  const handleRefresh = useCallback(() => {
    if (activeTab === "requests") {
      fetchRequests(1, true);
      return;
    }
    if (canViewList) {
      fetchData(1, true);
    }
  }, [fetchData, fetchRequests, canViewList, activeTab]);

  const handleLoadMore = useCallback(() => {
    if (activeTab === "requests") {
      if (!requestsLoadingMore && requestsHasMore && !requestsLoading) {
        fetchRequests(requestsPage + 1);
      }
      return;
    }
    if (!loadingMore && hasMore && !loading && canViewList) {
      fetchData(page + 1);
    }
  }, [activeTab, loadingMore, hasMore, loading, page, fetchData, canViewList, requestsLoadingMore, requestsHasMore, requestsLoading, requestsPage, fetchRequests]);

  const handleUserPress = useCallback(
    (userAddress: string) => {
      showUserProfile(userAddress);
    },
    [showUserProfile]
  );

  const handleTabChange = useCallback((tab: TabKey) => {
    setActiveTab(tab);
    setSearchQuery("");
    setDebouncedSearch("");
    setShowSortPicker(false);
  }, []);

  const handleSortChange = useCallback((option: SortOption) => {
    setSortOption(option);
    setShowSortPicker(false);
  }, []);

  const dismissKeyboard = useCallback(() => {
    Keyboard.dismiss();
    setShowSortPicker(false);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: FollowListItem }) => (
      <FollowUserRow
        item={item}
        onPress={handleUserPress}
        onRemove={isOwner && activeTab === "followers" ? handleRemoveFollower : undefined}
      />
    ),
    [handleUserPress, isOwner, activeTab, handleRemoveFollower]
  );

  const renderRequestItem = useCallback(
    ({ item }: { item: FollowRequestItem }) => (
      <FollowRequestRow
        item={item}
        onAccept={handleAcceptRequest}
        onReject={handleRejectRequest}
        onPress={handleUserPress}
      />
    ),
    [handleAcceptRequest, handleRejectRequest, handleUserPress]
  );

  const keyExtractor = useCallback((item: FollowListItem) => item.user.address, []);
  const requestKeyExtractor = useCallback((item: FollowRequestItem) => item.requestId, []);

  const ItemSeparatorComponent = useCallback(() => (
    <View className="h-[1px] bg-theme-neutrals-800/50 ml-[76px]" />
  ), []);

  const ListFooterComponent = useMemo(() => {
    if (loadingMore) {
      return (
        <View className="py-6 items-center">
          <ActivityIndicator size="small" color="#fff" />
        </View>
      );
    }
    if (!hasMore && data.length > 0) {
      return (
        <View className="py-6 items-center">
          <Text className="text-gray-600 text-sm">No more {activeTab}</Text>
        </View>
      );
    }
    return <View className="h-6" />;
  }, [loadingMore, hasMore, data.length, activeTab]);

  const ListEmptyComponent = useMemo(() => {
    if (loading) return null;
    return (
      <View className="flex-1 items-center justify-center py-16">
        <View className="bg-theme-neutrals-800/30 rounded-full p-5 mb-4">
          <Ionicons name="people-outline" size={40} color="#555" />
        </View>
        <Text className="text-gray-400 text-base text-center px-8">
          {debouncedSearch
            ? `No ${activeTab} found matching "${debouncedSearch}"`
            : `No ${activeTab} yet`}
        </Text>
      </View>
    );
  }, [loading, debouncedSearch, activeTab]);

  const headerTitle = username ? `@${username}` : truncate(address, 12, "..");

  return (
    <View 
      className="flex-1 bg-black" 
      style={{ paddingTop: 0 }}
    >
      {/* Header */}
      <ScreenHeader title={headerTitle} />

      {/* Tabs - Instagram style */}
      <View className="flex-row border-b border-theme-neutrals-800">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => handleTabChange(tab.key)}
              className="flex-1 py-4 items-center"
              activeOpacity={0.7}
            >
              <View className="flex-row items-center gap-1">
                <Text
                  className={`font-semibold text-base ${
                    isActive ? "text-white" : "text-gray-500"
                  }`}
                >
                  {tab.label}
                </Text>
                {tab.key === "requests" && requestsCount > 0 && (
                  <View className="bg-red-500 rounded-full min-w-[18px] h-[18px] items-center justify-center px-1">
                    <Text className="text-white text-[10px] font-bold">
                      {requestsCount > 99 ? "99+" : requestsCount}
                    </Text>
                  </View>
                )}
              </View>
              {isActive && (
                <View className="absolute bottom-0 left-4 right-4 h-[2px] bg-white rounded-full" />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Content */}
      {!canViewList ? (
        <HiddenFollowersMessage username={username} />
      ) : activeTab === "requests" ? (
        /* Requests Tab Content */
        requestsLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#fff" />
          </View>
        ) : (
          <FlatList
            data={requestsData}
            renderItem={renderRequestItem}
            keyExtractor={requestKeyExtractor}
            ItemSeparatorComponent={ItemSeparatorComponent}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.3}
            refreshControl={
              <RefreshControl
                refreshing={requestsRefreshing}
                onRefresh={handleRefresh}
                tintColor="#fff"
                progressBackgroundColor="#1a1a1a"
              />
            }
            ListFooterComponent={
              requestsLoadingMore ? (
                <View className="py-6 items-center">
                  <ActivityIndicator size="small" color="#fff" />
                </View>
              ) : null
            }
            ListEmptyComponent={
              <View className="flex-1 items-center justify-center py-16">
                <View className="bg-theme-neutrals-800/30 rounded-full p-5 mb-4">
                  <Ionicons name="person-add-outline" size={40} color="#555" />
                </View>
                <Text className="text-gray-400 text-base text-center px-8">
                  No pending follow requests
                </Text>
              </View>
            }
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ flexGrow: 1 }}
          />
        )
      ) : (
        <>
          {/* Search and Sort Row */}
          <View className="px-4 py-3 flex-row items-center gap-3">
            <View className="flex-1 flex-row items-center bg-theme-neutrals-800/60 rounded-xl px-4 h-10">
              <Ionicons name="search" size={18} color="#666" />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search"
                placeholderTextColor="#555"
                className="flex-1 ml-2 text-white text-[15px]"
                returnKeyType="search"
                onSubmitEditing={dismissKeyboard}
                autoCorrect={false}
                autoCapitalize="none"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity 
                  onPress={() => setSearchQuery("")}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close-circle" size={18} color="#666" />
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity
              onPress={() => setShowSortPicker(!showSortPicker)}
              className={`h-10 px-3 rounded-xl flex-row items-center ${
                showSortPicker ? "bg-white" : "bg-theme-neutrals-800/60"
              }`}
              activeOpacity={0.7}
            >
              <Ionicons 
                name="options-outline" 
                size={20} 
                color={showSortPicker ? "#000" : "#fff"} 
              />
            </TouchableOpacity>
          </View>

          {/* Sort Picker Dropdown */}
          {showSortPicker && (
            <View className="px-4 pb-3">
              <View className="bg-theme-neutrals-800 rounded-xl overflow-hidden">
                {SORT_OPTIONS.map((option, index) => (
                  <TouchableOpacity
                    key={option.key}
                    onPress={() => handleSortChange(option.key)}
                    className={`px-4 py-3.5 flex-row items-center ${
                      index !== SORT_OPTIONS.length - 1 ? "border-b border-theme-neutrals-700/50" : ""
                    }`}
                    activeOpacity={0.6}
                  >
                    <Ionicons 
                      name={option.icon as any} 
                      size={20} 
                      color={sortOption === option.key ? "#fff" : "#888"} 
                    />
                    <Text 
                      className={`flex-1 ml-3 text-[15px] ${
                        sortOption === option.key ? "text-white font-medium" : "text-gray-400"
                      }`}
                    >
                      {option.label}
                    </Text>
                    {sortOption === option.key && (
                      <Ionicons name="checkmark-circle" size={20} color="#3b82f6" />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Count indicator */}
          {!loading && totalCount > 0 && (
            <View className="px-4 pb-2">
              <Text className="text-gray-500 text-sm font-medium">
                {formatCompactNumber(totalCount)} {activeTab}
              </Text>
            </View>
          )}

          {/* List */}
          {loading ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator size="large" color="#fff" />
            </View>
          ) : (
            <FlatList
              data={data}
              renderItem={renderItem}
              keyExtractor={keyExtractor}
              ItemSeparatorComponent={ItemSeparatorComponent}
              onEndReached={handleLoadMore}
              onEndReachedThreshold={0.3}
              refreshControl={
                <RefreshControl 
                  refreshing={refreshing} 
                  onRefresh={handleRefresh} 
                  tintColor="#fff"
                  progressBackgroundColor="#1a1a1a"
                />
              }
              ListFooterComponent={ListFooterComponent}
              ListEmptyComponent={ListEmptyComponent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ flexGrow: 1 }}
            />
          )}
        </>
      )}

      {/* Remove Follower confirmation modal */}
      <GlassModal
        visible={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        presentation="center"
        maxHeight="40%"
        blurIntensity={50}
      >
        <View className="px-5 py-6 items-center">
          <View className="w-14 h-14 rounded-full bg-white/10 items-center justify-center mb-4">
            <Ionicons name="person-remove-outline" size={28} color="#fff" />
          </View>
          <Text className="text-white text-lg font-semibold text-center mb-2">
            Remove follower?
          </Text>
          <Text className="text-theme-neutrals-400 text-sm text-center mb-6 leading-5">
            {removeTarget?.displayName || "This user"} won't be notified that they were removed from your followers.
          </Text>
          <View className="flex-row gap-3 w-full">
            <TouchableOpacity
              onPress={() => setRemoveTarget(null)}
              className="flex-1 bg-theme-neutrals-800 py-3 rounded-xl items-center"
              activeOpacity={0.7}
            >
              <Text className="text-white font-semibold">Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleConfirmRemoveFollower}
              className="flex-1 bg-red-500/90 py-3 rounded-xl items-center"
              activeOpacity={0.7}
            >
              <Text className="text-white font-semibold">Remove</Text>
            </TouchableOpacity>
          </View>
        </View>
      </GlassModal>
    </View>
  );
};

export default FollowListScreen;

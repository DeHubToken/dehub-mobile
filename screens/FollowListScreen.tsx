import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
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
import { useTranslation } from "react-i18next";
import { useRoute, RouteProp } from "@react-navigation/native";
import { useUser } from "../context/AuthContext";
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
  followUser,
  unfollowUser,
} from "../services/user.service";
import { getAvatarUrl } from "../libs/misc";
import { truncate } from "../libs/strings.util";
import { formatCompactNumber } from "../libs/numbers.util";
import Avatar from "../components/common/Avatar";
import ScreenHeader from "../components/ScreenHeader";
import GlassFollowButton from "../components/ui/GlassFollowButton";
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

/** What the viewer's own relationship to a listed account is. */
interface Relationship {
  isFollowing: boolean;
  followsYou: boolean;
  isPending: boolean;
}

const SORT_OPTIONS: { key: SortOption; labelKey: string; icon: string }[] = [
  { key: "recent", labelKey: "follow.sortRecent", icon: "time-outline" },
  { key: "oldest", labelKey: "follow.sortOldest", icon: "hourglass-outline" },
  { key: "alphabetical", labelKey: "follow.sortAlphabetical", icon: "text-outline" },
];

const PAGE_LIMIT = 20;

// Fallback only. The API stamps every row with isFollowing/followsYou for the
// authenticated viewer; if it ever answers without them we page the viewer's
// own following list instead, capped so a phone never fires more than this.
const FALLBACK_PAGES = 3;
const FALLBACK_PAGE_SIZE = 100;

const lower = (value?: string | null) => (value || "").toLowerCase();

interface FollowUserRowProps {
  item: FollowListItem;
  relationship?: Relationship;
  isSelf: boolean;
  busy: boolean;
  showFollowButton: boolean;
  onPress: (address: string) => void;
  onToggleFollow: (item: FollowListItem) => void;
  onLongPress?: (address: string) => void;
}

const FollowUserRow: React.FC<FollowUserRowProps> = React.memo(
  ({ item, relationship, isSelf, busy, showFollowButton, onPress, onToggleFollow, onLongPress }) => {
    const { t } = useTranslation();
    const user = item.user;
    const displayName = user.displayName || user.username || truncate(user.address, 12, "..");
    const avatarUrl = getAvatarUrl(user.avatarImageUrl);
    const hasUsername = !!user.username;

    const handlePress = useCallback(() => {
      onPress(user.address);
    }, [onPress, user.address]);

    const handleLongPress = useCallback(() => {
      onLongPress?.(user.address);
    }, [onLongPress, user.address]);

    const handleFollow = useCallback(() => {
      onToggleFollow(item);
    }, [onToggleFollow, item]);

    return (
      <TouchableOpacity
        onPress={handlePress}
        onLongPress={onLongPress ? handleLongPress : undefined}
        delayLongPress={350}
        activeOpacity={0.6}
        className="flex-row items-center px-4 py-3"
      >
        {/* Rounded square, the same shape avatars take everywhere else in both
            apps. This row used to wrap it in a circular ring, which left a
            squared image sitting inside a circle. */}
        <Avatar uri={avatarUrl} size={48} name={displayName} />

        {/* Name and handle get a row each so neither has to be cut short. */}
        <View className="flex-1 ml-3 mr-3">
          <Text className="text-white font-semibold text-[15px]" numberOfLines={2}>
            {displayName}
          </Text>
          {hasUsername && (
            <Text className="text-theme-neutrals-400 text-[13px] mt-0.5" numberOfLines={1}>
              @{user.username}
            </Text>
          )}
          <View className="flex-row items-center flex-wrap mt-1">
            {relationship?.followsYou && !isSelf && (
              <View className="bg-theme-neutrals-800 rounded px-1.5 py-0.5 mr-2">
                <Text className="text-theme-neutrals-300 text-[10px] font-medium">
                  {t("follow.followsYou")}
                </Text>
              </View>
            )}
            {user.followers !== undefined && (
              <Text className="text-theme-neutrals-500 text-[11px]">
                {t("follow.followerCount", { compact: formatCompactNumber(user.followers) })}
              </Text>
            )}
          </View>
        </View>

        {showFollowButton && !isSelf ? (
          <GlassFollowButton
            isFollowing={!!relationship?.isFollowing}
            isPending={!!relationship?.isPending}
            isLoading={busy}
            followsYou={!!relationship?.followsYou}
            onPress={handleFollow}
            style={{ minWidth: 92 }}
          />
        ) : (
          <Ionicons name="chevron-forward" size={20} color="#A1A1AA" />
        )}
      </TouchableOpacity>
    );
  }
);

interface FollowRequestRowProps {
  item: FollowRequestItem;
  onAccept: (item: FollowRequestItem) => void;
  onReject: (item: FollowRequestItem) => void;
  onPress: (address: string) => void;
}

const FollowRequestRow: React.FC<FollowRequestRowProps> = React.memo(
  ({ item, onAccept, onReject, onPress }) => {
    const { t } = useTranslation();
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
        <TouchableOpacity activeOpacity={0.6} onPress={handlePress}>
          <Avatar uri={avatarUrl} size={48} name={displayName} />
        </TouchableOpacity>

        <TouchableOpacity className="flex-1 ml-3 mr-3" activeOpacity={0.6} onPress={handlePress}>
          <Text className="text-white font-semibold text-[15px]" numberOfLines={2}>
            {displayName}
          </Text>
          {item.user.username && (
            <Text className="text-theme-neutrals-400 text-[13px] mt-0.5" numberOfLines={1}>
              @{item.user.username}
            </Text>
          )}
        </TouchableOpacity>

        <View className="flex-row items-center gap-2">
          <AccentButtonGradient style={{ borderRadius: 8 }}>
            <TouchableOpacity
              onPress={handleAccept}
              className="px-4 py-2"
              style={{ backgroundColor: 'transparent' }}
              activeOpacity={0.85}
            >
              <Text className="text-white text-xs font-semibold">{t("follow.accept")}</Text>
            </TouchableOpacity>
          </AccentButtonGradient>
          <TouchableOpacity
            onPress={handleReject}
            className="bg-theme-neutrals-800 px-4 py-2 rounded-lg"
            activeOpacity={0.85}
          >
            <Text className="text-gray-400 text-xs font-semibold">{t("follow.decline")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }
);

const HiddenFollowersMessage: React.FC<{ username?: string }> = ({ username }) => {
  const { t } = useTranslation();
  return (
    <View className="flex-1 items-center justify-center px-8">
      <View className="bg-theme-neutrals-800/50 rounded-2xl p-6 mb-6">
        <Ionicons name="lock-closed" size={48} color="#A1A1AA" />
      </View>
      <Text className="text-white text-xl font-bold text-center mb-2">
        {t("follow.privateTitle")}
      </Text>
      <Text className="text-gray-400 text-center text-base leading-6">
        {username
          ? t("follow.privateBody", { name: `@${username}` })
          : t("follow.privateBodyGeneric")}
      </Text>
    </View>
  );
};

const FollowListScreen: React.FC = () => {
  const { t } = useTranslation();
  const route = useRoute<RouteProp<RouteParams, "FollowList">>();
  const authUser = useUser();
  const { showUserProfile } = useUserProfileSheet();

  const {
    address,
    username,
    initialTab = "followers",
    hideFollowers = false,
    isOwnProfile = false,
  } = route.params;

  const viewerAddress = authUser?.address;

  // Determine if we can show the list
  const isOwner = isOwnProfile || lower(authUser?.address) === lower(address);
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

  // Viewer's own relationship to each listed account, keyed by lowercased address.
  const [relationships, setRelationships] = useState<Record<string, Relationship>>({});
  const [pendingFollow, setPendingFollow] = useState<Record<string, boolean>>({});
  const followingSetRef = useRef<Set<string> | null>(null);
  // Read by the follow handler so it can stay identity-stable. A handler that
  // closes over the maps is rebuilt on every toggle, which re-renders every
  // memoised row in the list instead of the one that changed.
  const relationshipsRef = useRef(relationships);
  relationshipsRef.current = relationships;
  const pendingFollowRef = useRef(pendingFollow);
  pendingFollowRef.current = pendingFollow;

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

  const isOwnFollowingList = isOwner && activeTab === "following";
  const isOwnFollowersList = isOwner && activeTab === "followers";

  // Build tabs dynamically — only show "Requests" for own private profile
  const isPrivateAccount = authUser?.isPrivate === true;
  const tabs = useMemo(() => {
    const base: { key: TabKey; label: string }[] = [
      { key: "followers", label: t("follow.followers") },
      { key: "following", label: t("follow.following") },
    ];
    if (isOwner && isPrivateAccount) {
      base.push({ key: "requests", label: t("follow.requests") });
    }
    return base;
  }, [isOwner, isPrivateAccount, t]);

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

  /**
   * Older API builds answer the follow list with profile fields only. Rather
   * than one is_following call per visible row, page the viewer's own following
   * list once per screen and reuse it. Capped: this is a stopgap, not the path.
   */
  const ensureFollowingSet = useCallback(async (): Promise<Set<string>> => {
    if (followingSetRef.current) return followingSetRef.current;
    const set = new Set<string>();
    if (!viewerAddress) {
      followingSetRef.current = set;
      return set;
    }
    try {
      for (let p = 1; p <= FALLBACK_PAGES; p++) {
        const res = await getFollowList({
          address: viewerAddress,
          type: "following",
          page: p,
          limit: FALLBACK_PAGE_SIZE,
        });
        for (const entry of res.result?.items || []) {
          if (entry.user?.address) set.add(lower(entry.user.address));
        }
        if (!res.result?.pagination?.hasMore) break;
      }
    } catch (error) {
      console.warn("[FollowListScreen] following cache failed:", error);
    }
    followingSetRef.current = set;
    return set;
  }, [viewerAddress]);

  /**
   * Fold a page of rows into the relationship map. Server flags win; what the
   * list itself proves (your own following list means you follow every row)
   * comes next; the cached set is the last resort.
   */
  const mergeRelationships = useCallback(
    (items: FollowListItem[], followingSet?: Set<string> | null) => {
      setRelationships((prev) => {
        const next = { ...prev };
        for (const entry of items) {
          const user = entry.user;
          const key = lower(user?.address);
          if (!key) continue;

          const serverFollowing = typeof user.isFollowing === "boolean" ? user.isFollowing : undefined;
          const serverFollowsYou = typeof user.followsYou === "boolean" ? user.followsYou : undefined;

          const cached = followingSet ? followingSet.has(key) : prev[key]?.isFollowing;
          next[key] = {
            isFollowing: isOwnFollowingList
              ? true
              : serverFollowing ?? cached ?? false,
            followsYou: isOwnFollowersList
              ? true
              : serverFollowsYou ?? prev[key]?.followsYou ?? false,
            isPending: prev[key]?.isPending ?? false,
          };
        }
        return next;
      });
    },
    [isOwnFollowingList, isOwnFollowersList]
  );

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
          const items = response.result.items;
          if (pageNum === 1) {
            setData(items);
          } else {
            setData((prev) => [...prev, ...items]);
          }
          setHasMore(response.result.pagination.hasMore);
          setTotalCount(response.result.pagination.totalCount);
          setPage(pageNum);

          const missingFlags = items.some(
            (entry) => typeof entry.user?.isFollowing !== "boolean"
          );
          if (missingFlags && !isOwnFollowingList && viewerAddress) {
            mergeRelationships(items);
            const set = await ensureFollowingSet();
            mergeRelationships(items, set);
          } else {
            mergeRelationships(items);
          }
        }
      } catch (error) {
        console.error("[FollowListScreen] fetchData error:", error);
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [
      address,
      activeTab,
      debouncedSearch,
      sortOption,
      getSortParams,
      canViewList,
      mergeRelationships,
      ensureFollowingSet,
      isOwnFollowingList,
      viewerAddress,
    ]
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

  /**
   * Follow / unfollow straight from the row. The button carries the state, so
   * this is the only place either list mutates a relationship.
   */
  const handleToggleFollow = useCallback(
    async (item: FollowListItem) => {
      const target = item.user.address;
      const key = lower(target);
      if (!viewerAddress || !target || key === lower(viewerAddress)) return;
      if (pendingFollowRef.current[key]) return;

      const current = relationshipsRef.current[key];
      const wasFollowing = !!current?.isFollowing || !!current?.isPending;

      setPendingFollow((prev) => ({ ...prev, [key]: true }));
      // Optimistic: the row flips now, and reverts below if the call fails.
      setRelationships((prev) => ({
        ...prev,
        [key]: {
          isFollowing: !wasFollowing,
          followsYou: prev[key]?.followsYou ?? false,
          isPending: false,
        },
      }));

      try {
        if (wasFollowing) {
          await unfollowUser(viewerAddress, target);
          followingSetRef.current?.delete(key);
        } else {
          const res = await followUser(viewerAddress, target);
          const isPending = res.status === "pending";
          setRelationships((prev) => ({
            ...prev,
            [key]: {
              isFollowing: !isPending,
              followsYou: prev[key]?.followsYou ?? false,
              isPending,
            },
          }));
          if (!isPending) followingSetRef.current?.add(key);
        }
      } catch (e) {
        console.error("[FollowListScreen] follow toggle error:", e);
        setRelationships((prev) => ({
          ...prev,
          [key]: {
            isFollowing: wasFollowing,
            followsYou: prev[key]?.followsYou ?? false,
            isPending: !!current?.isPending,
          },
        }));
      } finally {
        setPendingFollow((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }
    },
    [viewerAddress]
  );

  const handleRemoveFollower = useCallback((followerAddress: string) => {
    const targetItem = data.find(
      (d) => lower(d.user.address) === lower(followerAddress)
    );
    const displayName =
      targetItem?.user.displayName || targetItem?.user.username || t("follow.thisUser");
    setRemoveTarget({ address: followerAddress, displayName });
  }, [data, t]);

  const handleConfirmRemoveFollower = useCallback(async () => {
    if (!removeTarget) return;
    const { address: followerAddress } = removeTarget;
    const targetItem = data.find(
      (d) => lower(d.user.address) === lower(followerAddress)
    );

    setRemoveTarget(null);

    // Optimistic removal
    setData((prev) => prev.filter(
      (d) => lower(d.user.address) !== lower(followerAddress)
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
      followingSetRef.current = null;
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
    ({ item }: { item: FollowListItem }) => {
      const key = lower(item.user.address);
      return (
        <FollowUserRow
          item={item}
          relationship={relationships[key]}
          isSelf={!!viewerAddress && key === lower(viewerAddress)}
          busy={!!pendingFollow[key]}
          showFollowButton={!!viewerAddress}
          onPress={handleUserPress}
          onToggleFollow={handleToggleFollow}
          onLongPress={isOwnFollowersList ? handleRemoveFollower : undefined}
        />
      );
    },
    [
      handleUserPress,
      handleToggleFollow,
      handleRemoveFollower,
      isOwnFollowersList,
      relationships,
      pendingFollow,
      viewerAddress,
    ]
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
          <Text className="text-zinc-400 text-sm">
            {activeTab === "followers" ? t("follow.noMoreFollowers") : t("follow.noMoreFollowing")}
          </Text>
        </View>
      );
    }
    return <View className="h-6" />;
  }, [loadingMore, hasMore, data.length, activeTab, t]);

  const ListEmptyComponent = useMemo(() => {
    if (loading) return null;
    const message = debouncedSearch
      ? t("follow.noMatches", { query: debouncedSearch })
      : activeTab === "followers"
        ? t("follow.noFollowersYet")
        : t("follow.notFollowingAnyone");
    return (
      <View className="flex-1 items-center justify-center py-16">
        <View className="bg-theme-neutrals-800/30 rounded-2xl p-5 mb-4">
          <Ionicons name="people-outline" size={40} color="#A1A1AA" />
        </View>
        <Text className="text-gray-400 text-base text-center px-8">{message}</Text>
      </View>
    );
  }, [loading, debouncedSearch, activeTab, t]);

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
                  <View className="bg-white rounded-full min-w-[18px] h-[18px] items-center justify-center px-1">
                    <Text className="text-zinc-950 text-[10px] font-bold">
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
            initialNumToRender={12}
            maxToRenderPerBatch={10}
            windowSize={9}
            removeClippedSubviews
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
                <View className="bg-theme-neutrals-800/30 rounded-2xl p-5 mb-4">
                  <Ionicons name="person-add-outline" size={40} color="#A1A1AA" />
                </View>
                <Text className="text-gray-400 text-base text-center px-8">
                  {t("follow.noRequests")}
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
              <Ionicons name="search" size={18} color="#A1A1AA" />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder={t("follow.searchPlaceholder")}
                placeholderTextColor="#A1A1AA"
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
                  <Ionicons name="close-circle" size={18} color="#A1A1AA" />
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
                      color={sortOption === option.key ? "#fff" : "#A1A1AA"}
                    />
                    <Text
                      className={`flex-1 ml-3 text-[15px] ${
                        sortOption === option.key ? "text-white font-medium" : "text-gray-400"
                      }`}
                    >
                      {t(option.labelKey)}
                    </Text>
                    {sortOption === option.key && (
                      <Ionicons name="checkmark-circle" size={20} color="#F4F4F5" />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Count indicator, plus how to get rid of a follower now that the
              row's button carries the follow state instead. */}
          {!loading && totalCount > 0 && (
            <View className="px-4 pb-2">
              <Text className="text-gray-500 text-sm font-medium">
                {activeTab === "followers"
                  ? t("follow.countFollowers", { compact: formatCompactNumber(totalCount) })
                  : t("follow.countFollowing", { compact: formatCompactNumber(totalCount) })}
              </Text>
              {isOwnFollowersList && (
                <Text className="text-theme-neutrals-600 text-xs mt-0.5">
                  {t("follow.removeFollowerHint")}
                </Text>
              )}
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
              initialNumToRender={12}
              maxToRenderPerBatch={10}
              windowSize={9}
              removeClippedSubviews
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
          <View className="w-14 h-14 rounded-2xl bg-white/10 items-center justify-center mb-4">
            <Ionicons name="person-remove-outline" size={28} color="#fff" />
          </View>
          <Text className="text-white text-lg font-semibold text-center mb-2">
            {t("follow.removeFollowerTitle")}
          </Text>
          <Text className="text-theme-neutrals-400 text-sm text-center mb-6 leading-5">
            {t("follow.removeFollowerBody", {
              name: removeTarget?.displayName || t("follow.thisUser"),
            })}
          </Text>
          <View className="flex-row gap-3 w-full">
            <TouchableOpacity
              onPress={() => setRemoveTarget(null)}
              className="flex-1 bg-theme-neutrals-800 py-3 rounded-xl items-center"
              activeOpacity={0.7}
            >
              <Text className="text-white font-semibold">{t("follow.cancel")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleConfirmRemoveFollower}
              className="flex-1 bg-white/15 border border-white/25 py-3 rounded-xl items-center"
              activeOpacity={0.7}
            >
              <Text className="text-white font-semibold">{t("follow.remove")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </GlassModal>
    </View>
  );
};

export default FollowListScreen;

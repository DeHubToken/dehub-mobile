import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  View,
  TextInput,
  FlatList,
  ScrollView,
  Text,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "../components/ui/Icon";
import {
  search,
  fetchSuggestions,
  getHistory,
  addToHistory,
  topHistorySubset,
  SearchContentResult,
  SearchAccountResult,
  SearchPostType,
  SearchPagination,
  UnifiedSearchResponse,
} from "../services/search.service";
import {
  getUnifiedFeed,
  type UnifiedFeedItem,
  type UnifiedFeedResponse,
  type FeedPostType,
} from "../services/feed.unified.service";
import ScreenHeader from "../components/ScreenHeader";
import FeedCard from "../components/Home/FeedCard";
import SearchAccountCard from "../components/Search/SearchAccountCard";
import SearchAccountChip from "../components/Search/SearchAccountChip";
import FeedCardSkeleton from "../components/Feed/FeedCardSkeleton";
import type { FollowState } from "../components/Search/SearchAccountChip";
import { useAuth } from "../context/AuthContext";

type TabKey = "all" | "accounts" | "posts" | "images" | "videos" | "voice" | "live";

interface Tab {
  key: TabKey;
  label: string;
  icon: React.ComponentProps<typeof Icon>["name"];
  postType?: SearchPostType;
  searchType?: "accounts" | "content";
}

const TABS: Tab[] = [
  { key: "all", label: "All", icon: "Search" },
  { key: "accounts", label: "Accounts", icon: "Users", searchType: "accounts" },
  { key: "posts", label: "Posts", icon: "FileText", postType: "feed-simple" },
  { key: "images", label: "Images", icon: "Image", postType: "feed-images" },
  { key: "videos", label: "Videos", icon: "Play", postType: "video" },
  { key: "voice", label: "Voice", icon: "Mic", postType: "feed-audio" },
  { key: "live", label: "Live", icon: "Radio", postType: "live" },
];

const TAB_H = 36;
const TAB_RADIUS = 12;
const SLIDE_TIMING = { duration: 150, easing: Easing.out(Easing.cubic) };
const PAGE_SIZE = 20;

/** Tabs shown on the default explore screen (no accounts) */
const EXPLORE_TABS = TABS.filter((t) => t.key !== "accounts");

/** Label for the trending section per tab */
const TRENDING_LABEL: Record<TabKey, string> = {
  all: "Trending This Week",
  accounts: "",
  posts: "Trending Posts",
  images: "Trending Images",
  videos: "Trending Videos",
  voice: "Trending Voice Posts",
  live: "Trending Live",
};

/** Map a SearchContentResult → UnifiedFeedItem for card components */
const toFeedItem = (item: SearchContentResult): UnifiedFeedItem => ({
  tokenId: item.tokenId,
  id: String(item.tokenId),
  name: item.name,
  title: item.name,
  description: item.description,
  imageUrl: item.imageUrl,
  videoUrl: item.videoUrl,
  videoDuration: item.videoDuration,
  thumbnailUrl: item.thumbnailUrl || item.imageUrl,
  imageUrls: item.imageUrls,
  audioUrl: item.audioUrl,
  audioDuration: item.audioDuration,
  listens: item.listens,
  postType: (item.postType as UnifiedFeedItem["postType"]) ?? "video",
  views: item.views ?? 0,
  likes: item.totalVotes?.for ?? item.likes ?? 0,
  dislikes: item.totalVotes?.against ?? item.dislikes ?? 0,
  createdAt: item.createdAt,
  minter: item.minter || item.minterUser?.address,
  minterUser: item.minterUser,
  minterUsername: item.minterUsername || item.minterUser?.username,
  minterDisplayName: item.minterDisplayName || item.minterUser?.displayName,
  minterAvatarUrl: item.minterAvatarUrl || item.minterUser?.avatarImageUrl,
  minterStaked: item.minterUser?.badgeBalance ?? item.minterStaked ?? 0,
  stream: item.stream,
  isLiked: item.isLiked,
  isDisliked: item.isDisliked,
  isSaved: item.isSaved,
  isFollowing: item.isFollowing,
  isOwner: item.isOwner,
  isUnlocked: item.isUnlocked,
  commentCount: item.commentCount ?? 0,
  category: item.category,
});

const SearchScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { user: authUser } = useAuth() as { user: { address?: string } | null };
  const userAddress = authUser?.address;

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [hasSearched, setHasSearched] = useState(false);

  // Result buckets
  const [accounts, setAccounts] = useState<SearchAccountResult[]>([]);
  const [content, setContent] = useState<SearchContentResult[]>([]);
  const [accountsPagination, setAccountsPagination] = useState<SearchPagination | null>(null);
  const [contentPagination, setContentPagination] = useState<SearchPagination | null>(null);

  // Loading
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Suggestions & history
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [inputFocused, setInputFocused] = useState(false);

  // Trending
  const [trendingVideos, setTrendingVideos] = useState<UnifiedFeedItem[]>([]);
  const [trendingLoading, setTrendingLoading] = useState(true);

  // Glass pill indicator
  const pillX = useSharedValue(0);
  const pillW = useSharedValue(0);
  const tabLayouts = useRef<Record<string, { x: number; width: number }>>({});

  // Refs
  const inputRef = useRef<TextInput>(null);
  const lastQuery = useRef("");

  useEffect(() => {
    getHistory(userAddress).then(setSearchHistory);
  }, [userAddress]);

  // Fetch trending content based on active tab
  useEffect(() => {
    if (hasSearched) return; // don't refetch while viewing search results
    let cancelled = false;
    setTrendingLoading(true);
    const tabConfig = TABS.find((t) => t.key === activeTab);
    const feedPostType: FeedPostType =
      activeTab === "all" ? "all" : (tabConfig?.postType as FeedPostType) ?? "all";
    (async () => {
      try {
        const res: UnifiedFeedResponse = await getUnifiedFeed({
          postType: feedPostType,
          sortBy: "views",
          sortOrder: "desc",
          range: "week",
          limit: 10,
          page: 1,
        });
        if (!cancelled) setTrendingVideos(res.result || []);
      } catch {
        // silently fail
      } finally {
        if (!cancelled) setTrendingLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activeTab, hasSearched]);

  useEffect(() => {
    let cancelled = false;
    const q = searchQuery.trim();
    if (!q) {
      setSuggestions([]);
      return;
    }
    if (hasSearched && q === lastQuery.current) return;

    const timer = setTimeout(async () => {
      const sugg = await fetchSuggestions(q);
      if (!cancelled) setSuggestions(sugg.slice(0, 5));
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery, hasSearched]);

  const executeSearch = useCallback(
    async (query: string, tab: TabKey = activeTab, page: number = 1, append: boolean = false) => {
      const q = query.trim();
      if (!q) return;

      if (page === 1) {
        setLoading(true);
        if (!append) {
          setAccounts([]);
          setContent([]);
        }
      } else {
        setLoadingMore(true);
      }

      try {
        const tabConfig = TABS.find((t) => t.key === tab);

        // Build search params based on active tab
        const type =
          tab === "all" ? undefined : tab === "accounts" ? "accounts" : "content";
        const postType: SearchPostType | undefined =
          tab === "accounts" || tab === "all" ? undefined : tabConfig?.postType;

        const res: UnifiedSearchResponse = await search({
          q,
          page,
          limit: PAGE_SIZE,
          type: type as any,
          postType,
        });

        if (res.accounts) {
          if (append) {
            setAccounts((prev) => [...prev, ...res.accounts!.items]);
          } else {
            setAccounts(res.accounts.items);
          }
          setAccountsPagination(res.accounts.pagination);
        } else if (!append) {
          setAccounts([]);
          setAccountsPagination(null);
        }

        if (res.content) {
          if (append) {
            setContent((prev) => [...prev, ...res.content!.items]);
          } else {
            setContent(res.content.items);
          }
          setContentPagination(res.content.pagination);
        } else if (!append) {
          setContent([]);
          setContentPagination(null);
        }

        // History & state (first page only)
        if (page === 1) {
          await addToHistory(q, userAddress);
          getHistory(userAddress).then(setSearchHistory);
          setSuggestions([]);
          lastQuery.current = q;
        }

        setHasSearched(true);
      } catch (e) {
        console.error("[SearchScreen] Search error:", e);
      } finally {
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    },
    [activeTab, userAddress],
  );

  const handleSearch = useCallback(() => {
    if (!searchQuery.trim()) return;
    executeSearch(searchQuery, activeTab, 1);
  }, [searchQuery, activeTab, executeSearch]);

  const handleSuggestionClick = useCallback(
    (term: string) => {
      setSearchQuery(term);
      setInputFocused(false);
      inputRef.current?.blur();
      executeSearch(term, activeTab, 1);
    },
    [activeTab, executeSearch],
  );

  const handleTabChange = useCallback(
    (tab: TabKey) => {
      if (tab === activeTab) return;
      setActiveTab(tab);
      // Animate glass pill
      const layout = tabLayouts.current[tab];
      if (layout) {
        pillX.value = withTiming(layout.x, SLIDE_TIMING);
        pillW.value = withTiming(layout.width, SLIDE_TIMING);
      }
      if (hasSearched && searchQuery.trim()) {
        executeSearch(searchQuery, tab, 1);
      }
    },
    [activeTab, hasSearched, searchQuery, executeSearch],
  );

  const handleTabLayout = useCallback(
    (key: TabKey, x: number, width: number) => {
      tabLayouts.current[key] = { x, width };
      if (key === activeTab) {
        pillX.value = x;
        pillW.value = width;
      }
    },
    [activeTab],
  );

  const pillStyle = useAnimatedStyle(() => ({
    position: "absolute" as const,
    left: pillX.value,
    width: pillW.value,
    height: TAB_H,
  }));

  const handleLoadMore = useCallback(() => {
    if (loadingMore) return;

    if (activeTab === "accounts") {
      if (!accountsPagination?.hasMore) return;
      executeSearch(searchQuery, activeTab, accountsPagination.page + 1, true);
    } else {
      // "all" or content tabs — paginate content
      if (!contentPagination?.hasMore) return;
      executeSearch(searchQuery, activeTab, contentPagination.page + 1, true);
    }
  }, [loadingMore, activeTab, accountsPagination, contentPagination, searchQuery, executeSearch]);

  const handleRefresh = useCallback(() => {
    if (!searchQuery.trim()) return;
    setRefreshing(true);
    executeSearch(searchQuery, activeTab, 1);
  }, [searchQuery, activeTab, executeSearch]);

  const clearSearch = useCallback(() => {
    setSearchQuery("");
    setAccounts([]);
    setContent([]);
    setAccountsPagination(null);
    setContentPagination(null);
    setSuggestions([]);
    setHasSearched(false);
    lastQuery.current = "";
    inputRef.current?.focus();
  }, []);

  const handleReplaceSearchBox = useCallback((term: string) => {
    setSearchQuery(term);
    inputRef.current?.focus();
  }, []);

  // Propagate follow state changes to account list
  const handleFollowChange = useCallback((address: string, newState: FollowState) => {
    setAccounts((prev) =>
      prev.map((a) =>
        a.address.toLowerCase() === address.toLowerCase()
          ? { ...a, isFollowing: newState.isFollowing, isFollowRequestPending: newState.isFollowRequestPending }
          : a,
      ),
    );
  }, []);

  const renderContentItem = useCallback(
    ({ item }: { item: SearchContentResult }) => {
      const feedItem = toFeedItem(item);
      return (
        <View className="px-4">
          <FeedCard item={feedItem} />
        </View>
      );
    },
    [],
  );

  const renderAccountItem = useCallback(
    ({ item }: { item: SearchAccountResult }) => (
      <View className="px-4">
        <SearchAccountCard account={item} onFollowChange={handleFollowChange} />
      </View>
    ),
    [handleFollowChange],
  );

  const contentKeyExtractor = useCallback(
    (item: SearchContentResult, index: number) => `content-${item.tokenId}-${index}`,
    [],
  );

  const accountKeyExtractor = useCallback(
    (item: SearchAccountResult, index: number) => `account-${item.address}-${index}`,
    [],
  );

  const AccountsCarousel = useMemo(() => {
    if (activeTab !== "all" || accounts.length === 0) return null;

    return (
      <View className="mb-2">
        <View className="flex-row items-center justify-between px-4 mb-2">
          <Text className="text-theme-neutrals-400 text-xs font-semibold">
            Accounts
          </Text>
          <TouchableOpacity
            onPress={() => handleTabChange("accounts")}
            activeOpacity={0.7}
          >
            <Text className="text-theme-accent text-xs font-semibold">
              See All
            </Text>
          </TouchableOpacity>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16 }}
        >
          {accounts.map((account) => (
            <SearchAccountChip
              key={account.address}
              account={account}
              onFollowChange={handleFollowChange}
            />
          ))}
        </ScrollView>
      </View>
    );
  }, [activeTab, accounts, handleFollowChange, handleTabChange]);

  const ListFooter = useMemo(() => {
    if (loadingMore) {
      return (
        <View className="py-4">
          <FeedCardSkeleton count={3} />
        </View>
      );
    }

    const activePagination = activeTab === "accounts" ? accountsPagination : contentPagination;
    const hasItems = activeTab === "accounts" ? accounts.length > 0 : content.length > 0;

    if (hasItems && !activePagination?.hasMore) {
      return (
        <View className="py-6">
          <Text className="text-center text-theme-neutrals-500 text-xs">End of results</Text>
        </View>
      );
    }

    return null;
  }, [loadingMore, activeTab, accountsPagination, contentPagination, accounts.length, content.length]);

  const renderTrendingItem = useCallback(
    ({ item }: { item: UnifiedFeedItem }) => (
      <View className="px-4">
        <FeedCard item={item} />
      </View>
    ),
    [],
  );

  const trendingKeyExtractor = useCallback(
    (item: UnifiedFeedItem, index: number) => `trending-${item.tokenId ?? item.id}-${index}`,
    [],
  );

  const renderContent = () => {
    // Loading
    if (loading) {
      return (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#fff" />
        </View>
      );
    }

    if (hasSearched) {
      // "accounts" tab → vertical list of account cards
      if (activeTab === "accounts") {
        if (accounts.length === 0) {
          return (
            <View className="flex-1 items-center justify-center px-6">
              <Icon name="Users" size={48} color="#6B7280" />
              <Text className="text-theme-neutrals-300 font-semibold text-base mt-4">
                No accounts found
              </Text>
              <Text className="text-theme-neutrals-500 text-sm text-center mt-2">
                Try different keywords or check your spelling
              </Text>
            </View>
          );
        }

        return (
          <FlatList
            data={accounts}
            renderItem={renderAccountItem}
            keyExtractor={accountKeyExtractor}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.5}
            ListFooterComponent={ListFooter}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#fff" />
            }
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 0, paddingTop: 8, paddingBottom: insets.bottom + 80 }}
          />
        );
      }

      // "all" or a content tab — horizontal accounts carousel + content list
      const isEmpty = content.length === 0 && accounts.length === 0;

      if (isEmpty) {
        return (
          <View className="flex-1 items-center justify-center px-6">
            <Icon name="Search" size={48} color="#6B7280" />
            <Text className="text-theme-neutrals-300 font-semibold text-base mt-4">
              No results found
            </Text>
            <Text className="text-theme-neutrals-500 text-sm text-center mt-2">
              Try different keywords or check your spelling
            </Text>
          </View>
        );
      }

      return (
        <FlatList
          data={content}
          renderItem={renderContentItem}
          keyExtractor={contentKeyExtractor}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          ListHeaderComponent={AccountsCarousel}
          ListFooterComponent={ListFooter}
          ListEmptyComponent={
            accounts.length > 0 ? (
              <View className="py-6">
                <Text className="text-center text-theme-neutrals-500 text-xs">
                  No content results
                </Text>
              </View>
            ) : null
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#fff" />
          }
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 0, paddingTop: 8, paddingBottom: insets.bottom + 80 }}
        />
      );
    }

    // ---- Pre-search: typing overlay ----
    const q = searchQuery.trim();
    const isTyping = q.length > 0;
    const SUGGEST_THRESHOLD = 2;

    // Focused + short query → recent searches
    if (inputFocused && q.length < SUGGEST_THRESHOLD && searchHistory.length > 0) {
      return (
        <View className="px-4 pt-3">
          <Text className="text-theme-neutrals-400 text-xs font-semibold mb-2 px-1">
            Recent Searches
          </Text>
          <View className="rounded-2xl overflow-hidden bg-theme-neutrals-800">
            {topHistorySubset(searchHistory, 5).map((item, index) => (
              <TouchableOpacity
                key={`history-${index}`}
                className="px-4 py-3 flex-row items-center"
                onPress={() => handleSuggestionClick(item)}
                activeOpacity={0.8}
                style={{
                  borderBottomWidth: index === topHistorySubset(searchHistory, 5).length - 1 ? 0 : StyleSheet.hairlineWidth,
                  borderBottomColor: "#333",
                }}
              >
                <Icon name="Clock" size={18} color="#9CA3AF" />
                <Text className="text-theme-neutrals-100 flex-1 ml-3" numberOfLines={1}>
                  {item}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      );
    }

    // Focused + >=threshold → suggestions
    if (isTyping && suggestions.length > 0) {
      return (
        <View className="px-4 pt-3">
          <View className="rounded-2xl overflow-hidden bg-theme-neutrals-800">
            {suggestions.map((item, index) => (
              <TouchableOpacity
                key={`sugg-${index}`}
                className="px-4 py-3 flex-row items-center"
                onPress={() => handleSuggestionClick(item)}
                activeOpacity={0.8}
                style={{
                  borderBottomWidth: index === suggestions.length - 1 ? 0 : StyleSheet.hairlineWidth,
                  borderBottomColor: "#333",
                }}
              >
                <Icon name="Search" size={18} color="#9CA3AF" />
                <Text className="text-theme-neutrals-100 flex-1 ml-3" numberOfLines={1}>
                  {item}
                </Text>
                <TouchableOpacity
                  className="w-8 h-8 rounded-full bg-theme-neutrals-700 items-center justify-center"
                  onPress={() => handleReplaceSearchBox(item)}
                >
                  <Icon name="ArrowUpLeft" size={16} color="#E5E7EB" />
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      );
    }

    // Not typing / not focused → show trending
    return (
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}>
        {trendingLoading ? (
          <View className="px-2 pt-2">
            <FeedCardSkeleton count={3} />
          </View>
        ) : trendingVideos.length > 0 ? (
          <View>
            <View className="px-4 pt-3 pb-2">
              <Text className="text-white text-base font-bold">
                {TRENDING_LABEL[activeTab] || "Trending This Week"}
              </Text>
            </View>
            {trendingVideos.map((item, index) => (
              <View key={`trending-${item.tokenId ?? item.id}-${index}`} className="px-4">
                <FeedCard item={item} />
              </View>
            ))}
          </View>
        ) : (
          <View className="flex-1 items-center justify-center px-6 pt-20">
            <Icon name="TrendingUp" size={48} color="#6B7280" />
            <Text className="text-theme-neutrals-400 text-sm text-center mt-4">
              No trending content this week
            </Text>
          </View>
        )}
      </ScrollView>
    );
  };

  return (
    <View className="flex-1 bg-theme-neutrals-900">
      <ScreenHeader title="Explore" canGoBack={false} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
      >
        {/* Search Input */}
        <View className="px-4 pb-2">
          <View className="flex-row items-center bg-theme-neutrals-800 rounded-full px-3 py-2">
            <Icon name="Search" size={18} color="#9CA3AF" />
            <TextInput
              ref={inputRef}
              className="flex-1 text-white px-2 py-1"
              placeholder="Search DeHub"
              placeholderTextColor="#9CA3AF"
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={handleSearch}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={clearSearch}
                className="w-6 h-6 rounded-full bg-theme-neutrals-700 items-center justify-center mr-2"
              >
                <Icon name="X" size={14} color="#E5E7EB" />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              className="w-9 h-9 rounded-full bg-theme-neutrals-700 items-center justify-center"
              onPress={handleSearch}
              disabled={loading || !searchQuery.trim()}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#E5E7EB" />
              ) : (
                <Icon name="ArrowRight" size={18} color="#E5E7EB" />
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Filter Tabs — always visible */}
        <View className="px-4 py-2">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ position: "relative", gap: 8 }}
          >
            <Animated.View style={[styles.indicator, pillStyle]}>
              <LinearGradient
                colors={["rgba(255,255,255,0.20)", "rgba(255,255,255,0.10)", "rgba(255,255,255,0.05)"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[StyleSheet.absoluteFill, { borderRadius: TAB_RADIUS }]}
              />
              <View style={styles.indicatorHighlight} />
            </Animated.View>

            {(hasSearched ? TABS : EXPLORE_TABS).map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  onPress={() => handleTabChange(tab.key)}
                  onLayout={(e) => {
                    const { x, width } = e.nativeEvent.layout;
                    handleTabLayout(tab.key, x, width);
                  }}
                  style={[styles.tabBtn, !isActive && styles.tabBtnInactive]}
                  activeOpacity={0.8}
                >
                  <Icon
                    name={tab.icon}
                    size={14}
                    color={isActive ? "#F9FBFF" : "#A1A1AA"}
                  />
                  <Text
                    style={[
                      styles.tabLabel,
                      isActive && styles.tabLabelActive,
                    ]}
                  >
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Content */}
        {renderContent()}
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  indicator: {
    overflow: "hidden",
    borderRadius: TAB_RADIUS,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.30)",
  },
  indicatorHighlight: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.4)",
    borderTopLeftRadius: TAB_RADIUS,
    borderTopRightRadius: TAB_RADIUS,
  },
  tabBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: TAB_H,
    paddingHorizontal: 16,
    borderRadius: TAB_RADIUS,
    gap: 6,
  },
  tabBtnInactive: {
    backgroundColor: "#27272a",
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#A1A1AA",
  },
  tabLabelActive: {
    color: "#F9FBFF",
  },
});

export default SearchScreen;
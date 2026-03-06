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
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
import ScreenHeader from "../components/ScreenHeader";
import VideoCard from "../components/Home/VideoCard";
import HomeFeedCard from "../components/Home/HomeFeedCard";
import LiveStreamCard from "../components/Home/LiveStreamCard";
import SearchAccountCard from "../components/Search/SearchAccountCard";
import SearchAccountChip from "../components/Search/SearchAccountChip";
import AccentButtonGradient from "../components/ui/AccentButtonGradient";
import CompactVideoCardSkeleton from "../components/Home/CompactVideoCardSkeleton";
import type { UnifiedFeedItem } from "../services/feed.unified.service";
import type { FollowState } from "../components/Search/SearchAccountChip";
import { useAuth } from "../context/AuthContext";

type TabKey = "all" | "accounts" | "videos" | "live" | "feeds";

interface Tab {
  key: TabKey;
  label: string;
  postType?: SearchPostType;
}

const TABS: Tab[] = [
  { key: "all", label: "All" },
  { key: "accounts", label: "Accounts" },
  { key: "videos", label: "Videos", postType: "video" },
  { key: "live", label: "Live", postType: "live" },
  { key: "feeds", label: "Posts", postType: "feed-all" },
];

const PAGE_SIZE = 20;

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

  // Refs
  const inputRef = useRef<TextInput>(null);
  const lastQuery = useRef("");

  useEffect(() => {
    getHistory(userAddress).then(setSearchHistory);
  }, [userAddress]);

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
      executeSearch(term, activeTab, 1);
    },
    [activeTab, executeSearch],
  );

  const handleTabChange = useCallback(
    (tab: TabKey) => {
      if (tab === activeTab) return;
      setActiveTab(tab);
      if (hasSearched && searchQuery.trim()) {
        executeSearch(searchQuery, tab, 1);
      }
    },
    [activeTab, hasSearched, searchQuery, executeSearch],
  );

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
      const postType = item.postType;

      if (postType === "live" || item.stream?.status) {
        return (
          <View className="px-4">
            <LiveStreamCard item={feedItem} />
          </View>
        );
      }

      if (postType === "feed-simple" || postType === "feed-images" || postType === "feed-audio") {
        return (
          <View className="px-4">
            <HomeFeedCard item={feedItem} />
          </View>
        );
      }

      return (
        <View className="px-4">
          <VideoCard nft={feedItem as any} enablePreview />
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
          {[0, 1, 2].map((i) => (
            <CompactVideoCardSkeleton key={i} />
          ))}
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
              <Ionicons name="people-outline" size={48} color="#6B7280" />
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
            contentContainerStyle={{ paddingHorizontal: 0, paddingTop: 8, paddingBottom: insets.bottom + 20 }}
          />
        );
      }

      // "all" or a content tab — horizontal accounts carousel + content list
      const isEmpty = content.length === 0 && accounts.length === 0;

      if (isEmpty) {
        return (
          <View className="flex-1 items-center justify-center px-6">
            <Ionicons name="search-outline" size={48} color="#6B7280" />
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
          contentContainerStyle={{ paddingHorizontal: 0, paddingTop: 8, paddingBottom: insets.bottom + 20 }}
        />
      );
    }

    // ---- Pre-search: suggestions or history ----
    const isTyping = !!searchQuery.trim();
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
                <Ionicons name="search-outline" size={18} color="#9CA3AF" />
                <Text className="text-theme-neutrals-100 flex-1 ml-3" numberOfLines={1}>
                  {item}
                </Text>
                <TouchableOpacity
                  className="w-8 h-8 rounded-full bg-theme-neutrals-700 items-center justify-center"
                  onPress={() => handleReplaceSearchBox(item)}
                >
                  <Ionicons
                    name="arrow-up"
                    size={16}
                    color="#E5E7EB"
                    style={{ transform: [{ rotate: "-45deg" }] }}
                  />
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      );
    }

    // Not typing → show history
    const historySubset = topHistorySubset(searchHistory, 8);
    if (historySubset.length === 0) {
      return (
        <View className="flex-1 items-center justify-center px-6">
          <Ionicons name="search-outline" size={48} color="#6B7280" />
          <Text className="text-theme-neutrals-400 text-sm text-center mt-4">
            Search for creators, videos, or posts
          </Text>
        </View>
      );
    }

    return (
      <View className="px-4 pt-3">
        <Text className="text-theme-neutrals-400 text-xs font-semibold mb-2 px-1">
          Recent Searches
        </Text>
        <View className="rounded-2xl overflow-hidden bg-theme-neutrals-800">
          {historySubset.map((item, index) => (
            <TouchableOpacity
              key={`history-${index}`}
              className="px-4 py-3 flex-row items-center"
              onPress={() => handleSuggestionClick(item)}
              activeOpacity={0.8}
              style={{
                borderBottomWidth: index === historySubset.length - 1 ? 0 : StyleSheet.hairlineWidth,
                borderBottomColor: "#333",
              }}
            >
              <Ionicons name="time-outline" size={18} color="#9CA3AF" />
              <Text className="text-theme-neutrals-100 flex-1 ml-3" numberOfLines={1}>
                {item}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  };

  return (
    <View className="flex-1 bg-theme-neutrals-900">
      <ScreenHeader title="Search" />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
      >
        {/* Search Input */}
        <View className="px-4 pb-2">
          <View className="flex-row items-center bg-theme-neutrals-800 rounded-full px-3 py-2">
            <Ionicons name="search" size={18} color="#9CA3AF" />
            <TextInput
              ref={inputRef}
              className="flex-1 text-white px-2 py-1"
              placeholder="Search DeHub"
              placeholderTextColor="#9CA3AF"
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={handleSearch}
              autoFocus
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={clearSearch}
                className="w-6 h-6 rounded-full bg-theme-neutrals-700 items-center justify-center mr-2"
              >
                <Ionicons name="close" size={14} color="#E5E7EB" />
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
                <Ionicons name="arrow-forward" size={18} color="#E5E7EB" />
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Tabs — only after a search */}
        {hasSearched && (
          <View className="flex-row px-4 py-2">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.key;

              if (isActive) {
                return (
                  <AccentButtonGradient key={tab.key} style={{ marginRight: 8, borderRadius: 20 }}>
                    <TouchableOpacity className="px-4 py-2" activeOpacity={0.85}>
                      <Text className="text-white text-xs font-semibold">{tab.label}</Text>
                    </TouchableOpacity>
                  </AccentButtonGradient>
                );
              }

              return (
                <TouchableOpacity
                  key={tab.key}
                  onPress={() => handleTabChange(tab.key)}
                  className="px-4 py-2 rounded-full bg-theme-neutrals-800 mr-2"
                  activeOpacity={0.85}
                >
                  <Text className="text-white/80 text-xs font-semibold">{tab.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Content */}
        {renderContent()}
      </KeyboardAvoidingView>
    </View>
  );
};

export default SearchScreen;
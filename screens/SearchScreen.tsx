import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  View,
  TextInput,
  FlatList,
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
  searchAccounts,
  searchContent,
  fetchSuggestions,
  getHistory,
  addToHistory,
  topHistorySubset,
  SearchContentResult,
  SearchAccountResult,
  SearchPostType,
  SearchPagination,
} from "../services/search.service";
import ScreenHeader from "../components/ScreenHeader";
import VideoCard from "../components/Home/VideoCard";
import HomeFeedCard from "../components/Home/HomeFeedCard";
import LiveStreamCard from "../components/Home/LiveStreamCard";
import SearchAccountCard from "../components/Search/SearchAccountCard";
import AccentButtonGradient from "../components/ui/AccentButtonGradient";
import CompactVideoCardSkeleton from "../components/Home/CompactVideoCardSkeleton";
import type { UnifiedFeedItem } from "../services/feed.unified.service";

// =============================================================================
// Types
// =============================================================================

type TabKey = "all" | "accounts" | "videos" | "live" | "feeds";

interface Tab {
  key: TabKey;
  label: string;
  postType?: SearchPostType;
  searchType?: "accounts" | "content";
}

const TABS: Tab[] = [
  { key: "all", label: "All" },
  { key: "accounts", label: "Accounts", searchType: "accounts" },
  { key: "videos", label: "Videos", postType: "video", searchType: "content" },
  { key: "live", label: "Live", postType: "live", searchType: "content" },
  { key: "feeds", label: "Posts", postType: "feed-all", searchType: "content" },
];

const PAGE_SIZE = 20;

// =============================================================================
// Component
// =============================================================================

const SearchScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  
  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [hasSearched, setHasSearched] = useState(false);
  
  // Results state
  const [results, setResults] = useState<(SearchContentResult | SearchAccountResult)[]>([]);
  const [pagination, setPagination] = useState<SearchPagination | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  
  // Suggestions & history
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  
  // Refs
  const inputRef = useRef<TextInput>(null);
  const lastQuery = useRef<string>("");

  // Load history on mount
  useEffect(() => {
    getHistory().then(setSearchHistory);
  }, []);

  // Fetch suggestions as user types
  useEffect(() => {
    let cancelled = false;
    const q = searchQuery.trim();
    
    if (!q) {
      setSuggestions([]);
      return;
    }
    
    // Don't fetch suggestions if we already searched this query
    if (hasSearched && q === lastQuery.current) return;
    
    const timer = setTimeout(async () => {
      const sugg = await fetchSuggestions(q);
      if (!cancelled) setSuggestions(sugg.slice(0, 5));
    }, 300); // Debounce
    
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery, hasSearched]);

  // Execute search
  const executeSearch = useCallback(async (
    query: string,
    tab: TabKey = activeTab,
    page: number = 1,
    append: boolean = false
  ) => {
    const q = query.trim();
    if (!q) return;
    
    if (page === 1) {
      setLoading(true);
      setResults([]);
    } else {
      setLoadingMore(true);
    }
    
    try {
      const tabConfig = TABS.find(t => t.key === tab);
      
      let res;
      if (tab === "all") {
        // For "all" tab, search content (includes everything)
        res = await search({
          q,
          page,
          limit: PAGE_SIZE,
        });
      } else if (tabConfig?.searchType === "accounts") {
        res = await searchAccounts(q, { page, limit: PAGE_SIZE });
      } else {
        res = await searchContent(q, {
          page,
          limit: PAGE_SIZE,
          postType: tabConfig?.postType,
        });
      }
      
      if (append) {
        setResults(prev => [...prev, ...res.result]);
      } else {
        setResults(res.result);
      }
      setPagination(res.pagination);
      
      // Add to history only on first search
      if (page === 1) {
        await addToHistory(q);
        getHistory().then(setSearchHistory);
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
  }, [activeTab]);

  // Handle search submit
  const handleSearch = useCallback(() => {
    if (!searchQuery.trim()) return;
    executeSearch(searchQuery, activeTab, 1);
  }, [searchQuery, activeTab, executeSearch]);

  // Handle suggestion/history click
  const handleSuggestionClick = useCallback((term: string) => {
    setSearchQuery(term);
    executeSearch(term, activeTab, 1);
  }, [activeTab, executeSearch]);

  // Handle tab change
  const handleTabChange = useCallback((tab: TabKey) => {
    if (tab === activeTab) return;
    setActiveTab(tab);
    if (hasSearched && searchQuery.trim()) {
      executeSearch(searchQuery, tab, 1);
    }
  }, [activeTab, hasSearched, searchQuery, executeSearch]);

  // Handle load more
  const handleLoadMore = useCallback(() => {
    if (loadingMore || !pagination?.hasMore) return;
    executeSearch(searchQuery, activeTab, pagination.page + 1, true);
  }, [loadingMore, pagination, searchQuery, activeTab, executeSearch]);

  // Handle refresh
  const handleRefresh = useCallback(() => {
    if (!searchQuery.trim()) return;
    setRefreshing(true);
    executeSearch(searchQuery, activeTab, 1);
  }, [searchQuery, activeTab, executeSearch]);

  // Clear search
  const clearSearch = useCallback(() => {
    setSearchQuery("");
    setResults([]);
    setPagination(null);
    setSuggestions([]);
    setHasSearched(false);
    lastQuery.current = "";
    inputRef.current?.focus();
  }, []);

  // Replace search box text (arrow button in suggestions)
  const handleReplaceSearchBox = useCallback((term: string) => {
    setSearchQuery(term);
    inputRef.current?.focus();
  }, []);

  // Determine if item is an account
  const isAccountItem = useCallback((item: any): item is SearchAccountResult => {
    return 'address' in item && !('tokenId' in item);
  }, []);

  // Render item based on type
  const renderItem = useCallback(({ item }: { item: SearchContentResult | SearchAccountResult }) => {
    if (isAccountItem(item)) {
      return (
        <View className="px-4">
          <SearchAccountCard account={item} />
        </View>
      );
    }
    
    // Content item - render based on postType
    const contentItem = item as SearchContentResult;
    const postType = contentItem.postType;
    
    // Map to UnifiedFeedItem format for consistency
    const feedItem: UnifiedFeedItem = {
      tokenId: contentItem.tokenId,
      id: String(contentItem.tokenId),
      name: contentItem.name,
      title: contentItem.name,
      description: contentItem.description,
      imageUrl: contentItem.imageUrl,
      thumbnailUrl: contentItem.thumbnailUrl || contentItem.imageUrl,
      imageUrls: contentItem.imageUrls,
      postType: postType as any,
      views: contentItem.views || 0,
      likes: contentItem.totalVotes?.for || contentItem.likes || 0,
      dislikes: contentItem.totalVotes?.against || contentItem.dislikes || 0,
      createdAt: contentItem.createdAt,
      minter: contentItem.minter || contentItem.minterUser?.address,
      minterUser: contentItem.minterUser,
      minterUsername: contentItem.minterUsername || contentItem.minterUser?.username,
      minterDisplayName: contentItem.minterDisplayName || contentItem.minterUser?.displayName,
      minterAvatarUrl: contentItem.minterAvatarUrl || contentItem.minterUser?.avatarImageUrl,
      minterStaked: contentItem.minterStaked || contentItem.minterUser?.staked || 0,
      stream: contentItem.stream,
      isLiked: contentItem.isLiked,
      isDisliked: contentItem.isDisliked,
      isSaved: contentItem.isSaved,
      isFollowing: contentItem.isFollowing,
      commentCount: contentItem.commentCount || 0,
      category: contentItem.category,
    };
    
    // Render based on post type
    if (postType === 'live' || contentItem.stream?.status) {
      return (
        <View className="px-4">
          <LiveStreamCard item={feedItem} />
        </View>
      );
    }
    
    if (postType === 'feed-simple' || postType === 'feed-images') {
      return (
        <View className="px-4">
          <HomeFeedCard item={feedItem} />
        </View>
      );
    }
    
    // Default: video card
    return (
      <View className="px-4">
        <VideoCard nft={feedItem as any} enablePreview />
      </View>
    );
  }, [isAccountItem]);

  // Key extractor
  const keyExtractor = useCallback((item: SearchContentResult | SearchAccountResult, index: number) => {
    if (isAccountItem(item)) {
      return `account-${item.address}-${index}`;
    }
    return `content-${(item as SearchContentResult).tokenId}-${index}`;
  }, [isAccountItem]);

  // List footer
  const ListFooter = useMemo(() => {
    if (loadingMore) {
      return (
        <View className="py-4">
          {[0, 1, 2].map(i => (
            <CompactVideoCardSkeleton key={i} />
          ))}
        </View>
      );
    }
    
    if (results.length > 0 && !pagination?.hasMore) {
      return (
        <View className="py-6">
          <Text className="text-center text-theme-neutrals-500 text-xs">
            End of results
          </Text>
        </View>
      );
    }
    
    return null;
  }, [loadingMore, results.length, pagination?.hasMore]);

  // Render content based on state
  const renderContent = () => {
    // Loading state
    if (loading) {
      return (
        <View className="flex-1 px-4 pt-4">
          {[0, 1, 2, 3, 4, 5].map(i => (
            <CompactVideoCardSkeleton key={i} />
          ))}
        </View>
      );
    }
    
    // Results
    if (hasSearched) {
      if (results.length === 0) {
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
          data={results}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={ListFooter}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#fff"
            />
          }
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: 8, paddingBottom: insets.bottom + 20 }}
        />
      );
    }
    
    // Typing - show suggestions
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
    
    // Not typing - show history
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
        
        {/* Tabs - only show after search */}
        {hasSearched && (
          <View className="flex-row px-3 py-2">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.key;
              
              if (isActive) {
                return (
                  <AccentButtonGradient key={tab.key} style={{ marginRight: 8, borderRadius: 20 }}>
                    <TouchableOpacity
                      className="px-4 py-2"
                      activeOpacity={0.85}
                    >
                      <Text className="text-white text-xs font-semibold">
                        {tab.label}
                      </Text>
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
                  <Text className="text-white/80 text-xs font-semibold">
                    {tab.label}
                  </Text>
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

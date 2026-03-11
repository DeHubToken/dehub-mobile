import React, { useState, useCallback, useMemo, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { useUserProfileSheet } from "../context/UserProfileSheetContext";
import {
  getRepostUsers,
  getQuotePosts,
  RepostUser,
} from "../services/repost.service";
import { getAvatarUrl } from "../libs/misc";
import { truncate } from "../libs/strings.util";
import { formatCompactNumber } from "../libs/numbers.util";
import Avatar from "../components/common/Avatar";
import ScreenHeader from "../components/ScreenHeader";
import FeedCard from "../components/Home/FeedCard";
import { ScreenNames } from "../navigation/ScreenNames";


type RouteParams = {
  RepostQuoteList: {
    tokenId: number | string;
    initialTab?: "reposts" | "quotes";
    repostCount?: number;
    quoteCount?: number;
  };
};

type TabKey = "reposts" | "quotes";

const TAB_OPTIONS: { key: TabKey; label: string }[] = [
  { key: "reposts", label: "Reposts" },
  { key: "quotes", label: "Quotes" },
];

const PAGE_LIMIT = 20;


interface RepostUserRowProps {
  item: RepostUser;
  onPress: (address: string) => void;
}

const RepostUserRow: React.FC<RepostUserRowProps> = React.memo(
  ({ item, onPress }) => {
    const displayName =
      item.displayName || item.username || truncate(item.address, 12, "..");
    const hasUsername = !!item.username;
    const avatarUrl = getAvatarUrl(item.avatarImageUrl);

    const handlePress = useCallback(() => {
      onPress(item.address);
    }, [onPress, item.address]);

    return (
      <TouchableOpacity
        onPress={handlePress}
        className="flex-row items-center px-4 py-3"
        activeOpacity={0.6}
      >
        <Avatar uri={avatarUrl} size={48} name={displayName} />
        <View className="flex-1 ml-3">
          <Text className="text-white font-semibold text-[15px]" numberOfLines={1}>
            {displayName}
          </Text>
          {hasUsername && (
            <Text className="text-gray-500 text-sm" numberOfLines={1}>
              @{item.username}
            </Text>
          )}
          {item.followers !== undefined && (
            <Text className="text-gray-600 text-xs mt-0.5">
              {formatCompactNumber(item.followers)} followers
            </Text>
          )}
        </View>
        <Ionicons name="chevron-forward" size={20} color="#555" />
      </TouchableOpacity>
    );
  }
);


const RepostQuoteListScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RouteParams, "RepostQuoteList">>();
  const { showUserProfile } = useUserProfileSheet();

  const {
    tokenId,
    initialTab = "reposts",
    repostCount: initialRepostCount = 0,
    quoteCount: initialQuoteCount = 0,
  } = route.params;

  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);

  const [repostUsers, setRepostUsers] = useState<RepostUser[]>([]);
  const [repostLoading, setRepostLoading] = useState(true);
  const [repostRefreshing, setRepostRefreshing] = useState(false);
  const [repostLoadingMore, setRepostLoadingMore] = useState(false);
  const [repostPage, setRepostPage] = useState(1);
  const [repostHasMore, setRepostHasMore] = useState(true);
  const [repostTotal, setRepostTotal] = useState(initialRepostCount);

  const [quotePosts, setQuotePosts] = useState<any[]>([]);
  const [quoteLoading, setQuoteLoading] = useState(true);
  const [quoteRefreshing, setQuoteRefreshing] = useState(false);
  const [quoteLoadingMore, setQuoteLoadingMore] = useState(false);
  const [quotePage, setQuotePage] = useState(1);
  const [quoteHasMore, setQuoteHasMore] = useState(true);
  const [quoteTotal, setQuoteTotal] = useState(initialQuoteCount);

  const fetchReposts = useCallback(
    async (pageNum: number, isRefresh = false) => {
      if (pageNum === 1) {
        isRefresh ? setRepostRefreshing(true) : setRepostLoading(true);
      } else {
        setRepostLoadingMore(true);
      }
      try {
        const res = await getRepostUsers({ tokenId, page: pageNum, limit: PAGE_LIMIT });
        if (pageNum === 1) {
          setRepostUsers(res.result);
        } else {
          setRepostUsers((prev) => [...prev, ...res.result]);
        }
        setRepostHasMore(res.pagination?.hasMore ?? false);
        setRepostTotal(res.pagination?.totalCount ?? res.result.length);
        setRepostPage(pageNum);
      } catch (e) {
        console.error("[RepostQuoteListScreen] fetchReposts error:", e);
      } finally {
        setRepostLoading(false);
        setRepostRefreshing(false);
        setRepostLoadingMore(false);
      }
    },
    [tokenId]
  );

  const fetchQuotes = useCallback(
    async (pageNum: number, isRefresh = false) => {
      if (pageNum === 1) {
        isRefresh ? setQuoteRefreshing(true) : setQuoteLoading(true);
      } else {
        setQuoteLoadingMore(true);
      }
      try {
        const res = await getQuotePosts({ tokenId, page: pageNum, limit: PAGE_LIMIT });
        if (pageNum === 1) {
          setQuotePosts(res.result);
        } else {
          setQuotePosts((prev) => [...prev, ...res.result]);
        }
        setQuoteHasMore(res.pagination?.hasMore ?? false);
        setQuoteTotal(res.pagination?.totalCount ?? res.result.length);
        setQuotePage(pageNum);
      } catch (e) {
        console.error("[RepostQuoteListScreen] fetchQuotes error:", e);
      } finally {
        setQuoteLoading(false);
        setQuoteRefreshing(false);
        setQuoteLoadingMore(false);
      }
    },
    [tokenId]
  );

  // Initial load
  useEffect(() => {
    if (activeTab === "reposts") {
      setRepostPage(1);
      setRepostHasMore(true);
      fetchReposts(1);
    } else {
      setQuotePage(1);
      setQuoteHasMore(true);
      fetchQuotes(1);
    }
  }, [activeTab, fetchReposts, fetchQuotes]);

  const handleRefresh = useCallback(() => {
    if (activeTab === "reposts") {
      fetchReposts(1, true);
    } else {
      fetchQuotes(1, true);
    }
  }, [activeTab, fetchReposts, fetchQuotes]);

  const handleLoadMore = useCallback(() => {
    if (activeTab === "reposts") {
      if (!repostLoadingMore && repostHasMore && !repostLoading) {
        fetchReposts(repostPage + 1);
      }
    } else {
      if (!quoteLoadingMore && quoteHasMore && !quoteLoading) {
        fetchQuotes(quotePage + 1);
      }
    }
  }, [
    activeTab,
    repostLoadingMore, repostHasMore, repostLoading, repostPage, fetchReposts,
    quoteLoadingMore, quoteHasMore, quoteLoading, quotePage, fetchQuotes,
  ]);

  const handleUserPress = useCallback(
    (address: string) => {
      showUserProfile(address);
    },
    [showUserProfile]
  );

  const handleTabChange = useCallback((tab: TabKey) => {
    setActiveTab(tab);
  }, []);

  const renderRepostItem = useCallback(
    ({ item }: { item: RepostUser }) => (
      <RepostUserRow item={item} onPress={handleUserPress} />
    ),
    [handleUserPress]
  );

  const renderQuoteItem = useCallback(
    ({ item }: { item: any }) => {
      return (
        <View className="px-4 mb-3">
          <FeedCard item={item} />
        </View>
      );
    },
    []
  );

  const repostKeyExtractor = useCallback(
    (item: RepostUser) => item.address,
    []
  );

  const quoteKeyExtractor = useCallback(
    (item: any) => String(item.tokenId || item.id || item._id),
    []
  );

  const ItemSeparator = useCallback(
    () => <View className="h-[1px] bg-theme-neutrals-800/50 ml-[76px]" />,
    []
  );

  const repostFooter = useMemo(() => {
    if (repostLoadingMore) {
      return (
        <View className="py-6 items-center">
          <ActivityIndicator size="small" color="#fff" />
        </View>
      );
    }
    if (!repostHasMore && repostUsers.length > 0) {
      return (
        <View className="py-6 items-center">
          <Text className="text-gray-600 text-sm">No more reposts</Text>
        </View>
      );
    }
    return <View className="h-6" />;
  }, [repostLoadingMore, repostHasMore, repostUsers.length]);

  const quoteFooter = useMemo(() => {
    if (quoteLoadingMore) {
      return (
        <View className="py-6 items-center">
          <ActivityIndicator size="small" color="#fff" />
        </View>
      );
    }
    if (!quoteHasMore && quotePosts.length > 0) {
      return (
        <View className="py-6 items-center">
          <Text className="text-gray-600 text-sm">No more quotes</Text>
        </View>
      );
    }
    return <View className="h-6" />;
  }, [quoteLoadingMore, quoteHasMore, quotePosts.length]);

  const repostEmpty = useMemo(() => {
    if (repostLoading) return null;
    return (
      <View className="flex-1 items-center justify-center py-16">
        <View className="bg-theme-neutrals-800/30 rounded-full p-5 mb-4">
          <Ionicons name="git-compare-outline" size={40} color="#555" />
        </View>
        <Text className="text-gray-400 text-base text-center px-8">
          No reposts yet
        </Text>
      </View>
    );
  }, [repostLoading]);

  const quoteEmpty = useMemo(() => {
    if (quoteLoading) return null;
    return (
      <View className="flex-1 items-center justify-center py-16">
        <View className="bg-theme-neutrals-800/30 rounded-full p-5 mb-4">
          <Ionicons name="chatbubble-ellipses-outline" size={40} color="#555" />
        </View>
        <Text className="text-gray-400 text-base text-center px-8">
          No quotes yet
        </Text>
      </View>
    );
  }, [quoteLoading]);

  const isLoading = activeTab === "reposts" ? repostLoading : quoteLoading;
  const isRefreshing = activeTab === "reposts" ? repostRefreshing : quoteRefreshing;

  return (
    <View className="flex-1 bg-black">
      <ScreenHeader title="Reposts & Quotes" />

      {/* Tabs */}
      <View className="flex-row border-b border-theme-neutrals-800">
        {TAB_OPTIONS.map((tab) => {
          const isActive = activeTab === tab.key;
          const count = tab.key === "reposts" ? repostTotal : quoteTotal;
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
                {count > 0 && (
                  <Text
                    className={`text-xs ${
                      isActive ? "text-gray-400" : "text-gray-600"
                    }`}
                  >
                    {formatCompactNumber(count)}
                  </Text>
                )}
              </View>
              {isActive && (
                <View className="absolute bottom-0 left-4 right-4 h-[2px] bg-white rounded-full" />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Count indicator */}
      {!isLoading && (activeTab === "reposts" ? repostTotal : quoteTotal) > 0 && (
        <View className="px-4 py-2">
          <Text className="text-gray-500 text-sm font-medium">
            {formatCompactNumber(activeTab === "reposts" ? repostTotal : quoteTotal)}{" "}
            {activeTab}
          </Text>
        </View>
      )}

      {/* Content */}
      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#fff" />
        </View>
      ) : activeTab === "reposts" ? (
        <FlatList
          data={repostUsers}
          renderItem={renderRepostItem}
          keyExtractor={repostKeyExtractor}
          ItemSeparatorComponent={ItemSeparator}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          refreshControl={
            <RefreshControl
              refreshing={repostRefreshing}
              onRefresh={handleRefresh}
              tintColor="#fff"
              progressBackgroundColor="#1a1a1a"
            />
          }
          ListFooterComponent={repostFooter}
          ListEmptyComponent={repostEmpty}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ flexGrow: 1 }}
        />
      ) : (
        <FlatList
          data={quotePosts}
          renderItem={renderQuoteItem}
          keyExtractor={quoteKeyExtractor}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          refreshControl={
            <RefreshControl
              refreshing={quoteRefreshing}
              onRefresh={handleRefresh}
              tintColor="#fff"
              progressBackgroundColor="#1a1a1a"
            />
          }
          ListFooterComponent={quoteFooter}
          ListEmptyComponent={quoteEmpty}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ flexGrow: 1, paddingTop: 8 }}
        />
      )}
    </View>
  );
};

export default RepostQuoteListScreen;

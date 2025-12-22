import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Dimensions,
  Text,
  View,
  FlatList,
  type ListRenderItemInfo,
  TouchableOpacity,
} from "react-native";
import { TabView, TabBar } from "react-native-tab-view";
import { theme } from "../../theme";
import VideoCard from "../Home/VideoCard";
import FeedRoute from "../Profile/FeedRoute";
import { getUserVideos } from "../../services/user.service";
import type { GetNFTsResult } from "../../services/nft.service";

interface UserProfileBottomContentTabsProps {
  address: string;
  onClose: () => void;
}

const PAGE_SIZE = 20;

const UserProfileBottomContentTabs: React.FC<
  UserProfileBottomContentTabsProps
> = ({ address, onClose }) => {
  const [tabIndex, setTabIndex] = useState(0);
  const [videoItems, setVideoItems] = useState<GetNFTsResult[]>([]);
  const [videoPage, setVideoPage] = useState(0);
  const [videoHasMore, setVideoHasMore] = useState(true);
  const [videoLoading, setVideoLoading] = useState(true);
  const videoLoadingRef = useRef(false);

  const routes = useMemo(
    () => [
      { key: "videos", title: "Videos" },
      { key: "feed", title: "Feed" },
    ],
    []
  );

  const listHeight = useMemo(() => {
    const winH = Dimensions.get("window").height;
    return Math.min(560, Math.max(360, Math.round(winH * 0.55)));
  }, []);

  const loadVideoPage = useCallback(
    async (targetPage: number, replace = false) => {
      if (videoLoadingRef.current) return;
      if (!replace && !videoHasMore) return;
      videoLoadingRef.current = true;
      if (targetPage === 0 && !replace) setVideoLoading(true);
      try {
        const res = await getUserVideos(address, {
          page: targetPage,
          unit: PAGE_SIZE,
        } as any);
        const newItems = res?.result || [];
        setVideoHasMore(newItems.length === PAGE_SIZE);
        setVideoItems((prev) => (replace ? newItems : [...prev, ...newItems]));
        setVideoPage(targetPage);
      } catch (e) {
        console.warn("[UserProfileBottomContentTabs] load videos error", e);
      } finally {
        videoLoadingRef.current = false;
        setVideoLoading(false);
      }
    },
    [address]
  );

  useEffect(() => {
    setVideoItems([]);
    setVideoPage(0);
    setVideoHasMore(true);
    setVideoLoading(true);
    videoLoadingRef.current = false;
    loadVideoPage(0, true);
  }, [address]);

  const onVideoEndReached = useCallback(() => {
    if (!videoHasMore || videoLoadingRef.current) return;
    loadVideoPage(videoPage + 1);
  }, [videoHasMore, videoPage, loadVideoPage]);

  const keyExtractor = useCallback((item: GetNFTsResult, index: number) => {
    const created =
      (item as any).createdAt || (item as any).created_at || "nocreated";
    return `${(item as any).tokenId || item.id || "vid"}-${created}-${index}`;
  }, []);

  const renderVideoItem = useCallback(
    ({ item }: ListRenderItemInfo<GetNFTsResult>) => {
      return (
        <VideoCard
          nft={item}
          enablePreview={false}
          onBeforeNavigate={onClose}
        />
      );
    },
    [onClose]
  );

  const VideoListFooter = useMemo(() => {
    if (!videoHasMore) {
      return videoItems.length > 0 ? (
        <View className="py-4 items-center">
          <Text className="text-theme-neutrals-400 text-xs">
            No more videos
          </Text>
        </View>
      ) : null;
    }
    return (
      <></>
      //   <View className="py-4 items-center">
      //     <ActivityIndicator color="#fff" />
      //   </View>
    );
  }, [videoHasMore, videoItems.length]);

  const VideoListEmpty = useMemo(() => {
    if (videoLoading) {
      return (
        <View className="flex-1 items-center justify-center pt-8">
          <ActivityIndicator color="#fff" />
        </View>
      );
    }
    return (
      <View className="flex-1 items-center justify-center pt-8 px-6">
        <Text className="text-theme-neutrals-400 text-sm">No videos yet.</Text>
      </View>
    );
  }, [videoLoading]);

  const renderScene = useCallback(
    ({ route }: { route: { key: string; title: string } }) => {
      switch (route.key) {
        case "videos":
          return (
            <FlatList
              data={videoItems}
              keyExtractor={keyExtractor}
              renderItem={renderVideoItem}
              onEndReached={onVideoEndReached}
              onEndReachedThreshold={0.5}
              ListFooterComponent={VideoListFooter}
              ListEmptyComponent={VideoListEmpty}
              contentContainerStyle={{ paddingBottom: 24 }}
              showsVerticalScrollIndicator={false}
              removeClippedSubviews
            />
          );
        case "feed":
          return (
            <View style={{ flex: 1}}>
              <FeedRoute address={address} />
            </View>
          );
        default:
          return null;
      }
    },
    [
      address,
      videoItems,
      keyExtractor,
      renderVideoItem,
      onVideoEndReached,
      VideoListFooter,
      VideoListEmpty,
    ]
  );

  const renderTabBar = useCallback(
    (props: any) => (
      <TabBar
        {...props}
        indicatorStyle={{ backgroundColor: "transparent" }}
        style={{ backgroundColor: "transparent" }}
        renderTabBarItem={({ route, navigationState, onPress }) => {
          const focused =
            navigationState.index ===
            navigationState.routes.findIndex((r) => r.key === route.key);

          return (
            <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
              <View
                className={`px-5 py-2 rounded-full ${
                  focused ? "bg-theme-neutrals-800" : "bg-transparent"
                }`}
              >
                <Text
                  className={`text-sm font-semibold ${
                    focused
                      ? "text-theme-neutrals-200"
                      : "text-theme-neutrals-500"
                  }`}
                >
                  {route.title}
                </Text>
              </View>
            </TouchableOpacity>
          );
        }}
        pressColor="transparent"
      />
    ),
    []
  );

  if (!address) return null;

  return (
    <View className="mt-4" style={{ height: listHeight }}>
      <TabView
        navigationState={{ index: tabIndex, routes }}
        renderScene={renderScene}
        onIndexChange={setTabIndex}
        initialLayout={{ width: Dimensions.get("window").width }}
        renderTabBar={renderTabBar}
        lazy
        lazyPreloadDistance={0}
        renderLazyPlaceholder={() => (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#fff" />
          </View>
        )}
      />
    </View>
  );
};

export default UserProfileBottomContentTabs;

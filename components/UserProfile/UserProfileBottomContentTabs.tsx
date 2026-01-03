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
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from "react-native";
import VideoCard from "../Home/VideoCard";
import FeedRoute from "../Profile/FeedRoute";
import { getUserVideos } from "../../services/user.service";
import type { GetNFTsResult } from "../../services/nft.service";

interface UserProfileBottomContentTabsProps {
  address: string;
  onClose: () => void;
  scrollEnabled: boolean;
  isFullScreen: boolean;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  registerScrollToTop: (handler: (() => void) | null) => void;
}

const PAGE_SIZE = 20;

type ActiveTab = "videos" | "feed";

const UserProfileBottomContentTabs: React.FC<
  UserProfileBottomContentTabsProps
> = ({
  address,
  onClose,
  scrollEnabled,
  isFullScreen,
  onScroll,
  registerScrollToTop,
}) => {
  const [activeTab, setActiveTab] = useState<ActiveTab>("videos");
  const [videoItems, setVideoItems] = useState<GetNFTsResult[]>([]);
  const [videoPage, setVideoPage] = useState(0);
  const [videoHasMore, setVideoHasMore] = useState(true);
  const [videoLoading, setVideoLoading] = useState(true);
  const videoLoadingRef = useRef(false);
  const videosListRef = useRef<FlatList<GetNFTsResult> | null>(null);
  const feedListRef = useRef<FlatList<any> | null>(null);

  const onPressVideos = useCallback(() => {
    setActiveTab("videos");
  }, []);

  const onPressFeed = useCallback(() => {
    setActiveTab("feed");
  }, []);

  // When fullscreen, don't constrain height - let it fill available space
  const listHeight = useMemo(() => {
    if (isFullScreen) return undefined;
    const winH = Dimensions.get("window").height;
    return Math.min(560, Math.max(360, Math.round(winH * 0.55)));
  }, [isFullScreen]);

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

  const scrollVideosToTop = useCallback(() => {
    videosListRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, []);

  const scrollFeedToTop = useCallback(() => {
    feedListRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, []);

  useEffect(() => {
    registerScrollToTop(
      activeTab === "videos" ? scrollVideosToTop : scrollFeedToTop
    );
    return () => {
      registerScrollToTop(null);
    };
  }, [activeTab, registerScrollToTop, scrollFeedToTop, scrollVideosToTop]);

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

  if (!address) return null;

  return (
    <View
      className="mt-4"
      style={isFullScreen ? { flex: 1 } : { height: listHeight }}
    >
      <View className="flex-row items-center justify-start">
        <View
          style={{
            flexDirection: "row",
            borderRadius: 20,
            padding: 0,
            overflow: "hidden",
          }}
        >
          <TouchableOpacity onPress={onPressVideos} activeOpacity={0.85}>
            <View
              style={{
                paddingHorizontal: 16,
                paddingVertical: 8,
                borderRadius: 16,
                overflow: "hidden",
                backgroundColor:
                  activeTab === "videos" ? "#1D1F21" : "rgba(0,0,0,0)",
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "600",
                  color: activeTab === "videos" ? "#e5e5e5" : "#737373",
                }}
              >
                Videos
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity onPress={onPressFeed} activeOpacity={0.85}>
            <View
              style={{
                paddingHorizontal: 16,
                paddingVertical: 8,
                borderRadius: 16,
                overflow: "hidden",
                backgroundColor:
                  activeTab === "feed" ? "#1D1F21" : "rgba(0,0,0,0)",
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "600",
                  color: activeTab === "feed" ? "#e5e5e5" : "#737373",
                }}
              >
                Feed
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <View className="flex-1 mt-1 pb-16">
        {activeTab === "videos" ? (
          <FlatList
            ref={videosListRef}
            style={{ flex: 1 }}
            data={videoItems}
            keyExtractor={keyExtractor}
            renderItem={renderVideoItem}
            scrollEnabled={!!scrollEnabled}
            onScroll={onScroll}
            scrollEventThrottle={16}
            onEndReached={onVideoEndReached}
            onEndReachedThreshold={0.5}
            ListFooterComponent={VideoListFooter}
            ListEmptyComponent={VideoListEmpty}
            contentContainerStyle={{ paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
            removeClippedSubviews
          />
        ) : (
          <View style={{ flex: 1 }}>
            <FeedRoute
              address={address}
              scrollEnabled={!!scrollEnabled}
              onScroll={onScroll}
              listRef={feedListRef}
              noPadding
            />
          </View>
        )}
      </View>
    </View>
  );
};

export default UserProfileBottomContentTabs;

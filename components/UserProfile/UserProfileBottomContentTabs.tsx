import React, { useCallback, useEffect, useMemo, useRef } from "react";
import {
  Dimensions,
  Text,
  View,
  FlatList,
  type ListRenderItemInfo,
  TouchableOpacity,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import HomeFeedCard from "../Home/HomeFeedCard";
import VideoCard from "../Home/VideoCard";
import InfiniteFeed from "../Feed/InfiniteFeed";
import type { GetNFTsResult } from "../../services/nft.service";
import type { GetNFTsResponse } from "../../services/feed.service";
import {
  getUnifiedFeed,
  type UnifiedFeedItem,
} from "../../services/feed.unified.service";
import { useNavigation } from "@react-navigation/native";
import { ScreenNames } from "../../navigation/ScreenNames";
import { useUserProfileSheet } from "../../context/UserProfileSheetContext";
import { useAuthState } from "../../context/AuthContext";
import AccentButtonGradient from "../ui/AccentButtonGradient";

interface UserProfileBottomContentTabsProps {
  address: string;
  onClose: () => void;
  scrollEnabled: boolean;
  isFullScreen: boolean;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  registerScrollToTop: (handler: (() => void) | null) => void;
  isPrivate?: boolean;
  canViewContent?: boolean;
  isFollowRequestPending?: boolean;
  onFollow?: () => void;
}

// Helper to determine if item is a video
const isVideoItem = (item: GetNFTsResult): boolean => {
  return !(item as any).postType || (item as any).postType === "video";
};

const UserProfileBottomContentTabs: React.FC<
  UserProfileBottomContentTabsProps
> = ({
  address,
  onClose,
  scrollEnabled,
  isFullScreen,
  onScroll,
  registerScrollToTop,
  isPrivate = false,
  canViewContent = true,
  isFollowRequestPending = false,
  onFollow,
}) => {
  const navigation = useNavigation<any>();
  const { hideUserProfile } = useUserProfileSheet();
  const { isSignedIn } = useAuthState();
  const listRef = useRef<FlatList<any> | null>(null);

  // When fullscreen, don't constrain height — let it fill available space
  const listHeight = useMemo(() => {
    if (isFullScreen) return undefined;
    const winH = Dimensions.get("window").height;
    return Math.min(560, Math.max(360, Math.round(winH * 0.55)));
  }, [isFullScreen]);

  // Custom fetcher that uses the /feed endpoint instead of /search_nfts
  const fetchPage = useCallback(
    async (page: number, limit: number): Promise<GetNFTsResponse> => {
      const res = await getUnifiedFeed({
        minter: address,
        postType: "all",
        sortBy: "createdAt",
        sortOrder: "desc",
        page: page + 1, // /feed uses 1-indexed pages
        limit,
      });
      return { result: res.result as unknown as GetNFTsResult[] };
    },
    [address]
  );

  const scrollToTop = useCallback(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, []);

  useEffect(() => {
    registerScrollToTop(scrollToTop);
    return () => {
      registerScrollToTop(null);
    };
  }, [registerScrollToTop, scrollToTop]);

  const handlePostPress = useCallback(
    (post: GetNFTsResult) => {
      const tokenId = (post as any).tokenId ?? (post as any).id;
      hideUserProfile();
      onClose();
      if (isVideoItem(post)) {
        navigation.navigate(ScreenNames.VideoPlayer, { tokenId });
      } else {
        navigation.navigate(ScreenNames.FeedDetail as any, { tokenId });
      }
    },
    [navigation, hideUserProfile, onClose]
  );

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<GetNFTsResult>) => {
      if (isVideoItem(item)) {
        return (
          <VideoCard
            nft={item}
            enablePreview={false}
            onBeforeNavigate={onClose}
          />
        );
      }
      return (
        <HomeFeedCard
          item={item as UnifiedFeedItem}
          onPress={() => handlePostPress(item)}
        />
      );
    },
    [onClose, handlePostPress]
  );

  // Private account message component
  const PrivateAccountMessage = useMemo(() => {
    if (canViewContent) return null;
    return (
      <View className="flex-1 items-center justify-center px-6 py-12">
        <View className="bg-theme-neutrals-800/50 rounded-full p-5 mb-5">
          <Ionicons name="lock-closed" size={40} color="#666" />
        </View>
        <Text className="text-white text-lg font-bold text-center mb-2">
          This Account is Private
        </Text>
        <Text className="text-gray-400 text-center text-sm leading-5 mb-5">
          {isFollowRequestPending
            ? "Your follow request has been sent. You'll be able to see their posts once they approve your request."
            : "Follow this account to see their posts."}
        </Text>
        {!isFollowRequestPending && onFollow && (
          <AccentButtonGradient>
            <TouchableOpacity
              onPress={onFollow}
              className="bg-transparent px-8 py-3 rounded-full"
              activeOpacity={0.8}
            >
              <Text className="text-white font-semibold text-sm">Follow</Text>
            </TouchableOpacity>
          </AccentButtonGradient>
        )}
      </View>
    );
  }, [canViewContent, isFollowRequestPending, onFollow]);

  if (!address) return null;

  return (
    <View
      className="mt-4"
      style={isFullScreen ? { flex: 1 } : { height: listHeight }}
    >
      {/* Posts Header */}
      <View className="flex-row items-center justify-start">
        <View
          style={{
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderRadius: 16,
            backgroundColor: "#1D1F21",
          }}
        >
          <Text
            style={{
              fontSize: 12,
              fontWeight: "600",
              color: "#e5e5e5",
            }}
          >
            Posts
          </Text>
        </View>
      </View>

      <View className="flex-1 mt-1 pb-16">
        {!canViewContent ? (
          PrivateAccountMessage
        ) : (
          <InfiniteFeed
            insideNavigatorScreen={false}
            fetchPage={fetchPage}
            pageSize={20}
            isSignedIn={isSignedIn}
            contentContainerStyle={{ paddingBottom: 24 }}
            scrollEnabled={scrollEnabled}
            onScroll={onScroll}
            listRef={listRef}
            enableBackToTop={false}
            renderItem={renderItem}
          />
        )}
      </View>
    </View>
  );
};

export default UserProfileBottomContentTabs;

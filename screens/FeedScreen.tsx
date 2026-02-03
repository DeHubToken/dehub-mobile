import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Image, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { ScreenNames } from "../navigation/ScreenNames";
import HomeHeader from "../components/HomeHeader";
import { theme } from "../theme";
import CategorySelector from "../components/Home/CategorySelector";
import { Ionicons } from "@expo/vector-icons";
import CommentsBottomSheet from "../components/Feed/CommentsBottomSheet";
import { toastSuccess } from "../libs/toast";
import InfiniteFeed from "../components/Feed/InfiniteFeed";
import type { GetNFTsResult, SearchParams } from "../services/nft.service";
import { getImageUrl } from "../libs";
import { useAppKitAccount } from "@reown/appkit-ethers5-react-native";
import FeedCard from "../components/Feed/FeedCard";
import { useUser, useAuthState } from "../context/AuthContext";
import { getSavedPosts, getLikedNFTs } from "../services";
import AccentButtonGradient from "../components/ui/AccentButtonGradient";

// Tabs: New, Trending, Saved/My Posts/Liked (when signed in)
const feedTabs = [
  "New",
  "Trending",
  //  "Subscribed", "Followed", "Liked",
  "Saved",
];

// FeedCard moved to components/Feed/FeedCard.tsx; use a single comment sheet at screen level

const FeedScreen = () => {
  const navigation = useNavigation<any>();
  const [activeTab, setActiveTab] = useState("New");
  const user = useUser();
  const { isSignedIn } = useAuthState();

  const [commentSheetOpen, setCommentSheetOpen] = useState(false);
  const [commentPost, setCommentPost] = useState<GetNFTsResult | null>(null);
  const [activeCommentCount, setActiveCommentCount] = useState<number | null>(
    0
  );
  // Bottom sheet now fetches comments itself

  const handleOpenImage = useCallback(
    (images: any[], index: number) => {
      navigation.navigate(ScreenNames.ImageViewer, { images, index });
    },
    [navigation]
  );

  // Derive viewer address and memoize to avoid unnecessary param changes
  const viewerAddress = useMemo(
    () => user?.walletAddress || user?.address || undefined,
    [user?.walletAddress, user?.address]
  );

  const feedParams = useMemo<Partial<SearchParams>>(() => {
    const base: Partial<SearchParams> = {
      category: undefined,
      address: viewerAddress,
      postType: "feed-all",
    };
    if (activeTab === "Saved") {
      base.sortMode = "saved";
    } else if (activeTab === "My Posts") {
      base.minter = viewerAddress;
      base.owner = viewerAddress;
      base.sortMode = undefined;
    } else if (activeTab === "New") {
      base.sortMode = "new";
    } else if (activeTab === "Trending") {
      base.sortMode = "mostLiked";
    } else {
      base.sortMode = undefined;
      base.minter = undefined;
    }
    return base;
  }, [activeTab, viewerAddress]);

  // Saved tab uses explicit savedPosts endpoint
  const savedFetcher = useCallback(
    (page: number, unit: number) =>
      getSavedPosts({ page, unit, address: viewerAddress }),
    [viewerAddress]
  );

  // Liked tab uses liked_videos endpoint with contentType='post'
  const likedFetcher = useCallback(
    (page: number, unit: number) => {
      if (!viewerAddress)
        return Promise.resolve({ result: [] as GetNFTsResult[] });
      return getLikedNFTs(viewerAddress, { page, unit, contentType: "post" });
    },
    [viewerAddress]
  );

  // Only show Saved when authenticated
  const categories = useMemo(
    () =>
      isSignedIn
        ? ["New", "Trending", "Saved", "Liked", "My Posts"]
        : ["New", "Trending"],
    [isSignedIn]
  );

  // If user signs out while on a gated tab, reset to New
  useEffect(() => {
    if (
      !isSignedIn &&
      (activeTab === "Saved" ||
        activeTab === "Liked" ||
        activeTab === "My Posts")
    ) {
      setActiveTab("New");
    }
  }, [isSignedIn, activeTab]);

  const handleOpenComments = useCallback((post: GetNFTsResult) => {
    setActiveCommentCount(post.commentCount || 0);
    setCommentPost(post);
    setCommentSheetOpen(true);
  }, []);

  const handleCommentDelta = useCallback(
    (tid: number | string, delta: number) => {
      // Update the commentPost local reference so the count shows updated if the card re-renders
      setCommentPost((prev) => {
        if (!prev) return prev;
        const prevId = (prev as any).tokenId ?? (prev as any).id;
        if (String(prevId) !== String(tid)) return prev;
        const current = (prev as any).commentCount ?? 0;
        const nextCount = Math.max(0, current + delta);
        return { ...(prev as any), commentCount: nextCount } as any;
      });
    },
    []
  );

  const handleGoToUpload = useCallback(() => {
    navigation.navigate(ScreenNames.Upload, { tab: "feed" });
  }, [navigation]);

  return (
    <View className="flex-1 bg-theme-neutrals-900">
      <HomeHeader />
      <View className="flex-1 px-4">
        <CategorySelector
          categories={categories}
          selectedCategory={activeTab}
          onCategoryPress={(category) => {
            if (
              category === "New" ||
              category === "Trending" ||
              category === "Saved" ||
              category === "Liked" ||
              category === "My Posts"
            ) {
              setActiveTab(category);
            } else {
              toastSuccess("This tab is coming soon");
            }
          }}
        />
        <InfiniteFeed
          params={feedParams}
          pageSize={20}
          isSignedIn={isSignedIn}
          fetchPage={
            activeTab === "Saved"
              ? savedFetcher
              : activeTab === "Liked"
              ? likedFetcher
              : undefined
          }
          contentContainerStyle={{ paddingBottom: 16 }}
          emptyComponent={
            <View className="items-center">
              <Text className="text-theme-neutrals-400 text-sm mb-1">
                {activeTab === "Saved"
                  ? "You haven’t saved any posts yet."
                  : activeTab === "Liked"
                  ? "You haven’t liked any posts yet."
                  : activeTab === "My Posts"
                  ? "You haven’t posted anything yet."
                  : "No posts yet."}
              </Text>
              <Text className="text-theme-neutrals-500 text-xs  mb-2">
                {activeTab === "Saved"
                  ? "Save posts to see them here."
                  : activeTab === "Liked"
                  ? "Like posts to see them here."
                  : activeTab === "My Posts"
                  ? "Create a post to get started."
                  : "Pull to refresh or try again later."}
              </Text>
              {activeTab === "My Posts" && (
                <AccentButtonGradient>
                  <TouchableOpacity
                    onPress={handleGoToUpload}
                    activeOpacity={0.8}
                    className="flex-row items-center px-4 py-2 rounded-full bg-transparent"
                  >
                    <Ionicons name="pencil" size={16} color="white" />
                    <Text className="ml-2 text-theme-neutrals-100 font-medium">
                      Create
                    </Text>
                  </TouchableOpacity>
                </AccentButtonGradient>
              )}
            </View>
          }
          renderItem={({ item }) => (
            <FeedCard
              item={item}
              onOpenImage={handleOpenImage}
              onOpenComments={handleOpenComments}
            />
          )}
        />
        <CommentsBottomSheet
          visible={commentSheetOpen}
          onClose={() => setCommentSheetOpen(false)}
          tokenId={(commentPost as any)?.tokenId ?? (commentPost as any)?.id}
          onTopLevelCommentDelta={handleCommentDelta}
          commentCount={activeCommentCount || undefined}
        />
      </View>
    </View>
  );
};

export default FeedScreen;

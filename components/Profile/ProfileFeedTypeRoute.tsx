import React, { useCallback } from "react";
import { View, type NativeSyntheticEvent, type NativeScrollEvent } from "react-native";
import InfiniteFeed from "../Feed/InfiniteFeed";
import FeedCard from "../Home/FeedCard";
import {
  getUnifiedFeed,
  type FeedPostType,
  type UnifiedFeedItem,
} from "../../services/feed.unified.service";
import type { GetNFTsResponse, GetNFTsResult } from "../../services/nft.service";
import { useAuthState } from "../../context/AuthContext";
import ProfileEmptyState, { type ProfileEmptyStateKind } from "./ProfileEmptyState";

interface ProfileFeedTypeRouteProps {
  address?: string;
  /** Which single post type to show (e.g. "feed-simple" for Posts, "feed-audio" for Audio). */
  postType: FeedPostType;
  onScroll?: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  listHeader?: React.ReactNode;
  emptyKind?: ProfileEmptyStateKind;
  emptyTitle?: string;
  emptySubtitle?: string;
  onBeforeNavigate?: () => void;
}

/**
 * A profile content tab that lists a single feed post type (Posts, Audio, …)
 * using the unified feed endpoint. Mirrors FeedRoute but scoped to one type.
 */
const ProfileFeedTypeRoute: React.FC<ProfileFeedTypeRouteProps> = ({
  address,
  postType,
  onScroll,
  listHeader,
  emptyKind = "songs",
  emptyTitle = "No audio yet",
  emptySubtitle = "Audio tracks will appear here",
  onBeforeNavigate,
}) => {
  const { isSignedIn } = useAuthState();

  const fetchPage = useCallback(
    async (page: number, limit: number): Promise<GetNFTsResponse> => {
      if (!address) return { result: [] };
      const res = await getUnifiedFeed({
        minter: address,
        postType,
        sortBy: "createdAt",
        sortOrder: "desc",
        status: "minted",
        page: page + 1, // /feed uses 1-indexed pages
        limit,
      });
      return { result: res.result as unknown as GetNFTsResult[] };
    },
    [address, postType],
  );

  return (
    <View className={`flex-1 ${listHeader ? '' : 'px-4'}`}>
      <InfiniteFeed
        insideNavigatorScreen={false}
        cacheKey={["profile-feed-type", address ?? "", postType]}
        fetchPage={fetchPage}
        pageSize={20}
        isSignedIn={isSignedIn}
        contentContainerStyle={{ paddingBottom: 80, paddingTop: listHeader ? 0 : 8 }}
        enableBackToTop={false}
        onScroll={onScroll}
        headerComponent={listHeader}
        emptyComponent={(
          <ProfileEmptyState
            kind={emptyKind}
            title={emptyTitle}
            subtitle={emptySubtitle}
          />
        )}
        // isVisible must be forwarded or FeedCard falls back to its own
        // `true` default and every windowed row attaches a video player.
        renderItem={({ item, isVisible }) => (
          <View className={listHeader ? 'px-4' : undefined}>
            <FeedCard
              item={item as UnifiedFeedItem}
              isVisible={isVisible}
              onBeforeNavigate={onBeforeNavigate}
            />
          </View>
        )}
      />
    </View>
  );
};

export default ProfileFeedTypeRoute;

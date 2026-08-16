import React, { useCallback } from 'react';
import { View, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';
import InfiniteFeed, { type InfiniteFeedRenderItemInfo } from '../Feed/InfiniteFeed';
import FeedCard from '../Home/FeedCard';
import { getUnifiedFeed, type UnifiedFeedItem } from '../../services/feed.unified.service';
import type { GetNFTsResponse, GetNFTsResult } from '../../services/nft.service';
import { useAuthState } from '../../context/AuthContext';
import ProfileEmptyState from './ProfileEmptyState';

interface FeedRouteProps {
  address?: string;
  /** Profile header rendered as the scrollable list header (banner, info, tabs). */
  listHeader?: React.ReactNode;
  onBeforeNavigate?: () => void;
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  scrollEnabled?: boolean;
}

/**
 * Profile "All" tab — every piece of the user's own content (text, images,
 * videos, audio), matching the web profile's home feed. Uses the unified feed
 * with no postType filter (the `feed-all` postType returns nothing for a
 * minter-scoped query).
 */
const FeedRoute: React.FC<FeedRouteProps> = ({
  address,
  listHeader,
  onBeforeNavigate,
  onScroll,
  scrollEnabled = true,
}) => {
  const { isSignedIn } = useAuthState();

  const fetchPage = useCallback(
    async (page: number, limit: number): Promise<GetNFTsResponse> => {
      if (!address) return { result: [] };
      const res = await getUnifiedFeed({
        minter: address,
        sortBy: 'createdAt',
        sortOrder: 'desc',
        // 'all' resolves to minted+signed server-side; 'minted' alone hides
        // off-chain (mint-opt-out) posts from their own author's profile.
        status: 'all',
        page: page + 1, // /feed uses 1-indexed pages
        limit,
      });
      return { result: res.result as unknown as GetNFTsResult[] };
    },
    [address],
  );

  // Stable identity: InfiniteFeed's own renderItem useCallback lists this in
  // its deps, so a fresh arrow per render invalidated it and re-rendered every
  // cell in the window on any re-render of this route.
  const renderItem = useCallback(
    ({ item, isVisible }: InfiniteFeedRenderItemInfo) => (
      <View className="px-4">
        <FeedCard
          item={item as UnifiedFeedItem}
          isVisible={isVisible}
          onBeforeNavigate={onBeforeNavigate}
        />
      </View>
    ),
    [onBeforeNavigate],
  );

  return (
    <View className="flex-1">
      <InfiniteFeed
        insideNavigatorScreen={false}
        cacheKey={["profile-feed-all", address ?? ""]}
        fetchPage={fetchPage}
        pageSize={20}
        isSignedIn={isSignedIn}
        contentContainerStyle={{ paddingBottom: 80, paddingTop: 0 }}
        enableBackToTop={false}
        headerComponent={listHeader}
        onScroll={onScroll}
        scrollEnabled={scrollEnabled}
        emptyComponent={(
          <ProfileEmptyState
            kind="home"
            title="No posts yet"
            subtitle="Content will appear here when posted"
          />
        )}
        // isVisible must be forwarded or FeedCard falls back to its own
        // `true` default and every windowed row attaches a video player.
        renderItem={renderItem}
      />
    </View>
  );
};

export default FeedRoute;

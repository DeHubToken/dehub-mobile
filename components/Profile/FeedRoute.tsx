import React, { useCallback } from 'react';
import { View } from 'react-native';
import InfiniteFeed from '../Feed/InfiniteFeed';
import FeedCard from '../Home/FeedCard';
import { getUnifiedFeed, type UnifiedFeedItem } from '../../services/feed.unified.service';
import type { GetNFTsResponse, GetNFTsResult } from '../../services/nft.service';
import { useAuthState } from '../../context/AuthContext';

interface FeedRouteProps {
  address?: string;
  /** Profile header rendered as the scrollable list header (banner, info, tabs). */
  listHeader?: React.ReactNode;
}

/**
 * Profile "All" tab — every piece of the user's own content (text, images,
 * videos, audio), matching the web profile's home feed. Uses the unified feed
 * with no postType filter (the `feed-all` postType returns nothing for a
 * minter-scoped query).
 */
const FeedRoute: React.FC<FeedRouteProps> = ({ address, listHeader }) => {
  const { isSignedIn } = useAuthState();

  const fetchPage = useCallback(
    async (page: number, limit: number): Promise<GetNFTsResponse> => {
      if (!address) return { result: [] };
      const res = await getUnifiedFeed({
        minter: address,
        sortBy: 'createdAt',
        sortOrder: 'desc',
        status: 'minted',
        page: page + 1, // /feed uses 1-indexed pages
        limit,
      });
      return { result: res.result as unknown as GetNFTsResult[] };
    },
    [address],
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
        // isVisible must be forwarded or FeedCard falls back to its own
        // `true` default and every windowed row attaches a video player.
        renderItem={({ item, isVisible }) => (
          <View className="px-3">
            <FeedCard item={item as UnifiedFeedItem} isVisible={isVisible} />
          </View>
        )}
      />
    </View>
  );
};

export default FeedRoute;

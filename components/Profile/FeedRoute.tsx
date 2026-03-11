import React, { useMemo } from 'react';
import { View, FlatList } from 'react-native';
import InfiniteFeed from '../Feed/InfiniteFeed';
import FeedCard from '../Home/FeedCard';
import type { SearchParams } from '../../services/nft.service';
import type { UnifiedFeedItem } from '../../services/feed.unified.service';
import { useAuthState } from '../../context/AuthContext';

interface FeedRouteProps {
  address?: string;
  scrollEnabled?: boolean;
  onScroll?: any;
  listRef?: React.RefObject<FlatList<any> | null>;
  noPadding?: boolean;
}

const FeedRoute: React.FC<FeedRouteProps> = ({ address, scrollEnabled, onScroll, listRef, noPadding }) => {
  const { isSignedIn } = useAuthState();

  const feedParams = useMemo<Partial<SearchParams>>(() => ({
    minter: address,
    owner: address,
    address,
    postType: 'feed-all',
    sortMode: 'new',
  }), [address]);

  return (
    <View className={`flex-1 ${noPadding ? '' : 'px-4'}`}>
      <InfiniteFeed
        insideNavigatorScreen={false}
        params={feedParams}
        pageSize={20}
        isSignedIn={isSignedIn}
        contentContainerStyle={{ paddingBottom: 80, paddingTop: noPadding ? 0 : 8 }}
        scrollEnabled={scrollEnabled}
        onScroll={onScroll}
        listRef={listRef}
        enableBackToTop={false}
        renderItem={({ item }) => (
          <FeedCard item={item as UnifiedFeedItem} />
        )}
      />
    </View>
  );
};

export default FeedRoute;

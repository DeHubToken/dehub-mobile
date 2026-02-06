import React, { useCallback, useMemo } from 'react';
import { View, FlatList } from 'react-native';
import InfiniteFeed from '../Feed/InfiniteFeed';
import HomeFeedCard from '../Home/HomeFeedCard';
import type { GetNFTsResult, SearchParams } from '../../services/nft.service';
import type { UnifiedFeedItem } from '../../services/feed.unified.service';
import { useNavigation } from '@react-navigation/native';
import { ScreenNames } from '../../navigation/ScreenNames';
import { useUserProfileSheet } from '../../context/UserProfileSheetContext';
import { useAuthState } from '../../context/AuthContext';

interface FeedRouteProps {
  address?: string;
  scrollEnabled?: boolean;
  onScroll?: any;
  listRef?: React.RefObject<FlatList<any> | null>;
  noPadding?: boolean;
}

const FeedRoute: React.FC<FeedRouteProps> = ({ address, scrollEnabled, onScroll, listRef, noPadding }) => {
  const navigation = useNavigation<any>();
  const { hideUserProfile } = useUserProfileSheet();
  const { isSignedIn } = useAuthState();

  const handleFeedPress = useCallback((post: GetNFTsResult) => {
    const tokenId = (post as any).tokenId ?? (post as any).id;
    hideUserProfile();
    navigation.navigate(ScreenNames.FeedDetail as any, { tokenId });
  }, [navigation, hideUserProfile]);

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
          <HomeFeedCard
            item={item as UnifiedFeedItem}
            onPress={() => handleFeedPress(item)}
          />
        )}
      />
    </View>
  );
};

export default FeedRoute;

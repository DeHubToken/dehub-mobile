import React, { useCallback, useMemo } from 'react';
import { View } from 'react-native';
import InfiniteFeed from '../Feed/InfiniteFeed';
import FeedCard from '../Feed/FeedCard';
import type { GetNFTsResult, SearchParams } from '../../services/nft.service';
import { useNavigation } from '@react-navigation/native';
import { ScreenNames } from '../../navigation/ScreenNames';
import { useUserProfileSheet } from '../../context/UserProfileSheetContext';

interface FeedRouteProps {
  address?: string;
}

const FeedRoute: React.FC<FeedRouteProps> = ({ address }) => {
  const navigation = useNavigation<any>();
  const { hideUserProfile } = useUserProfileSheet();

  const handleOpenImage = useCallback(
    (images: any[], index: number) => {
      hideUserProfile();
      navigation.navigate(ScreenNames.ImageViewer, { images, index });
    },
    [navigation, hideUserProfile]
  );

  const handleOpenComments = useCallback((post: GetNFTsResult) => {
    const tokenId = (post as any).tokenId ?? (post as any).id;
    hideUserProfile();
    navigation.navigate(ScreenNames.FeedDetail as any, { tokenId });
  }, [navigation, hideUserProfile]);

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
    <View className="flex-1 px-4">
      <InfiniteFeed
        insideNavigatorScreen={false}
        params={feedParams}
        pageSize={20}
        contentContainerStyle={{ paddingBottom: 80, paddingTop: 8 }}
        renderItem={({ item }) => (
          <FeedCard
            item={item}
            onOpenImage={handleOpenImage}
            onOpenComments={handleOpenComments}
            onFeedPress={handleFeedPress}
          />
        )}
      />
    </View>
  );
};

export default FeedRoute;

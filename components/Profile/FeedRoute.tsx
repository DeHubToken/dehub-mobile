import React, { useMemo } from 'react';
import { View, FlatList } from 'react-native';
import InfiniteFeed from '../Feed/InfiniteFeed';
import FeedCard from '../Home/FeedCard';
import ProfileApps from './ProfileApps';
import ProfileHeader from './ProfileHeader';
// import InviteFriendsCard from '../common/InviteFriendsCard';
import PinnedCommunities from '../Communities/PinnedCommunities';
import type { SearchParams } from '../../services/nft.service';
import type { UnifiedFeedItem } from '../../services/feed.unified.service';
import { useAuthState, useUser } from '../../context/AuthContext';

interface FeedRouteProps {
  address?: string;
  scrollEnabled?: boolean;
  onScroll?: any;
  listRef?: React.RefObject<FlatList<any> | null>;
  noPadding?: boolean;
  showProfileExtras?: boolean;
}

const ProfileExtrasHeader: React.FC = () => {
  const user = useUser() as any;
  const address = user?.address || user?.walletAddress;
  return (
    <View className="w-full">
      <ProfileHeader />
      <View className="px-3">
        <PinnedCommunities
          walletAddress={address || ""}
          isOwnProfile
        />
      </View>
      {/* Invite friends card — hidden for now
      <View className="px-3 mt-2 mb-1">
        <InviteFriendsCard address={address} shareName={user?.username} />
      </View>
      */}
      <ProfileApps />
    </View>
  );
};

const FeedRoute: React.FC<FeedRouteProps> = ({ address, scrollEnabled, onScroll, listRef, noPadding, showProfileExtras }) => {
  const { isSignedIn } = useAuthState();

  const feedParams = useMemo<Partial<SearchParams>>(() => ({
    minter: address,
    owner: address,
    address,
    postType: 'feed-all',
    sortMode: 'new',
  }), [address]);

  const horizontalPad = noPadding || showProfileExtras;

  return (
    <View className={`flex-1 ${horizontalPad ? '' : 'px-4'}`}>
      <InfiniteFeed
        insideNavigatorScreen={false}
        params={feedParams}
        pageSize={20}
        isSignedIn={isSignedIn}
        contentContainerStyle={{ paddingBottom: 80, paddingTop: horizontalPad ? 0 : 8 }}
        scrollEnabled={scrollEnabled ?? true}
        onScroll={onScroll}
        listRef={listRef}
        enableBackToTop={false}
        headerComponent={showProfileExtras ? <ProfileExtrasHeader /> : undefined}
        renderItem={({ item }) => (
          <View className={horizontalPad ? 'px-3' : undefined}>
            <FeedCard item={item as UnifiedFeedItem} />
          </View>
        )}
      />
    </View>
  );
};

export default FeedRoute;

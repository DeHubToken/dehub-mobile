import React, { memo, useMemo } from "react";
import { View, FlatList } from "react-native";
import Animated, { SharedValue, useAnimatedProps } from "react-native-reanimated";
import UserProfileSkeleton from "./UserProfileSkeleton";
import UserProfileHeader from "./UserProfileHeader";
import UserProfileStatsRow from "./UserProfileStatsRow";
import UserProfileActions from "./UserProfileActions";
import UserProfileAboutSection from "./UserProfileAboutSection";

const FallbackAvatar = require("../../assets/default-avatar.png");

interface UserProfileSheetContentProps {
  loading: boolean;
  data: any;
  profileData: any;
  isFollowing: boolean;
  followLoading: boolean;
  avatarUrl: string;
  coverUrl: string;
  defaultBanner: any;
  stats: any[];
  scrollEnabled: boolean;
  flatListRef: React.RefObject<FlatList | null>;
  onScroll: any;
  onFollow: () => void;
  onOpenUnfollow: () => void;
  onOpenVideos: () => void;
  onMessage: () => void;
  onShare: () => void;
  onOpenImage: (type: "avatar" | "cover") => void;
  onClose: () => void;
}

const UserProfileSheetContent: React.FC<UserProfileSheetContentProps> = ({
  loading,
  data,
  profileData,
  isFollowing,
  followLoading,
  avatarUrl,
  coverUrl,
  defaultBanner,
  stats,
  scrollEnabled,
  flatListRef,
  onScroll,
  onFollow,
  onOpenUnfollow,
  onOpenVideos,
  onMessage,
  onShare,
  onOpenImage,
  onClose,
}) => {
  const ListHeaderComponent = useMemo(() => {
    if (!profileData) return null;
    
    return (
      <View>
        <UserProfileHeader
          avatarUrl={avatarUrl}
          coverUrl={coverUrl}
          displayName={profileData.displayName}
          badge={profileData.badge}
          badgeImage={profileData.badgeImage}
          badgeIcon="trophy-outline"
          address={profileData.address}
          shortAddr={profileData.shortAddr}
          username={profileData.username}
          hasUsername={profileData.hasUsername}
          joinedDate={profileData.joinedDate}
          onOpenImage={onOpenImage}
          onShare={onShare}
          onMessage={onMessage}
          FallbackAvatar={FallbackAvatar}
          FallbackBanner={defaultBanner}
          socials={data}
        />
        <View className="px-6 mt-2">
          <UserProfileStatsRow stats={stats} />
          <UserProfileActions
            isFollowing={isFollowing}
            followLoading={followLoading}
            disableActions={profileData.disableActions}
            address={profileData.address}
            onFollow={onFollow}
            onOpenUnfollow={onOpenUnfollow}
            onOpenVideos={onOpenVideos}
          />
          {data?.aboutMe && <UserProfileAboutSection content={data.aboutMe} />}
        </View>
      </View>
    );
  }, [
    profileData,
    avatarUrl,
    coverUrl,
    defaultBanner,
    data,
    stats,
    isFollowing,
    followLoading,
    onOpenImage,
    onShare,
    onMessage,
    onFollow,
    onOpenUnfollow,
    onOpenVideos,
  ]);

  if (loading || !data) {
    return (
      <View className="flex-1 p-6">
        <UserProfileSkeleton />
      </View>
    );
  }

  if (!profileData) return null;

  return (
    <Animated.FlatList
      ref={flatListRef as any}
      data={[]}
      renderItem={() => null}
      ListHeaderComponent={ListHeaderComponent}
      scrollEnabled={scrollEnabled}
      showsVerticalScrollIndicator={false}
      className="flex-1"
      removeClippedSubviews
      scrollEventThrottle={16}
      onScroll={onScroll}
      bounces={false}
      ListFooterComponent={<View style={{ height: 40 }} />}
    />
  );
};

export default memo(UserProfileSheetContent);

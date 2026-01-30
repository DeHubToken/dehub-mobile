import React, { memo, useMemo } from "react";
import { View, type NativeSyntheticEvent, type NativeScrollEvent } from "react-native";
import UserProfileSkeleton from "./UserProfileSkeleton";
import UserProfileHeader from "./UserProfileHeader";
import UserProfileStatsRow from "./UserProfileStatsRow";
import UserProfileActions from "./UserProfileActions";
import UserProfileAboutSection from "./UserProfileAboutSection";
import UserProfileBottomContentTabs from "./UserProfileBottomContentTabs";

const FallbackAvatar = require("../../assets/default-avatar.png");

interface UserProfileSheetContentProps {
  loading: boolean;
  data: any;
  profileData: any;
  isFollowing: boolean;
  followsYou?: boolean;
  followLoading: boolean;
  avatarUrl: string;
  coverUrl: string;
  defaultBanner: any;
  stats: any[];
  scrollEnabled: boolean;
  isFullScreen: boolean;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  registerScrollToTop: (handler: (() => void) | null) => void;
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
  followsYou,
  followLoading,
  avatarUrl,
  coverUrl,
  defaultBanner,
  stats,
  scrollEnabled,
  isFullScreen,
  onScroll,
  registerScrollToTop,
  onFollow,
  onOpenUnfollow,
  onOpenVideos,
  onMessage,
  onShare,
  onOpenImage,
  onClose,
}) => {
  const ProfileHeader = useMemo(() => {
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
          followsYou={followsYou}
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
    followsYou,
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
      <View className="flex-1 p-2">
        <UserProfileSkeleton />
      </View>
    );
  }

  if (!profileData) return null;

  // Single render - tabs component is always the same instance to prevent refetching
  return (
    <View className="flex-1">
      {ProfileHeader}
      <View className={isFullScreen ? "flex-1 px-6" : "px-6"}>
        <UserProfileBottomContentTabs
          address={profileData.address}
          onClose={onClose}
          scrollEnabled={isFullScreen}
          isFullScreen={isFullScreen}
          onScroll={onScroll}
          registerScrollToTop={registerScrollToTop}
        />
      </View>
      {!isFullScreen && <View style={{ height: 40 }} />}
    </View>
  );
};

export default memo(UserProfileSheetContent);

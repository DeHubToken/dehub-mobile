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
  isFollowRequestPending?: boolean;
  followsYou?: boolean;
  followLoading: boolean;
  isPrivate?: boolean;
  canViewContent?: boolean;
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
  onMessage: () => void;
  onShare: () => void;
  onOpenImage: (type: "avatar" | "cover") => void;
  onClose: () => void;
  onStatPress?: (key: string) => void;
}

const UserProfileSheetContent: React.FC<UserProfileSheetContentProps> = ({
  loading,
  data,
  profileData,
  isFollowing,
  isFollowRequestPending,
  followsYou,
  followLoading,
  isPrivate,
  canViewContent,
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
  onMessage,
  onShare,
  onOpenImage,
  onClose,
  onStatPress,
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
          isPrivate={isPrivate}
          canViewContent={canViewContent}
          onOpenImage={onOpenImage}
          onShare={onShare}
          onMessage={onMessage}
          FallbackAvatar={FallbackAvatar}
          FallbackBanner={defaultBanner}
          socials={data}
        />
        <View className="px-6 mt-2">
          <UserProfileStatsRow stats={stats} onStatPress={onStatPress} />
          <UserProfileActions
            isFollowing={isFollowing}
            isFollowRequestPending={isFollowRequestPending}
            followLoading={followLoading}
            disableActions={profileData.disableActions}
            address={profileData.address}
            onFollow={onFollow}
            onOpenUnfollow={onOpenUnfollow}
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
    isFollowRequestPending,
    followsYou,
    followLoading,
    onOpenImage,
    onShare,
    onMessage,
    onFollow,
    onOpenUnfollow,
    onStatPress,
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
          isPrivate={isPrivate}
          canViewContent={canViewContent}
          isFollowRequestPending={isFollowRequestPending}
          onFollow={onFollow}
        />
      </View>
      {!isFullScreen && <View style={{ height: 40 }} />}
    </View>
  );
};

export default memo(UserProfileSheetContent);

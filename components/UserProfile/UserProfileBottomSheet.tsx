import React, { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StackActions, useNavigation } from "@react-navigation/native";
import CollapsingProfileHeader from '../Profile/CollapsingProfileHeader';
import { useProfileCollapse } from '../Profile/useProfileCollapse';
import UserProfileSheetContent from "./UserProfileSheetContent";
import ProfileSurface from "./ProfileSurface";
import UnfollowSheet from "./UnfollowSheet";
import { useUserProfileData } from "../../hooks/useUserProfileData";
import { ScreenNames } from "../../navigation/ScreenNames";
import { TAB_BAR_CONTENT_INSET } from "../../navigation/tabBarLayout";
import { TabBarHideProvider } from "../../context/TabBarHideContext";
import StandaloneTabBar from "../../navigation/StandaloneTabBar";
import SwipeBackBoundary from '../common/SwipeBackBoundary';
import { FrostedBackground } from "../ui/FrostedBackdrop";
import ImageViewerModal from "../common/ImageViewerModal";

interface UserProfileBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  onOpenComplete?: () => void;
  usernameOrAddress?: string | null;
  /** Retained for call-site compatibility; profiles no longer open collapsed. */
  initialHeightPct?: number;
  /**
   * Home owns the feed header while a creator profile is open. In this mode
   * render the profile as an ordinary full-height surface below that header,
   * rather than putting a draggable native modal over the whole app.
   */
  embedded?: boolean;
}

const UserProfileBottomSheet: React.FC<UserProfileBottomSheetProps> = ({
  visible,
  onClose,
  onOpenComplete,
  usernameOrAddress,
  embedded = false,
}) => {
  const [showUnfollowSheet, setShowUnfollowSheet] = useState(false);

  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  // Still showing while it slides away: the provider clears the identifier
  // once the close has finished, so the page keeps its content (and scroll)
  // on the way out instead of swapping to a skeleton mid-slide.
  const showing = visible || !!usernameOrAddress;
  const collapse = useProfileCollapse(showing ? usernameOrAddress : null);

  // The tap's own commit mounts only the light skeleton, so the slide starts
  // on the next frame; the full profile mounts a frame later, while the slide
  // runs on the UI thread. Embedded profiles have no slide to protect.
  const [contentReady, setContentReady] = useState(embedded);
  useEffect(() => {
    if (embedded) return;
    if (!showing) {
      setContentReady(false);
      return;
    }
    const frame = requestAnimationFrame(() => setContentReady(true));
    return () => cancelAnimationFrame(frame);
  }, [embedded, showing]);

  // Shared profile data and actions for both embedded and standalone pages.
  const {
    loading,
    data,
    error,
    retry,
    profileData,
    isFollowing,
    isFollowRequestPending,
    followsYou,
    followLoading,
    isPrivate,
    canViewContent,
    isOwnProfile,
    avatarUrl,
    coverUrl,
    defaultBanner,
    stats,
    handleFollow,
    handleUnfollow,
    handleRemoveFollower,
    handleBlock,
    handleUnblock,
    youBlocked,
    blockedYou,
    isBlocked,
    blockLoading,
    handleOpenImage,
    viewerImages,
    closeImage,
    handleShare,
    handleMessage,
  } = useUserProfileData(showing, usernameOrAddress);


  const handleEditProfile = useCallback(() => {
    onClose();
    (navigation as any).navigate(ScreenNames.EditProfile);
  }, [onClose, navigation]);

  const registerScrollToTop = useCallback((_handler: (() => void) | null) => {}, []);
  const handleScroll = useCallback(() => {}, []);

  useEffect(() => {
    if (!visible) {
      setShowUnfollowSheet(false);
    }
  }, [visible]);

  const handleMessageWrapper = useCallback(() => {
    handleMessage(onClose);
  }, [handleMessage, onClose]);

  const handleStatPress = useCallback((key: string) => {
    if (!profileData?.address) return;
    const initialTab = key === "following" ? "following" : "followers";
    onClose();
    // Push, not navigate: from a follow list, navigate reuses that screen with
    // its old tab and drops it from the back stack.
    navigation.dispatch(
      StackActions.push(ScreenNames.FollowList, {
        address: profileData.address,
        username: profileData.username,
        initialTab,
        hideFollowers: data?.hideFollowers,
        isOwnProfile: false,
      }),
    );
  }, [navigation, profileData, data, onClose]);

  const profileBar = (
    <CollapsingProfileHeader
      {...collapse}
      name={profileData?.displayName}
      handle={profileData?.username}
      cover={coverUrl && coverUrl !== 'default-banner' ? { uri: coverUrl } : defaultBanner}
      canGoBack
      onBackPress={onClose}
      showFollow={!!profileData && !loading && !isOwnProfile && !isBlocked}
      isFollowing={isFollowing}
      isPending={isFollowRequestPending}
      followLoading={followLoading}
      disableFollow={profileData?.disableActions}
      onFollow={handleFollow}
      onOpenUnfollow={() => setShowUnfollowSheet(true)}
    />
  );
  if (embedded) {
    return (
      <SwipeBackBoundary onBack={onClose} enabled={visible}>
      <View className="flex-1 bg-theme-neutrals-900">
        <UserProfileSheetContent
          collapse={collapse}
          loading={loading}
          data={data}
          error={error}
          onRetry={retry}
          backToTopBottom={TAB_BAR_CONTENT_INSET}
          profileData={profileData}
          isFollowing={isFollowing}
          isFollowRequestPending={isFollowRequestPending}
          followsYou={followsYou}
          followLoading={followLoading}
          isPrivate={isPrivate}
          canViewContent={canViewContent}
          isOwnProfile={isOwnProfile}
          avatarUrl={avatarUrl}
          coverUrl={coverUrl}
          defaultBanner={defaultBanner}
          stats={stats}
          scrollEnabled
          isFullScreen
          registerScrollToTop={registerScrollToTop}
          onScroll={handleScroll}
          onFollow={handleFollow}
          onOpenUnfollow={() => setShowUnfollowSheet(true)}
          onMessage={handleMessageWrapper}
          onShare={handleShare}
          onOpenImage={handleOpenImage}
          onClose={onClose}
          onStatPress={handleStatPress}
          onEditProfile={handleEditProfile}
          youBlocked={youBlocked}
          blockedYou={blockedYou}
          isBlocked={isBlocked}
          blockLoading={blockLoading}
          onBlock={handleBlock}
          onUnblock={handleUnblock}
          onRemoveFollower={handleRemoveFollower}
        />
        {profileBar}
        <UnfollowSheet
          visible={showUnfollowSheet && (isFollowing || isFollowRequestPending)}
          username={profileData?.username || usernameOrAddress || ""}
          followLoading={followLoading}
          onClose={() => setShowUnfollowSheet(false)}
          onUnfollow={handleUnfollow}
          isCancelRequest={isFollowRequestPending}
        />
        <ImageViewerModal images={viewerImages} onClose={closeImage} />
      </View>
      </SwipeBackBoundary>
    );
  }

  return (
    <ProfileSurface
      visible={visible}
      onClose={onClose}
      onOpenComplete={onOpenComplete}
    >
      <FrostedBackground>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SwipeBackBoundary onBack={onClose} enabled={visible}>
        {/* Its own nav state: a modal sits above the tabs, so the home bar is
            out of sight and this one hides with this profile's scroll. */}
        <TabBarHideProvider>
        <View
          className="flex-1 bg-theme-neutrals-900"
          style={{ paddingTop: insets.top, paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right }}
        >
          {/* Absolute header controls need a parent inside the safe area;
              top: 0 on the padded outer view still reaches the status bar. */}
          <View style={{ flex: 1 }}>
          <UserProfileSheetContent
            collapse={collapse}
            loading={loading || !contentReady}
            data={data}
            error={error}
            onRetry={retry}
            backToTopBottom={TAB_BAR_CONTENT_INSET}
            profileData={profileData}
            isFollowing={isFollowing}
            isFollowRequestPending={isFollowRequestPending}
            followsYou={followsYou}
            followLoading={followLoading}
            isPrivate={isPrivate}
            canViewContent={canViewContent}
            isOwnProfile={isOwnProfile}
            avatarUrl={avatarUrl}
            coverUrl={coverUrl}
            defaultBanner={defaultBanner}
            stats={stats}
            scrollEnabled
            isFullScreen
            registerScrollToTop={registerScrollToTop}
            onScroll={handleScroll}
            onFollow={handleFollow}
            onOpenUnfollow={() => setShowUnfollowSheet(true)}
            onMessage={handleMessageWrapper}
            onShare={handleShare}
            onOpenImage={handleOpenImage}
            onClose={onClose}
            onStatPress={handleStatPress}
            onEditProfile={handleEditProfile}
            youBlocked={youBlocked}
            blockedYou={blockedYou}
            isBlocked={isBlocked}
            blockLoading={blockLoading}
            onBlock={handleBlock}
            onUnblock={handleUnblock}
            onRemoveFollower={handleRemoveFollower}
          />
          {profileBar}
          <StandaloneTabBar onBeforeNavigate={onClose} />
          </View>
        </View>
        </TabBarHideProvider>
        </SwipeBackBoundary>
      </GestureHandlerRootView>
      <UnfollowSheet
        visible={showUnfollowSheet && (isFollowing || isFollowRequestPending)}
        username={profileData?.username || usernameOrAddress || ""}
        followLoading={followLoading}
        onClose={() => setShowUnfollowSheet(false)}
        onUnfollow={handleUnfollow}
        isCancelRequest={isFollowRequestPending}
      />
      <ImageViewerModal images={viewerImages} onClose={closeImage} />
      </FrostedBackground>
    </ProfileSurface>
  );
};

export default UserProfileBottomSheet;

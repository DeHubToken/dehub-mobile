import React, { useCallback, useEffect, useState } from "react";
import { View, Modal, TouchableOpacity } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import ScreenHeader from "../ScreenHeader";
import Icon from "../ui/Icon";
import UserProfileSheetContent from "./UserProfileSheetContent";
import UnfollowSheet from "./UnfollowSheet";
import { useUserProfileData } from "../../hooks/useUserProfileData";
import { ScreenNames } from "../../navigation/ScreenNames";

interface UserProfileBottomSheetProps {
  visible: boolean;
  onClose: () => void;
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
  usernameOrAddress,
  embedded = false,
}) => {
  const [showUnfollowSheet, setShowUnfollowSheet] = useState(false);
  const [menuTrigger, setMenuTrigger] = React.useState<(() => void) | null>(null);

  const handleRegisterMenuTrigger = useCallback((trigger: () => void) => {
    // Must wrap in arrow — passing a function directly to setState invokes it as a functional updater
    setMenuTrigger(() => trigger);
  }, []);

  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  // Shared profile data and actions for both embedded and standalone pages.
  const {
    loading,
    data,
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
    handleShare,
    handleMessage,
  } = useUserProfileData(visible, usernameOrAddress);


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
    (navigation as any).navigate(ScreenNames.FollowList, {
      address: profileData.address,
      username: profileData.username,
      initialTab,
      hideFollowers: data?.hideFollowers,
      isOwnProfile: false,
    });
  }, [navigation, profileData, data, onClose]);

  if (embedded) {
    return (
      <View className="flex-1 bg-theme-neutrals-900">
        {!isOwnProfile && menuTrigger ? (
          <TouchableOpacity
            onPress={menuTrigger}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            className="absolute right-3 top-3 z-20 w-10 h-10 items-center justify-center rounded-xl bg-black/40"
            accessibilityRole="button"
            accessibilityLabel="Profile options"
          >
            <Icon name="EllipsisVertical" size={20} color="#E5E7EB" />
          </TouchableOpacity>
        ) : null}
        <UserProfileSheetContent
          loading={loading}
          data={data}
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
          onRegisterMenuTrigger={handleRegisterMenuTrigger}
        />
        <UnfollowSheet
          visible={showUnfollowSheet && (isFollowing || isFollowRequestPending)}
          username={profileData?.username || usernameOrAddress || ""}
          followLoading={followLoading}
          onClose={() => setShowUnfollowSheet(false)}
          onUnfollow={handleUnfollow}
          isCancelRequest={isFollowRequestPending}
        />
      </View>
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="fullScreen"
      statusBarTranslucent
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View
          className="flex-1 bg-theme-neutrals-900"
          style={{ paddingTop: insets.top }}
        >
          <ScreenHeader
            title={profileData?.displayName || "Profile"}
            subtitle={profileData?.username ? `@${profileData.username}` : undefined}
            canGoBack
            onBackPress={onClose}
            rightContent={
              !isOwnProfile && menuTrigger ? (
                <TouchableOpacity
                  onPress={menuTrigger}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  className="w-10 h-10 items-center justify-center"
                  accessibilityRole="button"
                  accessibilityLabel="Profile options"
                >
                  <Icon name="EllipsisVertical" size={20} color="#E5E7EB" />
                </TouchableOpacity>
              ) : undefined
            }
          />
          <UserProfileSheetContent
            loading={loading}
            data={data}
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
            onRegisterMenuTrigger={handleRegisterMenuTrigger}
          />
        </View>
      </GestureHandlerRootView>
      <UnfollowSheet
        visible={showUnfollowSheet && (isFollowing || isFollowRequestPending)}
        username={profileData?.username || usernameOrAddress || ""}
        followLoading={followLoading}
        onClose={() => setShowUnfollowSheet(false)}
        onUnfollow={handleUnfollow}
        isCancelRequest={isFollowRequestPending}
      />
    </Modal>
  );
};

export default UserProfileBottomSheet;

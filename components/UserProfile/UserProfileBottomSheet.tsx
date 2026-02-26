import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Dimensions, Modal, Pressable, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  Extrapolate,
  interpolate,
  useAnimatedStyle,
} from "react-native-reanimated";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import ScreenHeader from "../ScreenHeader";
import UserProfileSheetContent from "./UserProfileSheetContent";
import UnfollowSheet from "./UnfollowSheet";
import { useUserProfileData } from "../../hooks/useUserProfileData";
import { useBottomSheetGestures } from "../../hooks/useBottomSheetGestures";
import { ScreenNames } from "../../navigation/ScreenNames";

interface UserProfileBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  usernameOrAddress?: string | null;
  initialHeightPct?: number;
}

const WIN_HEIGHT = Dimensions.get("window").height;
const COLLAPSED_HEIGHT = Math.round(WIN_HEIGHT * 0.5);

const UserProfileBottomSheet: React.FC<UserProfileBottomSheetProps> = ({
  visible,
  onClose,
  usernameOrAddress,
  initialHeightPct,
}) => {
  const [showUnfollowSheet, setShowUnfollowSheet] = useState(false);
  const [menuTrigger, setMenuTrigger] = React.useState<(() => void) | null>(null);

  const handleRegisterMenuTrigger = useCallback((trigger: () => void) => {
    // Must wrap in arrow — passing a function directly to setState invokes it as a functional updater
    setMenuTrigger(() => trigger);
  }, []);

  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const initialHeight = useMemo(() => {
    if (
      typeof initialHeightPct === "number" &&
      initialHeightPct > 0 &&
      initialHeightPct <= 1
    ) {
      return Math.round(WIN_HEIGHT * initialHeightPct);
    }
    return COLLAPSED_HEIGHT;
  }, [initialHeightPct]);

  // Custom hooks for data and gestures
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

  const {
    animatedStyle,
    isFullScreen,
    fullScreenProgress,
    scrollEnabled,
    registerScrollToTop,
    composedGesture,
    GestureDetector,
    expandToFullScreen,
    collapseToInitial,
    scrollHandler,
    resetGestureState,
  } = useBottomSheetGestures(initialHeight, onClose);

  // Reset state when modal closes
  useEffect(() => {
    if (!visible) {
      setShowUnfollowSheet(false);
      resetGestureState();
    }
  }, [visible, resetGestureState]);

  const handleBackToProfile = useCallback(() => {
    onClose();
  }, [onClose]);

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

  const sheetChromeStyle = useAnimatedStyle(() => {
    const p = fullScreenProgress.value;
    return {
      borderTopLeftRadius: interpolate(p, [0, 1], [16, 0], Extrapolate.CLAMP),
      borderTopRightRadius: interpolate(p, [0, 1], [16, 0], Extrapolate.CLAMP),
      paddingTop: interpolate(p, [0, 1], [0, insets.top], Extrapolate.CLAMP),
    };
  }, [insets.top]);

  const headerStyle = useAnimatedStyle(() => {
    const p = fullScreenProgress.value;
    const opacity = interpolate(p, [0.55, 0.85], [0, 1], Extrapolate.CLAMP);
    return { opacity };
  });

  const headerSpacerStyle = useAnimatedStyle(() => {
    const p = fullScreenProgress.value;
    const height = interpolate(p, [0.55, 0.85], [0, 64], Extrapolate.CLAMP);
    return { height };
  });

  const handleStyle = useAnimatedStyle(() => {
    const p = fullScreenProgress.value;
    const opacity = interpolate(p, [0.2, 0.5], [1, 0], Extrapolate.CLAMP);
    return { opacity };
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            justifyContent: "flex-end",
          }}
        >
          <Pressable style={{ flex: 1 }} onPress={onClose} />
          <GestureDetector gesture={composedGesture}>
            <Animated.View
              className="bg-theme-neutrals-900 overflow-hidden"
              style={[animatedStyle, sheetChromeStyle]}
            >
              {/* Header */}
              <View className="w-full" style={{ position: "relative" }}>
                <Animated.View style={headerSpacerStyle} />
                <Animated.View
                  style={[
                    headerStyle,
                    {
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                    },
                  ]}
                  pointerEvents={isFullScreen ? "auto" : "none"}
                >
                  <ScreenHeader
                    title={profileData?.displayName || "Profile"}
                    canGoBack={true}
                    onBackPress={handleBackToProfile}
                    rightContent={
                      !isOwnProfile && menuTrigger ? (
                        <TouchableOpacity
                          onPress={menuTrigger}
                          activeOpacity={0.7}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          className="w-10 h-10 items-center justify-center"
                        >
                          <Ionicons name="ellipsis-vertical" size={20} color="#e5e5e5" />
                        </TouchableOpacity>
                      ) : undefined
                    }
                  />
                </Animated.View>

                {!isFullScreen && (
                  <Animated.View
                    style={[
                      handleStyle,
                      {
                        alignItems: "center",
                        paddingTop: 12,
                        paddingBottom: 8,
                      },
                    ]}
                    pointerEvents={isFullScreen ? "none" : "auto"}
                  >
                    <View className="w-16 h-1.5 bg-theme-neutrals-700 rounded-full" />
                  </Animated.View>
                )}
              </View>

              {/* Content */}
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
                scrollEnabled={scrollEnabled}
                isFullScreen={isFullScreen}
                registerScrollToTop={registerScrollToTop}
                onScroll={scrollHandler}
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
            </Animated.View>
          </GestureDetector>
        </View>
      </GestureHandlerRootView>
      {/* Unfollow / Cancel Request Sheet */}
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

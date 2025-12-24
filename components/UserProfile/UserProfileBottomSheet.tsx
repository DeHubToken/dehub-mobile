import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Dimensions, Modal, Pressable } from "react-native";
import Animated from "react-native-reanimated";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ScreenHeader from "../ScreenHeader";
import UserProfileSheetContent from "./UserProfileSheetContent";
import UserProfileVideosContent from "./UserProfileVideosContent";
import UnfollowSheet from "./UnfollowSheet";
import { useUserProfileData } from "../../hooks/useUserProfileData";
import { useBottomSheetGestures } from "../../hooks/useBottomSheetGestures";

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
  const [mode, setMode] = useState<"profile" | "videos">("profile");
  const [tabIndex, setTabIndex] = useState(0);
  const [showUnfollowSheet, setShowUnfollowSheet] = useState(false);

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
    followLoading,
    avatarUrl,
    coverUrl,
    defaultBanner,
    stats,
    handleFollow,
    handleUnfollow,
    handleOpenImage,
    handleShare,
    handleMessage,
  } = useUserProfileData(visible, usernameOrAddress);

  const {
    animatedStyle,
    isFullScreen,
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
      setMode("profile");
      setTabIndex(0);
      setShowUnfollowSheet(false);
      resetGestureState();
    }
  }, [visible, resetGestureState]);

  const handleVideos = useCallback(() => {
    setMode("videos");
    if (!isFullScreen) {
      expandToFullScreen();
    }
  }, [isFullScreen, expandToFullScreen]);

  const handleBackToProfile = useCallback(() => {
    if (mode === "videos") {
      setMode("profile");
    } else if (isFullScreen) {
      collapseToInitial();
    } else {
      onClose();
    }
  }, [mode, isFullScreen, collapseToInitial, onClose]);

  const handleMessageWrapper = useCallback(() => {
    handleMessage(onClose);
  }, [handleMessage, onClose]);

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
              style={[
                animatedStyle,
                {
                  borderTopLeftRadius: isFullScreen ? 0 : 16,
                  borderTopRightRadius: isFullScreen ? 0 : 16,
                  paddingTop: isFullScreen ? insets.top : 0,
                },
              ]}
            >
              {/* Header */}
              <View
                className="w-full items-center"
                style={{
                  paddingTop: isFullScreen ? 0 : 12,
                  paddingBottom: isFullScreen ? 0 : 8,
                }}
              >
                {isFullScreen ? (
                  <ScreenHeader
                    title={
                      mode === "videos"
                        ? "Content"
                        : profileData?.displayName || "Profile"
                    }
                    canGoBack={true}
                    onBackPress={handleBackToProfile}
                  />
                ) : (
                  <View className="w-16 h-1.5 bg-theme-neutrals-700 rounded-full" />
                )}
              </View>

              {/* Content */}
              {mode === "profile" ? (
                <UserProfileSheetContent
                  loading={loading}
                  data={data}
                  profileData={profileData}
                  isFollowing={isFollowing}
                  followLoading={followLoading}
                  avatarUrl={avatarUrl}
                  coverUrl={coverUrl}
                  defaultBanner={defaultBanner}
                  stats={stats}
                  scrollEnabled={scrollEnabled}
                  registerScrollToTop={registerScrollToTop}
                  onScroll={scrollHandler}
                  onFollow={handleFollow}
                  onOpenUnfollow={() => setShowUnfollowSheet(true)}
                  onOpenVideos={handleVideos}
                  onMessage={handleMessageWrapper}
                  onShare={handleShare}
                  onOpenImage={handleOpenImage}
                  onClose={onClose}
                />
              ) : (
                <UserProfileVideosContent
                  profileAddress={profileData?.address || ""}
                  tabIndex={tabIndex}
                  onTabIndexChange={setTabIndex}
                />
              )}
            </Animated.View>
          </GestureDetector>
        </View>
      </GestureHandlerRootView>
      {/* Unfollow Sheet */}
      <UnfollowSheet
        visible={showUnfollowSheet && isFollowing}
        username={profileData?.username || usernameOrAddress || ""}
        followLoading={followLoading}
        onClose={() => setShowUnfollowSheet(false)}
        onUnfollow={handleUnfollow}
      />
    </Modal>
  );
};

export default UserProfileBottomSheet;

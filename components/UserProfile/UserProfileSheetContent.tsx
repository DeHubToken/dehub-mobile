import React, { memo, useCallback, useMemo, useState } from "react";
import { View, Text, TouchableOpacity, type NativeSyntheticEvent, type NativeScrollEvent } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import UserProfileSkeleton from "./UserProfileSkeleton";
import UserProfileHeader from "./UserProfileHeader";
import UserProfileStatsRow from "./UserProfileStatsRow";
import UserProfileActions from "./UserProfileActions";
import UserProfileAboutSection from "./UserProfileAboutSection";
import UserProfileBottomContentTabs from "./UserProfileBottomContentTabs";
import GlassModal from "../ui/GlassModal";
import ConfirmBlockModal from "../common/ConfirmBlockModal";
import ReportModal from "../common/ReportModal";

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
  isOwnProfile?: boolean;
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
  onEditProfile?: () => void;
  youBlocked?: boolean;
  blockedYou?: boolean;
  isBlocked?: boolean;
  blockLoading?: boolean;
  onBlock?: () => void;
  onUnblock?: () => void;
  onRemoveFollower?: () => void;
  /** Callback to register menu trigger handler */
  onRegisterMenuTrigger?: (trigger: () => void) => void;
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
  isOwnProfile = false,
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
  onEditProfile,
  youBlocked = false,
  blockedYou = false,
  isBlocked = false,
  blockLoading = false,
  onBlock,
  onUnblock,
  onRemoveFollower,
  onRegisterMenuTrigger,
}) => {
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);
  const [showReportUser, setShowReportUser] = useState(false);
  const [showRemoveFollowerConfirm, setShowRemoveFollowerConfirm] = useState(false);

  const handleOpenMenu = useCallback(() => {
    setShowProfileMenu(true);
  }, []);

  // Register menu trigger with parent
  React.useEffect(() => {
    if (!isOwnProfile && onRegisterMenuTrigger) {
      onRegisterMenuTrigger(handleOpenMenu);
    }
  }, [isOwnProfile, onRegisterMenuTrigger, handleOpenMenu]);

  const handleBlockPress = useCallback(() => {
    setShowProfileMenu(false);
    setTimeout(() => setShowBlockConfirm(true), 200);
  }, []);

  const handleReportPress = useCallback(() => {
    setShowProfileMenu(false);
    setTimeout(() => setShowReportUser(true), 200);
  }, []);

  const handleRemoveFollowerPress = useCallback(() => {
    setShowProfileMenu(false);
    setTimeout(() => setShowRemoveFollowerConfirm(true), 200);
  }, []);

  const handleConfirmRemoveFollower = useCallback(() => {
    onRemoveFollower?.();
    setShowRemoveFollowerConfirm(false);
  }, [onRemoveFollower]);

  const handleConfirmBlock = useCallback(() => {
    if (youBlocked) {
      onUnblock?.();
    } else {
      onBlock?.();
    }
    setShowBlockConfirm(false);
  }, [youBlocked, onBlock, onUnblock]);
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
          onMessage={isOwnProfile ? undefined : onMessage}
          FallbackAvatar={FallbackAvatar}
          FallbackBanner={defaultBanner}
          socials={data}
        />
        <View className="px-6 mt-2">
          <UserProfileStatsRow stats={stats} onStatPress={onStatPress} />

          {/* Block status banners */}
          {!isOwnProfile && youBlocked && (
            <View className="mt-3 bg-red-900/30 border border-red-800/50 rounded-xl px-4 py-3 flex-row items-center">
              <Ionicons name="ban-outline" size={18} color="#EF4444" />
              <View className="flex-1 ml-3">
                <Text className="text-red-400 text-sm font-medium">You blocked this user</Text>
                <Text className="text-red-400/70 text-xs mt-0.5">Their content is hidden from your feeds.</Text>
              </View>
              <TouchableOpacity
                onPress={onUnblock}
                disabled={blockLoading}
                activeOpacity={0.8}
                className="bg-red-800/50 px-3 py-1.5 rounded-full"
              >
                <Text className="text-red-300 text-xs font-semibold">
                  {blockLoading ? "..." : "Unblock"}
                </Text>
              </TouchableOpacity>
            </View>
          )}
          {!isOwnProfile && blockedYou && !youBlocked && (
            <View className="mt-3 bg-theme-neutrals-800/50 border border-theme-neutrals-700 rounded-xl px-4 py-3 flex-row items-center">
              <Ionicons name="information-circle-outline" size={18} color="#9CA3AF" />
              <View className="flex-1 ml-3">
                <Text className="text-gray-400 text-sm font-medium">You were blocked by this user</Text>
                <Text className="text-gray-500 text-xs mt-0.5">You may not be able to interact with this account.</Text>
              </View>
            </View>
          )}

          {!isOwnProfile && !isBlocked && (
            <UserProfileActions
              isFollowing={isFollowing}
              isFollowRequestPending={isFollowRequestPending}
              followLoading={followLoading}
              disableActions={profileData.disableActions}
              address={profileData.address}
              onFollow={onFollow}
              onOpenUnfollow={onOpenUnfollow}
            />
          )}
          {data?.aboutMe && !isBlocked && <UserProfileAboutSection content={data.aboutMe} />}
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
    isOwnProfile,
    onOpenImage,
    onShare,
    onMessage,
    onFollow,
    onOpenUnfollow,
    onStatPress,
    youBlocked,
    blockedYou,
    isBlocked,
    blockLoading,
    onUnblock,
    isPrivate,
    canViewContent,
  ]);

  if (loading || !data) {
    return (
      <View className="flex-1 p-2">
        <UserProfileSkeleton />
      </View>
    );
  }

  if (!profileData) return null;

  /*
   * Single render tree: one UserProfileBottomContentTabs is always mounted
   * so InfiniteFeed keeps its data across collapsed ↔ fullscreen transitions
   * (no skeleton flash). In fullscreen the profile header is injected into
   * the FlatList header; in collapsed it sits above the tabs statically.
   */
  return (
    <View className="flex-1">
      {!isFullScreen && ProfileHeader}
      <UserProfileBottomContentTabs
        address={profileData.address}
        onClose={onClose}
        scrollEnabled={isFullScreen}
        isFullScreen={isFullScreen}
        onScroll={onScroll}
        registerScrollToTop={registerScrollToTop}
        isPrivate={isPrivate}
        canViewContent={isBlocked ? false : canViewContent}
        isFollowRequestPending={isFollowRequestPending}
        onFollow={onFollow}
        isOwnProfile={isOwnProfile}
        onEditProfile={onEditProfile}
        profileHeader={isFullScreen ? ProfileHeader : undefined}
        isBlocked={isBlocked}
        youBlocked={youBlocked}
        blockedYou={blockedYou}
      />
      {!isFullScreen && <View style={{ height: 40 }} />}

      {/* Profile 3-dot menu */}
      <GlassModal
        visible={showProfileMenu}
        onClose={() => setShowProfileMenu(false)}
        presentation="center"
        maxHeight="50%"
        blurIntensity={50}
      >
        <View className="pb-4 pt-2">
          {/* Remove Follower — only when this user follows you */}
          {followsYou && (
            <>
              <TouchableOpacity
                onPress={handleRemoveFollowerPress}
                activeOpacity={0.7}
                className="flex-row items-center px-5 py-3.5"
              >
                <View className="w-10 h-10 rounded-full bg-white/10 items-center justify-center mr-3">
                  <Ionicons name="person-remove-outline" size={18} color="#fff" />
                </View>
                <View className="flex-1">
                  <Text className="text-white text-[15px] font-medium">
                    Remove follower
                  </Text>
                  <Text className="text-theme-neutrals-500 text-xs mt-0.5">
                    Remove {profileData?.displayName || "this user"} from your followers
                  </Text>
                </View>
              </TouchableOpacity>

              <View className="mx-5 my-1 h-px bg-white/10" />
            </>
          )}

          <TouchableOpacity
            onPress={handleBlockPress}
            activeOpacity={0.7}
            className="flex-row items-center px-5 py-3.5"
          >
            <View className="w-10 h-10 rounded-full bg-white/10 items-center justify-center mr-3">
              <Ionicons
                name={youBlocked ? "lock-open-outline" : "ban-outline"}
                size={18}
                color="#EF4444"
              />
            </View>
            <View className="flex-1">
              <Text style={{ color: "#EF4444" }} className="text-[15px] font-medium">
                {youBlocked
                  ? `Unblock ${profileData?.displayName || "user"}`
                  : `Block ${profileData?.displayName || "user"}`}
              </Text>
              <Text className="text-theme-neutrals-500 text-xs mt-0.5">
                {youBlocked
                  ? "Allow this user to appear in your feeds"
                  : "Hide their content and restrict interactions"}
              </Text>
            </View>
          </TouchableOpacity>

          <View className="mx-5 my-1 h-px bg-white/10" />

          <TouchableOpacity
            onPress={handleReportPress}
            activeOpacity={0.7}
            className="flex-row items-center px-5 py-3.5"
          >
            <View className="w-10 h-10 rounded-full bg-white/10 items-center justify-center mr-3">
              <Ionicons name="flag-outline" size={18} color="#F97316" />
            </View>
            <View className="flex-1">
              <Text style={{ color: "#F97316" }} className="text-[15px] font-medium">
                Report {profileData?.displayName || "user"}
              </Text>
              <Text className="text-theme-neutrals-500 text-xs mt-0.5">
                Report this account for violating guidelines
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      </GlassModal>

      {/* Remove Follower confirmation */}
      <GlassModal
        visible={showRemoveFollowerConfirm}
        onClose={() => setShowRemoveFollowerConfirm(false)}
        presentation="center"
        maxHeight="40%"
        blurIntensity={50}
      >
        <View className="px-5 py-6 items-center">
          <View className="w-14 h-14 rounded-full bg-white/10 items-center justify-center mb-4">
            <Ionicons name="person-remove-outline" size={28} color="#fff" />
          </View>
          <Text className="text-white text-lg font-semibold text-center mb-2">
            Remove follower?
          </Text>
          <Text className="text-theme-neutrals-400 text-sm text-center mb-6 leading-5">
            {profileData?.displayName || "This user"} won't be notified that they were removed from your followers.
          </Text>
          <View className="flex-row gap-3 w-full">
            <TouchableOpacity
              onPress={() => setShowRemoveFollowerConfirm(false)}
              className="flex-1 bg-theme-neutrals-800 py-3 rounded-xl items-center"
              activeOpacity={0.7}
            >
              <Text className="text-white font-semibold">Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleConfirmRemoveFollower}
              className="flex-1 bg-red-500/90 py-3 rounded-xl items-center"
              activeOpacity={0.7}
            >
              <Text className="text-white font-semibold">Remove</Text>
            </TouchableOpacity>
          </View>
        </View>
      </GlassModal>

      {/* Block/Unblock confirmation */}
      <ConfirmBlockModal
        visible={showBlockConfirm}
        mode={youBlocked ? "unblock" : "block"}
        targetLabel={profileData?.displayName || "user"}
        onConfirm={handleConfirmBlock}
        onCancel={() => setShowBlockConfirm(false)}
        loading={blockLoading}
      />

      {/* Report user modal */}
      <ReportModal
        visible={showReportUser}
        onClose={() => setShowReportUser(false)}
        type="user"
        userId={profileData?.address}
        userName={profileData?.displayName}
      />
    </View>
  );
};

export default memo(UserProfileSheetContent);

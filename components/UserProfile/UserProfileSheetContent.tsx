import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, TouchableOpacity, type NativeSyntheticEvent, type NativeScrollEvent } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import UserProfileSkeleton from "./UserProfileSkeleton";
import UserProfileHeader from "./UserProfileHeader";
import UserProfileBottomContentTabs from "./UserProfileBottomContentTabs";
import GlassModal from "../ui/GlassModal";
import GlassTipSheet from "../Tip/GlassTipSheet";
import ConfirmBlockModal from "../common/ConfirmBlockModal";
import ReportModal from "../common/ReportModal";
import Icon from "../ui/Icon";
import { copyToClipboard } from "../../libs";
import { shareProfile } from "../../libs/misc";
import { useMutualFollowers } from "../../hooks/useMutualFollowers";
import { WEBSITE_LINK } from "../../config/links";

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
  const [showTip, setShowTip] = useState(false);

  const { mutuals } = useMutualFollowers({
    profileAddress: profileData?.address,
    enabled: !isOwnProfile && !!profileData?.address,
  });

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

  const handleMenuMessage = useCallback(() => {
    setShowProfileMenu(false);
    setTimeout(() => onMessage(), 200);
  }, [onMessage]);

  const handleMenuTip = useCallback(() => {
    setShowProfileMenu(false);
    setTimeout(() => setShowTip(true), 200);
  }, []);

  const handleMenuShare = useCallback(() => {
    setShowProfileMenu(false);
    const url = `${WEBSITE_LINK}/${profileData?.username || profileData?.address}`;
    const message = `Check out ${profileData?.displayName || "this user"} on DeHub ${url}`;
    shareProfile(url, message);
  }, [profileData]);

  const handleMenuCopyUrl = useCallback(() => {
    const url = `${WEBSITE_LINK}/${profileData?.username || profileData?.address}`;
    copyToClipboard(url);
    setShowProfileMenu(false);
  }, [profileData]);

  const handleMenuCopyAddress = useCallback(() => {
    if (profileData?.address) {
      copyToClipboard(profileData.address);
    }
    setShowProfileMenu(false);
  }, [profileData]);
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
          address={profileData.address}
          shortAddr={profileData.shortAddr}
          username={profileData.username}
          hasUsername={profileData.hasUsername}
          joinedDate={profileData.joinedDate}
          followsYou={followsYou}
          isPrivate={isPrivate}
          bio={data?.aboutMe}
          isFollowing={isFollowing}
          isFollowRequestPending={isFollowRequestPending}
          followLoading={followLoading}
          disableActions={profileData.disableActions}
          isOwnProfile={isOwnProfile}
          isBlocked={isBlocked}
          onFollow={onFollow}
          onOpenUnfollow={onOpenUnfollow}
          onOpenImage={onOpenImage}
          onShare={onShare}
          onMessage={isOwnProfile ? undefined : onMessage}
          onEditProfile={onEditProfile}
          stats={stats}
          onStatPress={onStatPress}
          FallbackAvatar={FallbackAvatar}
          FallbackBanner={defaultBanner}
          socials={data}
          mutuals={mutuals}
        />
        <View className="px-5 mt-2">
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
    mutuals,
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

      <GlassModal
        visible={showProfileMenu}
        onClose={() => setShowProfileMenu(false)}
        presentation="bottom"
        maxHeight="80%"
        blurIntensity={50}
      >
        <View className="pb-4 pt-2" style={{ backgroundColor: "rgba(10,10,12,0.85)" }}>
          <TouchableOpacity
            onPress={handleMenuMessage}
            activeOpacity={0.7}
            className="flex-row items-center px-5 py-3.5"
          >
            <View className="w-10 h-10 rounded-full bg-white/10 items-center justify-center mr-3">
              <Icon name="MessageSquare" size={18} color="#fff" />
            </View>
            <View className="flex-1">
              <Text className="text-white text-[15px] font-medium">Message</Text>
              <Text className="text-theme-neutrals-500 text-xs mt-0.5">
                Send a direct message
              </Text>
            </View>
          </TouchableOpacity>

          <View className="mx-5 my-1 h-px bg-white/10" />

          <TouchableOpacity
            onPress={handleMenuTip}
            activeOpacity={0.7}
            className="flex-row items-center px-5 py-3.5"
          >
            <View className="w-10 h-10 rounded-full bg-white/10 items-center justify-center mr-3">
              <Icon name="HandCoins" size={18} color="#fff" />
            </View>
            <View className="flex-1">
              <Text className="text-white text-[15px] font-medium">Send Tip</Text>
              <Text className="text-theme-neutrals-500 text-xs mt-0.5">
                Send a tip to {profileData?.displayName || "this user"}
              </Text>
            </View>
          </TouchableOpacity>

          <View className="mx-5 my-1 h-px bg-white/10" />

          <TouchableOpacity
            onPress={handleMenuShare}
            activeOpacity={0.7}
            className="flex-row items-center px-5 py-3.5"
          >
            <View className="w-10 h-10 rounded-full bg-white/10 items-center justify-center mr-3">
              <Icon name="Share2" size={18} color="#fff" />
            </View>
            <View className="flex-1">
              <Text className="text-white text-[15px] font-medium">Share Profile</Text>
              <Text className="text-theme-neutrals-500 text-xs mt-0.5">
                Share this profile with others
              </Text>
            </View>
          </TouchableOpacity>

          <View className="mx-5 my-1 h-px bg-white/10" />

          <TouchableOpacity
            onPress={handleMenuCopyUrl}
            activeOpacity={0.7}
            className="flex-row items-center px-5 py-3.5"
          >
            <View className="w-10 h-10 rounded-full bg-white/10 items-center justify-center mr-3">
              <Icon name="Link" size={18} color="#fff" />
            </View>
            <View className="flex-1">
              <Text className="text-white text-[15px] font-medium">Copy Profile URL</Text>
              <Text className="text-theme-neutrals-500 text-xs mt-0.5">
                Copy link to clipboard
              </Text>
            </View>
          </TouchableOpacity>

          <View className="mx-5 my-1 h-px bg-white/10" />

          <TouchableOpacity
            onPress={handleMenuCopyAddress}
            activeOpacity={0.7}
            className="flex-row items-center px-5 py-3.5"
          >
            <View className="w-10 h-10 rounded-full bg-white/10 items-center justify-center mr-3">
              <Icon name="Copy" size={18} color="#fff" />
            </View>
            <View className="flex-1">
              <Text className="text-white text-[15px] font-medium">Copy Address</Text>
              <Text className="text-theme-neutrals-500 text-xs mt-0.5">
                Copy wallet address to clipboard
              </Text>
            </View>
          </TouchableOpacity>

          <View className="mx-5 my-1 h-px bg-white/10" />

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

      <ConfirmBlockModal
        visible={showBlockConfirm}
        mode={youBlocked ? "unblock" : "block"}
        targetLabel={profileData?.displayName || "user"}
        onConfirm={handleConfirmBlock}
        onCancel={() => setShowBlockConfirm(false)}
        loading={blockLoading}
      />

      <ReportModal
        visible={showReportUser}
        onClose={() => setShowReportUser(false)}
        type="user"
        userId={profileData?.address}
        userName={profileData?.displayName}
      />

      <GlassTipSheet
        visible={showTip}
        onClose={() => setShowTip(false)}
        toAddress={profileData?.address || ""}
        recipientName={profileData?.displayName}
        tipContext="user"
      />
    </View>
  );
};

export default memo(UserProfileSheetContent);

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, View, Text, TouchableOpacity, type NativeSyntheticEvent, type NativeScrollEvent } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import UserProfileSkeleton from "./UserProfileSkeleton";
import UserProfileHeader from "./UserProfileHeader";
import PinnedCommunities from "../Communities/PinnedCommunities";
import UserProfileBottomContentTabs from "./UserProfileBottomContentTabs";
import GlassModal from "../ui/GlassModal";
import GlassTipSheet from "../Tip/GlassTipSheet";
import ConfirmBlockModal from "../common/ConfirmBlockModal";
import ReportModal from "../common/ReportModal";
import LendBadgeSheet from "./LendBadgeSheet";
import Icon from "../ui/Icon";
import { copyToClipboard } from "../../libs";
import { shareProfile } from "../../libs/misc";
import { useMutualFollowers } from "../../hooks/useMutualFollowers";
import { WEBSITE_LINK } from "../../config/links";
import { useCreatorPlans } from "../../hooks/useCreatorPlans";

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
  const { t } = useTranslation();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showLendBadge, setShowLendBadge] = useState(false);
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);
  const [showReportUser, setShowReportUser] = useState(false);
  const [showRemoveFollowerConfirm, setShowRemoveFollowerConfirm] = useState(false);
  const [showTip, setShowTip] = useState(false);

  const profileAddress =
    profileData?.walletAddress || profileData?.address || data?.address || data?.walletAddress || "";

  const paymentsHidden = data?.hideBadgeAndBalance === true && !isOwnProfile;

  // Plans drive the header Subscribe CTA. Reading them here (not inside the
  // tabs, which only fetch on the Subs tab being opened) is what lets the
  // button exist before anyone has gone looking for it.
  const { hasPlans, isLoading: plansLoading } = useCreatorPlans(
    !isOwnProfile && profileData?.address ? profileData.address : undefined,
  );

  // The Subs tab lives inside UserProfileBottomContentTabs; the header lives
  // here. One-shot request, cleared once the child has switched.
  const [pendingTab, setPendingTab] = useState<string | null>(null);
  const handleSubscribePress = useCallback(() => setPendingTab("subscribers"), []);
  const handlePendingTabConsumed = useCallback(() => setPendingTab(null), []);

  const { mutuals, isLoading: mutualsLoading } = useMutualFollowers({
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

  const pendingMenuAction = useRef<(() => void) | null>(null);
  const menuActionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (menuActionTimer.current) clearTimeout(menuActionTimer.current);
    pendingMenuAction.current = null;
  }, []);
  const runPendingMenuAction = useCallback(() => {
    const action = pendingMenuAction.current;
    pendingMenuAction.current = null;
    action?.();
  }, []);
  const closeMenuThen = useCallback((action: () => void) => {
    pendingMenuAction.current = action;
    setShowProfileMenu(false);
    if (Platform.OS !== "ios") {
      menuActionTimer.current = setTimeout(runPendingMenuAction, 200);
    }
  }, [runPendingMenuAction]);

  const handleBlockPress = useCallback(() => {
    closeMenuThen(() => setShowBlockConfirm(true));
  }, [closeMenuThen]);

  const handleReportPress = useCallback(() => {
    closeMenuThen(() => setShowReportUser(true));
  }, [closeMenuThen]);

  const handleRemoveFollowerPress = useCallback(() => {
    closeMenuThen(() => setShowRemoveFollowerConfirm(true));
  }, [closeMenuThen]);

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
    closeMenuThen(onMessage);
  }, [closeMenuThen, onMessage]);

  const handleMenuTip = useCallback(() => {
    if (paymentsHidden) return;
    closeMenuThen(() => setShowTip(true));
  }, [closeMenuThen, paymentsHidden]);

  const handleMenuLendBadge = useCallback(() => {
    closeMenuThen(() => setShowLendBadge(true));
  }, [closeMenuThen]);

  const handleMenuShare = useCallback(() => {
    const url = `${WEBSITE_LINK}/${profileData?.username || profileData?.address}`;
    const message = `Check out ${profileData?.displayName || "this user"} on DeHub ${url}`;
    closeMenuThen(() => { shareProfile(url, message); });
  }, [closeMenuThen, profileData]);

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
    const rawDmSettings = (data as any)?.dmSettings ?? (data as any)?.dmSetting;
    const dmSettings = Array.isArray(rawDmSettings) ? rawDmSettings[0] : rawDmSettings;
    const messagesDisabled = dmSettings?.disables?.some((value: unknown) => {
      const status = String(value).toUpperCase();
      return status === "ALL" || status === "NEW_DM";
    });
    
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
          ensName={profileData.ensName}
          hasUsername={profileData.hasUsername}
          joinedDate={profileData.joinedDate}
          followsYou={followsYou}
          isPrivate={isPrivate}
          bio={data?.aboutMe}
          bioLanguage={(data as any)?.detectedLanguage}
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
          onMessage={isOwnProfile || messagesDisabled ? undefined : onMessage}
          onEditProfile={onEditProfile}
          stats={stats}
          onStatPress={onStatPress}
          FallbackAvatar={FallbackAvatar}
          FallbackBanner={defaultBanner}
          socials={data}
          mutuals={mutuals}
          mutualsLoading={mutualsLoading}
          hasPlans={hasPlans}
          plansLoading={plansLoading}
          onSubscribe={handleSubscribePress}
        />
        {!!profileData.address && (
          <View className="px-3 mt-1">
            <PinnedCommunities
              walletAddress={profileData.address}
              isOwnProfile={!!isOwnProfile}
              onNavigate={onClose}
            />
          </View>
        )}
        <View className="px-5 mt-2">
          {!isOwnProfile && youBlocked && (
            <View className="mt-3 bg-white/15 border border-white/20 rounded-xl px-4 py-3 flex-row items-center">
              <Ionicons name="ban-outline" size={18} color="#F4F4F5" />
              <View className="flex-1 ml-3">
                <Text className="text-white/80 text-sm font-medium">{t("profileOptions.youBlocked")}</Text>
                <Text className="text-white/80 text-xs mt-0.5">{t("profileOptions.youBlockedHint")}</Text>
              </View>
              <TouchableOpacity
                onPress={onUnblock}
                disabled={blockLoading}
                activeOpacity={0.8}
                className="bg-white/20 px-3 py-1.5 rounded-xl"
              >
                <Text className="text-white/80 text-xs font-semibold">
                  {blockLoading ? "..." : t("profileOptions.unblock")}
                </Text>
              </TouchableOpacity>
            </View>
          )}
          {!isOwnProfile && blockedYou && !youBlocked && (
            <View className="mt-3 bg-theme-neutrals-800/50 border border-theme-neutrals-700 rounded-xl px-4 py-3 flex-row items-center">
              <Ionicons name="information-circle-outline" size={18} color="#9CA3AF" />
              <View className="flex-1 ml-3">
                <Text className="text-gray-400 text-sm font-medium">{t("profileOptions.blockedByThem")}</Text>
                <Text className="text-gray-500 text-xs mt-0.5">{t("profileOptions.blockedByThemHint")}</Text>
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
    mutualsLoading,
    hasPlans,
    plansLoading,
    handleSubscribePress,
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
        pendingTab={pendingTab}
        onPendingTabConsumed={handlePendingTabConsumed}
      />
      {!isFullScreen && <View style={{ height: 40 }} />}

      <GlassModal scrollable
        visible={showProfileMenu}
        onClose={() => setShowProfileMenu(false)}
        onDismiss={runPendingMenuAction}
        presentation="bottom"
        maxHeight="80%"
        blurIntensity={50}
      >
        <View className="pb-4 pt-2" style={{ backgroundColor: "rgba(10,10,12,0.85)" }}>
          <TouchableOpacity
            onPress={handleMenuMessage}
            activeOpacity={0.7}
            className="mx-3 flex-row items-center rounded-xl px-3 py-3.5 active:bg-white/10"
          >
            <View className="w-5 h-5 items-center justify-center mr-3">
              <Icon name="MessageSquare" size={18} color="#fff" />
            </View>
            <View className="flex-1">
              <Text className="text-white text-[15px] font-medium">{t("profileOptions.message")}</Text>
              <Text className="text-theme-neutrals-500 text-xs mt-0.5">
                {t("profileOptions.sendDm")}
              </Text>
            </View>
          </TouchableOpacity>

          <View className="mx-5 my-1 h-px bg-white/10" />

          <TouchableOpacity
            onPress={handleMenuTip}
            disabled={paymentsHidden}
            activeOpacity={0.7}
            className={`mx-3 flex-row items-center rounded-xl px-3 py-3.5 active:bg-white/10 ${paymentsHidden ? "opacity-40" : ""}`}
          >
            <View className="w-5 h-5 items-center justify-center mr-3">
              <Icon name="HandCoins" size={18} color="#fff" />
            </View>
            <View className="flex-1">
              <Text className="text-white text-[15px] font-medium">{paymentsHidden ? t("profileOptions.tipsDisabled") : t("profileOptions.sendTip")}</Text>
              <Text className="text-theme-neutrals-500 text-xs mt-0.5">
                {paymentsHidden ? t("profileOptions.privateBalanceMode") : t("profileOptions.sendTipTo", { name: profileData?.displayName || t("profileOptions.thisUser") })}
              </Text>
            </View>
          </TouchableOpacity>

          <View className="mx-5 my-1 h-px bg-white/10" />

          <TouchableOpacity
            onPress={handleMenuLendBadge}
            activeOpacity={0.7}
            className="mx-3 flex-row items-center rounded-xl px-3 py-3.5 active:bg-white/10"
          >
            <View className="w-5 h-5 items-center justify-center mr-3">
              <Icon name="Award" size={18} color="#fff" />
            </View>
            <View className="flex-1">
              <Text className="text-white text-[15px] font-medium">{t("settings.badgeDelegation")}</Text>
              <Text className="text-theme-neutrals-500 text-xs mt-0.5">
                {t("settings.badgeDelegationNoteAny")}
              </Text>
            </View>
          </TouchableOpacity>

          <View className="mx-5 my-1 h-px bg-white/10" />

          <TouchableOpacity
            onPress={handleMenuShare}
            activeOpacity={0.7}
            className="mx-3 flex-row items-center rounded-xl px-3 py-3.5 active:bg-white/10"
          >
            <View className="w-5 h-5 items-center justify-center mr-3">
              <Icon name="Share2" size={18} color="#fff" />
            </View>
            <View className="flex-1">
              <Text className="text-white text-[15px] font-medium">{t("profileOptions.shareProfile")}</Text>
              <Text className="text-theme-neutrals-500 text-xs mt-0.5">
                {t("profileOptions.shareProfileHint")}
              </Text>
            </View>
          </TouchableOpacity>

          <View className="mx-5 my-1 h-px bg-white/10" />

          <TouchableOpacity
            onPress={handleMenuCopyUrl}
            activeOpacity={0.7}
            className="mx-3 flex-row items-center rounded-xl px-3 py-3.5 active:bg-white/10"
          >
            <View className="w-5 h-5 items-center justify-center mr-3">
              <Icon name="Link" size={18} color="#fff" />
            </View>
            <View className="flex-1">
              <Text className="text-white text-[15px] font-medium">{t("profileOptions.copyProfileUrl")}</Text>
              <Text className="text-theme-neutrals-500 text-xs mt-0.5">
                {t("profileOptions.copyLinkHint")}
              </Text>
            </View>
          </TouchableOpacity>

          <View className="mx-5 my-1 h-px bg-white/10" />

          <TouchableOpacity
            onPress={handleMenuCopyAddress}
            disabled={paymentsHidden}
            activeOpacity={0.7}
            className={`mx-3 flex-row items-center rounded-xl px-3 py-3.5 active:bg-white/10 ${paymentsHidden ? "opacity-40" : ""}`}
          >
            <View className="w-5 h-5 items-center justify-center mr-3">
              <Icon name="Copy" size={18} color="#fff" />
            </View>
            <View className="flex-1">
              <Text className="text-white text-[15px] font-medium">{paymentsHidden ? t("profileOptions.addressHidden") : t("profileOptions.copyAddress")}</Text>
              <Text className="text-theme-neutrals-500 text-xs mt-0.5">
                {t("profileOptions.copyAddressHint")}
              </Text>
            </View>
          </TouchableOpacity>

          <View className="mx-5 my-1 h-px bg-white/10" />

          {followsYou && (
            <>
              <TouchableOpacity
                onPress={handleRemoveFollowerPress}
                activeOpacity={0.7}
                className="mx-3 flex-row items-center rounded-xl px-3 py-3.5 active:bg-white/10"
              >
                <View className="w-5 h-5 items-center justify-center mr-3">
                  <Ionicons name="person-remove-outline" size={18} color="#fff" />
                </View>
                <View className="flex-1">
                  <Text className="text-white text-[15px] font-medium">
                    {t("profileOptions.removeFollower")}
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
            className="mx-3 flex-row items-center rounded-xl px-3 py-3.5 active:bg-white/10"
          >
            <View className="w-5 h-5 items-center justify-center mr-3">
              <Ionicons
                name={youBlocked ? "lock-open-outline" : "ban-outline"}
                size={18}
                color="#F4F4F5"
              />
            </View>
            <View className="flex-1">
              <Text style={{ color: "#F4F4F5" }} className="text-[15px] font-medium">
                {youBlocked
                  ? `Unblock ${profileData?.displayName || "user"}`
                  : `Block ${profileData?.displayName || "user"}`}
              </Text>
              <Text className="text-theme-neutrals-500 text-xs mt-0.5">
                {youBlocked
                  ? t("profileOptions.allowInFeeds")
                  : t("profileOptions.hideContent")}
              </Text>
            </View>
          </TouchableOpacity>

          <View className="mx-5 my-1 h-px bg-white/10" />

          <TouchableOpacity
            onPress={handleReportPress}
            activeOpacity={0.7}
            className="mx-3 flex-row items-center rounded-xl px-3 py-3.5 active:bg-white/10"
          >
            <View className="w-5 h-5 items-center justify-center mr-3">
              <Ionicons name="flag-outline" size={18} color="#D4D4D8" />
            </View>
            <View className="flex-1">
              <Text style={{ color: "#D4D4D8" }} className="text-[15px] font-medium">
                Report {profileData?.displayName || "user"}
              </Text>
              <Text className="text-theme-neutrals-500 text-xs mt-0.5">
                {t("profileOptions.reportHint")}
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
          <View className="w-14 h-14 rounded-2xl bg-white/10 items-center justify-center mb-4">
            <Ionicons name="person-remove-outline" size={28} color="#fff" />
          </View>
          <Text className="text-white text-lg font-semibold text-center mb-2">
            {t("profileOptions.removeFollowerTitle")}
          </Text>
          <Text className="text-theme-neutrals-400 text-sm text-center mb-6 leading-5">
            {t("profileOptions.removeFollowerBody", { name: profileData?.displayName || t("profileOptions.thisUser") })}
          </Text>
          <View className="flex-row gap-3 w-full">
            <TouchableOpacity
              onPress={() => setShowRemoveFollowerConfirm(false)}
              className="flex-1 bg-theme-neutrals-800 py-3 rounded-xl items-center"
              activeOpacity={0.7}
            >
              <Text className="text-white font-semibold">{t("common.cancel")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleConfirmRemoveFollower}
              className="flex-1 bg-white/15 border border-white/25 py-3 rounded-xl items-center"
              activeOpacity={0.7}
            >
              <Text className="text-white font-semibold">{t("follow.remove")}</Text>
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

      <LendBadgeSheet
        visible={showLendBadge}
        onClose={() => setShowLendBadge(false)}
        address={profileData?.address}
        displayName={profileData?.displayName || profileData?.username}
      />

      <GlassTipSheet
        visible={showTip && !paymentsHidden}
        onClose={() => setShowTip(false)}
        toAddress={profileData?.address || ""}
        recipientName={profileData?.displayName}
        tipContext="user"
      />
    </View>
  );
};

export default memo(UserProfileSheetContent);

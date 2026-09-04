import React, { useCallback, useMemo } from "react";
import { View, Text, Image, ImageBackground, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { SvgXml } from "react-native-svg";
import Avatar from "../common/Avatar";
import StoryAvatarRing from "../Story/StoryAvatarRing";
import Icon from "../ui/Icon";
import { copyToClipboard } from "../../libs";
import { toastSuccess } from "../../libs/toast";
import { ensProfileUrl } from "../../libs/ens-handle";
import { getSocialLink, openExternalLink } from "../../libs/links.utils";
import { useTranslation } from "../../hooks/useTranslation";
import { TranslateButton } from "../ui/TranslateButton";
import FakeGlass from "../ui/FakeGlass";
import MutualFollowers from "./MutualFollowers";
import BadgePatronChip from "../common/BadgePatronChip";
import { useTranslation as useI18n } from "react-i18next";
import { formatCompactNumber } from "../../libs/numbers.util";
import type { FollowListItem } from "../../services/user.service";

const SOCIAL_SVGS: Record<string, string> = {
  twitter: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor"><path d="M12.6.75h2.454l-5.36 6.142L16 15.25h-4.937l-3.867-5.07-4.425 5.07H.316l5.733-6.57L0 .75h5.063l3.495 4.633L12.601.75Zm-.86 13.028h1.36L4.323 2.145H2.865z"/></svg>`,
  telegram: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>`,
  instagram: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>`,
  discord: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.865-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.618-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.058a.082.082 0 0 0 .031.056c2.053 1.508 4.041 2.423 5.993 3.03a.078.078 0 0 0 .084-.028c.462-.63.873-1.295 1.226-1.994a.076.076 0 0 0-.042-.106 13.11 13.11 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .078-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.009c.12.1.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.076.076 0 0 0-.041.107c.36.698.772 1.363 1.225 1.993a.076.076 0 0 0 .084.028c1.961-.607 3.95-1.522 6.002-3.029a.077.077 0 0 0 .032-.055c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.086-2.157-2.42 0-1.333.956-2.418 2.157-2.418 1.21 0 2.176 1.095 2.157 2.419 0 1.333-.956 2.419-2.157 2.419zm7.975 0c-1.183 0-2.157-1.086-2.157-2.42 0-1.333.955-2.418 2.157-2.418 1.21 0 2.176 1.095 2.157 2.419 0 1.333-.946 2.419-2.157 2.419z"/></svg>`,
  youtube: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`,
  tiktok: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/></svg>`,
  facebook: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>`,
};

const SOCIAL_HOSTS: Record<string, string> = {
  twitter: "x.com",
  telegram: "t.me",
  instagram: "instagram.com",
  discord: "discord.com",
  youtube: "youtube.com",
  tiktok: "tiktok.com",
  facebook: "facebook.com",
};
const SOCIAL_ORDER = ["twitter", "instagram", "tiktok", "youtube", "discord", "telegram", "facebook"];

const GLASS_GRADIENT: [string, string, string] = [
  "rgba(255,255,255,0.20)",
  "rgba(255,255,255,0.10)",
  "rgba(255,255,255,0.05)",
];
const BTN_RADIUS = 12;
const BTN_H = 36;

export interface UserProfileHeaderProps {
  avatarUrl?: string | null;
  coverUrl?: string | null;
  displayName: string;
  badge?: string | null;
  badgeImage?: number | undefined;
  address?: string;
  shortAddr?: string;
  username?: string | null;
  /** A verified `.eth` name, shown beside the handle. Never instead of it. */
  ensName?: string | null;
  hasUsername: boolean;
  joinedDate?: string | null;
  followsYou?: boolean;
  isPrivate?: boolean;
  canViewContent?: boolean;
  bio?: string | null;
  /** ISO 639-1 the backend detected for the bio, so a bio already in the
   *  reader's language costs no request at all. */
  bioLanguage?: string | null;
  isFollowing?: boolean;
  isFollowRequestPending?: boolean;
  followLoading?: boolean;
  disableActions?: boolean;
  isOwnProfile?: boolean;
  isBlocked?: boolean;
  onFollow?: () => void;
  onOpenUnfollow?: () => void;
  onOpenImage: (type: "avatar" | "cover") => void;
  onShare: () => void;
  onMessage?: () => void;
  onEditProfile?: () => void;
  stats?: { key: string; label: string; value: number }[];
  onStatPress?: (key: string) => void;
  FallbackAvatar: any;
  FallbackBanner: any;
  socials?: Partial<Record<string, string>>;
  mutuals?: FollowListItem[];
  hasStories?: boolean;
  hasUnwatchedStories?: boolean;
  onStoryPress?: () => void;
  /** The creator has published at least one subscription plan. */
  hasPlans?: boolean;
  onSubscribe?: () => void;
}

const UserProfileHeader: React.FC<UserProfileHeaderProps> = ({
  avatarUrl,
  coverUrl,
  displayName,
  badge,
  badgeImage,
  address,
  shortAddr,
  username,
  ensName,
  hasUsername,
  joinedDate,
  followsYou,
  isPrivate,
  bio,
  bioLanguage,
  isFollowing = false,
  isFollowRequestPending = false,
  followLoading = false,
  disableActions = false,
  isOwnProfile = false,
  isBlocked = false,
  onFollow,
  onOpenUnfollow,
  onOpenImage,
  onShare,
  onMessage,
  onEditProfile,
  stats,
  onStatPress,
  FallbackAvatar,
  FallbackBanner,
  socials,
  mutuals,
  hasStories = false,
  hasUnwatchedStories = false,
  onStoryPress,
  hasPlans = false,
  onSubscribe,
}) => {
  const { t } = useI18n();
  // Bios go through the shared hook rather than a private translateText call,
  // which is what gets them auto-translation, the persisted cache and — the
  // reason the old code was wrong — the reader's CHOSEN language. It targeted
  // the device locale, so a Turkish reader on an English handset was served
  // "translations" back into English.
  const bioTexts = useMemo(() => ({ bio: bio || "" }), [bio]);
  const {
    isTranslated: isBioTranslated,
    translatedTexts: translatedBioTexts,
    isLoading: isTranslatingBio,
    handleTranslate: handleTranslateBio,
    handleShowOriginal: handleShowOriginalBio,
    shouldShow: showBioTranslate,
  } = useTranslation(bioTexts, bioLanguage);
  const displayBio = isBioTranslated ? translatedBioTexts.bio || bio : bio;

  const handleCopyUsername = useCallback(() => {
    if (username) copyToClipboard(username);
  }, [username]);

  // The chip hands over the .eth URL rather than the bare name, because that
  // is the thing worth showing off and the only half a recipient can act on.
  const handleCopyEns = useCallback(() => {
    if (!ensName) return;
    copyToClipboard(ensProfileUrl(ensName));
    toastSuccess("ENS profile URL copied");
  }, [ensName]);

  const socialItems = useMemo(() => {
    if (!socials) return [];
    const list: { key: string; url: string; svg: string }[] = [];
    SOCIAL_ORDER.forEach((k) => {
      const raw = (socials as any)[`${k}Link`] || (socials as any)[k];
      if (!raw) return;
      const host = SOCIAL_HOSTS[k];
      const svg = SOCIAL_SVGS[k];
      if (!host || !svg) return;
      const url = getSocialLink(String(raw), host);
      if (!url || url === "#") return;
      list.push({ key: k, url, svg });
    });
    return list;
  }, [socials]);

  const followingItem = stats?.find((s) => s.key === "following");
  const followersItem = stats?.find((s) => s.key === "followers");

  const renderFollowButton = () => {
    if (isOwnProfile) {
      return (
        <TouchableOpacity
          onPress={onEditProfile}
          activeOpacity={0.7}
          style={s.glassBtn}
        >
          <BlurView intensity={40} tint="dark" style={[StyleSheet.absoluteFill, { borderRadius: BTN_RADIUS }]} />
          <LinearGradient colors={GLASS_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: BTN_RADIUS }]} />
          <View style={[StyleSheet.absoluteFill, s.glassOverlay]} />
          <View style={s.glassBtnContent}>
            <Icon name="Pencil" size={14} color="#fff" />
            <Text style={s.glassBtnLabel}>Edit Profile</Text>
          </View>
        </TouchableOpacity>
      );
    }

    if (followLoading) {
      return (
        <View style={[s.glassBtn, { opacity: 0.6 }]}>
          <BlurView intensity={40} tint="dark" style={[StyleSheet.absoluteFill, { borderRadius: BTN_RADIUS }]} />
          <LinearGradient colors={GLASS_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: BTN_RADIUS }]} />
          <View style={[StyleSheet.absoluteFill, s.glassOverlay]} />
          <View style={s.glassBtnContent}>
            <ActivityIndicator size="small" color="#fff" />
          </View>
        </View>
      );
    }

    if (isFollowRequestPending) {
      return (
        <TouchableOpacity
          onPress={() => !disableActions && onOpenUnfollow?.()}
          disabled={disableActions}
          activeOpacity={0.7}
          style={[s.glassBtn, disableActions && { opacity: 0.4 }]}
        >
          <BlurView intensity={40} tint="dark" style={[StyleSheet.absoluteFill, { borderRadius: BTN_RADIUS }]} />
          <LinearGradient colors={GLASS_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: BTN_RADIUS }]} />
          <View style={[StyleSheet.absoluteFill, s.glassOverlay]} />
          <View style={s.glassBtnContent}>
            <Icon name="Clock" size={14} color="#fff" />
            <Text style={s.glassBtnLabel}>Requested</Text>
          </View>
        </TouchableOpacity>
      );
    }

    if (isFollowing) {
      return (
        <TouchableOpacity
          onPress={() => !disableActions && onOpenUnfollow?.()}
          disabled={disableActions}
          activeOpacity={0.7}
          style={[s.glassBtn, disableActions && { opacity: 0.4 }]}
        >
          <BlurView intensity={40} tint="dark" style={[StyleSheet.absoluteFill, { borderRadius: BTN_RADIUS }]} />
          <LinearGradient colors={GLASS_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: BTN_RADIUS }]} />
          <View style={[StyleSheet.absoluteFill, s.glassOverlay]} />
          <View style={s.glassBtnContent}>
            <Text style={s.glassBtnLabel}>Following</Text>
            <Icon name="ChevronDown" size={14} color="#fff" />
          </View>
        </TouchableOpacity>
      );
    }

    return (
      <TouchableOpacity
        onPress={disableActions ? undefined : onFollow}
        disabled={disableActions}
        activeOpacity={0.7}
        style={[s.glassBtn, disableActions && { opacity: 0.4 }]}
      >
        <BlurView intensity={40} tint="dark" style={[StyleSheet.absoluteFill, { borderRadius: BTN_RADIUS }]} />
        <LinearGradient colors={GLASS_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: BTN_RADIUS }]} />
        <View style={[StyleSheet.absoluteFill, s.glassOverlay]} />
        <View style={s.glassBtnContent}>
          <Icon name="UserPlus" size={14} color="#fff" />
          <Text style={s.glassBtnLabel}>
            {followsYou && !isFollowing ? "Follow Back" : "Follow"}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View>
      <TouchableOpacity activeOpacity={0.8} onPress={() => onOpenImage("cover")}>
        <View className="mx-4 rounded-xl overflow-hidden" style={{ height: 140 }}>
          <ImageBackground
            source={coverUrl === "default-banner" ? FallbackBanner : { uri: coverUrl as string }}
            style={{ width: "100%", height: "100%" }}
            imageStyle={{ borderRadius: 12 }}
            resizeMode="cover"
          />
        </View>
      </TouchableOpacity>

      <View className="px-5">
        <View className="flex-row items-end justify-between" style={{ marginTop: -44 }}>
          <StoryAvatarRing
            uri={avatarUrl || undefined}
            name={displayName}
            size={88}
            hasStories={hasStories}
            unwatched={hasUnwatchedStories}
            onPressStory={onStoryPress}
            onPressAvatar={() => onOpenImage("avatar")}
            rounded={false}
          />
          {!isBlocked && (
            <View className="flex-row items-center gap-2 mb-1">
              {renderFollowButton()}
            </View>
          )}
        </View>

        <View className="mt-2">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-1.5 flex-1 mr-2">
              <Text className="text-white text-xl font-bold" numberOfLines={1}>{displayName}</Text>
              {badge && badgeImage && (
                <View className="w-4 h-4 rounded-full bg-theme-neutrals-800 items-center justify-center">
                  <Image source={badgeImage} className="w-2.5 h-2.5" />
                </View>
              )}
            </View>
            {socialItems.length > 0 && (
              <View className="flex-row items-center gap-1">
                {socialItems.map((si) => (
                  <TouchableOpacity
                    key={si.key}
                    onPress={() => openExternalLink(si.url)}
                    activeOpacity={0.7}
                    hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}
                    accessibilityLabel={si.key}
                  >
                    <FakeGlass className="rounded-xl" style={{ width: 32, height: 32, alignItems: "center", justifyContent: "center" }}>
                      <SvgXml xml={si.svg} width={14} height={14} color="#A1A1AA" />
                    </FakeGlass>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          <View className="flex-row items-center mt-0.5 gap-2">
            {!!username && (
              <TouchableOpacity onPress={handleCopyUsername} activeOpacity={0.7}>
                <Text className="text-zinc-400 text-sm">@{username}</Text>
              </TouchableOpacity>
            )}
            {/* Beside the handle, never instead of it: the username is what
                this account is called, while the .eth name is a claim on
                something that can be sold or left to expire. */}
            {!!ensName && (
              <TouchableOpacity
                onPress={handleCopyEns}
                activeOpacity={0.7}
                accessibilityLabel={`Verified ENS name ${ensName}`}
                className="px-2 py-0.5 bg-theme-neutrals-800 rounded-md flex-row items-center"
              >
                <Icon name="Globe" size={11} color="#A1A1AA" />
                <Text className="text-theme-neutrals-300 text-[11px] font-medium ml-1">
                  {ensName}
                </Text>
              </TouchableOpacity>
            )}
            {followsYou && (
              <View className="px-2 py-0.5 bg-theme-neutrals-800 rounded">
                <Text className="text-theme-neutrals-400 text-[11px] font-medium">Follows you</Text>
              </View>
            )}
            {/* A lent badge draws like any other badge everywhere else; this is
                the one place that says whose it is. */}
            <BadgePatronChip lookupId={address || username} />
          </View>

          {!!bio && (
            <View className="mt-3">
              <Text className="text-white/90 text-sm">{displayBio}</Text>
              {showBioTranslate && (
                <TranslateButton
                  isTranslated={isBioTranslated}
                  isLoading={isTranslatingBio}
                  onTranslate={handleTranslateBio}
                  onShowOriginal={handleShowOriginalBio}
                />
              )}
            </View>
          )}

          {!!joinedDate && (
            <Text className="text-zinc-400 text-sm mt-3">{t("profile.joined")} {joinedDate}</Text>
          )}

          {(followingItem || followersItem) && (
            <View className="flex-row items-center gap-4 mt-3">
              {followingItem && (
                <TouchableOpacity
                  onPress={onStatPress ? () => onStatPress("following") : undefined}
                  activeOpacity={onStatPress ? 0.7 : 1}
                >
                  <Text className="text-sm">
                    <Text className="text-white font-bold">{formatCompactNumber(followingItem.value)}</Text>
                    <Text className="text-zinc-400"> {t("profile.following")}</Text>
                  </Text>
                </TouchableOpacity>
              )}
              {followersItem && (
                <TouchableOpacity
                  onPress={onStatPress ? () => onStatPress("followers") : undefined}
                  activeOpacity={onStatPress ? 0.7 : 1}
                >
                  <Text className="text-sm">
                    <Text className="text-white font-bold">{formatCompactNumber(followersItem.value)}</Text>
                    <Text className="text-zinc-400"> {t("profile.followers")}</Text>
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        <MutualFollowers mutuals={mutuals || []} />

        {/* Subscribe CTA — web parity. A creator who has published a plan sells
            to anyone, so this does not wait on following; it jumps the sheet to
            the Subs tab, where the plan cards do the selling. Full width rather
            than beside Follow: two glass pills plus the avatar overflow on a
            narrow phone. */}
        {!isOwnProfile && !isBlocked && hasPlans && !!onSubscribe && (
          <TouchableOpacity
            onPress={onSubscribe}
            activeOpacity={0.7}
            style={[s.glassBtn, { marginTop: 12, paddingHorizontal: 0 }]}
          >
            <BlurView intensity={40} tint="dark" style={[StyleSheet.absoluteFill, { borderRadius: BTN_RADIUS }]} />
            <LinearGradient colors={GLASS_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: BTN_RADIUS }]} />
            <View style={[StyleSheet.absoluteFill, s.glassOverlay]} />
            <View style={s.glassBtnContent}>
              <Icon name="Star" size={14} color="#fff" />
              <Text style={s.glassBtnLabel}>Subscribe Now</Text>
            </View>
          </TouchableOpacity>
        )}

        {!hasUsername && (
          <View className="mt-3 bg-theme-neutrals-800/60 rounded-lg p-3">
            <Text className="text-theme-neutrals-200 text-xs leading-4">
              This user hasn't fully joined yet. They haven't claimed a username or completed profile setup. You can still view public activity and send tips if available.
            </Text>
          </View>
        )}
      </View>
    </View>
  );
};

const s = StyleSheet.create({
  glassBtn: {
    height: BTN_H,
    paddingHorizontal: 16,
    borderRadius: BTN_RADIUS,
    overflow: "hidden",
  },
  glassOverlay: {
    backgroundColor: "rgba(24,24,27,0.3)",
    borderRadius: BTN_RADIUS,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  glassBtnContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  glassBtnLabel: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
});

export default UserProfileHeader;

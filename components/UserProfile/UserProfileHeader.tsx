import React, { useCallback, useMemo, useRef } from "react";
import { View, Text, TouchableOpacity, Pressable, ActivityIndicator, StyleSheet, useWindowDimensions } from "react-native";
import { openBadgeShowcase } from "../../libs/badgeShowcase";
import SmartImage from "../common/SmartImage";
import { storageImage } from "../../libs/cdnImage";
import { LinearGradient } from "expo-linear-gradient";
import Avatar from "../common/Avatar";
import Icon from "../ui/Icon";
import { copyToClipboard, getBadgeOpticalStyle } from "../../libs";
import { toastSuccess } from "../../libs/toast";
import { ensProfileUrl } from "../../libs/ens-handle";
import { useTranslation } from "../../hooks/useTranslation";
import { TranslateButton } from "../ui/TranslateButton";
import MutualFollowers from "./MutualFollowers";
import StreamerLevelCard from "../Live/StreamerLevelCard";
import BadgePatronChip from "../common/BadgePatronChip";
import { useTranslation as useI18n } from "react-i18next";
import { formatCompactNumber } from "../../libs/numbers.util";
import type { FollowListItem } from "../../services/user.service";
import TotalReachPill from "../Profile/TotalReachPill";
import ProfileLinksPill from "../Profile/ProfileLinksPill";
import { useAppTheme } from "../../context/ThemeContext";
import { MINIMAL_HAIRLINE } from "../../theme/minimal";

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
  /** True while the mutual-followers request is still in flight — reserves
   *  the row's height instead of popping it in once the list arrives. */
  mutualsLoading?: boolean;
  /** The creator has published at least one subscription plan. */
  hasPlans?: boolean;
  /** True while the creator's plans are still loading — reserves the
   *  Subscribe button's height instead of popping it in once known. */
  plansLoading?: boolean;
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
  mutualsLoading = false,
  hasPlans = false,
  plansLoading = false,
  onSubscribe,
}) => {
  const { t } = useI18n();
  const { isMinimal, skin } = useAppTheme();
  const { width: windowWidth } = useWindowDimensions();
  const badgeRef = useRef<View>(null);
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
  } = useTranslation(bioTexts, bioLanguage, true, true);
  const displayBio = isBioTranslated ? translatedBioTexts.bio || bio : bio;

  const handleCopyUsername = useCallback(() => {
    if (username) copyToClipboard(username);
  }, [username]);

  // The chip hands over the .eth URL rather than the bare name, because that
  // is the thing worth showing off and the only half a recipient can act on.
  const handleCopyEns = useCallback(() => {
    if (!ensName) return;
    copyToClipboard(ensProfileUrl(ensName));
    toastSuccess(t("profile.ensUrlCopied"));
  }, [ensName]);

  // The glass fill every header button is painted with. Minimal drops it for a
  // 1px outline (s.minimalBtn), and grows the box to 44pt so the tap target
  // does not shrink with the slab.
  const glassLayers = isMinimal ? null : skin ? (
    <View style={[StyleSheet.absoluteFill, skin.centre]} />
  ) : (
    <>
      <View style={[StyleSheet.absoluteFill, { borderRadius: BTN_RADIUS, backgroundColor: "#18181B" }]} />
      <LinearGradient colors={GLASS_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: BTN_RADIUS }]} />
      <View style={[StyleSheet.absoluteFill, s.glassOverlay]} />
    </>
  );
  const btn = isMinimal ? [s.glassBtn, s.minimalBtn] : [s.glassBtn, skin?.centre];

  const followingItem = stats?.find((s) => s.key === "following");
  const followersItem = stats?.find((s) => s.key === "followers");

  const renderFollowButton = () => {
    if (isOwnProfile) {
      return (
        <TouchableOpacity
          onPress={onEditProfile}
          activeOpacity={0.7}
          style={btn}
        >
          {glassLayers}
          <View style={s.glassBtnContent}>
            <Icon name="Pencil" size={14} color="#fff" />
            <Text style={s.glassBtnLabel}>{t("screens.editProfile")}</Text>
          </View>
        </TouchableOpacity>
      );
    }

    if (followLoading) {
      return (
        <View style={[btn, { opacity: 0.6 }]}>
          {glassLayers}
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
          style={[btn, disableActions && { opacity: 0.4 }]}
        >
          {glassLayers}
          <View style={s.glassBtnContent}>
            <Icon name="Clock" size={14} color="#fff" />
            <Text style={s.glassBtnLabel}>{t("follow.requested")}</Text>
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
          style={[btn, disableActions && { opacity: 0.4 }]}
        >
          {glassLayers}
          <View style={s.glassBtnContent}>
            <Text style={s.glassBtnLabel}>{t("filters.following")}</Text>
            <Icon name="Check" size={14} color="#fff" />
          </View>
        </TouchableOpacity>
      );
    }

    return (
      <TouchableOpacity
        onPress={disableActions ? undefined : onFollow}
        disabled={disableActions}
        activeOpacity={0.7}
        style={[btn, disableActions && { opacity: 0.4 }]}
      >
        {glassLayers}
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
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => onOpenImage("cover")}
        accessibilityRole="button"
        accessibilityLabel={t("profile.viewCoverImage")}
      >
        {/* Minimal: media runs edge to edge, so the cover drops its inset. */}
        <View
          className={isMinimal ? "overflow-hidden" : "mx-4 rounded-xl overflow-hidden"}
          style={{ height: 140 }}
        >
          {/* coverUrl is the unsized original (the viewer opens it too); expo-image
              decodes it at banner size where ImageBackground decoded every pixel.
              A cover in Supabase Storage is fetched at banner width as well. */}
          <SmartImage
            source={
              coverUrl === "default-banner"
                ? FallbackBanner
                : { uri: storageImage(coverUrl as string, windowWidth) }
            }
            recyclingKey={coverUrl}
            style={[{ width: "100%", height: "100%" }, isMinimal ? null : { borderRadius: 12 }]}
            contentFit="cover"
          />
        </View>
      </TouchableOpacity>

      <View className="px-5">
        <View className="flex-row items-end justify-between" style={{ marginTop: -44 }}>
          <Avatar
            uri={avatarUrl || undefined}
            name={displayName}
            size={88}
            style={{ borderWidth: 3, borderColor: "#010305" }}
            onPress={() => onOpenImage("avatar")}
          />
          {!isBlocked && (
            <View className="flex-row items-center gap-2 mb-1">
              {renderFollowButton()}
              {!!onMessage && (
                <TouchableOpacity
                  onPress={onMessage}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={t("profile.messageUser")}
                  style={[btn, s.iconBtn, isMinimal && s.minimalIconBtn]}
                >
                  {glassLayers}
                  <View style={s.glassBtnContent}>
                    <Icon name="MessageSquare" size={16} color="#fff" />
                  </View>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        <View className="mt-2">
          {/* The name owns the full width and may take two lines. Social
              links used to share this row and cut a long name to one line;
              they now live in the Links pill at the bottom of the header. */}
          <View className="flex-row items-center gap-1.5">
            <Text className="text-white text-xl font-bold" numberOfLines={2} style={{ flexShrink: 1 }}>{displayName}</Text>
            {badge && badgeImage && (
              <Pressable ref={badgeRef} hitSlop={8} onPress={() => openBadgeShowcase(badge, badgeRef.current)}>
                <SmartImage source={badgeImage} style={[getBadgeOpticalStyle(badgeImage, 20), { marginLeft: 0 }]} contentFit="contain" />
              </Pressable>
            )}
          </View>

          {/* Wraps, so a long handle plus the .eth / follows-you / patron
              chips drop to a second line instead of running off the edge, and
              a handle too long for a line on its own truncates. */}
          <View className="flex-row flex-wrap items-center mt-0.5 gap-2">
            {!!username && (
              <TouchableOpacity onPress={handleCopyUsername} activeOpacity={0.7} style={{ flexShrink: 1, maxWidth: "100%" }}>
                <Text className="text-zinc-400 text-sm" numberOfLines={1}>@{username}</Text>
              </TouchableOpacity>
            )}
            {/* Beside the handle, never instead of it: the username is what
                this account is called, while the .eth name is a claim on
                something that can be sold or left to expire. */}
            {!!ensName && (
              <TouchableOpacity
                onPress={handleCopyEns}
                activeOpacity={0.7}
                accessibilityLabel={t("profile.verifiedEnsName", { name: ensName })}
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
                <Text className="text-theme-neutrals-400 text-[11px] font-medium">{t("follow.followsYou")}</Text>
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

          {(followingItem || followersItem) ? (
            <View className="flex-row flex-wrap items-center gap-4 mt-3">
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
              {/* `socials` is the whole account record, so the self-reported
                  counts under its `customs` come along with the links. */}
              {followersItem && (
                <TotalReachPill
                  source={socials as Record<string, unknown> | undefined}
                  followers={followersItem.value}
                />
              )}
            </View>
          ) : null}
        </View>

        {/* Both rows below reserve their real height the moment their query
            starts, rather than popping in once it resolves (mutuals and plans
            are separate requests that land after the header has already
            painted). A profile opened mid-scroll used to grow twice under the
            reader as each one arrived; the placeholder keeps that height
            stable and only actually collapses if the answer turns out empty,
            which happens once, right after mount, not while reading. */}
        {/* The bottom row: mutual followers on the left, the creator's social
            icons tucked into the right-hand corner. Each side carries its own
            top margin, so the row takes no space when both are empty. */}
        <View className="flex-row items-center" style={{ gap: 12 }}>
          <View className="flex-1" style={{ minWidth: 0 }}>
            {mutualsLoading && !mutuals?.length ? (
              <View style={s.mutualsPlaceholder} />
            ) : (
              <MutualFollowers mutuals={mutuals || []} />
            )}
          </View>
          <View style={{ marginTop: 12 }}>
            <ProfileLinksPill source={socials as Record<string, unknown> | undefined} />
          </View>
        </View>

        {/* The streamer ladder. Renders nothing until a stream has ended,
            so a non-streamer's profile is unchanged. */}
        {isOwnProfile && !isBlocked && <StreamerLevelCard address={address} className="mt-3" />}

        {/* Subscribe CTA — web parity. A creator who has published a plan sells
            to anyone, so this does not wait on following; it jumps the sheet to
            the Subs tab, where the plan cards do the selling. Full width rather
            than beside Follow: two glass pills plus the avatar overflow on a
            narrow phone. */}
        {!isOwnProfile && !isBlocked && plansLoading && !hasPlans ? (
          <View style={[btn, s.subscribePlaceholder]} />
        ) : (
          !isOwnProfile && !isBlocked && hasPlans && !!onSubscribe && (
            <TouchableOpacity
              onPress={onSubscribe}
              activeOpacity={0.7}
              style={[btn, { marginTop: 12, paddingHorizontal: 0 }]}
            >
              {glassLayers}
              <View style={s.glassBtnContent}>
                <Icon name="Star" size={14} color="#fff" />
                <Text style={s.glassBtnLabel}>{t("profile.subscribeNow")}</Text>
              </View>
            </TouchableOpacity>
          )
        )}

        {!hasUsername && (
          <View className="mt-3 bg-theme-neutrals-800/60 rounded-lg p-3">
            <Text className="text-theme-neutrals-200 text-xs leading-4">
              {t("profile.notFullyJoined")}
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
  // Same box the real row/button occupies, so the mutuals-loading and
  // plans-loading states don't change the header's height once real content
  // (or nothing) replaces them.
  mutualsPlaceholder: {
    height: 20,
    marginTop: 12,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  subscribePlaceholder: {
    marginTop: 12,
    paddingHorizontal: 0,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  iconBtn: {
    width: BTN_H,
    paddingHorizontal: 0,
  },
  minimalBtn: {
    height: 44,
    borderWidth: 1,
    borderColor: MINIMAL_HAIRLINE,
  },
  minimalIconBtn: {
    width: 44,
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

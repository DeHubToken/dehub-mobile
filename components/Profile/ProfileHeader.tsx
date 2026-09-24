import React, { useState, useMemo, useCallback, useRef } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, Dimensions } from "react-native";
import SmartImage from "../common/SmartImage";
import Avatar from "../common/Avatar";
import { Ionicons } from "@expo/vector-icons";
import LiquidGlass from "../ui/LiquidGlass";
import { useNavigation } from "@react-navigation/native";
import { ScreenNames } from "../../navigation/ScreenNames";
import { useTranslation } from "react-i18next";

import { copyToClipboard } from "../../libs";
import { useUser, useAuthActions } from "../../context/AuthContext";
import {
  getAvatarUrl,
  getCoverUrl,
  getBadgeName,
  getBadgeOpticalStyle,
  getBadgeUrl,
  getDefaultBanner,
  resolveBadgeBalance,
  resolveBadgeLock,
  resolveBadgeUsername,
} from "../../libs/misc";
import BadgeAscension, { type BadgeSlot } from "./BadgeAscension";
import StreamerLevelCard from "../Live/StreamerLevelCard";
import { useBadgeCeremony } from "../../hooks/useBadgeCeremony";
import { openExternalLink } from "../../libs/links.utils";
import { ensProfileUrl } from "../../libs/ens-handle";
import { truncateAddress } from "../../libs/strings.util";
import { formatJoinedDate } from "../../libs/date.util";
import { formatCompactNumber, resolveCount } from "../../libs/numbers.util";
import { shareProfile } from "../../libs/misc";
import CopyAddressSheet from "../Wallet/CopyAddressSheet";
import * as ImagePicker from "expo-image-picker";

/** Matches the Avatar `size={88}` below. */
const PROFILE_AVATAR_PT = 88;
/** The cover is full-bleed, so it is fetched at the screen's own width. */
const COVER_WIDTH_PT = Dimensions.get("window").width;
import {
  openCroppedImagePicker,
  resizeAndCompress,
  createRNImageFile,
} from "../../libs/assets.util";
import { runWithPermissions } from "../../libs/permissions.util";
import { AuthService } from "../../services/auth.service";
import { toastError, toastSuccess } from "../../libs/toast";
import { WEBSITE_LINK } from "../../config";
import { translateText, getUserLanguage } from "../../services/translation.service";
import { TranslateButton } from "../ui/TranslateButton";
import NewMemberChip from "../common/NewMemberChip";
import BadgePatronChip from "../common/BadgePatronChip";
import TotalReachPill from "./TotalReachPill";
import { useAppTheme } from "../../context/ThemeContext";
import { MINIMAL_HAIRLINE } from "../../theme/minimal";

// Minimal header buttons: no glass slab, just a 1px outline, and a 44pt box so
// losing the padded pill does not shrink the tap target.
const MINIMAL_OUTLINE_BUTTON = {
  height: 44,
  borderWidth: 1,
  borderColor: MINIMAL_HAIRLINE,
  backgroundColor: "transparent",
} as const;
// Social icons stay bare at 32pt (seven of them share one row) and reach 44pt
// through hitSlop instead.
const MINIMAL_SOCIAL_HIT_SLOP = { top: 6, right: 6, bottom: 6, left: 6 };

const ProfileHeader = () => {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const { isMinimal } = useAppTheme();
  const user = useUser() as any;
  const { refreshUser, patchUser } = useAuthActions();
  const [translatedBio, setTranslatedBio] = useState<string | null>(null);
  const [isTranslatingBio, setIsTranslatingBio] = useState(false);
  const [copyAddressVisible, setCopyAddressVisible] = useState(false);
  // The reader's chosen language, not the handset's: a Turkish reader on an
  // English phone was being served "translations" back into English.
  //
  // Left on-demand deliberately, unlike every other surface — this is the
  // signed-in user's OWN bio, which they wrote. Auto-translating someone's own
  // words back at them is not the parity anyone wanted.
  const targetLang = useRef(getUserLanguage());
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [localAvatarUri, setLocalAvatarUri] = useState<string | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [localCoverUri, setLocalCoverUri] = useState<string | null>(null);

  const displayName = user?.displayName || "Unknown";
  const username = user?.username || user?.address || "";
  const address = user?.walletAddress || user?.address || "";
  // An alias, not a rename — `username` above is untouched by it, and every
  // share link on this screen still points at the username URL.
  const ensName = user?.ensName || "";

  const shortAddr = truncateAddress(address, 5, 5);
  // Explicit sizes: this avatar renders at 88pt, well above the 48pt default
  // getAvatarUrl assumes for feed and comment rows, and the cover is full-bleed.
  const avatarUrl = getAvatarUrl(user?.avatarImageUrl, PROFILE_AVATAR_PT);
  const coverUrl = getCoverUrl(user?.coverImageUrl, COVER_WIDTH_PT);
  // Both are tappable and open the pinch-zoom viewer, which has to be handed the
  // original — the sized versions above are for the 88pt/140pt boxes on screen,
  // and blowing one of those up to fullscreen is exactly the softness the
  // sizing is meant to be invisible at. `0` / no width means no transform.
  const avatarFullUrl = getAvatarUrl(user?.avatarImageUrl, 0);
  const coverFullUrl = getCoverUrl(user?.coverImageUrl);
  const badgeVal = resolveBadgeBalance(user as any);
  // The lock alongside the balance: a tier earned before the ladder moved is
  // still theirs, and the badge here has to agree with the one on their posts.
  const badgeLock = resolveBadgeLock(user as any);
  // The handle too: a granted account wears its tier here and on its posts,
  // the same way it does on the website.
  const badgeCtx = { lock: badgeLock, username: resolveBadgeUsername(user as any) };
  const badge = getBadgeName(badgeVal, badgeCtx);
  const badgeImage = getBadgeUrl(badgeVal, badgeCtx);

  // Badge ascension. This header only ever draws the signed-in user, so the
  // ceremony is always looking at its own holder. The slot is measured on
  // layout because the animation flies the badge out of it and back into it.
  const badgeSlotRef = useRef<View>(null);
  const [badgeSlot, setBadgeSlot] = useState<BadgeSlot | null>(null);
  const { ceremony, dismiss } = useBadgeCeremony({
    enabled: true,
    address,
    tier: badge,
  });
  const measureBadgeSlot = useCallback(() => {
    badgeSlotRef.current?.measureInWindow((x, y, width, height) => {
      if (!width) return;
      setBadgeSlot({ x: x + width / 2, y: y + height / 2, size: width });
    });
  }, []);

  // account_info returns followers/followings as arrays of addresses (or a
  // plain number elsewhere) — resolveCount normalises both to a count.
  const followersCount = resolveCount(user?.followers, (user as any)?.follower_count);
  const followingCount = resolveCount(user?.followings, (user as any)?.following_count);

  // Deterministic default banner based on user ID/address
  const defaultBanner = useMemo(
    () => getDefaultBanner(user?.address || ""),
    [user?.address]
  );

  const createdAtFormatted = useMemo(
    () => formatJoinedDate(user?.createdAt) || undefined,
    [user?.createdAt]
  );

  const socials: { key: string; url?: string; icon: string; label: string }[] =
    [
      { key: "facebook", url: user?.facebookLink, icon: "logo-facebook", label: "Facebook" },
      { key: "twitter", url: user?.twitterLink, icon: "logo-twitter", label: "Twitter" },
      { key: "discord", url: user?.discordLink, icon: "logo-discord", label: "Discord" },
      { key: "instagram", url: user?.instagramLink, icon: "logo-instagram", label: "Instagram" },
      { key: "tiktok", url: user?.tiktokLink, icon: "musical-notes-outline", label: "TikTok" },
      { key: "youtube", url: user?.youtubeLink, icon: "logo-youtube", label: "YouTube" },
      { key: "telegram", url: user?.telegramLink, icon: "paper-plane-outline", label: "Telegram" },
    ].filter((s) => !!s.url);

  const aboutText = (user?.aboutMe || "").trim();

  const handleTranslateBio = useCallback(async () => {
    if (!aboutText) return;
    setIsTranslatingBio(true);
    try {
      const { translatedText } = await translateText(aboutText, targetLang.current);
      setTranslatedBio(translatedText);
    } catch {
      // silently ignore
    } finally {
      setIsTranslatingBio(false);
    }
  }, [aboutText]);

  const handleShare = useCallback(async () => {
    const profileSlug = username || address;
    const url = `${WEBSITE_LINK}/${profileSlug}`;
    const message = `Check out my dehub profile ${url}`;
    await shareProfile(url, message);
  }, [username, address]);

  const openViewer = useCallback(
    (uri?: string) => {
      if (!uri) return;
      (navigation as any).navigate(ScreenNames.ImageViewer, {
        images: [uri],
        initialIndex: 0,
      });
    },
    [navigation]
  );

  const goToFollowList = useCallback(
    (tab: "followers" | "following") => {
      if (!address) return;
      navigation.navigate(ScreenNames.FollowList, {
        address,
        username: user?.username,
        initialTab: tab,
        hideFollowers: user?.hideFollowers,
        isOwnProfile: true,
      });
    },
    [address, user?.username, user?.hideFollowers, navigation]
  );

  const processAndUpload = useCallback(
    async (kind: "avatar" | "cover", uri: string) => {
      const isAvatar = kind === "avatar";
      try {
        isAvatar ? setUploadingAvatar(true) : setUploadingCover(true);
        const target = isAvatar
          ? { width: 512, height: 512 }
          : { width: 1500, height: 500 };
        const manipUri = await resizeAndCompress(uri, {
          width: target.width,
          height: target.height,
          compress: 0.85,
          format: "jpeg",
        });
        if (isAvatar) setLocalAvatarUri(manipUri);
        else setLocalCoverUri(manipUri);
        const file = createRNImageFile(manipUri, kind);
        const payload = isAvatar
          ? { avatar: file, avatarImg: file }
          : { cover: file, coverImg: file };
        await AuthService.updateProfile(payload);
        if (isAvatar) {
          await patchUser?.({ avatarImageUrl: `${user?.avatarImageUrl || ""}` });
        } else {
          await patchUser?.({ coverImageUrl: `${user?.coverImageUrl || ""}` });
        }
        await refreshUser?.();
        toastSuccess(isAvatar ? t("profile.avatarUpdated") : t("profile.coverUpdated"));
      } catch (e) {
        toastError(e, t("stores.uploadFailed"));
        if (isAvatar) setLocalAvatarUri(null);
        else setLocalCoverUri(null);
      } finally {
        isAvatar ? setUploadingAvatar(false) : setUploadingCover(false);
      }
    },
    [user, patchUser, refreshUser, t]
  );

  const startChangeAvatar = useCallback(async () => {
    try {
      await runWithPermissions(["photos"], async () => {
        const pickedUri = await openCroppedImagePicker({
          width: 800,
          height: 800,
          circle: false,
          quality: 0.9,
          forceJpg: true,
        });
        if (!pickedUri) return;
        setLocalAvatarUri(pickedUri);
        await processAndUpload("avatar", pickedUri);
      });
    } catch (e) {
      toastError(e, t("profile.couldNotPickImage"));
    }
  }, [processAndUpload, t]);

  const startChangeCover = useCallback(async () => {
    try {
      await runWithPermissions(["photos"], async () => {
        const pickedUri = await openCroppedImagePicker({
          width: 1800,
          height: 600,
          circle: false,
          quality: 0.9,
          forceJpg: true,
        });
        if (!pickedUri) return;
        setLocalCoverUri(pickedUri);
        await processAndUpload("cover", pickedUri);
      });
    } catch (e) {
      toastError(e, t("profile.couldNotPickImage"));
    }
  }, [processAndUpload, t]);

  return (
    <View className="w-full">
      {ceremony && (
        <BadgeAscension
          from={ceremony.from}
          to={ceremony.to}
          slot={badgeSlot}
          balance={typeof badgeVal === "string" ? Number(badgeVal) : badgeVal}
          onDone={dismiss}
        />
      )}
      {/* Cover */}
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() =>
          openViewer(
            localCoverUri ||
              (coverFullUrl !== "default-banner" ? coverFullUrl : undefined)
          )
        }
      >
        {/* Minimal: media runs edge to edge, so the cover drops its inset. */}
        <View
          className={isMinimal ? "overflow-hidden" : "mx-4 rounded-xl overflow-hidden"}
          style={{ height: 140 }}
        >
          <SmartImage
            source={
              localCoverUri
                ? { uri: localCoverUri }
                : coverUrl === "default-banner"
                ? defaultBanner
                : { uri: coverUrl }
            }
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={150}
            style={{ width: "100%", height: "100%", opacity: uploadingCover ? 0.6 : 1 }}
          />
          <TouchableOpacity
            onPress={startChangeCover}
            className="absolute right-2 bottom-2 dark-surface bg-black/50 rounded-xl p-2"
            accessibilityLabel={t("profile.changeCoverImage")}
            activeOpacity={0.85}
          >
            <Ionicons name="camera" size={16} color="#fff" />
          </TouchableOpacity>
          {uploadingCover && (
            <View className="absolute inset-0 items-center justify-center">
              <ActivityIndicator color="#fff" />
            </View>
          )}
        </View>
      </TouchableOpacity>

      {/* Content */}
      <View className="px-5">
        {/* Avatar overlapping cover + actions on the right */}
        <View className="flex-row items-end justify-between" style={{ marginTop: -44 }}>
          <View>
            <Avatar
              uri={avatarUrl === "default-avatar" ? undefined : avatarUrl}
              name={displayName}
              size={88}
              style={{ borderWidth: 3, borderColor: "#010305" }}
              onPress={() =>
                openViewer(
                  avatarFullUrl === "default-avatar" ? undefined : avatarFullUrl
                )
              }
            />
            <TouchableOpacity
              onPress={startChangeAvatar}
              className="absolute right-0 bottom-0 dark-surface bg-black/60 rounded-lg p-1.5 border border-white/20"
              accessibilityLabel={t("profile.changeAvatar")}
              activeOpacity={0.85}
            >
              <Ionicons name="camera" size={13} color="#fff" />
            </TouchableOpacity>
            {uploadingAvatar && (
              <View className="absolute inset-0 items-center justify-center">
                <ActivityIndicator color="#fff" />
              </View>
            )}
          </View>

          {isMinimal ? (
            <View className="flex-row items-center gap-2 mb-1">
              <TouchableOpacity
                onPress={() => navigation.navigate(ScreenNames.EditProfile)}
                accessibilityLabel={t("settings.editProfile")}
                activeOpacity={0.85}
                className="px-4 flex-row items-center"
                style={[MINIMAL_OUTLINE_BUTTON, { gap: 6 }]}
              >
                <Ionicons name="pencil" size={14} color="#fff" />
                <Text className="text-white font-semibold text-[13px]">{t("screens.editProfile")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleShare}
                accessibilityLabel={t("profileOptions.shareProfile")}
                activeOpacity={0.85}
                className="items-center justify-center"
                style={[MINIMAL_OUTLINE_BUTTON, { width: 44 }]}
              >
                <Ionicons name="share-social" size={16} color="#fff" />
              </TouchableOpacity>
            </View>
          ) : (
          <View className="flex-row items-center gap-2 mb-1">
            <LiquidGlass className="rounded-xl" intensity={40} noBlur>
              <TouchableOpacity
                onPress={() => navigation.navigate(ScreenNames.EditProfile)}
                accessibilityLabel={t("settings.editProfile")}
                activeOpacity={0.85}
                className="px-4 flex-row items-center"
                style={{ height: 36, gap: 6 }}
              >
                <Ionicons name="pencil" size={14} color="#fff" />
                <Text className="text-white font-semibold text-[13px]">{t("screens.editProfile")}</Text>
              </TouchableOpacity>
            </LiquidGlass>
            <TouchableOpacity
              onPress={handleShare}
              accessibilityLabel={t("profileOptions.shareProfile")}
              activeOpacity={0.85}
            >
              <LiquidGlass className="rounded-xl" intensity={40} noBlur>
                <View className="items-center justify-center" style={{ width: 36, height: 36 }}>
                  <Ionicons name="share-social" size={16} color="#fff" />
                </View>
              </LiquidGlass>
            </TouchableOpacity>
          </View>
          )}
        </View>

        {/* Name + badge + socials */}
        <View className="mt-2">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-baseline gap-1.5 flex-1 mr-2">
              <Text className="text-white font-bold" numberOfLines={1} style={{ flexShrink: 1, fontSize: 24, lineHeight: 30 }}>
                {displayName}
              </Text>
              {badge && badgeImage && (
                <View ref={badgeSlotRef} onLayout={measureBadgeSlot} collapsable={false}>
                  <SmartImage
                    source={badgeImage as any}
                    contentFit="contain"
                    cachePolicy="memory-disk"
                    style={[getBadgeOpticalStyle(badgeImage as number, 20), { marginLeft: 0 }]}
                  />
                </View>
              )}
            </View>
            {socials.length > 0 && (
              <View className="flex-row items-center gap-1">
                {socials.map((sc) => (
                  <TouchableOpacity
                    key={sc.key}
                    onPress={() => openExternalLink(sc.url)}
                    activeOpacity={0.7}
                    accessibilityLabel={sc.label}
                    hitSlop={isMinimal ? MINIMAL_SOCIAL_HIT_SLOP : undefined}
                  >
                    {isMinimal ? (
                      <View
                        className="items-center justify-center"
                        style={{ width: 32, height: 32 }}
                      >
                        <Ionicons name={sc.icon as any} size={14} color="#A1A1AA" />
                      </View>
                    ) : (
                    <LiquidGlass className="rounded-xl" intensity={30} noBlur>
                      <View
                        className="items-center justify-center"
                        style={{ width: 32, height: 32 }}
                      >
                        <Ionicons name={sc.icon as any} size={14} color="#A1A1AA" />
                      </View>
                    </LiquidGlass>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Username + wallet address */}
          <View className="flex-row items-center mt-0.5 gap-2 flex-wrap">
            {!!username && (
              <TouchableOpacity onPress={() => copyToClipboard(username)} activeOpacity={0.7}>
                <Text className="text-zinc-400" style={{ fontSize: 16, lineHeight: 22 }}>@{username}</Text>
              </TouchableOpacity>
            )}
            {/* Beside the handle, never instead of it. Tapping copies the .eth
                URL rather than the bare name — that is the half a recipient
                can act on, and the reason to have claimed one. */}
            {!!ensName && (
              <TouchableOpacity
                onPress={() => {
                  copyToClipboard(ensProfileUrl(ensName));
                  toastSuccess(t("profile.ensUrlCopied"));
                }}
                activeOpacity={0.7}
                accessibilityLabel={t("profile.verifiedEnsName", { name: ensName })}
                className="px-2 py-0.5 bg-theme-neutrals-800 rounded-md flex-row items-center"
              >
                <Ionicons name="globe-outline" size={11} color="#A1A1AA" />
                <Text className="text-theme-neutrals-300 text-[11px] font-medium ml-1">
                  {ensName}
                </Text>
              </TouchableOpacity>
            )}
            {/* Temporary — gone 30 days after signup, and immediately if they
                switch it off in Settings › Privacy. Renders nothing otherwise. */}
            <NewMemberChip address={address} />
            {/* A lent badge draws like any other badge everywhere else; this
                is the one place that says whose it is. */}
            <BadgePatronChip lookupId={address} />
            {!!address && (
              <View className="flex-row items-center">
                <Ionicons
                  name="wallet-outline"
                  size={13}
                  color="#808089"
                  style={{ marginRight: 4 }}
                />
                <Text className="text-zinc-400 text-xs mr-1" numberOfLines={1}>
                  {shortAddr}
                </Text>
                <TouchableOpacity
                  onPress={() => setCopyAddressVisible(true)}
                  accessibilityLabel={t("wallet.copyAddress")}
                  hitSlop={{ top: 16, right: 16, bottom: 16, left: 16 }}
                >
                  <Ionicons name="copy-outline" size={13} color="#808089" />
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Bio */}
          {!!aboutText && (
            <View className="mt-3">
              <Text className="text-white/90" style={{ fontSize: 17, lineHeight: 24 }}>{translatedBio ?? aboutText}</Text>
              <TranslateButton
                isTranslated={!!translatedBio}
                isLoading={isTranslatingBio}
                onTranslate={handleTranslateBio}
                onShowOriginal={() => setTranslatedBio(null)}
              />
            </View>
          )}

          {/* Joined */}
          {!!createdAtFormatted && (
            <Text className="text-zinc-400 text-sm mt-3">{t("profile.joined")} {createdAtFormatted}</Text>
          )}

          {/* Following / Followers */}
          <View className="flex-row items-center gap-4 mt-3">
            <TouchableOpacity onPress={() => goToFollowList("following")} activeOpacity={0.7}>
              <Text className="text-sm">
                <Text className="text-white font-bold">
                  {formatCompactNumber(followingCount)}
                </Text>
                <Text className="text-zinc-400"> {t("profile.following")}</Text>
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => goToFollowList("followers")} activeOpacity={0.7}>
              <Text className="text-sm">
                <Text className="text-white font-bold">
                  {formatCompactNumber(followersCount)}
                </Text>
                <Text className="text-zinc-400"> {t("profile.followers")}</Text>
              </Text>
            </TouchableOpacity>
            {/* DeHub followers plus the creator's own figures for their linked
                socials. Absent until a social carries a count. */}
            <TotalReachPill source={user} followers={followersCount} />
          </View>

          {/* The streamer ladder. Renders nothing until a stream has ended,
              so a non-streamer's profile is unchanged. */}
          <StreamerLevelCard address={address} className="mt-4" />
        </View>
      </View>

      {/* This is your own profile, so both address spaces are known — which is
          why the picker belongs here and not on someone else's header, where
          only the EVM address is ever available. */}
      <CopyAddressSheet
        visible={copyAddressVisible}
        onClose={() => setCopyAddressVisible(false)}
        evmAddress={address}
      />
    </View>
  );
};

export default ProfileHeader;
